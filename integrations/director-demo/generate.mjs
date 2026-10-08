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

export function directorSceneSource() {
  return '\uFEFF' + crlf([
    '; Round 7 director fixture. Preserve this BOM, CRLF, and inline comments.',
    'changeBg:day.svg -duration=250 -next; R7 preserve: background comment',
    'bgm:test-bgm.wav -volume=28 -enter=0 -next; R7 preserve: music comment',
    'changeFigure:lin-neutral.svg -left -duration=250 -next; R7 preserve: left actor',
    'changeFigure:yu-neutral.svg -right -duration=250 -next; R7 preserve: right actor',
    'wait:500 -nobreak;',
    'say:【R7-01 导演入口】林在左侧，羽在右侧。这一句带有说话者与 voice 测试音，可在导演面板修改后预览。 -speaker=林 -vocal=voice-a.wav -left; R7 preserve: dialogue comment',
    'changeFigureDiff:lin-smile.svg -left -next; R7 preserve: left expression',
    'changeFigureDiff:yu-smile.svg -right -next; R7 preserve: right expression',
    'wait:500 -nobreak;',
    'say:【R7-02 双人笑脸】两人保留原站位并切换笑脸。当前播放的是低音测试序列，不是真人配音。 -speaker=羽 -vocal=voice-b.wav -right; R7 preserve: second dialogue',
    'choose:继续资源失败验证:failureTest|结束:finish;',
    'label:failureTest;',
    'changeScene:failure.txt;',
    'label:finish;',
    'end;',
  ]);
}

export function failureSceneSource() {
  return crlf([
    '; Deliberately corrupt image is sealed and present: this tests decode failure, not missing-file integrity.',
    'changeBg:day.svg -duration=0 -exitDuration=0 -next;',
    'changeFigure:lin-neutral.svg -left -duration=0 -exitDuration=0 -next;',
    'changeFigure:yu-neutral.svg -right -duration=0 -exitDuration=0 -next;',
    'wait:500 -nobreak;',
    'say:【R7-BASE 正常保存】当前日景与双角色图片已就绪后，可以先保存到普通槽和快速槽。下一步将显示故意损坏的图片。 -speaker=测试员;',
    'changeBg:broken.svg -duration=0 -exitDuration=0 -next;',
    'wait:100 -nobreak;',
    'say:【R7-FAIL 资源失败】broken.svg 文件存在但不是有效图像。等待失败后尝试普通保存和快速保存，都应提示资源失败并保留原存档。 -speaker=测试员;',
    'changeBg:day.svg -duration=0 -exitDuration=0 -next;',
    'wait:100 -nobreak;',
    'say:【R7-RECOVER 恢复保存】已切换回新的日景主图请求。图片显示后，普通保存与快速保存应恢复可用。 -speaker=测试员;',
    'end;',
  ]);
}

export function directorFiles(gameKey) {
  const files = originalFiles(gameKey);
  files.set('game/config.txt', crlf([
    'Game_name:MakeNovel 第七轮导演与资源验证;', `Game_key:${gameKey};`, 'Title_img:day.svg;',
    'Title_bgm:test-bgm.wav;', 'Enable_Appreciation:false;', 'Enable_Continue:true;', 'Enable_flowchart:true;',
  ]));
  files.set('game/scene/start.txt', directorSceneSource());
  files.set('game/scene/failure.txt', failureSceneSource());
  for (const file of ['game/background/day.svg', 'game/background/night.svg']) {
    files.set(file, files.get(file).replace('ROUND 6 /', 'ROUND 7 /'));
  }
  files.set('game/background/broken.svg', 'MakeNovel R7 intentional image-decode failure fixture. This is not SVG.\n');
  return files;
}

/** Create a fresh project only. No intermediate round-6 identity or receipt is written. */
export async function generateDirectorDemo(output) {
  const root = path.resolve(output);
  await assertPlainDirectory(path.dirname(root));
  try { await fs.lstat(root); throw new Error(`OUTPUT_EXISTS: Refusing to replace existing path: ${root}`); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const gameKey = `makenovel-round7-${randomUUID()}`;
  const files = directorFiles(gameKey);
  const templateFiles = [];
  for (const relative of TEMPLATE_FILES) {
    const source = `packages/webgal/public/game/template/${relative}`;
    const { stdout } = await exec('git', ['-C', path.join(REPO, 'vendor/WebGAL'), 'show', `${UPSTREAM_COMMIT}:${source}`], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 });
    const destination = `game/template/${relative}`;
    files.set(destination, stdout); templateFiles.push({ path: destination, sha256: hash(stdout) });
  }
  const { stdout: license } = await exec('git', ['-C', path.join(REPO, 'vendor/WebGAL'), 'show', `${UPSTREAM_COMMIT}:LICENSE`], { encoding: 'buffer' });
  await fs.mkdir(root); // Atomic: a concurrently created output is never replaced.
  for (const [relative, bytes] of files) {
    const destination = path.join(root, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes, { flag: 'wx' });
  }
  await fs.writeFile(path.join(root, 'WEBGAL-LICENSE.txt'), license, { flag: 'wx' });
  const result = await sealGame(root, { init: true });
  const verified = await verifyGame(root);
  const receipt = {
    generator: 'integrations/director-demo/generate.mjs', version: 1,
    originalAssetGenerator: 'integrations/stage-demo/generate.mjs', upstreamCommit: UPSTREAM_COMMIT,
    gameKey, projectId: verified.projectId, manifestHash: verified.manifestHash,
    templateFiles, files: verified.files.length,
    sceneSources: ['game/scene/start.txt', 'game/scene/failure.txt'].map(file => ({ path: file, sha256: hash(files.get(file)), encoding: 'UTF-8', lineEndings: 'CRLF', bom: file.endsWith('/start.txt') })),
    configSource: { path: 'game/config.txt', sha256: hash(files.get('game/config.txt')) },
    intentionalInvalidAssets: ['game/background/broken.svg'],
    originalAssets: [...files.keys()].filter(file => /\.(svg|wav)$/.test(file) && !file.endsWith('/broken.svg')),
    limitation: 'Original development placeholders and voice-channel test tones, not speech. Intentional broken.svg is included in the manifest to test decoder failure. Shared reviewed runtime required. Receipt describes generation only; author edits require explicit resealing.',
  };
  if (result.manifest.manifestHash !== receipt.manifestHash) throw new Error('Generated manifest changed before receipt.');
  await fs.writeFile(path.join(root, 'director-demo-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(root, 'ASSET-CREDITS.txt'),
    `MakeNovel round 7 director and resource-failure development fixture\n\nSVG characters/backgrounds and PCM diagnostic tones are original programmatic placeholders from integrations/stage-demo/generate.mjs, adapted by integrations/director-demo/generate.mjs. No commercial artwork, music, or speech recordings were copied. The intentionally invalid broken.svg is a decoder-failure fixture, not artwork. Original generated content follows this project's MPL-2.0 license.\n\nGUI template text: WebGAL, https://github.com/OpenWebGAL/WebGAL, commit ${UPSTREAM_COMMIT}, MPL-2.0; see WEBGAL-LICENSE.txt. Shared engine media retain their upstream terms.\n\nVoice files are diagnostic tones, not speech. Formal artwork, voice quality, accessibility and release acceptance remain separate. The current generated source/config identity is recorded only in director-demo-receipt.json.\n`, { flag: 'wx' });
  return { output: root, ...receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output' || !args[1] || args[1].startsWith('--')) {
    console.error('Usage: node integrations/director-demo/generate.mjs --output <new-project-path>');
    process.exitCode = 1;
  } else {
    generateDirectorDemo(args[1]).then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(cause => { console.error(cause.message); process.exitCode = 1; });
  }
}
