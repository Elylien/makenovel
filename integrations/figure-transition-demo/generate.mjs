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
export const TRANSITION_CASES = Object.freeze([
  { key: 'inline-left-next', beforeLine: 3, commandLine: 4, duration: 1200, enterDuration: 2200, exitDuration: 2600,
    next: true, file: 'lin-neutral.svg', position: 'left', explicitPosition: true, target: 'fig-left',
    nodeId: 'r13-left', markerKind: 'inline', targetLine: 5, targetLabel: 'R13-LEFT',
    targetNodeId: 'r13-left-target', closeLine: 6, closedLine: 7, closedLabel: 'R13-CLOSED',
    plannedEdit: { enterDuration: 3200, exitDuration: 3000 } },
  { key: 'legacy-id-right-stop', beforeLine: 7, markerLine: 9, commandLine: 10, duration: 2400, exitDuration: 2100,
    next: false, file: 'yu-neutral.svg', position: 'right', explicitPosition: true, id: 'r13-hero', target: 'r13-hero',
    nodeId: 'r13-right', markerKind: 'standalone', targetLine: 11, targetLabel: 'R13-RIGHT',
    targetNodeId: 'r13-right-target', closeLine: 12, closedLine: 13, closedLabel: 'R13-CLOSED-SECOND',
    plannedEdit: { duration: 3000 } },
  { key: 'unregistered-center-next', beforeLine: 13, commandLine: 14, duration: 1800, exitDuration: 2200,
    next: true, file: 'lin-smile.svg', position: 'center', explicitPosition: false, target: 'fig-center',
    targetLine: 15, targetLabel: 'R13-UNREGISTERED', targetNodeId: 'r13-unregistered-target',
    closeLine: 16, closedLine: 17, closedLabel: 'R13-AFTER', plannedEdit: { duration: 1600 } },
]);
export const BOUNDARY_TARGETS = Object.freeze([
  { line: 3, label: 'R13-CUSTOM', sourceLine: 2, kind: 'custom-animation' },
  { line: 5, label: 'R13-DIFF', sourceLine: 4, kind: 'figure-difference' },
  { line: 7, label: 'R13-RESERVED', sourceLine: 6, kind: 'reserved-id' },
  { line: 9, label: 'R13-POSITIONS', sourceLine: 8, kind: 'multiple-positions' },
  { line: 11, label: 'R13-MODEL', sourceLine: 10, kind: 'model-parameters' },
  { line: 13, label: 'R13-OPAQUE', sourceLine: 12, kind: 'unknown-option' },
  { line: 15, label: 'R13-ASSOCIATED', sourceLine: 14, kind: 'associated-animation' },
]);

/** Pale, original stage lets transparent orange and blue figures remain distinct. */
export function transitionBackground() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="2560" height="1440" viewBox="0 0 2560 1440"><rect width="2560" height="1440" fill="#eef0e5"/><rect y="980" width="2560" height="460" fill="#dce2d7"/><path d="M0 980 H2560 M0 1200 H2560" stroke="#c5cec0" stroke-width="6"/><path d="M700 320 V930 M1280 320 V930 M1860 320 V930" stroke="#c5cec0" stroke-width="4" stroke-dasharray="12 18"/><rect x="100" y="85" width="1120" height="110" rx="18" fill="#31484b"/><text x="145" y="158" font-family="sans-serif" font-size="54" fill="#f6f3df">ROUND 13 / FIGURE TRANSITIONS</text><text x="700" y="275" text-anchor="middle" font-family="sans-serif" font-size="44" fill="#85634c">LEFT / LIN</text><text x="1280" y="275" text-anchor="middle" font-family="sans-serif" font-size="44" fill="#526851">CENTER</text><text x="1860" y="275" text-anchor="middle" font-family="sans-serif" font-size="44" fill="#416b80">RIGHT / YU</text><text x="130" y="910" font-family="sans-serif" font-size="32" fill="#758678">ORIGINAL FIGURES / NATIVE PLAYBACK</text></svg>\n';
}

/** Enter each case from its preceding dialogue; run-to skips transition playback. */
export function transitionSceneSource() {
  return '\uFEFF' + crlf([
    '; Round 13 figure transition fixture. Preserve BOM, CRLF, targets, mixed identities, and author notes.',
    'changeBg:stage.svg -duration=0 -exitDuration=0 -next; R13 preserve: pale observation stage @makenovel-node r13-initial',
    'say:【R13-BEFORE 第一段起点】文字显示完整后点击继续。橙色林将从左侧渐入，下一句会同时出现；请观察人物由透明到清晰的过程。 -speaker=测试员; R13 preserve: first entry',
    'changeFigure:lin-neutral.svg -left -duration=1200 -enterDuration=2200 -exitDuration=2600 -next; R13 preserve: inline left-slot author note @makenovel-node r13-left',
    'say:【R13-LEFT 左侧入场】入场使用 enterDuration，duration 作为回退。待人物稳定后继续，观察左槽立绘按先前配置淡出。 -speaker=测试员; R13 preserve: first target @makenovel-node r13-left-target',
    'changeFigure:none -left -duration=0 -next; R13 preserve: close fig-left uses preceding figure exit setting',
    'say:【R13-CLOSED 第二段起点】待人物退场后继续。蓝色羽按自定义 ID 显示在右侧，未开启立即继续，人物清晰后再点击才进入下一句。 -speaker=测试员; R13 preserve: second entry',
    '; R13 preserve: standalone author note with opaque tokens alpha={a:b} -future=kept',
    '; @makenovel-node r13-right',
    'changeFigure:yu-neutral.svg -id=r13-hero -right -duration=2400 -exitDuration=2100 -next=false; R13 preserve: legacy free-figure author note',
    'say:【R13-RIGHT 自定义 ID 入场】这条立绘保留旧式身份。右侧人物的舞台目标是 r13-hero，不是 fig-right。再次继续会按原目标关闭人物。 -speaker=测试员; R13 preserve: second target @makenovel-node r13-right-target',
    'changeFigure:none -id=r13-hero -right -duration=0 -next; R13 preserve: close r13-hero keeps explicit right base position',
    'say:【R13-CLOSED-SECOND 第三段起点】待人物退场后继续。下一条立绘省略位置，使用中间槽；起初没有持久身份，仅在实际修改时登记。 -speaker=测试员; R13 preserve: third entry',
    'changeFigure:lin-smile.svg -duration=1800 -exitDuration=2200 -next; R13 preserve: unregistered implicit-center author note',
    'say:【R13-UNREGISTERED 中间入场】可在本句导演面板修改前面的立绘时长，并与对白一并应用和撤销。继续后观察最后一次退场。 -speaker=测试员; R13 preserve: third target @makenovel-node r13-unregistered-target',
    'changeFigure:none -duration=0 -next; R13 preserve: close implicit fig-center',
    'say:【R13-AFTER 后继对白】所有转场均沿原生播放器执行。保存字节、目标位置、局部草稿和实际播放分别核验；快速执行到目标不能证明转场过程。 -speaker=测试员; R13 preserve: successor',
    'end;',
  ]);
}

/** Inspection-only advanced forms are not reachable from start.txt. */
export function boundarySceneSource() {
  return crlf([
    '; Round 13 read-only boundaries. Open explicitly for authoring inspection; not a playable acceptance route.',
    'changeFigure:lin-neutral.svg -left -duration=700 -enter=r13-custom-fade -next; R13 preserve: custom animation reference',
    'say:【R13-CUSTOM 自定义动画】保留外部动画引用，不将帧动画时长冒充为普通转场时长。 -speaker=测试员;',
    'changeFigureDiff:lin-smile.svg -left -next; R13 preserve: difference command is not a new figure transition',
    'say:【R13-DIFF 差分命令】差分沿用原生行为，不按新立绘转场重写。 -speaker=测试员;',
    'changeFigure:lin-neutral.svg -id=fig-left -left -duration=800 -next; R13 preserve: reserved target spelling is an explicit free-figure id',
    'say:【R13-RESERVED 保留 ID】保留目标原文，不将显式 ID 改写为普通位置槽。 -speaker=测试员;',
    'changeFigure:yu-neutral.svg -left -right -duration=900 -next; R13 preserve: multiple position arguments',
    'say:【R13-POSITIONS 多位置】含多个位置参数的原句保持只读边界。 -speaker=测试员;',
    'changeFigure:yu-neutral.svg -right -motion=idle -bounds=0,0,800,1400 -duration=1000 -next; R13 preserve: model-specific parameters on static fixture asset',
    'say:【R13-MODEL 模型参数】保留模型参数，不把它们视为普通静态图片转场。 -speaker=测试员;',
    'changeFigure:lin-neutral.svg -left -duration=1100 -r13Opaque=kept -next; R13 preserve: unknown option alpha={a:b}',
    'say:【R13-OPAQUE 未知参数】保留未知源码和作者注释。 -speaker=测试员;',
    'changeFigure:yu-neutral.svg -right -mouthOpen=yu-smile.svg -duration=1200 -next; R13 preserve: associated animation keeps its own contract',
    'say:【R13-ASSOCIATED 关联动画】口型或眨眼等关联动画不纳入本轮时长编辑。 -speaker=测试员;',
    'end;',
  ]);
}

export function transitionFiles(gameKey) {
  const files = originalFiles(gameKey);
  files.delete('game/background/day.svg'); files.delete('game/background/night.svg');
  files.set('game/background/stage.svg', transitionBackground());
  files.set('game/config.txt', crlf([
    'Game_name:MakeNovel 第十三轮立绘转场验证;', `Game_key:${gameKey};`, 'Title_img:stage.svg;',
    'Title_bgm:none;', 'Enable_Appreciation:false;', 'Enable_Continue:true;', 'Enable_flowchart:true;',
  ]));
  files.set('game/scene/start.txt', transitionSceneSource());
  files.set('game/scene/readonly.txt', boundarySceneSource());
  files.set('game/animation/animationTable.json', '["r13-custom-fade"]\n');
  files.set('game/animation/r13-custom-fade.json', '[{"duration":0,"alpha":0},{"duration":1700,"alpha":1,"ease":"linear"}]\n');
  return files;
}

/** New directory only; previous author projects and player slots are never replaced. */
export async function generateFigureTransitionDemo(output) {
  const root = path.resolve(output);
  await assertPlainDirectory(path.dirname(root));
  try { await fs.lstat(root); throw new Error(`OUTPUT_EXISTS: Refusing to replace existing path: ${root}`); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const gameKey = `makenovel-round13-${randomUUID()}`;
  const files = transitionFiles(gameKey);
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
    generator: 'integrations/figure-transition-demo/generate.mjs', version: 1,
    originalAssetGenerator: 'integrations/stage-demo/generate.mjs', upstreamCommit: UPSTREAM_COMMIT,
    gameKey, projectId: verified.projectId, manifestHash: verified.manifestHash,
    templateFiles, files: verified.files.length,
    sceneSources: ['game/scene/start.txt', 'game/scene/readonly.txt'].map(file => ({ path: file, sha256: hash(files.get(file)), encoding: 'UTF-8', lineEndings: 'CRLF', bom: file.endsWith('/start.txt') })),
    configSource: { path: 'game/config.txt', sha256: hash(files.get('game/config.txt')) },
    transitionCases: TRANSITION_CASES,
    boundaryTargets: BOUNDARY_TARGETS.map(entry => ({ path: 'game/scene/readonly.txt', ...entry })),
    originalAssets: [...files.keys()].filter(file => /\.(svg|wav)$/.test(file)),
    limitation: 'Original development placeholders, no commercial artwork. Initial configured milliseconds are not playback measurements. Enter from preceding dialogue using normal native playback; editor run-to is not transition evidence. next=false requires player advancement after completion. Exit duration belongs to the displayed figure when later replaced or closed. Explicit id selects a free-figure target while position sets its base position; id and position must both survive editing. Open readonly.txt only for boundary inspection. No custom executor or clock. Shared reviewed runtime required; edits require explicit resealing.',
  };
  if (result.manifest.manifestHash !== receipt.manifestHash) throw new Error('Generated manifest changed before receipt.');
  await fs.writeFile(path.join(root, 'figure-transition-demo-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(root, 'ASSET-CREDITS.txt'),
    `MakeNovel round 13 figure transition development fixture\n\nThe pale SVG stage and r13-custom-fade animation are original programmatic content from integrations/figure-transition-demo/generate.mjs. Orange LIN and blue YU SVG characters, the unused black background and diagnostic PCM tones are original placeholders from integrations/stage-demo/generate.mjs. No commercial artwork, music, or speech recordings were copied. Original generated content follows this project's MPL-2.0 license.\n\nGUI template text: WebGAL, https://github.com/OpenWebGAL/WebGAL, commit ${UPSTREAM_COMMIT}, MPL-2.0; see WEBGAL-LICENSE.txt. Shared engine media retain their upstream terms.\n\nThe main transition scene uses only static figures, a background and unvoiced dialogue. Formal artwork, voice quality, accessibility and release acceptance remain separate. Initial source/config identity appears in figure-transition-demo-receipt.json; later edits need explicit resealing.\n`, { flag: 'wx' });
  return { output: root, ...receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output' || !args[1] || args[1].startsWith('--')) {
    console.error('Usage: node integrations/figure-transition-demo/generate.mjs --output <new-project-path>');
    process.exitCode = 1;
  } else {
    generateFigureTransitionDemo(args[1]).then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(cause => { console.error(cause.message); process.exitCode = 1; });
  }
}
