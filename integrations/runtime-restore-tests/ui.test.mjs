import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const h = {};
globalThis.__saveUiHarness = h;
const ui = await import(pathToFileURL(process.env.SAVE_UI_TEST_BUNDLE));
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
function find(node, predicate) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return;
  }
  if (!node || typeof node !== "object") return;
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}
const byKey = (tree, key) => find(tree, (node) => node.key === key);
const control = (tree, style) =>
  find(
    tree,
    (node) =>
      typeof node.props?.className === "string" &&
      node.props.className.split(" ").includes(style)
  );
const savePreview = () => ({
  index: 1,
  saveTime: "now",
  previewImage: "",
  nowStageState: { showName: "Mio", showText: "hello" },
});
beforeEach(() => {
  h.state = {
    userData: { optionData: { slPage: 1 }, globalGameVar: {} },
    saveData: { saveData: [] },
    GUI: { showTextBox: true, controlsVisibility: true },
  };
  h.stage = { enableFilm: "" };
  h.effects = [];
  h.events = [];
  h.persist = 0;
  h.errors = [];
  h.calls = [];
  h.dispatch = (action) => h.events.push(action);
  h.read = async () => {};
  h.sounds = {
    playSePageChange: () => h.events.push("page"),
    playSeClick: () => h.events.push("click"),
    playSeEnter() {},
    playSeDialogOpen: () => h.events.push("dialog"),
  };
  h.save = async (i) => {
    h.calls.push(["save", i]);
    return true;
  };
  h.load = async (i) => {
    h.calls.push(["load", i]);
    return true;
  };
  h.dialog = undefined;
});
test("empty slot save feedback waits for successful persistence", async () => {
  const wait = deferred();
  h.save = () => wait.promise;
  const click = byKey(ui.Save(), "saveElement_1").props.onClick();
  assert.deepEqual(h.events, []);
  wait.resolve(true);
  await click;
  assert.deepEqual(h.events, ["page"]);
});
test("failed empty slot save gives no success feedback", async () => {
  h.save = async () => false;
  await byKey(ui.Save(), "saveElement_1").props.onClick();
  assert.deepEqual(h.events, []);
  assert.equal(h.persist, 0);
});
test("overwrite confirmation only persists settings and plays success feedback after successful save", async () => {
  h.state.saveData.saveData[1] = savePreview();
  await byKey(ui.Save(), "saveElement_1").props.onClick();
  assert.deepEqual(h.calls, []);
  h.save = async () => false;
  await h.dialog.leftFunc();
  assert.deepEqual(h.events, ["dialog"]);
  assert.equal(h.persist, 0);
  h.save = async () => true;
  await h.dialog.leftFunc();
  assert.deepEqual(h.events, ["dialog", "page"]);
  assert.equal(h.persist, 1);
});
test("load feedback waits for completed native restore", async () => {
  const wait = deferred();
  h.load = () => wait.promise;
  const click = byKey(ui.Load(), "loadElement_1").props.onClick();
  assert.deepEqual(h.events, []);
  wait.resolve(true);
  await click;
  assert.deepEqual(h.events, ["click"]);
});
test("failed load leaves menu feedback and visibility unchanged", async () => {
  h.load = async () => false;
  await byKey(ui.Load(), "loadElement_1").props.onClick();
  assert.deepEqual(h.events, []);
});
for (const [className, method] of [
  ["fastsave", "save"],
  ["fastload", "load"],
]) {
  test(`${className} feedback follows successful completion`, async () => {
    const wait = deferred();
    h[method] = () => wait.promise;
    const click = control(ui.BottomControlPanel(), className).props.onClick();
    assert.deepEqual(h.events, []);
    wait.resolve(true);
    await click;
    assert.deepEqual(h.events, ["click"]);
  });
  test(`${className} failure gives no success feedback`, async () => {
    h[method] = async () => false;
    await control(ui.BottomControlPanel(), className).props.onClick();
    assert.deepEqual(h.events, []);
  });
}
test("malformed stored previews do not crash any save/load surface", () => {
  h.state.saveData.saveData[0] = { nowStageState: null };
  h.state.saveData.saveData[1] = {
    nowStageState: { showName: { bad: true }, showText: [] },
  };
  assert.doesNotThrow(() => ui.Save());
  assert.doesNotThrow(() => ui.Load());
  assert.doesNotThrow(() => ui.BottomControlPanel());
  assert.equal(ui.canPreviewSave(h.state.saveData.saveData[0]), false);
  assert.equal(ui.canPreviewSave(savePreview()), true);
});
for (const name of ["Save", "Load"])
  test(`${name} slot read rejection is reported without unhandled rejection`, async () => {
    h.read = async () => {
      throw Error("storage read failed");
    };
    ui[name]();
    h.effects[0]();
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(h.errors[0], /storage read failed/);
  });
