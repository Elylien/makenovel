import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { originalFiles, REPO, UPSTREAM_COMMIT } from '../stage-demo/generate.mjs';
import { assertPlainDirectory, sealGame, verifyGame } from '../game-manifest/manifest.mjs';

const exec = promisify(execFile);
const TEMPLATE_FILES = ['template.json', 'Stage/Choose/choose.scss', 'Stage/TextBox/textbox.scss', 'UI/Title/title.scss'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const crlf = lines => lines.join('\r\n') + '\r\n';

export const ANIMATION_RESOURCES = Object.freeze([
  { name: 'move-left', path: 'game/animation/move-left.json', duration: 3000, endX: -180 },
  { name: 'move-right', path: 'game/animation/move-right.json', duration: 3000, endX: 180 },
  { name: 'nested.json/move.json-side', path: 'game/animation/nested.json/move.json-side.json', duration: 3000, endX: 120 },
  { name: 'upper', path: 'game/animation/upper.JSON', duration: 3000, endX: -120, caseSensitiveRuntimePathMismatch: true },
]);
export const ANIMATION_CASES = Object.freeze([
  { key: 'inline-id-next', beforeLine: 5, commandLine: 6, targetLine: 7, targetLabel: 'R15-MOVING',
    targetNodeId: 'r15-moving', stableLine: 8, stableLabel: 'R15-STABLE',
    animation: 'move-right', target: 'r15-hero', duration: 3000, endX: 180, next: true,
    nodeId: 'r15-animation-hero', markerKind: 'inline', closeLine: 9, closedLine: 11, closedLabel: 'R15-CLOSED',
    plannedEdit: { animation: 'move-left', target: 'fig-left', next: true } },
  { key: 'legacy-left-manual', beforeLine: 13, markerLine: 15, commandLine: 16, targetLine: 17,
    targetLabel: 'R15-MANUAL', targetNodeId: 'r15-manual', animation: 'move-left', target: 'fig-left',
    duration: 3000, endX: -180, next: false, nodeId: 'r15-animation-manual', markerKind: 'standalone', closeLine: 18 },
  { key: 'unregistered-background-next', beforeLine: 19, commandLine: 20, targetLine: 21,
    targetLabel: 'R15-BG-MOVING', targetNodeId: 'r15-bg-moving', stableLine: 22, stableLabel: 'R15-BG-STABLE',
    animation: 'nested.json/move.json-side', target: 'bg-main', duration: 3000, endX: 120, next: true },
]);

const BOUNDARY_CASES = Object.freeze([
  { kind: 'keep', source: 'setAnimation:move-right -target=r15-hero -keep -next;', label: 'R15-KEEP' },
  { kind: 'parallel', source: 'setAnimation:move-right -target=r15-hero -parallel -next;', label: 'R15-PARALLEL' },
  { kind: 'continue', source: 'setAnimation:move-right -target=r15-hero -continue;', label: 'R15-CONTINUE' },
  { kind: 'legacy-false', source: 'setAnimation:move-right -target=r15-hero -writeDefault=false -ignoreDefault=false -next;', label: 'R15-LEGACY' },
  { kind: 'dynamic', source: 'setAnimation:{r15_animation} -target={r15_target} -next;', label: 'R15-DYNAMIC' },
  { kind: 'reserved-stage', source: 'setAnimation:move-right -target=stage-main -next;', label: 'R15-STAGE' },
  { kind: 'unknown-option', source: 'setAnimation:move-right -target=r15-hero -r15Opaque=kept -next;', label: 'R15-OPAQUE' },
  { kind: 'default-transform', source: 'setAnimation:move-right -target=r15-hero -transformFrom=default -next;', label: 'R15-DEFAULT' },
  { kind: 'missing-resource', source: 'setAnimation:not-registered -target=r15-hero -next;', label: 'R15-MISSING-RESOURCE' },
  { kind: 'missing-target', source: 'setAnimation:move-right -target=not-on-stage -next;', label: 'R15-MISSING-TARGET' },
  { kind: 'no-next', source: 'setAnimation:move-right -target=r15-hero;', label: 'R15-NO-NEXT' },
]);
export const BOUNDARY_TARGETS = Object.freeze(BOUNDARY_CASES.map((entry, index) => ({
  kind: entry.kind, sourceLine: index * 2 + 2, line: index * 2 + 3, label: entry.label,
})));

/** Original stage rulers make figure motion and background motion distinguishable. */
export function animationBackground() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="2560" height="1440" viewBox="0 0 2560 1440"><rect width="2560" height="1440" fill="#eef0e5"/><rect y="980" width="2560" height="460" fill="#dce2d7"/><path d="M0 980 H2560 M0 1200 H2560" stroke="#b9c6b5" stroke-width="6"/><path d="M520 300 V930 M700 300 V930 M1100 300 V930 M1280 300 V930 M1680 300 V930 M1860 300 V930 M2040 300 V930" stroke="#bdcbbb" stroke-width="4" stroke-dasharray="12 18"/><path d="M1680 260 H2040 M1680 240 V280 M1860 240 V280 M2040 240 V280" stroke="#758678" stroke-width="5"/><rect x="100" y="85" width="1250" height="110" rx="18" fill="#263d42"/><text x="145" y="158" font-family="sans-serif" font-size="48" fill="#f2ead9">ROUND 15 / NATIVE ANIMATION</text><text x="1560" y="158" font-family="sans-serif" font-size="32" fill="#758678">ORIGINAL FIGURES / 3000 MS</text></svg>\n';
}

/** Enter each animation from READY by normal advancement, never editor run-to. */
export function animationSceneSource() {
  return '\uFEFF' + crlf([
    '; Round 15 finite animation fixture. Preserve BOM, CRLF, targets, mixed identities and author notes.',
    'changeBg:stage.svg -duration=0 -exitDuration=0 -next; R15 preserve: original measurement stage @makenovel-node r15-stage',
    'changeFigure:lin-neutral.svg -id=r15-hero -right -duration=0 -exitDuration=0 -next; R15 preserve: orange custom target',
    'changeFigure:yu-neutral.svg -left -duration=0 -exitDuration=0 -next; R15 preserve: blue alternate target',
    'say:【R15-READY 动画起点】右侧橙色人物为 r15-hero，左侧蓝色人物为 fig-left。下一次正常推进开始三秒平移。 -speaker=测试员; R15 preserve: normal entry',
    'setAnimation:move-right -target=r15-hero -keep=false -parallel=false -transformFrom=current -next; R15 preserve: explicit false and current @makenovel-node r15-animation-hero',
    'say:【R15-MOVING 平移进行】立即继续让本句与动画同时出现；动画运行中不能保存玩家进度。 -speaker=测试员; R15 preserve: animation target dialogue @makenovel-node r15-moving',
    'say:【R15-STABLE 稳定存档点】人物平移已结算，可在此保存。继续将关闭两个人物，再快速读取核对人物和最终位置。 -speaker=测试员; R15 preserve: stable save anchor @makenovel-node r15-stable',
    'changeFigure:none -id=r15-hero -right -duration=0 -next; R15 preserve: close exact custom target',
    'changeFigure:none -left -duration=0 -next; R15 preserve: close alternate slot',
    'say:【R15-CLOSED 目标已关闭】舞台只剩背景。在此读取先前稳定存档，应恢复两个人物及动画目标的最终位置。 -speaker=测试员; R15 preserve: restoration observation',
    'changeFigure:yu-neutral.svg -left -duration=0 -exitDuration=0 -next; R15 preserve: fresh left figure',
    'say:【R15-READY-SECOND 手动等待起点】继续后左侧蓝色人物向左平移。本段 next=false，动画结束后仍需手动推进。 -speaker=测试员; R15 preserve: manual entry',
    '; R15 preserve: standalone author note with opaque tokens alpha={a:b} -future=kept',
    '; @makenovel-node r15-animation-manual',
    'setAnimation:move-left -target=fig-left -next=false; R15 preserve: legacy standalone identity and explicit false',
    'say:【R15-MANUAL 手动后继】本句不应由动画自然结束自动出现。有限动画中提前点击先结算，再点击才推进。 -speaker=测试员; R15 preserve: manual target dialogue @makenovel-node r15-manual',
    'changeFigure:none -left -duration=0 -next; R15 preserve: close manual target',
    'say:【R15-BG-READY 背景起点】下一次推进使用嵌套动画资源，让背景横向移动；应同时观察背景标尺与对白。 -speaker=测试员; R15 preserve: background entry',
    'setAnimation:nested.json/move.json-side -target=bg-main -next; R15 preserve: unregistered animation with internal json suffix',
    'say:【R15-BG-MOVING 背景平移】资源目录和文件名中间的 .json 是名称的一部分，不能被选择器删除。 -speaker=测试员; R15 preserve: background target dialogue @makenovel-node r15-bg-moving',
    'say:【R15-BG-STABLE 样片终点】独立动画沿原生引擎执行。本样片不代表循环、跨句相位恢复或完整时间轴已验收。 -speaker=测试员; R15 preserve: final anchor',
    'end;',
  ]);
}

/** Inspection only: unsupported syntax and absent resources are not a play route. */
export function boundarySceneSource() {
  return crlf([
    '; Round 15 inspection boundaries only. Do not use this scene as normal playback evidence.',
    ...BOUNDARY_CASES.flatMap(entry => [
      `${entry.source} R15 preserve: ${entry.kind} alpha={a:b}`,
      `say:【${entry.label}】检查前一条原生动画语句；保留高级语法。缺失资源或目标不构成可见动画通过证据。 -speaker=测试员;`,
    ]),
    'end;',
  ]);
}

export function animationFiles(gameKey) {
  const files = originalFiles(gameKey);
  files.delete('game/background/day.svg'); files.delete('game/background/night.svg');
  files.set('game/background/stage.svg', animationBackground());
  files.set('game/config.txt', crlf([
    'Game_name:MakeNovel 第十五轮独立动画验证;', `Game_key:${gameKey};`, 'Title_img:stage.svg;',
    'Title_bgm:none;', 'Enable_Appreciation:false;', 'Enable_Continue:true;', 'Enable_flowchart:true;',
  ]));
  files.set('game/scene/start.txt', animationSceneSource());
  files.set('game/scene/readonly.txt', boundarySceneSource());
  files.set('game/animation/animationTable.json', JSON.stringify(ANIMATION_RESOURCES.map(entry => entry.name), null, 2) + '\n');
  for (const entry of ANIMATION_RESOURCES) {
    files.set(entry.path, JSON.stringify([
      { position: { x: 0 }, duration: 0, ease: 'linear' },
      { position: { x: entry.endX }, duration: entry.duration, ease: 'linear' },
    ], null, 2) + '\n');
  }
  return files;
}

/** New directory only; previous author projects and player slots are never replaced. */
export async function generateAnimationDemo(output) {
  const root = path.resolve(output);
  await assertPlainDirectory(path.dirname(root));
  try { await fs.lstat(root); throw new Error(`OUTPUT_EXISTS: Refusing to replace existing path: ${root}`); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const gameKey = `makenovel-round15-${randomUUID()}`;
  const files = animationFiles(gameKey);
  const templateFiles = [];
  for (const relative of TEMPLATE_FILES) {
    const source = `packages/webgal/public/game/template/${relative}`;
    const { stdout } = await exec('git', ['-C', path.join(REPO, 'vendor/WebGAL'), 'show', `${UPSTREAM_COMMIT}:${source}`], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 });
    const destination = `game/template/${relative}`;
    files.set(destination, stdout); templateFiles.push({ path: destination, sha256: hash(stdout) });
  }
  const { stdout: license } = await exec('git', ['-C', path.join(REPO, 'vendor/WebGAL'), 'show', `${UPSTREAM_COMMIT}:LICENSE`], { encoding: 'buffer' });
  await fs.mkdir(root);
  for (const [relative, bytes] of files) {
    const destination = path.join(root, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes, { flag: 'wx' });
  }
  await fs.writeFile(path.join(root, 'WEBGAL-LICENSE.txt'), license, { flag: 'wx' });
  const result = await sealGame(root, { init: true });
  const verified = await verifyGame(root);
  const receipt = {
    generator: 'integrations/animation-demo/generate.mjs', version: 1,
    originalAssetGenerator: 'integrations/stage-demo/generate.mjs', upstreamCommit: UPSTREAM_COMMIT,
    gameKey, projectId: verified.projectId, manifestHash: verified.manifestHash,
    templateFiles, files: verified.files.length,
    sceneSources: ['game/scene/start.txt', 'game/scene/readonly.txt'].map(file => ({ path: file, sha256: hash(files.get(file)), encoding: 'UTF-8', lineEndings: 'CRLF', bom: file.endsWith('/start.txt') })),
    configSource: { path: 'game/config.txt', sha256: hash(files.get('game/config.txt')) },
    animationCases: ANIMATION_CASES,
    animationResources: ANIMATION_RESOURCES.map(entry => ({ ...entry, sha256: hash(files.get(entry.path)) })),
    boundaryTargets: BOUNDARY_TARGETS.map(entry => ({ path: 'game/scene/readonly.txt', ...entry })),
    originalAssets: [...files.keys()].filter(file => /\.(svg|wav)$/.test(file)),
    limitation: 'Original placeholders, no commercial artwork. JSON duration is configuration, not a playback measurement or editable command parameter. Enter from READY using normal native playback; editor run-to is not animation or player-save evidence. next=false requires manual advancement after completion. Saving finite animation in progress must be refused; stable saves restore final effects, not playback phase. upper.JSON tests case-insensitive suffix selection, but the locked runtime requests upper.json: case-sensitive hosting needs a lowercase file suffix. readonly.txt is inspection only. No custom executor or clock. Shared reviewed runtime required; edits require explicit resealing.',
  };
  if (result.manifest.manifestHash !== receipt.manifestHash) throw new Error('Generated manifest changed before receipt.');
  await fs.writeFile(path.join(root, 'animation-demo-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(root, 'ASSET-CREDITS.txt'),
    `MakeNovel round 15 finite animation development fixture\n\nThe pale SVG measurement stage and four animation JSON resources are original programmatic content from integrations/animation-demo/generate.mjs. Orange LIN and blue YU SVG characters, the unused black background and diagnostic PCM tones are original placeholders from integrations/stage-demo/generate.mjs. No commercial artwork, music, or speech recordings were copied. Original generated content follows this project's MPL-2.0 license.\n\nGUI template text: WebGAL, https://github.com/OpenWebGAL/WebGAL, commit ${UPSTREAM_COMMIT}, MPL-2.0; see WEBGAL-LICENSE.txt. Shared engine media retain their upstream terms.\n\nThe main scene uses only static figures, a background, finite animations and unvoiced dialogue. Formal artwork, voice quality, accessibility and release acceptance remain separate. Initial source/config identity appears in animation-demo-receipt.json; later edits need explicit resealing.\n`, { flag: 'wx' });
  return { output: root, ...receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output' || !args[1] || args[1].startsWith('--')) {
    console.error('Usage: node integrations/animation-demo/generate.mjs --output <new-project-path>');
    process.exitCode = 1;
  } else {
    generateAnimationDemo(args[1]).then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(cause => { console.error(cause.message); process.exitCode = 1; });
  }
}
