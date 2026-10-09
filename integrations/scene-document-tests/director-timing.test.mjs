import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const load = name => import(pathToFileURL(path.join(process.env.GRAPH_INPUT_TEST_BUNDLE, `${name}.mjs`)));
const { directorExecutionNote } = await load('directorTiming');
const { createDirectorSession } = await load('directorSession');
const require = createRequire(new URL('../../vendor/WebGAL_Terre/package.json', import.meta.url));
const { default: SceneParser, SCRIPT_CONFIG, ADD_NEXT_ARG_LIST } = require('webgal-parser');
const parser = new SceneParser(undefined, name => name, [], SCRIPT_CONFIG);
const runtimeParser = new SceneParser(undefined, name => name, ADD_NEXT_ARG_LIST, SCRIPT_CONFIG);
const session = raw => createDirectorSession(`${raw}\r\nsay:终点;`, 1, 7);
const node = raw => session(raw).nodes[0];
// Conditional and advanced examples are intentionally outside session editing;
// their explanation still consumes the real locked parser's sentence contract.
const nativeNode = (raw, role) => ({ role, sentence: parser.parse(raw, 'timing', 'timing.txt').sentenceList[0] });

test('ordinary and explicit false waits explain skippability without changing source', () => {
  for (const raw of ['wait:0500; 作者注释', 'wait:500 -nobreak=false; @makenovel-node timing-wait']) {
    const current = session(raw);
    const before = structuredClone(current);
    const note = directorExecutionNote(current.nodes[0]);
    assert.match(note, /配置等待 500 毫秒/);
    assert.match(note, /点击或快进可提前结束/);
    assert.match(note, /自动播放仍等待结束/);
    assert.match(note, /菜单内计时继续/);
    assert.deepEqual(current, before);
  }
});

test('nobreak true waits explain both input and auto behavior', () => {
  for (const raw of ['wait:500 -nobreak;', 'wait:500 -nobreak=true;']) {
    const note = directorExecutionNote(node(raw));
    assert.match(note, /点击与快进不会提前结束/);
    assert.match(note, /自动播放仍等待结束/);
  }
});

test('zero and largest supported delays stay configured durations, not exact timeline claims', () => {
  for (const duration of [0, 2147483647]) {
    const note = directorExecutionNote(node(`wait:${duration};`));
    assert.match(note, new RegExp(`配置等待 ${duration} 毫秒`));
    assert.match(note, /实际停留还受其他演出和运行状态影响/);
  }
  for (const content of ['-1', '0.5', '1e3', '0x10', '2147483648', '']) {
    assert.match(directorExecutionNote(nativeNode(`wait:${content};`, 'wait')), /等待时长按原文执行/);
  }
});

test('wait next and continue including explicit false remain conservative source explanations', () => {
  for (const argument of ['next', 'next=false', 'continue', 'continue=false']) {
    const note = directorExecutionNote(node(`wait:500 -${argument};`));
    assert.match(note, /执行顺序按原文处理/);
    assert.doesNotMatch(note, /配置等待|点击与快进不会|配置：/);
  }
});

test('conditions and interpolations never claim a resulting time or stage', () => {
  for (const [raw, role] of [
    ['wait:{delay};', 'wait'], ['wait:500 -nobreak={locked};', 'wait'],
    ['wait:500 -when=ready;', 'wait'], ['changeBg:{image} -next;', 'stage'],
    ['changeBg:day.svg -next={go};', 'stage'],
    ['changeFigure:lin.svg -duration={duration} -next;', 'stage'],
    ['changeBg:day.svg -duration=800 -when=ready;', 'stage'],
  ]) {
    const note = directorExecutionNote(nativeNode(raw, role));
    assert.match(note, /按原文解析/);
    assert.match(note, /不推断完成时间或舞台终态/);
    assert.doesNotMatch(note, /立即继续执行|配置等待|时长配置/);
  }
});

test('BGM and SE implicit first next=true wins over explicit source false', () => {
  for (const command of ['bgm', 'playEffect']) {
    const raw = `${command}:music.wav -next=false;`;
    const current = node(raw);
    const runtime = runtimeParser.parse(raw, 'timing', 'timing.txt').sentenceList[0];
    assert.deepEqual(current.sentence.args.filter(arg => arg.key === 'next').map(arg => arg.value), [false]);
    assert.deepEqual(runtime.args.filter(arg => arg.key === 'next').map(arg => arg.value), [true, false]);
    assert.match(directorExecutionNote(current), /立即继续执行后续命令/);
    assert.match(directorExecutionNote(current), /可能与后续内容重叠/);
    assert.match(directorExecutionNote(node(`${command}:music.wav;`)), /立即继续执行后续命令/);
  }
});

test('stage next uses native boolean conversions and does not mistake explicit false for true', () => {
  for (const suffix of ['', ' -next=false', ' -next=0', ' -next=FALSE']) {
    assert.match(directorExecutionNote(node(`changeBg:day.svg${suffix};`)), /未开启立即继续/);
  }
  for (const suffix of [' -next', ' -next=true', ' -next=1', ' -next=TRUE']) {
    assert.match(directorExecutionNote(node(`changeFigure:lin.svg${suffix};`)), /立即继续执行后续命令/);
  }
  assert.match(directorExecutionNote(nativeNode('changeBg:day.svg -next=false -next=true;', 'stage')), /未开启立即继续/);
  assert.match(directorExecutionNote(nativeNode('changeBg:day.svg -next=true -next=false;', 'stage')), /立即继续执行后续命令/);
});

test('stage duration values are configurations and never added to following wait', () => {
  const current = createDirectorSession('changeFigure:lin.svg -duration=800 -enterDuration=600 -exitDuration=200 -next;\r\nwait:2000 -nobreak;\r\nsay:终点;', 2, 0);
  const stage = directorExecutionNote(current.nodes[0]);
  const wait = directorExecutionNote(current.nodes[1]);
  assert.match(stage, /时长配置：duration=800 毫秒，enterDuration=600 毫秒，exitDuration=200 毫秒/);
  assert.match(stage, /实际演出还受动画与运行状态影响/);
  assert.match(wait, /配置等待 2000 毫秒/);
  assert.doesNotMatch(stage + wait, /2800|总时长|累计/);
});

test('continue stage keeps next explanation but avoids automatic completion claims', () => {
  const note = directorExecutionNote(node('changeBg:day.svg -next -continue;'));
  assert.match(note, /立即继续执行后续命令/);
  assert.match(note, /continue 参数按原文处理/);
});

test('dialogue and author comments have no execution-note projection', () => {
  const current = createDirectorSession('; 作者注释\r\nsay:终点;', 1, 0);
  assert.deepEqual(current.nodes.map(directorExecutionNote), [null, null]);
});
