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
export const TIMING_CASES = Object.freeze([
  { key: 'locked', beforeLine: 7, nightLine: 8, animationLine: 9, animationDuration: 800,
    waitLine: 10, duration: 2000, nobreak: true, nodeId: 'r11-locked-wait', markerKind: 'inline',
    dayLine: 11, targetLine: 12, targetLabel: 'R11-LOCKED', targetNodeId: 'r11-locked-target' },
  { key: 'skippable', beforeLine: 12, nightLine: 13, waitLine: 14, duration: 2500, nobreak: false,
    dayLine: 15, targetLine: 16, targetLabel: 'R11-SKIPPABLE', targetNodeId: 'r11-skippable-target' },
  { key: 'legacy', beforeLine: 16, nightLine: 17, markerLine: 18, waitLine: 19, duration: 1200,
    nobreak: true, nodeId: 'r11-legacy-wait', markerKind: 'standalone',
    dayLine: 20, targetLine: 21, targetLabel: 'R11-LEGACY', targetNodeId: 'r11-legacy-target' },
]);
export const TIMING_SUCCESSOR = Object.freeze({ line: 22, label: 'R11-AFTER' });
export const BOUNDARY_TARGETS = Object.freeze([
  { line: 3, label: 'R11-NEXT', sourceLine: 2, kind: 'next-true' },
  { line: 5, label: 'R11-NEXT-FALSE', sourceLine: 4, kind: 'next-false' },
  { line: 8, label: 'R11-DYNAMIC', sourceLine: 7, kind: 'dynamic' },
  { line: 10, label: 'R11-OPAQUE', sourceLine: 9, kind: 'unknown-option' },
  { line: 12, label: 'R11-CONTINUE', sourceLine: 11, kind: 'continue' },
  { line: 14, label: 'R11-WHEN', sourceLine: 13, kind: 'conditional' },
]);

/** Native normal-play intervals have visible night/day edges; no custom clock or executor. */
export function timingSceneSource() {
  return '\uFEFF' + crlf([
    '; Round 11 timing fixture. Preserve BOM, CRLF, wait identity, and author notes.',
    'changeBg:day.svg -duration=0 -next; R11 preserve: initial day @makenovel-node r11-day',
    'bgm:test-bgm.wav -volume=28 -enter=0 -next; R11 preserve: initial music',
    'changeFigure:lin-neutral.svg -left -duration=0 -next; R11 preserve: initial left',
    'changeFigure:yu-neutral.svg -right -duration=0 -next; R11 preserve: initial right',
    'wait:250 -nobreak; R11 preserve: initial setup wait',
    'say:【R11-BEFORE 等待起点】待文字显示完整后点击继续。夜景亮起时开始本段等待，结束后自动回到日景和下一句。 -speaker=测试员; R11 preserve: first interval entry',
    'changeBg:night.svg -duration=0 -next; R11 preserve: locked interval starts',
    'changeFigure:lin-smile.svg -left -duration=800 -next; R11 preserve: transition overlaps following wait',
    'wait:2000 -nobreak; R11 preserve: locked timing author note @makenovel-node r11-locked-wait',
    'changeBg:day.svg -duration=0 -next; R11 preserve: locked interval ends',
    'say:【R11-LOCKED 第一段结束】可在本句面板调整前面的等待。再次继续会进入第二段夜景；默认允许点击提前结束那一段等待。 -speaker=林; R11 preserve: first target @makenovel-node r11-locked-target',
    'changeBg:night.svg -duration=0 -next; R11 preserve: skippable interval starts',
    'wait:2500; R11 preserve: unregistered skippable timing author note',
    'changeBg:day.svg -duration=0 -next; R11 preserve: skippable interval ends',
    'say:【R11-SKIPPABLE 第二段结束】本句前等待起初没有节点标记。下一段保留独立的旧式标记，用来检查编辑和保存后的身份。 -speaker=羽; R11 preserve: second target @makenovel-node r11-skippable-target',
    'changeBg:night.svg -duration=0 -next; R11 preserve: legacy interval starts',
    '; @makenovel-node r11-legacy-wait',
    'wait:1200 -nobreak; R11 preserve: legacy timing author note',
    'changeBg:day.svg -duration=0 -next; R11 preserve: legacy interval ends',
    'say:【R11-LEGACY 第三段结束】等待沿用原有身份。时长与可否点击跳过一起进入导演草稿，应用后应能整批撤销和重做。 -speaker=测试员; R11 preserve: third target @makenovel-node r11-legacy-target',
    'say:【R11-AFTER 后继对白】本句没有自己的等待。配置、保存字节和实际播放时长分别核验；编辑器快速执行到目标不能代替正常播放计时。 -speaker=测试员; R11 preserve: timing successor',
    'end;',
  ]);
}

/** Open explicitly in Terre: these source forms are outside this round's timing controls. */
export function boundarySceneSource() {
  return crlf([
    '; Round 11 read-only timing forms. Inspect source; do not use this scene for interval measurement.',
    'wait:400 -next; R11 preserve: explicit next true',
    'say:【R11-NEXT 连续执行】等待带 next，属于本轮只读时序。 -speaker=测试员;',
    'wait:500 -next=false; R11 preserve: explicit next false',
    'say:【R11-NEXT-FALSE 显式参数】显式 next=false 原文保留，本轮不通过等待控件规范化。 -speaker=测试员;',
    'setVar:round11_delay=700; R11 preserve: runtime-only variable assignment',
    'wait:{round11_delay} -nobreak; R11 preserve: dynamic duration is not evaluated by authoring controls',
    'say:【R11-DYNAMIC 变量时长】等待由运行时变量决定，面板不把它改成静态数字。 -speaker=测试员;',
    'wait:600 -r11Opaque=kept; R11 preserve: unknown option alpha={a:b}',
    'say:【R11-OPAQUE 未知参数】原文带未知参数，保持导演边界。 -speaker=测试员;',
    'wait:900 -continue; R11 preserve: continuous execution option',
    'say:【R11-CONTINUE 连续参数】这条等待保持只读。 -speaker=测试员;',
    'wait:1000 -when=round11_delay>0; R11 preserve: conditional execution',
    'say:【R11-WHEN 条件参数】条件等待保持原文，不在面板内求值。 -speaker=测试员;',
    'end;',
  ]);
}

export function timingFiles(gameKey) {
  const files = originalFiles(gameKey);
  files.set('game/config.txt', crlf([
    'Game_name:MakeNovel 第十一轮导演等待时序验证;', `Game_key:${gameKey};`, 'Title_img:day.svg;',
    'Title_bgm:test-bgm.wav;', 'Enable_Appreciation:false;', 'Enable_Continue:true;', 'Enable_flowchart:true;',
  ]));
  files.set('game/scene/start.txt', timingSceneSource());
  files.set('game/scene/readonly.txt', boundarySceneSource());
  for (const file of ['game/background/day.svg', 'game/background/night.svg']) {
    files.set(file, files.get(file).replace('ROUND 6 /', 'ROUND 11 /'));
  }
  return files;
}

/** New directory only; prior works and player data are never overwritten. */
export async function generateTimingDemo(output) {
  const root = path.resolve(output);
  await assertPlainDirectory(path.dirname(root));
  try { await fs.lstat(root); throw new Error(`OUTPUT_EXISTS: Refusing to replace existing path: ${root}`); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const gameKey = `makenovel-round11-${randomUUID()}`;
  const files = timingFiles(gameKey);
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
    generator: 'integrations/director-timing-demo/generate.mjs', version: 1,
    originalAssetGenerator: 'integrations/stage-demo/generate.mjs', upstreamCommit: UPSTREAM_COMMIT,
    gameKey, projectId: verified.projectId, manifestHash: verified.manifestHash,
    templateFiles, files: verified.files.length,
    sceneSources: ['game/scene/start.txt', 'game/scene/readonly.txt'].map(file => ({ path: file, sha256: hash(files.get(file)), encoding: 'UTF-8', lineEndings: 'CRLF', bom: file.endsWith('/start.txt') })),
    configSource: { path: 'game/config.txt', sha256: hash(files.get('game/config.txt')) },
    timingCases: TIMING_CASES, successor: TIMING_SUCCESSOR,
    boundaryTargets: BOUNDARY_TARGETS.map(entry => ({ path: 'game/scene/readonly.txt', ...entry })),
    originalAssets: [...files.keys()].filter(file => /\.(svg|wav)$/.test(file)),
    limitation: 'Original development placeholders and diagnostic tones, not speech. Durations are native configured milliseconds, not measured playback results. Normal player progression from the preceding dialogue is required for timing; editor run-to preview is not timing evidence. A preceding -next transition overlaps its following wait. Open readonly.txt explicitly for authoring boundaries. Shared reviewed runtime required; edits require explicit resealing.',
  };
  if (result.manifest.manifestHash !== receipt.manifestHash) throw new Error('Generated manifest changed before receipt.');
  await fs.writeFile(path.join(root, 'director-timing-demo-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(root, 'ASSET-CREDITS.txt'),
    `MakeNovel round 11 director timing development fixture\n\nSVG characters/backgrounds and PCM diagnostic tones are original programmatic placeholders from integrations/stage-demo/generate.mjs, adapted by integrations/director-timing-demo/generate.mjs. No commercial artwork, music, or speech recordings were copied. Original generated content follows this project's MPL-2.0 license.\n\nGUI template text: WebGAL, https://github.com/OpenWebGAL/WebGAL, commit ${UPSTREAM_COMMIT}, MPL-2.0; see WEBGAL-LICENSE.txt. Shared engine media retain their upstream terms.\n\nVoice files are diagnostic tones, not speech; timing dialogues do not use them. Formal artwork, voice quality, accessibility and release acceptance remain separate. The initial source/config identity is recorded only in director-timing-demo-receipt.json.\n`, { flag: 'wx' });
  return { output: root, ...receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output' || !args[1] || args[1].startsWith('--')) {
    console.error('Usage: node integrations/director-timing-demo/generate.mjs --output <new-project-path>');
    process.exitCode = 1;
  } else {
    generateTimingDemo(args[1]).then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(cause => { console.error(cause.message); process.exitCode = 1; });
  }
}
