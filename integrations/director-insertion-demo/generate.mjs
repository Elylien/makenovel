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

/** No local stage commands precede R8-02: adding one must preserve its preceding comment. */
export function insertionSceneSource() {
  return '\uFEFF' + crlf([
    '; Round 8 insertion fixture. Preserve this BOM, CRLF, and every author comment.',
    'changeBg:day.svg -duration=250 -next; R8 preserve: establishing background',
    'bgm:test-bgm.wav -volume=28 -enter=0 -next; R8 preserve: establishing music',
    'changeFigure:lin-neutral.svg -left -duration=250 -next; R8 preserve: left actor',
    'changeFigure:yu-neutral.svg -right -duration=250 -next; R8 preserve: right actor',
    'wait:500 -nobreak;',
    'say:【R8-01 前文舞台】日景、左侧林、右侧羽和音量 28 的背景测试音已经建立。下一句原本没有局部舞台命令。 -speaker=林 -vocal=voice-a.wav -left; R8 preserve: first dialogue',
    '; R8 opaque author note: keep {draft: [night, left, sound]} exactly here.',
    'say:【R8-02 新增入口】这一句继承前文舞台。请在导演面板新增夜景、左侧笑脸、背景音乐和提示音，再一次应用。 -speaker=羽 -vocal=voice-b.wav -right; R8 preserve: insertion target',
    'wait:500 -nobreak;',
    'say:【R8-03 继承结果】这一句没有自己的舞台修改，继续沿用刚才的画面和音乐。提示音是一次性效果，不应当作持久继承状态。 -speaker=测试员; R8 preserve: inherited result',
    'choose:查看来源边界:boundary|结束:finish;',
    'label:boundary;',
    'say:【R8-LABEL 标签边界】此处有流程入口。导演面板不能把边界前的画面推算为确定的继承结果。 -speaker=测试员; R8 preserve: label boundary',
    'changeScene:readonly.txt;',
    'label:finish;',
    'end;',
  ]);
}

/** Both commands have native semantics; the opaque option is ignored by the background executor. */
export function boundarySceneSource() {
  return crlf([
    '; Round 8 read-only boundary fixture. Unknown text and arguments must survive edits.',
    'setVar:round8_boundary=1; R8 preserve: command outside director scope',
    'say:【R8-COMMAND 命令边界】前一行是原生变量赋值，超出本轮导演支持范围。来源应保持未知。 -speaker=测试员;',
    'changeBg:night.svg -duration=0 -next -r8Opaque=kept; R8 preserve: opaque argument alpha={a:b}',
    'wait:500 -nobreak;',
    'say:【R8-OPAQUE 不透明参数】原生执行器会显示夜景，作者面板须保留不认识的参数，并停止把它当作已理解的舞台来源。 -speaker=测试员;',
    'end;',
  ]);
}

export function insertionFiles(gameKey) {
  const files = originalFiles(gameKey);
  files.set('game/config.txt', crlf([
    'Game_name:MakeNovel 第八轮导演新增与继承验证;', `Game_key:${gameKey};`, 'Title_img:day.svg;',
    'Title_bgm:test-bgm.wav;', 'Enable_Appreciation:false;', 'Enable_Continue:true;', 'Enable_flowchart:true;',
  ]));
  files.set('game/scene/start.txt', insertionSceneSource());
  files.set('game/scene/readonly.txt', boundarySceneSource());
  for (const file of ['game/background/day.svg', 'game/background/night.svg']) {
    files.set(file, files.get(file).replace('ROUND 6 /', 'ROUND 8 /'));
  }
  return files;
}

/** Create only a fresh project. Earlier generators are used as pure asset factories, never run. */
export async function generateInsertionDemo(output) {
  const root = path.resolve(output);
  await assertPlainDirectory(path.dirname(root));
  try { await fs.lstat(root); throw new Error(`OUTPUT_EXISTS: Refusing to replace existing path: ${root}`); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const gameKey = `makenovel-round8-${randomUUID()}`;
  const files = insertionFiles(gameKey);
  const templateFiles = [];
  for (const relative of TEMPLATE_FILES) {
    const source = `packages/webgal/public/game/template/${relative}`;
    const { stdout } = await exec('git', ['-C', path.join(REPO, 'vendor/WebGAL'), 'show', `${UPSTREAM_COMMIT}:${source}`], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 });
    const destination = `game/template/${relative}`;
    files.set(destination, stdout); templateFiles.push({ path: destination, sha256: hash(stdout) });
  }
  const { stdout: license } = await exec('git', ['-C', path.join(REPO, 'vendor/WebGAL'), 'show', `${UPSTREAM_COMMIT}:LICENSE`], { encoding: 'buffer' });
  await fs.mkdir(root); // Exclusive create: a concurrent output is never replaced.
  for (const [relative, bytes] of files) {
    const destination = path.join(root, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes, { flag: 'wx' });
  }
  await fs.writeFile(path.join(root, 'WEBGAL-LICENSE.txt'), license, { flag: 'wx' });
  const result = await sealGame(root, { init: true });
  const verified = await verifyGame(root);
  const receipt = {
    generator: 'integrations/director-insertion-demo/generate.mjs', version: 1,
    originalAssetGenerator: 'integrations/stage-demo/generate.mjs', upstreamCommit: UPSTREAM_COMMIT,
    gameKey, projectId: verified.projectId, manifestHash: verified.manifestHash,
    templateFiles, files: verified.files.length,
    sceneSources: ['game/scene/start.txt', 'game/scene/readonly.txt'].map(file => ({ path: file, sha256: hash(files.get(file)), encoding: 'UTF-8', lineEndings: 'CRLF', bom: file.endsWith('/start.txt') })),
    configSource: { path: 'game/config.txt', sha256: hash(files.get('game/config.txt')) },
    insertionTarget: { path: 'game/scene/start.txt', line: 9, label: 'R8-02' },
    boundaryTargets: ['R8-LABEL', 'R8-COMMAND', 'R8-OPAQUE'],
    originalAssets: [...files.keys()].filter(file => /\.(svg|wav)$/.test(file)),
    limitation: 'Original development placeholders and diagnostic voice-channel tones, not speech. The opaque background argument is retained for authoring boundaries; the native command still executes. Shared reviewed runtime required. Receipt records generation only; author edits require explicit resealing.',
  };
  if (result.manifest.manifestHash !== receipt.manifestHash) throw new Error('Generated manifest changed before receipt.');
  await fs.writeFile(path.join(root, 'director-insertion-demo-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(root, 'ASSET-CREDITS.txt'),
    `MakeNovel round 8 director insertion and provenance development fixture\n\nSVG characters/backgrounds and PCM diagnostic tones are original programmatic placeholders from integrations/stage-demo/generate.mjs, adapted by integrations/director-insertion-demo/generate.mjs. No commercial artwork, music, or speech recordings were copied. Original generated content follows this project's MPL-2.0 license.\n\nGUI template text: WebGAL, https://github.com/OpenWebGAL/WebGAL, commit ${UPSTREAM_COMMIT}, MPL-2.0; see WEBGAL-LICENSE.txt. Shared engine media retain their upstream terms.\n\nVoice files are diagnostic tones, not speech. Formal artwork, voice quality, accessibility and release acceptance remain separate. The initial source/config identity is recorded only in director-insertion-demo-receipt.json.\n`, { flag: 'wx' });
  return { output: root, ...receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output' || !args[1] || args[1].startsWith('--')) {
    console.error('Usage: node integrations/director-insertion-demo/generate.mjs --output <new-project-path>');
    process.exitCode = 1;
  } else {
    generateInsertionDemo(args[1]).then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(cause => { console.error(cause.message); process.exitCode = 1; });
  }
}
