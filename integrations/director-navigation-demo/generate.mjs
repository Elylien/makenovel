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
export const BRIDGE_DIALOGUES = 80;
export const NAVIGATION_TARGET = Object.freeze({ path: 'game/scene/start.txt', line: 88, label: 'R9-TARGET', nodeId: 'r9-target' });
export const SOURCE_TARGETS = Object.freeze([
  { line: 2, command: 'changeBg', nodeId: 'r9-background', registered: true },
  { line: 3, command: 'changeFigure', target: 'position:left', registered: false },
  { line: 4, command: 'changeFigure', target: 'position:right', nodeId: 'r9-right', registered: true },
  { line: 5, command: 'bgm', registered: false },
]);

/** The long linear prefix puts each source outside the final dialogue's virtual window. */
export function navigationSceneSource() {
  const bridges = Array.from({ length: BRIDGE_DIALOGUES }, (_, index) =>
    `say:【R9-PASS-${String(index + 1).padStart(2, '0')}】这是来源定位的第 ${index + 1} 句线性过渡；沿用日景、双角色和背景测试音。 -speaker=测试员; R9 preserve: bridge ${index + 1}`);
  return '\uFEFF' + crlf([
    '; Round 9 navigation fixture. Preserve BOM, CRLF, mixed identities, and author comments.',
    'changeBg:day.svg -duration=250 -next; R9 preserve: registered background @makenovel-node r9-background',
    'changeFigure:lin-neutral.svg -left -duration=250 -next; R9 preserve: unregistered left actor',
    'changeFigure:yu-neutral.svg -right -duration=250 -next; R9 preserve: registered right actor @makenovel-node r9-right',
    'bgm:test-bgm.wav -volume=28 -enter=0 -next; R9 preserve: unregistered music',
    'wait:500 -nobreak;',
    ...bridges,
    '; R9 opaque author note: keep {navigation: [source, draft, return]} exactly here.',
    'say:【R9-TARGET 来源定位】前文来源远在列表开头。请检查定位与返回，并在本句新增素材草稿后再次查看来源。 -speaker=林 -vocal=voice-a.wav -left; R9 preserve: navigation target @makenovel-node r9-target',
    'say:【R9-AFTER 后继对白】前句新增的设置会成为这里的较早来源。局部草稿应在明确应用后才改变主文档。 -speaker=羽 -vocal=voice-b.wav -right; R9 preserve: following dialogue',
    'choose:查看来源边界:boundary|结束:finish;',
    'label:boundary;',
    'say:【R9-LABEL 标签边界】标签之前的舞台不能当作确定来源。没有具体来源的未知项不应提供误导的定位目标。 -speaker=测试员;',
    'changeScene:readonly.txt;',
    'label:finish;',
    'end;',
  ]);
}

/** Source facts remain inspectable without claiming the final state of a diff. */
export function boundarySceneSource() {
  return crlf([
    '; Round 9 read-only source-boundary fixture. A concrete diff is not an inferred stage result.',
    'setVar:round9_boundary=1; R9 preserve: command outside director scope',
    'say:【R9-UNKNOWN 无具体来源】前一行是变量命令，背景、音乐与角色来源应为未知且没有可定位的来源行。 -speaker=测试员;',
    'changeFigureDiff:lin-smile.svg -left -next; R9 preserve: concrete unknown result @makenovel-node r9-diff',
    'wait:500 -nobreak;',
    'say:【R9-DIFF 差分来源】左侧差分有可查看的原始命令，但作者面板不能据此保证人物最终状态。 -speaker=测试员;',
    'end;',
  ]);
}

export function navigationFiles(gameKey) {
  const files = originalFiles(gameKey);
  files.set('game/config.txt', crlf([
    'Game_name:MakeNovel 第九轮导演来源定位验证;', `Game_key:${gameKey};`, 'Title_img:day.svg;',
    'Title_bgm:test-bgm.wav;', 'Enable_Appreciation:false;', 'Enable_Continue:true;', 'Enable_flowchart:true;',
  ]));
  files.set('game/scene/start.txt', navigationSceneSource());
  files.set('game/scene/readonly.txt', boundarySceneSource());
  for (const file of ['game/background/day.svg', 'game/background/night.svg']) {
    files.set(file, files.get(file).replace('ROUND 6 /', 'ROUND 9 /'));
  }
  return files;
}

/** Generate a fresh project exclusively; old author files are never read or replaced. */
export async function generateNavigationDemo(output) {
  const root = path.resolve(output);
  await assertPlainDirectory(path.dirname(root));
  try { await fs.lstat(root); throw new Error(`OUTPUT_EXISTS: Refusing to replace existing path: ${root}`); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const gameKey = `makenovel-round9-${randomUUID()}`;
  const files = navigationFiles(gameKey);
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
    generator: 'integrations/director-navigation-demo/generate.mjs', version: 1,
    originalAssetGenerator: 'integrations/stage-demo/generate.mjs', upstreamCommit: UPSTREAM_COMMIT,
    gameKey, projectId: verified.projectId, manifestHash: verified.manifestHash,
    templateFiles, files: verified.files.length,
    sceneSources: ['game/scene/start.txt', 'game/scene/readonly.txt'].map(file => ({ path: file, sha256: hash(files.get(file)), encoding: 'UTF-8', lineEndings: 'CRLF', bom: file.endsWith('/start.txt') })),
    configSource: { path: 'game/config.txt', sha256: hash(files.get('game/config.txt')) },
    navigationTarget: NAVIGATION_TARGET, sourceTargets: SOURCE_TARGETS, bridgeDialogues: BRIDGE_DIALOGUES,
    boundaryTargets: [
      { path: 'game/scene/start.txt', line: 92, label: 'R9-LABEL' },
      { path: 'game/scene/readonly.txt', line: 3, label: 'R9-UNKNOWN' },
      { path: 'game/scene/readonly.txt', line: 6, label: 'R9-DIFF', sourceLine: 4, sourceNodeId: 'r9-diff' },
    ],
    originalAssets: [...files.keys()].filter(file => /\.(svg|wav)$/.test(file)),
    limitation: 'Original development placeholders and diagnostic voice-channel tones, not speech. Source lookup is an authoring operation, not runtime state reconstruction. The concrete diff is only a provenance case. Shared reviewed runtime required. Receipt records generation only; author edits require explicit resealing.',
  };
  if (result.manifest.manifestHash !== receipt.manifestHash) throw new Error('Generated manifest changed before receipt.');
  await fs.writeFile(path.join(root, 'director-navigation-demo-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(root, 'ASSET-CREDITS.txt'),
    `MakeNovel round 9 director source navigation development fixture\n\nSVG characters/backgrounds and PCM diagnostic tones are original programmatic placeholders from integrations/stage-demo/generate.mjs, adapted by integrations/director-navigation-demo/generate.mjs. No commercial artwork, music, or speech recordings were copied. Original generated content follows this project's MPL-2.0 license.\n\nGUI template text: WebGAL, https://github.com/OpenWebGAL/WebGAL, commit ${UPSTREAM_COMMIT}, MPL-2.0; see WEBGAL-LICENSE.txt. Shared engine media retain their upstream terms.\n\nVoice files are diagnostic tones, not speech. Formal artwork, voice quality, accessibility and release acceptance remain separate. The initial source/config identity is recorded only in director-navigation-demo-receipt.json.\n`, { flag: 'wx' });
  return { output: root, ...receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output' || !args[1] || args[1].startsWith('--')) {
    console.error('Usage: node integrations/director-navigation-demo/generate.mjs --output <new-project-path>');
    process.exitCode = 1;
  } else {
    generateNavigationDemo(args[1]).then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(cause => { console.error(cause.message); process.exitCode = 1; });
  }
}
