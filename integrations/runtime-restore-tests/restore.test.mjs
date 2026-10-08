import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const h = { WebGAL: {}, store: {}, stage: {}, storage: {} };
globalThis.__restoreHarness = h;
globalThis.window = {
  dispatchEvent() {},
  addEventListener() {},
  location: { protocol: "http:", hostname: "localhost", port: "3001" },
};
globalThis.document = {
  addEventListener() {},
  querySelector: () => null,
  getElementById: () => ({}),
  createElement: () => ({
    getContext: () => ({ drawImage() {} }),
    toDataURL: () => "",
    remove() {},
  }),
};
const runtime = await import(pathToFileURL(process.env.RESTORE_TEST_BUNDLE));

for (const command of ['changeBg', 'changeFigure', 'changeFigureDiff', 'setTransform', 'setAnimation', 'setTempAnimation', 'setComplexAnimation', 'wait']) {
  test(`save waits for a stable point while ${command} is active`, async () => {
    h.currentStage.PerformList = [{ id: 'unfinished', isHoldOn: false, script: { command: runtime.commandType[command], content: '', args: [] } }];
    const before = clone(h.currentStage);
    assert.equal(await runtime.saveGame(2), false);
    assert.equal(await runtime.fastSaveGame(), false);
    assert.equal(h.writes.length, 0);
    assert.deepEqual(h.currentStage, before);
    assert.match(h.errors.join('\n'), /演出.*结束/);
    h.currentStage.PerformList = [];
    assert.equal(await runtime.saveGame(2), true);
  });
}
test('dialogue and a held background effect remain saveable', async () => {
  h.currentStage.PerformList = [
    { id: 'dialogue', isHoldOn: false, script: { command: runtime.commandType.say, content: 'line', args: [] } },
    { id: 'loop', isHoldOn: true, script: { command: runtime.commandType.setAnimation, content: 'breathing', args: [] } },
  ];
  assert.equal(await runtime.saveGame(2), true);
  assert.equal(await runtime.fastSaveGame(), true);
});
test('completed animation behind a menu is not saved before its deferred story continuation', async () => {
  h.deferredStory = true;
  assert.equal(await runtime.saveGame(2), false);
  assert.equal(await runtime.fastSaveGame(), false);
  assert.equal(h.writes.length, 0);
  assert.match(h.errors.join('\n'), /返回剧情/);
  h.deferredStory = false;
  assert.equal(await runtime.saveGame(2), true);
});
test('a detached exit object prevents saving even when the native perform list is empty', async () => {
  const old = { key: 'departing', uuid: 'old' };
  runtime.scheduleStageExit({ getStageObjByKey: () => old, removeAnimation() {}, removeStageObjectByKey() {} }, old, 'exit', 8000);
  try {
    assert.equal(await runtime.saveGame(2), false);
    assert.equal(await runtime.fastSaveGame(), false);
    assert.equal(h.writes.length, 0);
  } finally { runtime.finishStageExits(); }
  assert.equal(await runtime.saveGame(2), true);
});
const metadata = {
  schemaVersion: 1,
  projectId: "fixture",
  gameKey: "fixture",
  runtimeCompatibilityId: "native-test",
  manifestHash: "fixture-hash",
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const clone = (v) => structuredClone(v);
const raw = "say:one;\nsay:two;\nsay:three;";
const preflight = () => ({
  rawScene: raw,
  sceneSources: new Map(
    ["start.txt", "child.txt", "parent.txt"].map((name) => [
      "./game/scene/" + name,
      raw,
    ])
  ),
});
const scene = (name = "start.txt") => ({
  sceneName: name,
  sceneUrl: "./game/scene/" + name,
  sentenceList: raw.split("\n").map((content) => ({ content })),
  assetsList: [],
  subSceneList: [],
});
const stage = (text) => ({
  showText: text,
  bgName: text + "-bg",
  PerformList: [],
  GameVar: { score: 1 },
});
const snapshot = (text = "saved", name = "child.txt") => ({
  makenovel: clone(metadata),
  nowStageState: stage(text),
  backlog: [],
  index: 1,
  saveTime: "today",
  previewImage: "",
  sceneData: {
    currentSentenceId: 2,
    sceneName: name,
    sceneUrl: "./game/scene/" + name,
    sceneStack: [
      {
        sceneName: "parent.txt",
        sceneUrl: "./game/scene/parent.txt",
        continueLine: 1,
        locals: { parent: 3 },
        writeReturnTo: "result",
      },
    ],
    currentLocals: { child: 7 },
  },
});
const state = () =>
  clone({
    scene: h.WebGAL.sceneManager.sceneData,
    stage: h.currentStage,
    backlog: h.WebGAL.backlogManager.getBacklog(),
    GUI: h.storeState.GUI,
  });
beforeEach(() => {
  runtime.autoFastSaveGame.cancel();
  h.errors = [];
  h.deferredStory = false;
  h.stops = [];
  h.next = 0;
  h.varWrites = [];
  h.writes = [];
  h.metadata = clone(metadata);
  h.storageEnabled = true;
  h.storageEpoch = 0;
  h.waitRuntimeReady = async () => {};
  h.previewMarks = 0;
  h.previewMessages = [];
  h.legacyGameKey = "original-game-key";
  h.applyDebugVariables = () => {};
  h.fastPreview = async () => null;
  h.setDebugTextReadMode = () => {};
  h.currentStage = stage("active");
  h.storeState = {
    GUI: {
      showTitle: false,
      showMenuPanel: true,
      titleBg: "title",
      showBacklog: true,
    },
    saveData: { saveData: [], quickSaveData: null },
  };
  Object.assign(h.store, {
    getState: () => h.storeState,
    dispatch(action) {
      const p = action.payload;
      if (action.type === "visibility")
        h.storeState.GUI[p.component] = p.visibility;
      if (action.type === "font") h.storeState.GUI.fontOptimization = p;
      if (action.type === "save")
        h.storeState.saveData.saveData[p.index] = p.saveData;
      if (action.type === "fast") h.storeState.saveData.quickSaveData = p;
    },
  });
  Object.assign(h.stage, {
    subscribe: () => () => {},
    getCalculationStageState: () => h.currentStage,
    getViewStageState: () => h.currentStage,
    replaceCalculationStageState: (s) => (h.currentStage = s),
    removeAllPerform: () => (h.currentStage.PerformList = []),
    commit() {},
    applyCommittedPixiEffects() {},
    setStage: (k, v) => (h.currentStage[k] = v),
    setStageAndCommit: (k, v) => (h.currentStage[k] = v),
    resetAllStageState: (s) => (h.currentStage = s),
    resetCalculationStageState: (s) => (h.currentStage = s),
  });
  const sceneManager = new runtime.SceneManager();
  sceneManager.sceneData.currentScene = scene();
  sceneManager.sceneData.currentSentenceId = 1;
  sceneManager.sceneData.currentLocals = { active: 4 };
  Object.assign(h.WebGAL, {
    sceneManager,
    gameName: "fixture",
    gameKey: "fixture",
    backlogManager: new runtime.BacklogManager(sceneManager),
    flowchartManager: {
      waitForCurrentSceneDialog() {},
      cancelPendingSceneUnlock() {},
    },
    gameplay: {
      isFastPreview: false,
      pixiStage: { requestRender() {}, removeAllAnimations() {}, getAllStageObj: () => [] },
      resetGamePlay() {},
      performController: {
        removeAllPerform: () => h.stops.push("perform"),
        beginCollectingPerforms() {},
        endCollectingPerforms() {},
        commitPendingPerforms() {},
        arrangeNewPerform() {},
      },
    },
  });
  h.validateLoad = async () => preflight();
  h.validateSave = async () => metadata;
  h.fetchScene = async () => raw;
  h.runScript = () => {};
  h.dumpSave = async (a, b) => h.writes.push(["save", a, b]);
  h.dumpFast = async () => h.writes.push(["fast"]);
  h.readFast = async () => h.storeState.saveData.quickSaveData;
  h.flowchart = {
    flowcharts: [
      {
        id: "main",
        name: "main",
        nodes: [
          {
            id: "node",
            position: { x: 0, y: 0 },
            data: { label: "Chapter", sceneName: "start.txt" },
          },
        ],
        edges: [],
      },
    ],
  };
  Object.assign(h.storage, {
    getItem: async () => null,
    setItem: async (k, v) => {
      h.writes.push([k, clone(v)]);
      return v;
    },
    removeItem: async () => {},
  });
});

test("successful restore commits native parent frame and child locals only after preflight", async () => {
  const wait = deferred();
  h.validateLoad = () => wait.promise;
  const before = state();
  const save = snapshot();
  const result = runtime.loadGameFromStageData(save);
  assert.deepEqual(state(), before);
  assert.equal(h.stops.length, 0);
  assert.equal(h.WebGAL.sceneManager.lockSceneWrite, true);
  wait.resolve(preflight());
  assert.equal(await result, true);
  assert.equal(h.currentStage.showText, "saved");
  assert.deepEqual(h.WebGAL.sceneManager.sceneData.currentLocals, { child: 7 });
  assert.equal(h.WebGAL.sceneManager.sceneData.sceneStack[0].continueLine, 1);
  assert.equal(h.WebGAL.sceneManager.lockSceneWrite, false);
  save.sceneData.currentLocals.child = 99;
  assert.equal(h.WebGAL.sceneManager.sceneData.currentLocals.child, 7);
});
test("failed preflight leaves playing scene, stage, backlog, visibility and performances intact", async () => {
  const before = state();
  h.validateLoad = async () => {
    throw Error("manifest mismatch");
  };
  assert.equal(await runtime.loadGameFromStageData(snapshot()), false);
  assert.deepEqual(state(), before);
  assert.deepEqual(h.stops, []);
  assert.match(h.errors[0], /manifest mismatch/);
  assert.equal(h.WebGAL.sceneManager.lockSceneWrite, false);
});
test("last restore request wins even when first response arrives last", async () => {
  const first = deferred(),
    second = deferred();
  let n = 0;
  h.validateLoad = () => (++n === 1 ? first.promise : second.promise);
  const a = runtime.loadGameFromStageData(snapshot("old"));
  const b = runtime.loadGameFromStageData(snapshot("new"));
  second.resolve(preflight());
  assert.equal(await b, true);
  first.resolve(preflight());
  assert.equal(await a, false);
  assert.equal(h.currentStage.showText, "new");
  assert.deepEqual(h.errors, []);
});
test("failed latest restore never revives a superseded earlier request", async () => {
  const first = deferred(),
    second = deferred();
  let n = 0;
  h.validateLoad = () => (++n === 1 ? first.promise : second.promise);
  const before = state();
  const a = runtime.loadGameFromStageData(snapshot("old"));
  const b = runtime.loadGameFromStageData(snapshot("new"));
  first.resolve(preflight());
  assert.equal(await a, false);
  assert.equal(h.WebGAL.sceneManager.lockSceneWrite, true);
  second.reject(Error("missing scene"));
  assert.equal(await b, false);
  assert.deepEqual(state(), before);
  assert.deepEqual(h.stops, []);
});
test("invalid native pointer rejects before stopping active performances", async () => {
  const save = snapshot();
  save.sceneData.currentSentenceId = 20;
  assert.equal(await runtime.loadGameFromStageData(save), false);
  assert.deepEqual(h.stops, []);
  assert.equal(h.currentStage.showText, "active");
});
test("unknown perform script rejects before commit", async () => {
  const save = snapshot();
  save.nowStageState.PerformList = [
    { script: { command: 999, args: [], content: "" } },
  ];
  assert.equal(await runtime.loadGameFromStageData(save), false);
  assert.deepEqual(h.stops, []);
});
test("backlog preflight retains current list and then trims only after success", async () => {
  const manager = h.WebGAL.backlogManager;
  for (const text of ["first", "second", "third"]) {
    const save = snapshot(text);
    manager.insertBacklogItem({
      makenovel: save.makenovel,
      currentStageState: save.nowStageState,
      saveScene: save.sceneData,
    });
  }
  const wait = deferred();
  h.validateLoad = (s) => {
    assert.equal(s.makenovel.manifestHash, metadata.manifestHash);
    assert.equal(s.backlog.length, 2);
    return wait.promise;
  };
  const pending = runtime.jumpFromBacklog(1, false);
  assert.equal(manager.getBacklog().length, 3);
  wait.resolve(preflight());
  assert.equal(await pending, true);
  assert.equal(manager.getBacklog().length, 2);
  assert.equal(h.currentStage.showText, "second");
  assert.equal(manager.isSaveBacklogNext, true);
});
test("failed backlog request preserves all history entries", async () => {
  const save = snapshot();
  h.WebGAL.backlogManager.insertBacklogItem({
    makenovel: save.makenovel,
    currentStageState: save.nowStageState,
    saveScene: save.sceneData,
  });
  const before = state();
  h.validateLoad = async () => {
    throw Error("wrong version");
  };
  assert.equal(await runtime.jumpFromBacklog(0), false);
  assert.deepEqual(state(), before);
});
test("native backlog snapshots receive compatibility and locals", () => {
  h.WebGAL.backlogManager.saveCurrentStateToBacklog();
  const entry = h.WebGAL.backlogManager.getBacklog()[0];
  assert.deepEqual(entry.makenovel, metadata);
  assert.deepEqual(entry.saveScene.currentLocals, { active: 4 });
});
test("quick-load epoch is acquired before asynchronous storage read", async () => {
  const slow = deferred();
  let n = 0;
  h.readFast = async () => {
    if (++n === 1) {
      await slow.promise;
      h.storeState.saveData.quickSaveData = snapshot("slow");
    } else h.storeState.saveData.quickSaveData = snapshot("latest");
    return h.storeState.saveData.quickSaveData;
  };
  const first = runtime.loadFastSaveGame();
  assert.equal(await runtime.loadFastSaveGame(), true);
  slow.resolve();
  assert.equal(await first, false);
  assert.equal(h.currentStage.showText, "latest");
});
test("return-to-title invalidates pending restore", async () => {
  const wait = deferred();
  h.validateLoad = () => wait.promise;
  const pending = runtime.loadGameFromStageData(snapshot());
  runtime.backToTitle();
  wait.resolve(preflight());
  assert.equal(await pending, false);
  assert.equal(h.storeState.GUI.showTitle, true);
  assert.equal(h.currentStage.showText, "active");
});
test("new start supersedes pending restore and runs only the new opening", async () => {
  const wait = deferred();
  h.validateLoad = () => wait.promise;
  const pending = runtime.loadGameFromStageData(snapshot());
  await runtime.startGame();
  wait.resolve(preflight());
  assert.equal(await pending, false);
  assert.equal(
    h.WebGAL.sceneManager.sceneData.currentScene.sceneName,
    "start.txt"
  );
  assert.equal(h.next, 1);
});
test("missing opening does not erase current stage", async () => {
  const before = state();
  h.fetchScene = async () => {
    throw Error("404");
  };
  await runtime.startGame();
  assert.deepEqual(state(), before);
  assert.deepEqual(h.stops, []);
  assert.equal(h.WebGAL.sceneManager.lockSceneWrite, false);
});
test("start waits for runtime bootstrap before fetching or changing the active stage", async () => {
  const ready = deferred();
  h.waitRuntimeReady = () => ready.promise;
  let fetches = 0;
  h.fetchScene = async () => {
    fetches++;
    return raw;
  };
  const before = state();
  const pending = runtime.startGame();
  await Promise.resolve();
  assert.equal(fetches, 0);
  assert.deepEqual(state(), before);
  assert.deepEqual(h.stops, []);
  ready.resolve();
  await pending;
  assert.equal(fetches, 1);
  assert.equal(h.next, 1);
});
test("repeated starts during bootstrap fetch and execute only the latest request", async () => {
  const ready = deferred();
  h.waitRuntimeReady = () => ready.promise;
  let fetches = 0;
  h.fetchScene = async () => {
    fetches++;
    return raw;
  };
  const first = runtime.startGame();
  const second = runtime.startGame();
  assert.equal(fetches, 0);
  ready.resolve();
  await Promise.all([first, second]);
  assert.equal(fetches, 1);
  assert.equal(h.next, 1);
  assert.equal(h.WebGAL.sceneManager.lockSceneWrite, false);
});
test("returning to title while start awaits bootstrap never revives that start", async () => {
  const ready = deferred();
  h.waitRuntimeReady = () => ready.promise;
  let fetches = 0;
  h.fetchScene = async () => {
    fetches++;
    return raw;
  };
  const pending = runtime.startGame();
  runtime.backToTitle();
  ready.resolve();
  await pending;
  assert.equal(fetches, 0);
  assert.equal(h.next, 0);
  assert.equal(h.currentStage.showText, "active");
  assert.equal(h.storeState.GUI.showTitle, true);
});
test("latest start remains authoritative when earlier fetch completes last", async () => {
  const firstFetch = deferred();
  const firstEntered = deferred();
  let fetches = 0;
  h.fetchScene = async () => {
    if (++fetches === 1) {
      firstEntered.resolve();
      return firstFetch.promise;
    }
    return "say:latest;";
  };
  const first = runtime.startGame();
  await firstEntered.promise;
  await runtime.startGame();
  firstFetch.resolve("say:old;");
  await first;
  assert.equal(
    h.WebGAL.sceneManager.sceneData.currentScene.sentenceList[0].content,
    "say:latest;"
  );
  assert.equal(h.next, 1);
});

async function openPreviewSession() {
  runtime.startPreviewSyncRuntime();
  await h.previewHooks.onOpen({});
  const registration = h.previewMessages.find(
    (message) => message.type === "session.register-preview"
  );
  assert.ok(registration);
  h.previewHooks.onMessage(
    JSON.stringify(
      runtime.createResponseEnvelope(
        "session.register-preview",
        registration.requestId,
        {}
      )
    )
  );
}
function previewRequest(type, payload) {
  h.previewHooks.onMessage(
    JSON.stringify(runtime.createRequestEnvelope(type, "preview-test", payload))
  );
}
test("author snippet disables persistence before debug variables or scripts execute", async () => {
  await openPreviewSession();
  let applied = false;
  h.applyDebugVariables = () => {
    assert.equal(h.storageEnabled, false);
    applied = true;
  };
  let executed = false;
  h.runScript = () => {
    assert.equal(h.storageEnabled, false);
    executed = true;
  };
  previewRequest("preview.command.run-snippet", {
    snippet: "say:preview;",
    debugVariables: [],
  });
  assert.equal(applied, true);
  assert.equal(executed, true);
  assert.equal(h.previewMarks, 1);
  assert.equal(await runtime.saveGame(2), false);
  assert.equal(await runtime.fastSaveGame(true), false);
  assert.deepEqual(h.writes, []);
});
test("read-only preview query does not disable player persistence", async () => {
  await openPreviewSession();
  previewRequest("preview.query.base-transform", {});
  assert.equal(h.previewMarks, 0);
  assert.equal(h.storageEnabled, true);
  assert.equal(await runtime.saveGame(2), true);
});
test("automatic font optimization setup changes only GUI settings and keeps player saving enabled", async () => {
  await openPreviewSession();
  previewRequest("preview.command.set-font-optimization", { enabled: true });
  assert.equal(h.storeState.GUI.fontOptimization, true);
  assert.equal(h.previewMarks, 0);
  assert.equal(h.storageEnabled, true);
  assert.equal(await runtime.saveGame(2), true);
  assert.equal(await runtime.fastSaveGame(true), true);
});
test("author text read override is marked before changing stage read semantics", async () => {
  await openPreviewSession();
  let applied = false;
  h.setDebugTextReadMode = (value) => {
    assert.equal(value, true);
    assert.equal(h.storageEnabled, false);
    applied = true;
  };
  previewRequest("preview.command.set-text-read-mode", { isRead: true });
  assert.equal(applied, true);
  assert.equal(h.previewMarks, 1);
  assert.equal(await runtime.saveGame(2), false);
  assert.equal(await runtime.fastSaveGame(true), false);
  assert.deepEqual(h.writes, []);
});
test("preview registration uses author Game_key rather than versioned player namespace", async () => {
  h.WebGAL.gameKey = "makenovel-v1:project:manifest";
  await openPreviewSession();
  const request = h.previewMessages.find(
    (message) => message.type === "session.register-preview"
  );
  assert.equal(request.payload.gameId, "original-game-key");
  assert.equal(h.WebGAL.gameKey, "makenovel-v1:project:manifest");
});
test("legacy JMP disables persistence before advancing and preserves its result", async () => {
  const expected = { stopReason: "target-reached" };
  h.fastPreview = async (...args) => {
    assert.equal(h.storageEnabled, false);
    assert.deepEqual(args, [2, "start.txt"]);
    return expected;
  };
  runtime.bindExtraFunc();
  assert.equal(await window.JMP(2, "start.txt"), expected);
  assert.equal(h.previewMarks, 1);
  assert.equal(await runtime.fastSaveGame(true), false);
  assert.deepEqual(h.writes, []);
});
test("call-scene fetch failure never pushes frame or overwrites caller locals", async () => {
  h.fetchScene = async () => {
    throw Error("404");
  };
  runtime.callScene("./game/scene/child.txt", "child.txt", { child: 7 });
  await h.WebGAL.sceneManager.sceneWritePromise;
  assert.deepEqual(h.WebGAL.sceneManager.sceneData.sceneStack, []);
  assert.deepEqual(h.WebGAL.sceneManager.sceneData.currentLocals, {
    active: 4,
  });
});
test("successful call records calling index before executor advances it", async () => {
  const wait = deferred();
  h.fetchScene = () => wait.promise;
  runtime.callScene(
    "./game/scene/child.txt",
    "child.txt",
    { child: 7 },
    "result"
  );
  const task = h.WebGAL.sceneManager.sceneWritePromise;
  h.WebGAL.sceneManager.sceneData.currentSentenceId++;
  assert.equal(h.WebGAL.sceneManager.sceneData.sceneStack.length, 0);
  wait.resolve(raw);
  await task;
  assert.equal(h.WebGAL.sceneManager.sceneData.sceneStack[0].continueLine, 1);
  assert.deepEqual(h.WebGAL.sceneManager.sceneData.currentLocals, { child: 7 });
  assert.equal(h.next, 1);
});
test("old scene request cannot clear new restore lock or overwrite reset session", async () => {
  const wait = deferred();
  h.fetchScene = () => wait.promise;
  runtime.callScene("child.txt", "child.txt");
  const task = h.WebGAL.sceneManager.sceneWritePromise;
  h.WebGAL.sceneManager.resetScene();
  const token = h.WebGAL.sceneManager.beginRestoreRequest();
  wait.resolve(raw);
  await task;
  assert.equal(h.WebGAL.sceneManager.lockSceneWrite, true);
  assert.equal(h.WebGAL.sceneManager.sceneData.currentScene.sceneName, "");
  assert.equal(h.next, 0);
  h.WebGAL.sceneManager.finishSessionOperation(token);
});
test("restore admission during ordinary scene switch is explicit and non-destructive", async () => {
  const wait = deferred();
  h.fetchScene = () => wait.promise;
  runtime.changeScene("child.txt", "child.txt");
  const task = h.WebGAL.sceneManager.sceneWritePromise;
  assert.equal(await runtime.loadGameFromStageData(snapshot()), false);
  assert.equal(h.WebGAL.sceneManager.lockSceneWrite, true);
  wait.resolve(raw);
  await task;
  assert.equal(
    h.WebGAL.sceneManager.sceneData.currentScene.sceneName,
    "child.txt"
  );
});
test("failed return preserves parent frame and does not write return value", async () => {
  h.WebGAL.sceneManager.sceneData.sceneStack = snapshot().sceneData.sceneStack;
  h.fetchScene = async () => {
    throw Error("404");
  };
  runtime.returnFromScene(42);
  await h.WebGAL.sceneManager.sceneWritePromise;
  assert.equal(h.WebGAL.sceneManager.sceneData.sceneStack.length, 1);
  assert.deepEqual(h.varWrites, []);
  assert.deepEqual(h.WebGAL.sceneManager.sceneData.currentLocals, {
    active: 4,
  });
});
test("successful return pops once and writes its value after restoring caller locals", async () => {
  h.WebGAL.sceneManager.sceneData.sceneStack = snapshot().sceneData.sceneStack;
  runtime.returnFromScene(42);
  await h.WebGAL.sceneManager.sceneWritePromise;
  assert.equal(h.WebGAL.sceneManager.sceneData.sceneStack.length, 0);
  assert.deepEqual(h.WebGAL.sceneManager.sceneData.currentLocals, {
    parent: 3,
  });
  assert.deepEqual(h.varWrites, [{ key: "result", value: 42 }]);
  assert.equal(h.WebGAL.sceneManager.sceneData.currentSentenceId, 2);
  assert.equal(h.next, 1);
});
test("save captures click-time data and validates before publishing a slot", async () => {
  const wait = deferred();
  h.validateSave = () => wait.promise;
  const pending = runtime.saveGame(2);
  h.currentStage.showText = "later";
  assert.equal(h.storeState.saveData.saveData[2], undefined);
  wait.resolve(metadata);
  assert.equal(await pending, true);
  assert.equal(
    h.storeState.saveData.saveData[2].nowStageState.showText,
    "active"
  );
  assert.deepEqual(h.storeState.saveData.saveData[2].makenovel, metadata);
});
test("overlapping saves to one slot retain last requested snapshot", async () => {
  const first = deferred(),
    second = deferred();
  let n = 0;
  h.validateSave = () => (++n === 1 ? first.promise : second.promise);
  const a = runtime.saveGame(2);
  h.currentStage.showText = "latest";
  const b = runtime.saveGame(2);
  second.resolve(metadata);
  assert.equal(await b, true);
  first.resolve(metadata);
  assert.equal(await a, false);
  assert.equal(
    h.storeState.saveData.saveData[2].nowStageState.showText,
    "latest"
  );
});
test("new session cancels an in-flight save before publication", async () => {
  const wait = deferred();
  h.validateSave = () => wait.promise;
  const pending = runtime.saveGame(2);
  h.WebGAL.sceneManager.invalidateSession();
  wait.resolve(metadata);
  assert.equal(await pending, false);
  assert.equal(h.storeState.saveData.saveData[2], undefined);
  assert.deepEqual(h.writes, []);
});
test("missing compatibility prevents both manual and automatic save writes", async () => {
  h.metadata = undefined;
  assert.equal(await runtime.saveGame(2), false);
  assert.equal(await runtime.fastSaveGame(true), false);
  assert.deepEqual(h.writes, []);
  assert.equal(h.storeState.saveData.quickSaveData, null);
});
test("flowchart snapshots carry child locals and manifest metadata", async () => {
  const flow = new runtime.FlowchartManager(h.WebGAL.sceneManager);
  await flow.init("fixture", true);
  await flow.unlockCurrentScene();
  const stored = h.writes.find(
    ([key]) => key === "fixture-flowchart-main-node"
  );
  assert.ok(stored);
  assert.deepEqual(stored[1].sceneData.currentLocals, { active: 4 });
  assert.deepEqual(stored[1].makenovel, metadata);
});
test("flowchart save gate failure leaves stored progress and snapshot untouched", async () => {
  const flow = new runtime.FlowchartManager(h.WebGAL.sceneManager);
  await flow.init("fixture", true);
  h.validateSave = async () => {
    throw Error("changed manifest");
  };
  await flow.unlockCurrentScene();
  assert.deepEqual(h.writes, []);
  assert.equal(flow.isUnlocked("main", "node"), false);
});

test("failed slot persistence leaves the visible old slot intact", async () => {
  const old = snapshot("old slot");
  h.storeState.saveData.saveData[2] = old;
  h.dumpSave = async () => {
    throw Error("disk full");
  };
  assert.equal(await runtime.saveGame(2), false);
  assert.equal(h.storeState.saveData.saveData[2], old);
  assert.match(h.errors[0], /disk full/);
});
test("failed quick persistence leaves the prior quick slot intact", async () => {
  const old = snapshot("old quick");
  h.storeState.saveData.quickSaveData = old;
  h.dumpFast = async () => {
    throw Error("quota");
  };
  assert.equal(await runtime.fastSaveGame(), false);
  assert.equal(h.storeState.saveData.quickSaveData, old);
  assert.match(h.errors[0], /quota/);
});
test("synchronous renderer failure rebuilds the prior native state", async () => {
  const before = state();
  h.stage.commit = () => {
    if (h.currentStage.showText === "saved")
      throw Error("renderer rejected state");
  };
  assert.equal(await runtime.loadGameFromStageData(snapshot()), false);
  assert.deepEqual(state(), before);
  assert.match(h.errors[0], /renderer rejected/);
  assert.equal(h.WebGAL.sceneManager.lockSceneWrite, false);
});

test("an old blocking-perform retry cannot advance the replacement session", async () => {
  const controller = new runtime.PerformController();
  h.stage.removePerformByName = () => {};
  const finished = {
    performName: "finished",
    isStarted: true,
    stopFunction() {},
    goNextWhenOver: true,
  };
  const blocker = {
    performName: "blocker",
    isStarted: true,
    stopFunction() {},
    blockingNext: () => true,
  };
  controller.performList = [finished, blocker];
  controller.softUnmountPerformObject(finished);
  controller.removeAllPerform();
  await new Promise((resolve) => setTimeout(resolve, 125));
  assert.equal(h.next, 0);
});

test("invalid parent return pointer rejects the full slot before scene commit", async () => {
  const save = snapshot();
  save.sceneData.sceneStack[0].continueLine = 3;
  const before = state();
  assert.equal(await runtime.loadGameFromStageData(save), false);
  assert.deepEqual(state(), before);
  assert.deepEqual(h.stops, []);
});
test("invalid nested backlog pointer rejects the full slot without truncating history", async () => {
  const save = snapshot();
  const entry = snapshot("history");
  entry.sceneData.currentSentenceId = 500;
  save.backlog.push({
    makenovel: entry.makenovel,
    currentStageState: entry.nowStageState,
    saveScene: entry.sceneData,
  });
  const before = state();
  assert.equal(await runtime.loadGameFromStageData(save), false);
  assert.deepEqual(state(), before);
  assert.deepEqual(h.stops, []);
});
test("missing parent preflight bytes reject without refetch or state mutation", async () => {
  h.validateLoad = async () => ({ rawScene: raw, sceneSources: new Map() });
  const before = state();
  assert.equal(await runtime.loadGameFromStageData(snapshot()), false);
  assert.deepEqual(state(), before);
  assert.deepEqual(h.stops, []);
});

test("control-flow commands cannot be smuggled into a saved perform list", async () => {
  const save = snapshot();
  save.nowStageState.PerformList = [
    { script: { command: 11, args: [], content: "" } },
  ];
  const before = state();
  assert.equal(await runtime.loadGameFromStageData(save), false);
  assert.deepEqual(state(), before);
  assert.deepEqual(h.stops, []);
});

test("flowchart storage failure does not publish an unlocked node or cached snapshot", async () => {
  const flow = new runtime.FlowchartManager(h.WebGAL.sceneManager);
  await flow.init("fixture", true);
  h.storage.setItem = async () => {
    throw Error("quota");
  };
  await flow.unlockCurrentScene();
  assert.equal(flow.isUnlocked("main", "node"), false);
  assert.equal(await flow.loadSnapshot("main", "node"), null);
  assert.match(h.errors[0], /quota/);
});

test("flowchart clear waits for an active persistence task before removing progress", async () => {
  const flow = new runtime.FlowchartManager(h.WebGAL.sceneManager);
  await flow.init("fixture", true);
  const wait = deferred();
  const entered = deferred();
  const calls = [];
  h.storage.setItem = async (key) => {
    calls.push("write:" + key);
    entered.resolve();
    await wait.promise;
  };
  h.storage.removeItem = async (key) => {
    calls.push("remove:" + key);
  };
  const save = flow.unlockCurrentScene();
  await entered.promise;
  const clear = flow.clearProgress();
  assert.equal(calls.length, 1);
  wait.resolve();
  await Promise.all([save, clear]);
  assert.equal(flow.isUnlocked("main", "node"), false);
  assert.deepEqual(calls.slice(-2), [
    "remove:fixture-flowchart-main-node",
    "remove:fixture-flowchart",
  ]);
});

test("duplicate restore cleanup cannot unlock a subsequent scene write in the same session", () => {
  const manager = h.WebGAL.sceneManager;
  const token = manager.beginRestoreRequest();
  manager.finishSessionOperation(token);
  manager.beginSceneWrite();
  manager.finishSessionOperation(token);
  assert.equal(manager.lockSceneWrite, true);
  manager.finishSessionOperation(token, "scene");
  assert.equal(manager.lockSceneWrite, false);
});

test("quick-record query skips unsealed or backup-disabled storage without initialization", async () => {
  h.metadata = undefined;
  let reads = 0;
  h.readFast = async () => {
    reads++;
    throw Error("disabled");
  };
  assert.equal(await runtime.hasFastSaveRecord(), false);
  assert.equal(reads, 0);
  assert.deepEqual(h.errors, []);
});

test("quick-record query handles a storage read failure instead of rejecting", async () => {
  h.readFast = async () => {
    throw Error("storage inaccessible");
  };
  assert.equal(await runtime.hasFastSaveRecord(), false);
  assert.match(h.errors[0], /storage inaccessible/);
});

test("quick continue rejects before reservation or storage access when backup/version is not ready", async () => {
  h.metadata = undefined;
  const before = state();
  let reads = 0;
  h.readFast = async () => {
    reads++;
  };
  assert.equal(await runtime.loadFastSaveGame(), false);
  assert.deepEqual(state(), before);
  assert.equal(reads, 0);
  assert.equal(h.WebGAL.sceneManager.getSessionEpoch(), 0);
  assert.equal(h.WebGAL.sceneManager.lockSceneWrite, false);
});

test("disabled flowchart initialization and cleanup never touch empty or legacy keys", async () => {
  h.storageEnabled = false;
  let access = 0;
  h.storage.getItem = async () => {
    access++;
    return null;
  };
  h.storage.removeItem = async () => {
    access++;
  };
  const flow = new runtime.FlowchartManager(h.WebGAL.sceneManager);
  await flow.init("fixture", true);
  await assert.rejects(flow.clearProgress(), /未就绪/);
  assert.equal(await flow.loadSnapshot("main", "node"), null);
  assert.equal(access, 0);
});

test("late flowchart initialization cannot publish progress into a newer namespace", async () => {
  const wait = deferred();
  const entered = deferred();
  h.storage.getItem = async (key) => {
    if (key === "fixture-flowchart") {
      entered.resolve();
      return wait.promise;
    }
    return [];
  };
  const flow = new runtime.FlowchartManager(h.WebGAL.sceneManager);
  const old = flow.init("fixture", true);
  await entered.promise;
  h.WebGAL.gameKey = "other";
  h.flowchart = { flowcharts: [] };
  await flow.init("other", true);
  wait.resolve(["main-node"]);
  await old;
  assert.equal(flow.isUnlocked("main", "node"), false);
  assert.deepEqual(flow.getFlowcharts(), []);
});

test("flowchart persistence finishing after namespace switch cannot publish old unlocks", async () => {
  const flow = new runtime.FlowchartManager(h.WebGAL.sceneManager);
  await flow.init("fixture", true);
  const wait = deferred();
  const entered = deferred();
  const written = [];
  h.storage.setItem = async (key) => {
    written.push(key);
    entered.resolve();
    await wait.promise;
  };
  const save = flow.unlockCurrentScene();
  await entered.promise;
  h.WebGAL.gameKey = "other";
  await flow.init("other", true);
  wait.resolve();
  await save;
  assert.equal(flow.isUnlocked("main", "node"), false);
  assert.deepEqual(written, ["fixture-flowchart-main-node"]);
});

test("flowchart snapshot read finishing after namespace switch is discarded", async () => {
  const flow = new runtime.FlowchartManager(h.WebGAL.sceneManager);
  h.storage.getItem = async () => ["main-node"];
  await flow.init("fixture", true);
  const wait = deferred();
  h.storage.getItem = () => wait.promise;
  const load = flow.loadSnapshot("main", "node");
  h.WebGAL.gameKey = "other";
  h.storage.getItem = async () => [];
  await flow.init("other", true);
  wait.resolve(snapshot());
  assert.equal(await load, null);
});

test("flowchart initialization rejects a disable/re-enable ABA even when namespace is unchanged", async () => {
  const wait = deferred();
  const entered = deferred();
  h.storage.getItem = async () => {
    entered.resolve();
    return wait.promise;
  };
  const flow = new runtime.FlowchartManager(h.WebGAL.sceneManager);
  const pending = flow.init("fixture", true);
  await entered.promise;
  h.storageEnabled = false;
  h.storageEpoch++;
  h.storageEnabled = true;
  h.storageEpoch++;
  wait.resolve(["main-node"]);
  await pending;
  assert.equal(flow.isUnlocked("main", "node"), false);
  assert.deepEqual(flow.getFlowcharts(), []);
});

test("flowchart persistence cannot publish after storage disable/re-enable ABA", async () => {
  const flow = new runtime.FlowchartManager(h.WebGAL.sceneManager);
  await flow.init("fixture", true);
  const wait = deferred();
  const entered = deferred();
  const written = [];
  h.storage.setItem = async (key) => {
    written.push(key);
    entered.resolve();
    await wait.promise;
  };
  const pending = flow.unlockCurrentScene();
  await entered.promise;
  h.storageEnabled = false;
  h.storageEpoch++;
  h.storageEnabled = true;
  h.storageEpoch++;
  wait.resolve();
  await pending;
  assert.equal(flow.isUnlocked("main", "node"), false);
  assert.deepEqual(written, ["fixture-flowchart-main-node"]);
});
