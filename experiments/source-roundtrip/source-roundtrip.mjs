import { createHash } from 'node:crypto';

const markerPrefix = '; @makenovel-node';
const markerPattern = /^; @makenovel-node ([A-Za-z][A-Za-z0-9._:-]{0,95})$/;
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export class SceneEditError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SceneEditError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return { code: this.code, message: this.message, ...this.details };
  }
}

function fail(code, message, details) {
  throw new SceneEditError(code, message, details);
}

export function contentHash(source) {
  if (!Buffer.isBuffer(source)) fail('INVALID_SOURCE', 'Source must be a Buffer.');
  return createHash('sha256').update(source).digest('hex');
}

// Byte offsets belong to the original Buffer. No re-serialization of the scene.
function scanLines(source) {
  try {
    utf8.decode(source);
  } catch {
    fail('INVALID_UTF8', 'Only valid UTF-8 scene files are supported.');
  }
  const lines = [];
  let start = 0;
  for (let index = 0; index <= source.length; index += 1) {
    if (index !== source.length && source[index] !== 10) continue;
    const end = index < source.length && index > start && source[index - 1] === 13 ? index - 1 : index;
    const text = utf8.decode(source.subarray(start, end));
    if (text.includes('\r')) {
      fail('UNSUPPORTED_LINE_ENDING', 'A bare CR is unsupported.', { line: lines.length + 1 });
    }
    lines.push({ start, end, text, line: lines.length + 1, unsafe: false });
    start = index + 1;
  }

  // Conservative boundaries, derived from the pinned native preprocessor.
  // A continuation elsewhere may remain opaque; a marker or edited line may not
  // participate in one. We do not attempt to parse or rewrite multiline commands.
  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    if (current.text.endsWith('\\')) {
      current.unsafe = true;
      if (lines[index + 1]) lines[index + 1].unsafe = true;
    }
    const trimmed = current.text.trimStart();
    if (index > 0 && current.text.startsWith(' ')
        && (trimmed.startsWith('|') || trimmed.startsWith('-'))
        && !current.text.includes('-concat')) {
      current.unsafe = true;
      lines[index - 1].unsafe = true;
    }
  }
  return lines;
}

function indexNodes(source) {
  const lines = scanLines(source);
  const nodes = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const marker = line.text.trim();
    if (!marker.startsWith(markerPrefix)) continue;
    const match = markerPattern.exec(marker);
    if (!match) fail('INVALID_ID_MARKER', 'Malformed node marker.', { line: line.line });
    const nodeId = match[1];
    if (nodes.has(nodeId)) {
      fail('DUPLICATE_ID', 'Node ID appears more than once.', { nodeId, line: line.line });
    }
    if (line.unsafe) {
      fail('UNSAFE_ID_MARKER', 'The native preprocessor may absorb this marker into a continuation.',
        { nodeId, line: line.line });
    }
    const target = lines[index + 1];
    if (!target || !target.text.trim() || target.text.trimStart().startsWith(';')) {
      fail('MISSING_TARGET', 'A marker must immediately precede one command line.',
        { nodeId, line: line.line });
    }
    nodes.set(nodeId, { nodeId, markerLine: line.line, target });
  }
  return nodes;
}

function payloadRange(node) {
  const { nodeId, target } = node;
  const details = { nodeId, line: target.line };
  if (target.unsafe) {
    fail('UNSUPPORTED_MULTILINE', 'Editing a multiline command is not supported in this experiment.', details);
  }
  if (!target.text.startsWith('say:')) {
    fail('UNSUPPORTED_COMMAND', 'Only explicit, unindented say: commands are editable.', details);
  }
  // Native parser: first semicolon whose immediately previous character is not
  // a backslash, then first literal " -" in the content starts arguments.
  let end = target.text.length;
  for (let index = 4; index < target.text.length; index += 1) {
    if (target.text[index] === ';' && target.text[index - 1] !== '\\') {
      end = index;
      break;
    }
  }
  const argsStart = target.text.indexOf(' -', 4);
  if (argsStart >= 0 && argsStart < end) end = argsStart;
  let start = 4;
  while (start < end && target.text[start].trim() === '') start += 1;
  while (end > start && target.text[end - 1].trim() === '') end -= 1;
  const raw = target.text.slice(start, end);
  const text = raw.replaceAll('\\;', ';');
  if (!raw || text === 'none' || text.includes('\\') || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(text)) {
    fail('UNSUPPORTED_CONTENT', 'Empty, reserved, control, or advanced escaped text requires source editing.', details);
  }
  return {
    startByte: target.start + Buffer.byteLength(target.text.slice(0, start)),
    endByte: target.start + Buffer.byteLength(target.text.slice(0, end)),
    raw,
    text,
  };
}

function encodeDialogue(text, nodeId) {
  // Leading whitespace is preserved outside the replacement range. A new '-'
  // could combine with that existing space to become the native " -" delimiter.
  if (typeof text !== 'string' || !text.isWellFormed() || !text || text !== text.trim()
      || text === 'none' || text.startsWith('-') || text.includes(' -') || text.includes('\\')
      || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(text)) {
    fail('UNSUPPORTED_TEXT', 'Text must be nonempty single-line prose without a leading ASCII hyphen, outer whitespace, backslashes, controls, " -", or reserved "none".', { nodeId });
  }
  return text.replaceAll(';', '\\;');
}

/** Read-only, derived metadata. Opaque commands remain in the original source. */
export function inspectScene(source) {
  const hash = contentHash(source);
  const nodes = [...indexNodes(source).values()].map((node) => {
    const base = { nodeId: node.nodeId, markerLine: node.markerLine, line: node.target.line };
    try {
      const range = payloadRange(node);
      return { ...base, editable: true, ...range };
    } catch (error) {
      if (!(error instanceof SceneEditError)) throw error;
      return { ...base, editable: false, diagnostic: error.toJSON() };
    }
  });
  return { hash, nodes };
}

/**
 * All-or-nothing in-memory edit. This function does not save files, simulate a
 * story, or guarantee a later caller's filesystem write is atomic.
 */
export function applyDialogueEdits(source, { expectedHash, edits } = {}) {
  const beforeHash = contentHash(source);
  if (typeof expectedHash !== 'string' || !/^[0-9a-f]{64}$/u.test(expectedHash)) {
    fail('EXPECTED_HASH_REQUIRED', 'A lowercase SHA-256 of the caller\'s original bytes is required.');
  }
  if (expectedHash !== beforeHash) {
    fail('VERSION_CONFLICT', 'The scene bytes changed; reload before applying edits.',
      { expectedHash, actualHash: beforeHash });
  }
  if (!Array.isArray(edits) || edits.length === 0) {
    fail('INVALID_EDITS', 'At least one dialogue edit is required.');
  }
  const snapshot = Buffer.from(source);
  const nodes = indexNodes(snapshot);
  const seen = new Set();
  const changes = edits.map((edit) => {
    if (!edit || typeof edit.nodeId !== 'string') fail('INVALID_EDIT', 'Each edit needs a nodeId.');
    if (seen.has(edit.nodeId)) fail('DUPLICATE_EDIT', 'Only one edit per node is allowed.', { nodeId: edit.nodeId });
    seen.add(edit.nodeId);
    const node = nodes.get(edit.nodeId);
    if (!node) fail('ID_NOT_FOUND', 'The requested node ID does not exist.', { nodeId: edit.nodeId });
    const range = payloadRange(node);
    return {
      nodeId: node.nodeId,
      line: node.target.line,
      startByte: range.startByte,
      endByte: range.endByte,
      beforeRaw: range.raw,
      afterRaw: encodeDialogue(edit.text, edit.nodeId),
    };
  }).sort((a, b) => a.startByte - b.startByte);

  const chunks = [];
  let cursor = 0;
  for (const change of changes) {
    chunks.push(snapshot.subarray(cursor, change.startByte), Buffer.from(change.afterRaw));
    cursor = change.endByte;
  }
  chunks.push(snapshot.subarray(cursor));
  const result = Buffer.concat(chunks);
  return { beforeHash, afterHash: contentHash(result), source: result, changes };
}
