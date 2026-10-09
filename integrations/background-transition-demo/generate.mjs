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
  { key: 'inline-next', beforeLine: 3, commandLine: 4, duration: 1200, enterDuration: 2200, exitDuration: 2600,
    next: true, file: 'warm.svg', nodeId: 'r12-warm', markerKind: 'inline', targetLine: 5, targetLabel: 'R12-WARM',
    targetNodeId: 'r12-warm-target', closeLine: 6, closedLine: 7, closedLabel: 'R12-CLOSED' },
  { key: 'legacy-stop', beforeLine: 7, markerLine: 9, commandLine: 10, duration: 2400, exitDuration: 2100,
    next: false, file: 'cool.svg', nodeId: 'r12-cool', markerKind: 'standalone', targetLine: 11, targetLabel: 'R12-COOL',
    targetNodeId: 'r12-cool-target', closeLine: 12, closedLine: 13, closedLabel: 'R12-CLOSED-SECOND' },
  { key: 'unregistered-next', beforeLine: 13, commandLine: 14, duration: 1800, exitDuration: 2200,
    next: true, file: 'warm.svg', targetLine: 15, targetLabel: 'R12-UNREGISTERED',
    targetNodeId: 'r12-unregistered-target', closeLine: 16, closedLine: 17, closedLabel: 'R12-AFTER' },
]);
export const BOUNDARY_TARGETS = Object.freeze([
  { line: 3, label: 'R12-CUSTOM', sourceLine: 2, kind: 'custom-animation' },
  { line: 5, label: 'R12-TRANSFORM', sourceLine: 4, kind: 'transform' },
  { line: 8, label: 'R12-DYNAMIC', sourceLine: 7, kind: 'dynamic-duration' },
  { line: 10, label: 'R12-OPAQUE', sourceLine: 9, kind: 'unknown-option' },
  { line: 12, label: 'R12-WHEN', sourceLine: 11, kind: 'conditional' },
  { line: 14, label: 'R12-CONTINUE', sourceLine: 13, kind: 'continue' },
]);

/** Distinct original geometric images make partial alpha and black exits observable. */
export function transitionBackground(warm) {
  const base = warm ? '#cd693a' : '#173e67';
  const accent = warm ? '#ffdb91' : '#86e4de';
  const pattern = warm
    ? '<circle cx="1740" cy="520" r="320" fill="#ffdb91"/><circle cx="1740" cy="520" r="235" fill="#ec9751"/><circle cx="1740" cy="520" r="142" fill="#ffe9b6"/>'
    : '<path d="M1260 770 L1540 230 L1820 770Z M1700 770 L1980 230 L2260 770Z" fill="#86e4de"/><path d="M1430 720 L1540 500 L1650 720Z M1870 720 L1980 500 L2090 720Z" fill="#377eaa"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2560" height="1440" viewBox="0 0 2560 1440"><rect width="2560" height="1440" fill="${base}"/><path d="M0 990 H2560 V1440 H0Z" fill="${warm ? '#713629' : '#102538'}"/><path d="M0 1000 H2560 M0 1160 H2560 M0 1320 H2560" stroke="${accent}" stroke-width="8" opacity=".32"/>${pattern}<rect x="90" y="92" width="1010" height="130" rx="22" fill="#101e2e"/><text x="140" y="180" font-family="sans-serif" font-size="62" fill="#f7f4e8">ROUND 12 / ${warm ? 'WARM CIRCLES' : 'COOL TRIANGLES'}</text><text x="140" y="440" font-family="sans-serif" font-size="58" fill="${accent}">ORIGINAL TRANSITION STUDY</text><path d="M145 520 H850 M145 600 H630 M145 680 H760" stroke="${accent}" stroke-width="18" stroke-linecap="round"/><text x="140" y="890" font-family="sans-serif" font-size="46" fill="#fff3d8">NATIVE BACKGROUND / NO CUSTOM CLOCK</text></svg>\n`;
}

/** Enter normally from each preceding dialogue; run-to preview skips the transition. */
export function transitionSceneSource() {
  return '\uFEFF' + crlf([
    '; Round 12 background transition fixture. Preserve BOM, CRLF, mixed identities, and author notes.',
    'changeBg:cool.svg -duration=0 -exitDuration=0 -next; R12 preserve: initial cool background @makenovel-node r12-initial',
    'say:【R12-BEFORE 第一段起点】文字显示完整后点击继续。暖色圆环将渐入，下一句会同时出现；请观察画面由暗到亮的过程。 -speaker=测试员; R12 preserve: first entry',
    'changeBg:warm.svg -duration=1200 -enterDuration=2200 -exitDuration=2600 -next; R12 preserve: inline transition author note @makenovel-node r12-warm',
    'say:【R12-WARM 暖色入场】入场使用 enterDuration，duration 作为回退。待画面稳定后继续，观察这张背景按先前配置淡出至黑场。 -speaker=测试员; R12 preserve: first target @makenovel-node r12-warm-target',
    'changeBg:none -duration=0 -next; R12 preserve: close uses preceding warm exit setting',
    'say:【R12-CLOSED 第二段起点】待黑场稳定后继续。冷色三角入场未开启立即继续，画面完成后再点击才进入下一句。 -speaker=测试员; R12 preserve: second entry',
    '; R12 preserve: standalone author note with opaque tokens alpha={a:b} -future=kept',
    '; @makenovel-node r12-cool',
    'changeBg:cool.svg -duration=2400 -exitDuration=2100 -next=false; R12 preserve: legacy transition author note',
    'say:【R12-COOL 冷色入场】这条背景保留旧式身份。再次继续会按它此前配置的退场时长淡出；动画中点击可提前结算入场。 -speaker=测试员; R12 preserve: second target @makenovel-node r12-cool-target',
    'changeBg:none -duration=0 -next; R12 preserve: close uses preceding cool exit setting',
    'say:【R12-CLOSED-SECOND 第三段起点】待黑场稳定后继续。下一条背景起初没有持久身份，仅在实际修改时登记。 -speaker=测试员; R12 preserve: third entry',
    'changeBg:warm.svg -duration=1800 -exitDuration=2200 -next; R12 preserve: unregistered transition author note',
    'say:【R12-UNREGISTERED 未登记入场】可在本句导演面板修改前面的背景参数，并与对白一并应用和撤销。继续后观察最后一次淡出。 -speaker=测试员; R12 preserve: third target @makenovel-node r12-unregistered-target',
    'changeBg:none -duration=0 -next; R12 preserve: final close',
    'say:【R12-AFTER 后继对白】所有转场均沿原生播放器执行。保存字节、局部草稿和实际播放分别核验；快速执行到目标不能证明转场过程。 -speaker=测试员; R12 preserve: successor',
    'end;',
  ]);
}

/** These source forms are preserved inspection cases, never entered by start.txt. */
export function boundarySceneSource() {
  return crlf([
    '; Round 12 read-only advanced forms. Open explicitly for authoring boundary inspection.',
    'changeBg:warm.svg -duration=700 -enter=r12-custom-fade -next; R12 preserve: custom animation owns frame duration',
    'say:【R12-CUSTOM 自定义动画】保留外部动画引用，不将其时长冒充为普通转场时长。 -speaker=测试员;',
    'changeBg:cool.svg -transform={"alpha":0.7} -duration=800 -next; R12 preserve: explicit transform',
    'say:【R12-TRANSFORM 变换】高级变换保留原文。 -speaker=测试员;',
    'setVar:r12_duration=900; R12 preserve: runtime-only variable',
    'changeBg:warm.svg -duration={r12_duration} -next; R12 preserve: dynamic duration',
    'say:【R12-DYNAMIC 动态时长】运行时变量不在作者面板中求值。 -speaker=测试员;',
    'changeBg:cool.svg -duration=1000 -r12Opaque=kept -next; R12 preserve: unknown option alpha={a:b}',
    'say:【R12-OPAQUE 未知参数】保留未知源码和作者注释。 -speaker=测试员;',
    'changeBg:warm.svg -duration=1100 -when=r12_duration>0 -next; R12 preserve: conditional background',
    'say:【R12-WHEN 条件参数】条件命令保持编辑边界。 -speaker=测试员;',
    'changeBg:cool.svg -duration=1200 -continue; R12 preserve: continue on performance completion',
    'say:【R12-CONTINUE 完成推进】continue 不等同 next，继续保留原文。 -speaker=测试员;',
    'end;',
  ]);
}

export function transitionFiles(gameKey) {
  const files = originalFiles(gameKey);
  files.delete('game/background/day.svg'); files.delete('game/background/night.svg');
  files.set('game/background/warm.svg', transitionBackground(true));
  files.set('game/background/cool.svg', transitionBackground(false));
  files.set('game/config.txt', crlf([
    'Game_name:MakeNovel 第十二轮背景转场验证;', `Game_key:${gameKey};`, 'Title_img:cool.svg;',
    'Title_bgm:none;', 'Enable_Appreciation:false;', 'Enable_Continue:true;', 'Enable_flowchart:true;',
  ]));
  files.set('game/scene/start.txt', transitionSceneSource());
  files.set('game/scene/readonly.txt', boundarySceneSource());
  files.set('game/animation/animationTable.json', '["r12-custom-fade"]\n');
  files.set('game/animation/r12-custom-fade.json', '[{"duration":0,"alpha":0},{"duration":1700,"alpha":1,"ease":"linear"}]\n');
  return files;
}

/** New directory only; previous projects and player data are never overwritten. */
export async function generateBackgroundTransitionDemo(output) {
  const root = path.resolve(output);
  await assertPlainDirectory(path.dirname(root));
  try { await fs.lstat(root); throw new Error(`OUTPUT_EXISTS: Refusing to replace existing path: ${root}`); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const gameKey = `makenovel-round12-${randomUUID()}`;
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
    generator: 'integrations/background-transition-demo/generate.mjs', version: 1,
    originalAssetGenerator: 'integrations/stage-demo/generate.mjs', upstreamCommit: UPSTREAM_COMMIT,
    gameKey, projectId: verified.projectId, manifestHash: verified.manifestHash,
    templateFiles, files: verified.files.length,
    sceneSources: ['game/scene/start.txt', 'game/scene/readonly.txt'].map(file => ({ path: file, sha256: hash(files.get(file)), encoding: 'UTF-8', lineEndings: 'CRLF', bom: file.endsWith('/start.txt') })),
    configSource: { path: 'game/config.txt', sha256: hash(files.get('game/config.txt')) },
    transitionCases: TRANSITION_CASES,
    boundaryTargets: BOUNDARY_TARGETS.map(entry => ({ path: 'game/scene/readonly.txt', ...entry })),
    originalAssets: [...files.keys()].filter(file => /\.(svg|wav)$/.test(file)),
    limitation: 'Original development placeholders, no commercial artwork. Initial configured milliseconds are not playback measurements. Enter from the preceding dialogue using normal native playback; editor run-to preview is not timing evidence. next=false does not auto-continue on completion. Exit duration belongs to the background being closed and is set on its preceding display command. Open readonly.txt explicitly. No custom executor or clock. Shared reviewed runtime required; edits require explicit resealing.',
  };
  if (result.manifest.manifestHash !== receipt.manifestHash) throw new Error('Generated manifest changed before receipt.');
  await fs.writeFile(path.join(root, 'background-transition-demo-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(root, 'ASSET-CREDITS.txt'),
    `MakeNovel round 12 background transition development fixture\n\nWarm-circle and cool-triangle SVG backgrounds and r12-custom-fade animation are original programmatic content from integrations/background-transition-demo/generate.mjs. Other unused SVG characters, black background and diagnostic PCM tones are original placeholders from integrations/stage-demo/generate.mjs. No commercial artwork, music, or speech recordings were copied. Original generated content follows this project's MPL-2.0 license.\n\nGUI template text: WebGAL, https://github.com/OpenWebGAL/WebGAL, commit ${UPSTREAM_COMMIT}, MPL-2.0; see WEBGAL-LICENSE.txt. Shared engine media retain their upstream terms.\n\nThe transition scene uses only backgrounds and unvoiced dialogue. Formal artwork, voice quality, accessibility and release acceptance remain separate. Initial source/config identity appears in background-transition-demo-receipt.json; later edits need explicit resealing.\n`, { flag: 'wx' });
  return { output: root, ...receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output' || !args[1] || args[1].startsWith('--')) {
    console.error('Usage: node integrations/background-transition-demo/generate.mjs --output <new-project-path>');
    process.exitCode = 1;
  } else {
    generateBackgroundTransitionDemo(args[1]).then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(cause => { console.error(cause.message); process.exitCode = 1; });
  }
}
