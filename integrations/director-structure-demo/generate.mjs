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
export const STRUCTURE_TARGET = Object.freeze({ path: 'game/scene/start.txt', line: 17, label: 'R10-TARGET', nodeId: 'r10-target' });
export const STRUCTURE_CASES = Object.freeze({
  background: { line: 9, nodeId: 'r10-night', earlierLine: 2, earlierNodeId: 'r10-day' },
  bgm: { line: 10, registered: false, earlierLine: 3 },
  figurePair: [
    { line: 12, content: 'lin-neutral.svg', registered: false },
    { line: 13, content: 'lin-smile.svg', registered: true, nodeId: 'r10-smile' },
  ],
  barriers: [{ line: 8, kind: 'comment' }, { line: 11, kind: 'wait' }, { line: 14, kind: 'comment' }],
  legacyEffect: { line: 16, markerLine: 15, nodeId: 'r10-se' },
  successor: { line: 18, label: 'R10-AFTER' },
});

/** Adjacent same-position figures make native order observable; comments and wait remain barriers. */
export function structureSceneSource() {
  return '\uFEFF' + crlf([
    '; Round 10 structure fixture. Preserve BOM, CRLF, mixed identities, and author comments.',
    'changeBg:day.svg -duration=250 -next; R10 preserve: earlier day @makenovel-node r10-day',
    'bgm:test-bgm.wav -volume=28 -enter=0 -next; R10 preserve: earlier music',
    'changeFigure:lin-neutral.svg -left -duration=250 -next; R10 preserve: earlier left actor',
    'changeFigure:yu-neutral.svg -right -duration=250 -next; R10 preserve: earlier right actor',
    'wait:500 -nobreak;',
    'say:【R10-01 前文舞台】日景、双角色与音量 28 的背景测试音已建立。下一句有自己的舞台设置，删除局部设置后可查看较早来源。 -speaker=林 -vocal=voice-a.wav -left; R10 preserve: earlier dialogue',
    '; R10 preserve: standalone barrier before local commands {owner: author, move: never}.',
    'changeBg:night.svg -duration=250 -next; R10 preserve: local night author note @makenovel-node r10-night',
    'bgm:test-bgm.wav -volume=41 -enter=0 -next; R10 preserve: local music author note',
    'wait:500 -nobreak; R10 preserve: wait barrier',
    'changeFigure:lin-neutral.svg -left -duration=0 -next; R10 preserve: unregistered neutral order note',
    'changeFigure:lin-smile.svg -left -duration=0 -next; R10 preserve: registered smile order note @makenovel-node r10-smile',
    '; R10 preserve: standalone barrier before legacy effect {order: [neutral, smile]}.',
    '; @makenovel-node r10-se',
    'playEffect:test-se.wav -volume=55 -next; R10 preserve: one-shot author note',
    'say:【R10-TARGET 结构编辑】请调整本句前的设置。移除夜景后查看日景来源；交换左侧两条立绘命令，观察最后一条决定的表情。 -speaker=羽 -vocal=voice-b.wav -right; R10 preserve: structure target @makenovel-node r10-target',
    'say:【R10-AFTER 后继对白】这一句没有自己的舞台修改，沿用前句设置。提示音只触发一次，不代表持续播放；删除和排序应作为一批撤销。 -speaker=测试员; R10 preserve: inherited successor',
    'end;',
  ]);
}

/** Open this scene explicitly in Terre to inspect unsupported source boundaries. */
export function boundarySceneSource() {
  return crlf([
    '; Round 10 read-only boundary fixture. Unknown commands and options stay outside structural controls.',
    'changeBg:night.svg -duration=0 -next -r10Opaque=kept; R10 preserve: unknown option alpha={a:b}',
    'wait:500 -nobreak; R10 preserve: boundary wait',
    'say:【R10-OPAQUE 不透明参数】前面的背景命令带有面板不认识的参数，应保留源码，不能提供删除或排序。 -speaker=测试员;',
    'setVar:round10_boundary=1; R10 preserve: command outside director scope',
    'say:【R10-COMMAND 命令边界】前面的变量命令超出导演范围，不能作为可重排舞台卡片。 -speaker=测试员;',
    'end;',
  ]);
}

export function structureFiles(gameKey) {
  const files = originalFiles(gameKey);
  files.set('game/config.txt', crlf([
    'Game_name:MakeNovel 第十轮导演删除与排序验证;', `Game_key:${gameKey};`, 'Title_img:day.svg;',
    'Title_bgm:test-bgm.wav;', 'Enable_Appreciation:false;', 'Enable_Continue:true;', 'Enable_flowchart:true;',
  ]));
  files.set('game/scene/start.txt', structureSceneSource());
  files.set('game/scene/readonly.txt', boundarySceneSource());
  for (const file of ['game/background/day.svg', 'game/background/night.svg']) {
    files.set(file, files.get(file).replace('ROUND 6 /', 'ROUND 10 /'));
  }
  return files;
}

/** Generate exclusively in a new directory; prior games and player data are never touched. */
export async function generateStructureDemo(output) {
  const root = path.resolve(output);
  await assertPlainDirectory(path.dirname(root));
  try { await fs.lstat(root); throw new Error(`OUTPUT_EXISTS: Refusing to replace existing path: ${root}`); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const gameKey = `makenovel-round10-${randomUUID()}`;
  const files = structureFiles(gameKey);
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
    generator: 'integrations/director-structure-demo/generate.mjs', version: 1,
    originalAssetGenerator: 'integrations/stage-demo/generate.mjs', upstreamCommit: UPSTREAM_COMMIT,
    gameKey, projectId: verified.projectId, manifestHash: verified.manifestHash,
    templateFiles, files: verified.files.length,
    sceneSources: ['game/scene/start.txt', 'game/scene/readonly.txt'].map(file => ({ path: file, sha256: hash(files.get(file)), encoding: 'UTF-8', lineEndings: 'CRLF', bom: file.endsWith('/start.txt') })),
    configSource: { path: 'game/config.txt', sha256: hash(files.get('game/config.txt')) },
    structureTarget: STRUCTURE_TARGET, structureCases: STRUCTURE_CASES,
    boundaryTargets: [
      { path: 'game/scene/readonly.txt', line: 4, label: 'R10-OPAQUE', sourceLine: 2 },
      { path: 'game/scene/readonly.txt', line: 6, label: 'R10-COMMAND', sourceLine: 5 },
    ],
    originalAssets: [...files.keys()].filter(file => /\.(svg|wav)$/.test(file)),
    limitation: 'Original development placeholders and diagnostic voice-channel tones, not speech. Adjacent commands have native order semantics; source facts do not prove loaded runtime state. Open readonly.txt explicitly for authoring boundary checks. Shared reviewed runtime required. Receipt records generation only; author edits require explicit resealing.',
  };
  if (result.manifest.manifestHash !== receipt.manifestHash) throw new Error('Generated manifest changed before receipt.');
  await fs.writeFile(path.join(root, 'director-structure-demo-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(root, 'ASSET-CREDITS.txt'),
    `MakeNovel round 10 director structure editing development fixture\n\nSVG characters/backgrounds and PCM diagnostic tones are original programmatic placeholders from integrations/stage-demo/generate.mjs, adapted by integrations/director-structure-demo/generate.mjs. No commercial artwork, music, or speech recordings were copied. Original generated content follows this project's MPL-2.0 license.\n\nGUI template text: WebGAL, https://github.com/OpenWebGAL/WebGAL, commit ${UPSTREAM_COMMIT}, MPL-2.0; see WEBGAL-LICENSE.txt. Shared engine media retain their upstream terms.\n\nVoice files are diagnostic tones, not speech. Formal artwork, voice quality, accessibility and release acceptance remain separate. The initial source/config identity is recorded only in director-structure-demo-receipt.json.\n`, { flag: 'wx' });
  return { output: root, ...receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output' || !args[1] || args[1].startsWith('--')) {
    console.error('Usage: node integrations/director-structure-demo/generate.mjs --output <new-project-path>');
    process.exitCode = 1;
  } else {
    generateStructureDemo(args[1]).then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(cause => { console.error(cause.message); process.exitCode = 1; });
  }
}
