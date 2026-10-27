import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { originalFiles, REPO, UPSTREAM_COMMIT } from '../stage-demo/generate.mjs';
import { playbackFiles } from '../playback-demo/generate.mjs';
import { assertPlainDirectory, sealGame, verifyGame } from '../game-manifest/manifest.mjs';

const exec = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = lines => '\uFEFF' + lines.join('\r\n') + '\r\n';

export function playerLibraryFiles(gameKey) {
  const files = playbackFiles(gameKey);
  const originals = originalFiles(gameKey);
  for (const name of ['voice-a.wav', 'voice-b.wav']) files.set(`game/vocal/${name}`, originals.get(`game/vocal/${name}`));
  files.set('game/vocal/broken.wav', 'Intentional invalid audio for observable failure; not a recording.\n');
  files.set('game/background/stage.svg', files.get('game/background/stage.svg').replace('ROUND 16 / PLAYBACK &amp; RESTORE', 'ROUND 18 / PLAYER LIBRARY'));
  files.set('game/config.txt', [
    'Game_name:MakeNovel 第十八轮收藏与流程图;', `Game_key:${gameKey};`, 'Title_img:stage.svg;',
    'Title_bgm:none;', 'Enable_Appreciation:false;', 'Enable_Continue:true;', 'Enable_flowchart:true;',
  ].join('\r\n') + '\r\n');
  files.set('game/scene/start.txt', source([
    '; Single dialogue with image readiness. Do not advance when checking root unlock.',
    'changeBg:stage.svg -duration=0 -exitDuration=0 -next; preserve @makenovel-node r18-stage',
    'changeFigure:lin-neutral.svg -id=r18-hero -right -duration=0 -exitDuration=0 -next; preserve @makenovel-node r18-orange',
    'changeFigure:yu-neutral.svg -left -duration=0 -exitDuration=0 -next; preserve @makenovel-node r18-blue',
    'say:【R18-READY】等待图片就绪后，不推进下一句，打开流程图检查“图片就绪”解锁。可在此快存，稍后核对旧档不会抹去新收藏。 -speaker=测试员; preserve @makenovel-node r18-ready',
    'changeScene:motion.txt; preserve @makenovel-node r18-to-motion',
    'end;',
  ]));
  files.set('game/scene/motion.txt', source([
    '; One dialogue overlapping a finite eight-second animation. No later commitForward.',
    'setAnimation:move-right-eight -target=r18-hero -keep=false -parallel=false -transformFrom=current -next; preserve @makenovel-node r18-animation',
    'say:【R18-MOTION】橙色人物平移八秒。保持本句直到演出结束，再检查“单句动画”解锁；下一次点击进入收藏样片。 -speaker=测试员; preserve @makenovel-node r18-motion',
    'changeScene:library.txt; preserve @makenovel-node r18-to-library',
    'end;',
  ]));
  files.set('game/scene/library.txt', source([
    '; Original author comment, stable identities and CRLF retained. Voices are test tones.',
    'say:【R18-TEXT】雨后的书页还留着温度。这句没有语音，可以从历史中收藏。 -speaker=林; preserve @makenovel-node r18-text',
    'say:【R18-VOICE-A】把这一刻留在书签里。这里播放高音测试序列，不是真人配音。 -speaker=林 -vocal=voice-a.wav; preserve @makenovel-node r18-voice-a',
    'say:【R18-VOICE-B】下次重逢时，再听一遍。这里播放低音测试序列。 -speaker=羽 -vocal=voice-b.wav; preserve @makenovel-node r18-voice-b',
    'say:【R18-BROKEN】本句故意使用无法解码的声音，收藏文字应保留，试听应报告失败。 -speaker=测试员 -vocal=broken.wav; preserve @makenovel-node r18-broken',
    'say:【R18-NO-ID】本句故意没有稳定ID，用于核对版本内位置回退的说明。 -speaker=测试员; original comment without identity',
    'say:【R18-END】打开历史收藏、筛选和试听；快读起点或刷新重开后，收藏列表应仍保留。 -speaker=测试员; preserve @makenovel-node r18-end',
    'end;',
  ]));
  files.set('game/flowchart.json', JSON.stringify({ flowcharts: [{ id: 'main', name: '第十八轮玩家收藏', type: 'main', nodes: [
    { id: 'start', type: 'root', position: { x: 0, y: 0 }, data: { label: '图片就绪', sceneName: 'start.txt', isRoot: true } },
    { id: 'motion', type: 'chapter', position: { x: 0, y: 170 }, data: { label: '单句动画', sceneName: 'motion.txt' } },
    { id: 'library', type: 'chapter', position: { x: 0, y: 340 }, data: { label: '收藏书页', sceneName: 'library.txt' } },
  ], edges: [{ id: 'a', source: 'start', target: 'motion' }, { id: 'b', source: 'motion', target: 'library' }] }] }, null, 2) + '\n');
  return files;
}

export async function generatePlayerLibraryDemo(output) {
  const root = path.resolve(output);
  await assertPlainDirectory(path.dirname(root));
  try { await fs.lstat(root); throw new Error(`OUTPUT_EXISTS: Refusing to replace existing path: ${root}`); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const gameKey = `makenovel-round18-${randomUUID()}`, files = playerLibraryFiles(gameKey);
  for (const relative of ['template.json', 'Stage/Choose/choose.scss', 'Stage/TextBox/textbox.scss', 'UI/Title/title.scss']) {
    const { stdout } = await exec('git', ['-C', path.join(REPO, 'vendor/WebGAL'), 'show', `${UPSTREAM_COMMIT}:packages/webgal/public/game/template/${relative}`], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 });
    files.set(`game/template/${relative}`, stdout);
  }
  const { stdout: license } = await exec('git', ['-C', path.join(REPO, 'vendor/WebGAL'), 'show', `${UPSTREAM_COMMIT}:LICENSE`], { encoding: 'buffer' });
  await fs.mkdir(root);
  for (const [relative, bytes] of files) {
    const destination = path.join(root, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes, { flag: 'wx' });
  }
  await fs.writeFile(path.join(root, 'WEBGAL-LICENSE.txt'), license, { flag: 'wx' });
  await sealGame(root, { init: true });
  const verified = await verifyGame(root);
  const receipt = { generator: 'integrations/player-library-demo/generate.mjs', version: 1, upstreamCommit: UPSTREAM_COMMIT,
    gameKey, projectId: verified.projectId, manifestHash: verified.manifestHash, files: verified.files.length,
    sceneSources: [...files].filter(([p]) => p.startsWith('game/scene/')).map(([p, bytes]) => ({ path: p, sha256: hash(bytes), bom: true, lineEndings: 'CRLF' })),
    limitation: 'Native shared engine fixture. Synthetic tones, intentionally invalid audio and one missing node ID. No formal artwork, speech, Windows or full author acceptance implied.',
  };
  await fs.writeFile(path.join(root, 'player-library-demo-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(root, 'ASSET-CREDITS.txt'), `MakeNovel round 18 development fixture\nOriginal SVG placeholders and generated PCM test tones from integrations/stage-demo and animation-demo; finite animation from playback-demo. No commercial assets or recorded speech. Generated content follows MPL-2.0. Invalid audio is intentional.\nGUI templates: WebGAL ${UPSTREAM_COMMIT}, MPL-2.0; see WEBGAL-LICENSE.txt. Shared engine assets retain their own terms.\n`, { flag: 'wx' });
  return { output: root, ...receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output') { console.error('Usage: node integrations/player-library-demo/generate.mjs --output <new-project-path>'); process.exitCode = 1; }
  else generatePlayerLibraryDemo(args[1]).then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(cause => { console.error(cause.message); process.exitCode = 1; });
}
