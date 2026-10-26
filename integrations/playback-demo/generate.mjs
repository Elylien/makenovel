import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { originalFiles, REPO, UPSTREAM_COMMIT } from '../stage-demo/generate.mjs';
import { animationBackground } from '../animation-demo/generate.mjs';
import { assertPlainDirectory, sealGame, verifyGame } from '../game-manifest/manifest.mjs';

const exec = promisify(execFile);
const TEMPLATE_FILES = ['template.json', 'Stage/Choose/choose.scss', 'Stage/TextBox/textbox.scss', 'UI/Title/title.scss'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = lines => '\uFEFF' + lines.join('\r\n') + '\r\n';

export const PLAYBACK_RESOURCES = Object.freeze([
  { name: 'move-right-eight', path: 'game/animation/move-right-eight.json', duration: 8000, endX: 180 },
  { name: 'move-left-eight', path: 'game/animation/move-left-eight.json', duration: 8000, endX: -180 },
]);
export const PLAYBACK_STOPS = Object.freeze([
  { scene: 'start.txt', line: 5, label: 'R16-READY', nodeId: 'r16-ready' },
  { scene: 'motion.txt', line: 3, label: 'R16-MOVING', nodeId: 'r16-moving' },
  { scene: 'motion.txt', line: 4, label: 'R16-STABLE', nodeId: 'r16-stable' },
  { scene: 'motion.txt', line: 7, label: 'R16-CLOSED', nodeId: 'r16-closed' },
  { scene: 'motion.txt', line: 9, label: 'R16-MANUAL-READY', nodeId: 'r16-manual-ready' },
  { scene: 'motion.txt', line: 11, label: 'R16-MANUAL', nodeId: 'r16-manual' },
  ...Array.from({ length: 8 }, (_, i) => ({ scene: 'motion.txt', line: 12 + i, label: `R16-MODE-${String(i + 1).padStart(2, '0')}`, nodeId: `r16-mode-${i + 1}` })),
  { scene: 'motion.txt', line: 20, label: 'R16-END', nodeId: 'r16-end' },
]);

export function playbackStartSource() {
  return source([
    '; Round 16 native playback fixture. Preserve BOM, CRLF, stable identity and author comments.',
    'changeBg:stage.svg -duration=0 -exitDuration=0 -next; R16 preserve: original measurement stage @makenovel-node r16-stage',
    'changeFigure:lin-neutral.svg -id=r16-hero -right -duration=0 -exitDuration=0 -next; R16 preserve: orange custom target @makenovel-node r16-orange',
    'changeFigure:yu-neutral.svg -left -duration=0 -exitDuration=0 -next; R16 preserve: blue static target @makenovel-node r16-blue',
    'say:【R16-READY 起点】两个人物就绪。下一次正常推进进入动画章节，右侧橙色人物开始八秒平移。 -speaker=测试员; R16 preserve: normal entry @makenovel-node r16-ready',
    'changeScene:motion.txt; R16 preserve: native scene transition @makenovel-node r16-motion-entry',
    'end;',
  ]);
}

export function playbackMotionSource() {
  return source([
    '; Round 16 first dialogue overlaps a finite animation. No editor run-to for player evidence.',
    'setAnimation:move-right-eight -target=r16-hero -keep=false -parallel=false -transformFrom=current -next; R16 preserve: first-dialogue animation @makenovel-node r16-first-animation',
    'say:【R16-MOVING 动画中】本章节首句与八秒平移重叠。可打开菜单、历史或流程图；动画继续计时，菜单不能推进剧情。 -speaker=测试员; R16 preserve: unstable first snapshot @makenovel-node r16-moving',
    'say:【R16-STABLE 稳定点】人物动画已结算。在此检查“动画章节”解锁并保存；继续关闭人物，再从历史、流程图或存档返回核对。 -speaker=测试员; R16 preserve: stable retry anchor @makenovel-node r16-stable',
    'changeFigure:none -id=r16-hero -right -duration=0 -next; R16 preserve: close orange custom target @makenovel-node r16-close-orange',
    'changeFigure:none -left -duration=0 -next; R16 preserve: close blue target @makenovel-node r16-close-blue',
    'say:【R16-CLOSED 人物已关闭】舞台只剩背景。从历史或已解锁流程节点返回稳定点，应恢复双人和橙色人物最终位置。 -speaker=测试员; R16 preserve: restoration observation @makenovel-node r16-closed',
    'changeFigure:yu-neutral.svg -left -duration=0 -exitDuration=0 -next; R16 preserve: fresh manual-animation target @makenovel-node r16-blue-again',
    'say:【R16-MANUAL-READY 手动段起点】继续后左侧蓝色人物向左移动八秒。关闭自动和快进时，自然结束仍等待手动继续。 -speaker=测试员; R16 preserve: manual entry @makenovel-node r16-manual-ready',
    'setAnimation:move-left-eight -target=fig-left -next=false; R16 preserve: manual finite animation @makenovel-node r16-manual-animation',
    'say:【R16-MANUAL 手动后继】手动模式中本句需要点击才能出现；自动模式等待动画结束和阅读停留时间后再推进。 -speaker=测试员; R16 preserve: manual successor @makenovel-node r16-manual',
    ...Array.from({ length: 8 }, (_, i) => `say:【R16-MODE-${String(i + 1).padStart(2, '0')} 播放停靠 ${i + 1}】用于观察自动或快进状态，关闭模式后本句应停止推进。 -speaker=测试员; R16 preserve: playback stop ${i + 1} @makenovel-node r16-mode-${i + 1}`),
    'say:【R16-END 样片终点】本样片只验证已记录的有限播放组合，不代表模型、完整历史迁移或 Windows 离线验收。 -speaker=测试员; R16 preserve: final marker @makenovel-node r16-end',
    'end;',
  ]);
}

export function playbackFlowchart() {
  return { flowcharts: [{
    id: 'main', name: '第十六轮播放与恢复', type: 'main',
    nodes: [
      { id: 'start', type: 'root', position: { x: 0, y: 0 }, data: { label: '准备起点', sceneName: 'start.txt', isRoot: true } },
      { id: 'motion', type: 'chapter', position: { x: 0, y: 170 }, data: { label: '动画章节', sceneName: 'motion.txt' } },
    ],
    edges: [{ id: 'start-to-motion', source: 'start', target: 'motion' }],
  }] };
}

export function playbackFiles(gameKey) {
  const files = originalFiles(gameKey);
  for (const file of [...files.keys()]) {
    if (/^game\/(?:bgm|vocal)\//.test(file) || /^game\/background\//.test(file) || file.includes('-smile.svg')) files.delete(file);
  }
  files.set('game/background/stage.svg', animationBackground().replace('ROUND 15 / NATIVE ANIMATION', 'ROUND 16 / PLAYBACK &amp; RESTORE').replace('ORIGINAL FIGURES / 3000 MS', 'ORIGINAL FIGURES / 8000 MS'));
  files.set('game/config.txt', [
    'Game_name:MakeNovel 第十六轮播放与恢复验证;', `Game_key:${gameKey};`, 'Title_img:stage.svg;',
    'Title_bgm:none;', 'Enable_Appreciation:false;', 'Enable_Continue:true;', 'Enable_flowchart:true;',
  ].join('\r\n') + '\r\n');
  files.set('game/scene/start.txt', playbackStartSource());
  files.set('game/scene/motion.txt', playbackMotionSource());
  files.set('game/flowchart.json', JSON.stringify(playbackFlowchart(), null, 2) + '\n');
  files.set('game/animation/animationTable.json', JSON.stringify(PLAYBACK_RESOURCES.map(entry => entry.name), null, 2) + '\n');
  for (const entry of PLAYBACK_RESOURCES) {
    files.set(entry.path, JSON.stringify([
      { position: { x: 0 }, duration: 0, ease: 'linear' },
      { position: { x: entry.endX }, duration: entry.duration, ease: 'linear' },
    ], null, 2) + '\n');
  }
  return files;
}

/** New directory only; preserve all previous author projects and player namespaces. */
export async function generatePlaybackDemo(output) {
  const root = path.resolve(output);
  await assertPlainDirectory(path.dirname(root));
  try { await fs.lstat(root); throw new Error(`OUTPUT_EXISTS: Refusing to replace existing path: ${root}`); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const gameKey = `makenovel-round16-${randomUUID()}`;
  const files = playbackFiles(gameKey), templateFiles = [];
  for (const relative of TEMPLATE_FILES) {
    const { stdout } = await exec('git', ['-C', path.join(REPO, 'vendor/WebGAL'), 'show', `${UPSTREAM_COMMIT}:packages/webgal/public/game/template/${relative}`], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 });
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
  const result = await sealGame(root, { init: true }), verified = await verifyGame(root);
  const receipt = {
    generator: 'integrations/playback-demo/generate.mjs', version: 1, upstreamCommit: UPSTREAM_COMMIT,
    originalAssetGenerators: ['integrations/stage-demo/generate.mjs', 'integrations/animation-demo/generate.mjs'],
    gameKey, projectId: verified.projectId, manifestHash: verified.manifestHash, files: verified.files.length,
    templateFiles,
    sceneSources: ['game/scene/start.txt', 'game/scene/motion.txt'].map(file => ({ path: file, sha256: hash(files.get(file)), encoding: 'UTF-8', lineEndings: 'CRLF', bom: true })),
    configSource: { path: 'game/config.txt', sha256: hash(files.get('game/config.txt')) },
    flowchartSource: { path: 'game/flowchart.json', sha256: hash(files.get('game/flowchart.json')) },
    playbackStops: PLAYBACK_STOPS,
    animationResources: PLAYBACK_RESOURCES.map(entry => ({ ...entry, sha256: hash(files.get(entry.path)) })),
    originalAssets: [...files.keys()].filter(file => file.endsWith('.svg')),
    limitation: 'Original placeholders with the native shared engine; no commercial assets or separate player. Enter motion through start READY and changeScene, never editor run-to. The motion first dialogue overlaps an eight-second finite animation; a stable later dialogue is the retry checkpoint for flowchart unlock. Configuration duration is not measured timing. Generated data does not prove menu/auto/skip/history/flowchart or Windows behavior. Edits require explicit resealing.',
  };
  if (result.manifest.manifestHash !== receipt.manifestHash) throw new Error('Generated manifest changed before receipt.');
  await fs.writeFile(path.join(root, 'playback-demo-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(root, 'ASSET-CREDITS.txt'),
    `MakeNovel round 16 native playback development fixture\n\nOrange LIN and blue YU SVG figures are original programmatic placeholders from integrations/stage-demo/generate.mjs. The measurement stage is derived from original integrations/animation-demo/generate.mjs with the round label changed. The two finite animation JSON files and flowchart fixture are original programmatic content from integrations/playback-demo/generate.mjs. No commercial artwork, music, or recordings were copied. Original generated content follows the project MPL-2.0 license.\n\nGUI template: WebGAL, https://github.com/OpenWebGAL/WebGAL, commit ${UPSTREAM_COMMIT}, MPL-2.0; see WEBGAL-LICENSE.txt. Shared engine media retain their upstream terms.\n\nThis fixture contains no audio playback or independent runtime. Sources, stops and initial hashes are in playback-demo-receipt.json; later edits require explicit resealing.\n`, { flag: 'wx' });
  return { output: root, ...receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output' || !args[1] || args[1].startsWith('--')) {
    console.error('Usage: node integrations/playback-demo/generate.mjs --output <new-project-path>');
    process.exitCode = 1;
  } else {
    generatePlaybackDemo(args[1]).then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(cause => { console.error(cause.message); process.exitCode = 1; });
  }
}
