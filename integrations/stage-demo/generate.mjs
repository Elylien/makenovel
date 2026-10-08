import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertPlainDirectory, sealGame, verifyGame } from '../game-manifest/manifest.mjs';

const exec = promisify(execFile);
export const REPO = fileURLToPath(new URL('../../', import.meta.url));
export const UPSTREAM_COMMIT = 'd0318e6c4cdb8b04bb5d891f40368cff3c6efc85';
const TEMPLATE_FILES = ['template.json', 'Stage/Choose/choose.scss', 'Stage/TextBox/textbox.scss', 'UI/Title/title.scss'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function svg(body, width = 2560, height = 1440) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>\n`;
}

function figure(person, smile) {
  const female = person === 'lin';
  const hair = female ? '#553940' : '#263b4c';
  const cloth = female ? '#d9914f' : '#467f99';
  const face = smile
    ? '<path d="M325 296 Q347 279 369 296 M431 296 Q453 279 475 296 M365 350 Q400 397 435 350" fill="none" stroke="#543e3a" stroke-width="9" stroke-linecap="round"/>'
    : '<ellipse cx="347" cy="296" rx="10" ry="16" fill="#394352"/><ellipse cx="453" cy="296" rx="10" ry="16" fill="#394352"/><path d="M374 358 Q400 365 426 358" fill="none" stroke="#805958" stroke-width="7" stroke-linecap="round"/>';
  return svg(`<g stroke="#233346" stroke-width="7" stroke-linejoin="round">
<ellipse cx="400" cy="1306" rx="180" ry="24" fill="#102334" opacity=".15" stroke="none"/>
${female ? `<path d="M256 271 Q242 104 400 96 Q565 109 549 306 L578 636 Q512 685 470 606 L322 603 Q253 662 224 614Z" fill="${hair}"/>` : ''}
<path d="M300 889 L378 894 L376 1256 L293 1256Z M422 894 L500 889 L510 1256 L427 1256Z" fill="${female ? '#f0c1a5' : '#344259'}"/>
<path d="M290 1228 L377 1228 L383 1305 L256 1305 Q252 1271 290 1260Z M425 1228 L512 1228 L549 1305 L421 1305Z" fill="#364653"/>
<path d="M303 438 Q400 416 497 438 L533 956 L266 956Z" fill="${cloth}"/>
${female ? '<path d="M284 791 L516 791 L563 987 L238 987Z" fill="#645a74"/><path d="M326 810 L307 967 M395 813 L395 971 M467 810 L491 967" stroke="#b2a0aa"/>' : '<path d="M294 797 L506 797 L507 971 L402 962 L292 971Z" fill="#344259"/>'}
<path d="M306 451 Q266 458 250 520 L208 817 L275 834 L332 560 M494 451 Q535 461 548 520 L591 817 L524 834 L470 560" fill="${cloth}"/>
<path d="M211 812 L271 825 L266 892 Q242 932 217 894Z M528 825 L587 812 L583 894 Q557 932 533 892Z" fill="#f0c1a5"/>
<path d="M365 371 L435 371 L444 444 Q400 486 356 444Z" fill="#edbb9f"/>
<path d="M303 213 Q400 142 497 213 L496 326 Q480 406 400 425 Q320 406 304 326Z" fill="#f4cbb1"/>
<path d="M284 256 Q267 102 401 106 Q534 105 519 265 L475 234 L444 164 Q405 245 301 243Z" fill="${hair}"/>
${face}
<path d="M349 447 L400 499 L449 447" fill="none" stroke="#f2e0ca" stroke-width="22"/>
${female ? '<path d="M400 496 L370 558 L400 549 L432 561Z" fill="#cf6255"/>' : '<path d="M400 500 L382 551 L402 677 L421 551Z" fill="#cf9e67"/>'}
<rect x="325" y="618" width="150" height="54" rx="10" fill="#f4e5ca" stroke="none"/>
<text x="400" y="656" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#243744" stroke="none">${female ? 'LIN / A' : 'YU / B'}</text>
</g>`, 800, 1400);
}

function background(night) {
  const sky = night ? '#293650' : '#d8e5e5';
  const window = night ? '#5e688c' : '#f4dab5';
  return svg(`<rect width="2560" height="1440" fill="${sky}"/>
<rect y="910" width="2560" height="530" fill="${night ? '#38445c' : '#a7b6b9'}"/>
<path d="M0 1110 L2560 1110 M0 1310 L2560 1310 M470 910 L260 1440 M1050 910 L980 1440 M1600 910 L1670 1440 M2180 910 L2390 1440" fill="none" stroke="${night ? '#4b5872' : '#bdc9c9'}" stroke-width="6"/>
<rect x="660" y="170" width="1240" height="640" rx="20" fill="#586b7b"/>
<rect x="687" y="197" width="1186" height="586" fill="${window}"/>
<path d="M1090 197 L1090 783 M1470 197 L1470 783 M687 490 L1873 490" stroke="#586b7b" stroke-width="22"/>
<circle cx="${night ? '1720' : '880'}" cy="315" r="70" fill="${night ? '#f0e9d5' : '#fff5d8'}"/>
<path d="M687 770 L687 660 L890 580 L1090 650 L1330 520 L1510 605 L1873 550 L1873 783Z" fill="${night ? '#435577' : '#95b2b1'}"/>
<rect x="70" y="80" width="450" height="96" rx="16" fill="#182e44"/>
<text x="105" y="143" font-family="sans-serif" font-size="46" fill="#f4e7d4">ROUND 6 / ${night ? 'NIGHT' : 'DAY'}</text>
<text x="2040" y="143" font-family="sans-serif" font-size="35" fill="${night ? '#ddd5c9' : '#536675'}">ORIGINAL TEST SET</text>`);
}

/** Original mono PCM16 diagnostic tones. No recording or speech model is used. */
export function makeToneWav(frequencies, seconds, { sampleRate = 24000, gain = 0.16, beat = 0.5 } = {}) {
  const count = Math.round(seconds * sampleRate);
  const out = Buffer.alloc(44 + count * 2);
  out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sampleRate, 24); out.writeUInt32LE(sampleRate * 2, 28);
  out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    const frequency = frequencies[Math.floor(t / beat) % frequencies.length];
    const segment = t % beat;
    const envelope = Math.min(1, t / 0.025, (seconds - t) / 0.06, segment / 0.012, (beat - segment) / 0.04);
    const sample = Math.sin(2 * Math.PI * frequency * t) * Math.max(0, envelope) * gain;
    out.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  return out;
}

export function sceneSource() {
  return `; Round 6 original development fixture. Voices are diagnostic tones, not speech.
changeBg:day.svg -duration=900 -next;
bgm:test-bgm.wav -volume=28 -enter=1800;
changeFigure:lin-neutral.svg -left -duration=700 -next;
changeFigure:yu-neutral.svg -right -duration=700 -next;
测试员:【R6-01 双角色】左侧林穿橙色上衣与裙装，右侧羽穿蓝色外套与长裤。请先检查站位，再推进。
林:【R6-02 声音 A】现在播放 voice 通道的高音测试序列，不是真人配音。 -vocal=voice-a.wav -left;
羽:【R6-03 声音 B】现在播放 voice 通道的低音测试序列。BGM 应仍在背景循环。 -vocal=voice-b.wav -right;
playEffect:test-se.wav -volume=55;
测试员:【R6-04 SE】刚才应听到短提示音。下一步切换两人的笑脸差分。
changeFigureDiff:lin-smile.svg -left -next;
changeFigureDiff:yu-smile.svg -right -next;
wait:500 -nobreak;
测试员:【R6-05 差分】两人应保持站位，表情变为笑脸。下一步林轻跳两次。
setTempAnimation:[{"duration":0,"position":{"y":0}},{"duration":200,"position":{"y":-65}},{"duration":230,"position":{"y":0}},{"duration":200,"position":{"y":-40}},{"duration":230,"position":{"y":0}}] -target=fig-left -next;
wait:1000 -nobreak;
测试员:【R6-06 菜单入口】下一次推进开始 8 秒平移和不可点击跳过的等待。期间打开菜单或设置，再返回观察；也可回标题或读档检查旧演出是否停止。
setTransform:{"position":{"x":-220,"y":0}} -target=fig-right -duration=8000 -ease=linear -next;
wait:8000 -nobreak;
测试员:【R6-07 平移终点】羽已向舞台内侧移动。建议在此保存，随后继续至夜景，再读档核对位置、表情和声音。
setTransform:{"position":{"x":0,"y":0}} -target=fig-right -duration=1200 -next;
changeBg:night.svg -duration=1600 -exitDuration=1600 -next;
wait:1800 -nobreak;
测试员:【R6-08 夜景交叉淡化】人物未退场，背景从日景过渡至夜景。下一步淡出人物与背景至黑场。
changeFigure:none -left -duration=850 -exitDuration=850 -next;
changeFigure:none -right -duration=850 -exitDuration=850 -next;
changeBg:black.svg -duration=1200 -exitDuration=1200 -next;
bgm:none -enter=1200;
wait:1500 -nobreak;
测试员:【R6-09 黑场】舞台应为纯黑，无人物，BGM 已淡出。下一步淡入日景并显示分支。
changeBg:day.svg -duration=1200 -next;
changeFigure:lin-neutral.svg -left -duration=1000 -next;
changeFigure:yu-neutral.svg -right -duration=1000 -next;
bgm:test-bgm.wav -volume=28 -enter=1800;
wait:1400 -nobreak;
choose:与林走左线:routeA|与羽走右线:routeB;
label:routeA;
setVar:round6_route=1;
changeFigureDiff:lin-smile.svg -left -next;
林:【R6-A 左线】选择了林。路线值应为 1。 -vocal=voice-a.wav -left;
jumpLabel:ending;
label:routeB;
setVar:round6_route=2;
changeFigureDiff:yu-smile.svg -right -next;
羽:【R6-B 右线】选择了羽。路线值应为 2。 -vocal=voice-b.wav -right;
label:ending;
测试员:【R6-10 终点】当前路线值为 {round6_route}。可回读分支前存档验证另一条路线。本样片只有开发占位素材，正式美术和语音试听尚未验收。
choose:重新测试菜单与平移:menuRetry|结束并回标题:finish;
label:menuRetry;
setTransform:{"position":{"x":0,"y":0}} -target=fig-right -duration=1 -next;
测试员:【R6-11 重试入口】下一次推进再次进入 8 秒平移和等待。
setTransform:{"position":{"x":-220,"y":0}} -target=fig-right -duration=8000 -ease=linear -next;
wait:8000 -nobreak;
jumpLabel:ending;
label:finish;
end;
`;
}

export function originalFiles(gameKey) {
  return new Map([
    ['game/config.txt', `Game_name:MakeNovel 第六轮演出验证;\nGame_key:${gameKey};\nTitle_img:day.svg;\nTitle_bgm:test-bgm.wav;\nEnable_Appreciation:false;\nEnable_Continue:true;\nEnable_flowchart:true;\n`],
    ['game/scene/start.txt', sceneSource()],
    ['game/background/day.svg', background(false)],
    ['game/background/night.svg', background(true)],
    ['game/background/black.svg', svg('<rect width="2560" height="1440" fill="#000"/>')],
    ['game/figure/lin-neutral.svg', figure('lin', false)],
    ['game/figure/lin-smile.svg', figure('lin', true)],
    ['game/figure/yu-neutral.svg', figure('yu', false)],
    ['game/figure/yu-smile.svg', figure('yu', true)],
    ['game/bgm/test-bgm.wav', makeToneWav([220, 261.63, 329.63, 293.66, 196, 246.94, 293.66, 261.63], 8, { gain: 0.12, beat: 1 })],
    ['game/vocal/test-se.wav', makeToneWav([880, 1174.66, 1567.98], 0.45, { beat: 0.15, gain: 0.22 })],
    ['game/vocal/voice-a.wav', makeToneWav([523.25, 659.25, 783.99, 659.25], 3.2, { beat: 0.4, gain: 0.24 })],
    ['game/vocal/voice-b.wav', makeToneWav([174.61, 220, 261.63, 220], 3.2, { beat: 0.4, gain: 0.24 })],
    ['game/animation/animationTable.json', '[]\n'],
  ]);
}

async function loadLockedTemplate() {
  const vendor = path.join(REPO, 'vendor/WebGAL');
  const files = new Map();
  for (const relative of TEMPLATE_FILES) {
    const source = `packages/webgal/public/game/template/${relative}`;
    const { stdout } = await exec('git', ['-C', vendor, 'show', `${UPSTREAM_COMMIT}:${source}`], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 });
    files.set(`game/template/${relative}`, stdout);
  }
  const { stdout: license } = await exec('git', ['-C', vendor, 'show', `${UPSTREAM_COMMIT}:LICENSE`], { encoding: 'buffer' });
  return { files, license };
}

/** Only creates a new project. Existing paths (including links) always fail. */
export async function generateDemo(output) {
  const root = path.resolve(output);
  await assertPlainDirectory(path.dirname(root));
  try { await fs.lstat(root); throw new Error(`OUTPUT_EXISTS: Refusing to replace existing path: ${root}`); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const template = await loadLockedTemplate();
  const gameKey = `makenovel-round6-${randomUUID()}`;
  const files = originalFiles(gameKey);
  for (const [relative, bytes] of template.files) files.set(relative, bytes);
  await fs.mkdir(root); // Atomic create; a concurrent creator is never overwritten.
  for (const [relative, bytes] of files) {
    const destination = path.join(root, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes, { flag: 'wx' });
  }
  await fs.writeFile(path.join(root, 'WEBGAL-LICENSE.txt'), template.license, { flag: 'wx' });
  const result = await sealGame(root, { init: true });
  await verifyGame(root);
  const receipt = {
    generator: 'integrations/stage-demo/generate.mjs', version: 1,
    upstreamCommit: UPSTREAM_COMMIT, gameKey, projectId: result.manifest.projectId,
    manifestHash: result.manifest.manifestHash,
    templateFiles: [...template.files].map(([file, bytes]) => ({ path: file, sha256: hash(bytes) })),
    originalAssets: [...originalFiles(gameKey).keys()].filter((file) => /\.(svg|wav)$/.test(file)),
    limitation: 'Original development placeholders. Voice-channel tones are not speech or formal voice acceptance. Shared reviewed runtime required.',
  };
  await fs.writeFile(path.join(root, 'stage-demo-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(root, 'ASSET-CREDITS.txt'),
    'MakeNovel round 6 development fixture\n\nSVG characters/backgrounds and PCM diagnostic tones are original programmatic placeholders generated by integrations/stage-demo/generate.mjs; no third-party image, music or voice recording is used. Distributed under this project\'s MPL-2.0 license.\n\nGUI template text: WebGAL, https://github.com/OpenWebGAL/WebGAL, commit ' + UPSTREAM_COMMIT + ', MPL-2.0; see WEBGAL-LICENSE.txt. No vendor figure, background, music, voice, or font files were copied. Shared engine media retain their own upstream terms.\n\nVoice files are test tones, not speech. This fixture does not complete formal artwork, speech, accessibility, or sound-design acceptance.\n', { flag: 'wx' });
  return { output: root, ...receipt, files: result.manifest.files.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output') {
    console.error('Usage: node integrations/stage-demo/generate.mjs --output <new-project-path>');
    process.exitCode = 1;
  } else {
    generateDemo(args[1]).then((result) => console.log(JSON.stringify(result, null, 2)))
      .catch((cause) => { console.error(cause.message); process.exitCode = 1; });
  }
}
