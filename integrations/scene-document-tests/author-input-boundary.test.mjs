import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const bundle = process.env.AUTHOR_INPUT_TEST_BUNDLE;
if (!bundle) throw new Error('Run run-author-input-tests.mjs first');
const load = name => import(pathToFileURL(path.join(bundle, `${name}.mjs`)));
const [{ default: Sidebar }, { ChooseTargetDialog }, { GameConfigEditor }, { default: Assets }, { default: FileElement }] =
  await Promise.all(['sidebar', 'choose', 'config', 'assets', 'file'].map(load));

class Hooks {
  slots = []; cursor = 0;
  state(initial) {
    const index = this.cursor++;
    if (!(index in this.slots)) this.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [this.slots[index], value => { this.slots[index] = typeof value === 'function' ? value(this.slots[index]) : value; }];
  }
  ref(initial) { return this.state({ current: initial })[0]; }
  render(component, props) { this.cursor = 0; globalThis.__authorInputHooks = this; return component(props); }
}
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(item => nodes(item, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
const first = (tree, predicate) => {
  const node = nodes(tree, predicate)[0];
  assert.ok(node, 'Expected production control to render');
  return node;
};
const type = name => node => node.type === name;
const input = (tree, placeholder) => first(tree, node => node.type === 'Input' && node.props.placeholder === placeholder);
const noop = () => {};
const event = (flags = {}, value = '中文名称') => ({
  key: 'Enter', target: { value }, nativeEvent: {}, defaultPrevented: false,
  preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...flags,
});
const variants = [
  ['native composition flag', { nativeEvent: { isComposing: true } }],
  ['native keyCode 229 fallback', { nativeEvent: { isComposing: false, keyCode: 229 } }],
  ['synthetic keyCode 229 fallback', { keyCode: 229 }],
];

// These are callback boundary tests, not proof of an actual Windows IME session.
for (const [variant, flags] of variants) {
  for (const placeholder of ['游戏名称', '游戏目录']) test(`create game / ${placeholder}: ${variant} keeps the form and draft`, () => {
    const hooks = new Hooks(), created = [];
    const props = { gameList: [], currentSetGame: null, setCurrentGame: noop, createGame: data => created.push(data) };
    const render = () => hooks.render(Sidebar, props);
    let tree = render();
    first(tree, type('Popover')).props.onOpenChange();
    tree = render();
    input(tree, '游戏名称').props.onChange({ target: { value: '  中文游戏  ' } });
    tree = render();
    const keyEvent = event(flags);
    input(tree, placeholder).props.onKeyDown(keyEvent);
    assert.equal(created.length, 0);
    tree = render();
    assert.equal(first(tree, type('Popover')).props.open, true);
    assert.equal(input(tree, '游戏名称').props.value, '  中文游戏  ');
    assert.equal(keyEvent.defaultPrevented, false, 'candidate confirmation keeps its native default');
    input(tree, placeholder).props.onKeyDown(event());
    assert.equal(created.length, 1);
    assert.equal(created[0].gameName, '中文游戏');
    assert.equal(first(render(), type('Popover')).props.open, false);
  });

  test(`manual branch label: ${variant} keeps the dialog and draft`, () => {
    const hooks = new Hooks(), selected = [];
    const render = () => hooks.render(ChooseTargetDialog, { target: '', sceneLabels: [], onSelect: value => selected.push(value) });
    let tree = render();
    tree.props.onOpenChange({}, { open: true });
    tree = render();
    input(tree, '输入 label 名称').props.onChange({}, { value: '  中文结局  ' });
    input(tree, '输入 label 名称').props.onKeyDown(event(flags));
    assert.deepEqual(selected, []);
    tree = render();
    assert.equal(tree.props.open, true);
    assert.equal(input(tree, '输入 label 名称').props.value, '  中文结局  ');
    input(tree, '输入 label 名称').props.onKeyDown(event());
    assert.deepEqual(selected, ['中文结局']);
    assert.equal(render().props.open, false);
  });

  test(`game configuration name: ${variant} does not commit or close editing`, () => {
    const hooks = new Hooks(), saved = [];
    const render = () => hooks.render(GameConfigEditor, { value: '原名称', onChange: value => saved.push(value) });
    first(render(), node => node.type === 'span' && node.props.onClick).props.onClick();
    first(render(), type('Input')).props.onKeyDown(event(flags));
    assert.deepEqual(saved, []);
    first(render(), type('Input')).props.onKeyDown(event());
    assert.deepEqual(saved, ['中文名称']);
    assert.equal(nodes(render(), type('Input')).length, 0);
  });

  for (const [placeholder, method] of [['新文件名', 'assetsControllerCreateNewFile'], ['新文件夹名', 'assetsControllerCreateNewFolder']]) {
    test(`asset ${placeholder}: ${variant} does not request creation or clear the draft`, async () => {
      globalThis.__authorInputApi = [];
      const hooks = new Hooks();
      const render = () => hooks.render(Assets, { rootPath: ['games', 'test', 'game'], basePath: ['scene'] });
      const popover = tree => first(tree, node => node.type === 'Popover' && nodes(node, candidate => candidate.type === 'Input' && candidate.props.placeholder === placeholder).length > 0);
      let tree = render();
      popover(tree).props.onOpenChange();
      tree = render();
      input(tree, placeholder).props.onChange({}, { value: '中文章节' });
      first(popover(tree), type('PopoverSurface')).props.onKeyDown(event(flags));
      assert.deepEqual(globalThis.__authorInputApi, []);
      tree = render();
      assert.equal(popover(tree).props.open, true);
      assert.equal(input(tree, placeholder).props.value, '中文章节');
      first(popover(tree), type('PopoverSurface')).props.onKeyDown(event());
      await Promise.resolve();
      assert.deepEqual(globalThis.__authorInputApi, [{ name: method, args: [{ source: 'games/test/game/scene', name: '中文章节' }] }]);
      assert.equal(popover(render()).props.open, false);
    });
  }

  test(`asset rename: ${variant} preserves the edit without invoking rename`, () => {
    const hooks = new Hooks(), renamed = [];
    const props = { rootPath: ['games', 'test', 'game'], file: { name: 'old.txt', path: 'scene/old.txt', extName: '.txt', isDir: false }, type: 'list', selected: true,
      handleOpenFile: noop, handleBackupFile: noop, handleDeleteFile: noop, checkHasFile: () => false,
      handleRenameFile: (...args) => renamed.push(args) };
    const render = () => hooks.render(FileElement, props);
    let tree = render();
    first(tree, type('Input')).props.onChange({}, { value: '新章节.txt' });
    const renameSurface = node => node.type === 'PopoverSurface' && nodes(node, type('Input')).length > 0;
    first(tree, renameSurface).props.onKeyDown(event(flags));
    assert.deepEqual(renamed, []);
    tree = render();
    assert.equal(first(tree, type('Input')).props.value, '新章节.txt');
    first(tree, renameSurface).props.onKeyDown(event());
    assert.deepEqual(renamed, [['games/test/game/scene/old.txt', '新章节.txt']]);
  });
}
