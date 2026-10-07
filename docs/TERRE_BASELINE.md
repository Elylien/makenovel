# Terre 上游实测与改造边界

查阅与执行日期：2026-10-07（用户时区 Asia/Shanghai）。本记录属于 G0 的上游基线，不代表 G1 编辑器或 Windows 成品验收通过。

## 锁定来源

| 项目 | 实测值 |
| --- | --- |
| 官方仓库 | https://github.com/OpenWebGAL/WebGAL_Terre |
| 本地目录 | `vendor/WebGAL_Terre` |
| 提交 | `cf73dd58535d3ef15bddf0852adee153fa92d7da` |
| 根包与前后端版本 | `4.6.5` |
| 根 `LICENSE` | Mozilla Public License Version 2.0 |
| 环境 | Windows；PowerShell 7.6.5；Node 22.17.0；Corepack 提供 Yarn 1.22.22 |
| 根 `yarn.lock` SHA-256 | `1570D2015A5CFB488516FD9349A788F34433337C87CB34ED404CFE07B18F8E89` |
| 玩家壳 `packages/WebGAL-electron/yarn.lock` SHA-256 | `22E5AB373B8FB04AADDA61AAB7BFF4030156FEC4BD29B41A2B62096A6824C973` |
| 玩家壳锁定 Electron | `29.3.3`，electron-builder 配置 Windows `dir` 输出 |

上游根包管理四个 workspace：Origine React 前端、Terre Nest 后端、预览协议、开发代理。`WebGAL-electron` 玩家壳和 `terre-electron` 作者壳不属于根 workspace；根安装/构建成功不包含两者。Terre 后端锁定 npm `webgal-engine@4.6.5` 与 `webgal-parser@4.6.5`；根项目另外检出的 WebGAL Git 提交并不会自动替换 Terre 内嵌模板。

## 安装和运行证据

证据目录为 `docs/evidence/local/terre/`（本地忽略，不应将依赖缓存、日志中的本机路径或输入需求发布到 Git）。全部原生命令使用 PowerShell 7 并检查退出码。

```powershell
git clone --depth 1 https://github.com/OpenWebGAL/WebGAL_Terre.git vendor/WebGAL_Terre
# 在 vendor/WebGAL_Terre 运行
corepack.cmd yarn install --frozen-lockfile --network-timeout 300000
# 共享 Yarn 缓存解包失败后的隔离缓存重试
corepack.cmd yarn install --frozen-lockfile --non-interactive --network-timeout 120000 --network-concurrency 4 --cache-folder '../../docs/evidence/local/terre/yarn-cache'
corepack.cmd yarn workspace webgal-terre-2 build
corepack.cmd yarn workspace webgal-origine-2 build
corepack.cmd yarn workspace webgal-terre-2 test --runInBand
```

| 检查 | 状态 | 证据/限制 |
| --- | --- | --- |
| 官方仓库浅克隆 | 通过 | `clone.log`，退出码 0 |
| 第一次 frozen 安装 | 失败 | `install.log`；`@icon-park/react@1.4.2` 共享缓存解包 `EEXIST`；失败后仍等待网络的本任务进程经 PID/命令核验停止，未清除全局缓存 |
| 隔离缓存重试 | 通过 | `install-isolated-cache.log`、`install-isolated-result.json`；退出码 0，940.69 秒，根锁文件哈希未变；保留上游 peer dependency 警告 |
| 后端构建 | 通过 | `backend-build.log`、`backend-build-result.json`；退出码 0，31.55 秒；protocol 编译、锁定 npm 引擎模板复制、Nest 编译成功 |
| 前端构建 | 通过 | `frontend-build.log`、`frontend-build-result.json`；退出码 0，142.45 秒；Lingui、TypeScript、Vite 通过；8670 模块，保留 Sass 弃用、jimp eval、大 chunk 警告 |
| 后端上游测试 | 失败（部分通过） | `backend-tests.log`、`backend-tests-result.json`；退出码 1；9 个 suite 中 6 通过、3 加载失败；24 条实际执行的 test 全部通过；失败套件未执行，不计为通过 |
| 上游真实文本 helper/parser 探针 | 通过并确认三项限制 | `source-roundtrip-result.json`、`source-roundtrip-exit.json`，退出码 0；LF 邻接未知文本保留、CRLF 规范化、重复参数合并/注释 trim、未注册命令按说话人解析 |
| 图形/源码 UI、拖拽、关闭重开 | 未执行 | 此记录的源码检查不能替代 AT-01—AT-04 UI 操作 |
| Windows 导出与离线重启 | 未执行 | 需要另外构建 Electron 模板并真实验证 |

失败的三个 suite 是 `webgal-fs.service.spec.ts`、`manage-game.controller.spec.ts`、`manage-game.service.spec.ts`。一致错误是 Jest/ts-jest 的 CommonJS 运行上下文加载 `trash@10.1.1` 的 `index.js` 首行 ESM `import` 时抛出 `SyntaxError: Cannot use import statement outside a module`。源码入口是 `webgal-fs.service.ts:10` 的 `import trash from 'trash'`。这是可复现的上游测试装载兼容性问题，不是已验证的业务断言失败；不能将三个套件的业务行为视为通过。另有 ts-jest 对生成协议 `.js` 文件未启用 allowJs 的警告。下一轮应独立修复测试模块加载配置并重跑全部原断言，不以 mock 掉文件系统、删除断言或放宽检查代替修复。

实际构建产物是 `packages/terre2/dist/src/main.js` 与 `packages/origine2/dist/index.html`。后端 package 的 `start:prod` 却指向 `node dist/main`，入口与这次普通 build 输出不一致；下一轮启动适配需处理，不能直接把该脚本写成已通过。本轮没有启动 Terre 后端/作者 GUI，也没有创建或修改全局作者数据。构建前保存了 tracked locale 与模板 manifest 原件，但构建后 tracked 文件没有变化，因此无需还原。没有对上游源码或锁文件做修补。收尾 `git status --porcelain` 为空、`git diff --check` 通过，两份锁文件哈希均与初始相同，记录在 `final-verification.json`。

## 图形、源码和稳定身份

| 能力/风险 | 当前代码证据 | 判断与下一步 |
| --- | --- | --- |
| 语句范围与局部替换 | `packages/origine2/src/pages/editor/GraphicalEditor/GraphicalEditor.tsx` 的 `startLine/endLine`、`rewriteLines`、`updateSentenceByIndex`；`utils/sceneTextProcessor.ts` 的 `replaceLineRange` | 已具备按范围替换、多行语句、整块重排的基础，适合复用；传给后端仍是整份文本 |
| 注释和未知参数 | `packages/origine2/src/utils/combineSubmitString.ts` 使用原参数 Map 并传递 `inlineComment` | 编辑句保留未被控件覆盖的参数值，但重建句会改变参数顺序、折行、注释空白；重复键合并，不能声称字节级无损 |
| 未识别命令界面 | `GraphicalEditor/SentenceEditor/Unrecognized.tsx`、`SentenceEditor/index.tsx` 默认编辑器；安装的 `webgal-parser/src/scriptParser/commandParser.ts` | 实测 `futureCommand:raw` 被 parser 归为 say，speaker 为 futureCommand；fallback 面板不能识别这种拼写错误/未知命令。需在合法说话人和受注册命令边界上增加诊断，不能禁止 WebGAL 正常“人物:对白”语法 |
| 全文行尾 | `GraphicalEditor/utils/sceneTextProcessor.ts` 第 2、6 行 | `replaceAll('\r','').split('\n')` 再 `join('\n')`，图形编辑会将 CRLF 全文件规范化为 LF；需要修复 S-03 非破坏写回 |
| 稳定节点 ID | `GraphicalEditor.tsx` 的 `generateSentenceItem`、`fetchScene`；`utils/createId.ts` | UUID 作为内存虚拟列表/拖拽 key，同位置同文本才复用；重新打开生成新 ID，不满足 S-07/D-01/D-02 的作品持久身份 |
| 源码即时保存 | `pages/editor/TextEditor/TextEditor.tsx` 的 `submitChange` | 500ms debounce 后直接保存并发送预览；未见草稿有效性闸门、旧预览“未应用”状态，S-05 需新增 |
| 外部变更 | `TextEditor.tsx` 的 `updateEditData` 与焦点事件；`GraphicalEditor.tsx` 的 `fetchScene` | 焦点恢复会重读文件；这不等于带版本的冲突合并，存在覆盖风险 |
| 写入失败与事务 | `packages/terre2/src/Modules/manage-game/manage-game.dto.ts` 的 `EditTextFileDto`；`assets/assets.controller.ts` 的 `editTextFile`；`webgal-fs/webgal-fs.service.ts` 的 `updateTextFile` | DTO 仅 path/textFile，无 expected revision；后端直接 fs.writeFile，错误被 resolve 为字符串。需要 expected-hash、原子提交、结构化失败；前端 `.then` 不能代表可靠保存 |
| 中文输入 | `GraphicalEditor/SentenceEditor/Say.tsx` 的 composition start/end | 上游对白面板已考虑 IME debounce；仍需 AT-22 浏览器输入/游戏快捷键联合验证 |

优先路线是补强上游的文本写回、持久身份和预览边界；没有证据支持为此另造玩家执行器或存档系统。稳定 ID 不应直接复用目前的行 UUID，也不应只用文本匹配。

## 真实舞台预览与拖动

`packages/editor-preview-protocol/src/index.ts` 提供 V1 请求/响应、requestId、ready、stage snapshot、同步、基础变换和参考框查询。`origine2/src/utils/editorPreviewClient.ts` 包含断连拒绝请求、300ms 查询超时、基线重试与 scenePath/lineNumber 同步；`terre2/src/Modules/websocket/editorPreviewHost.ts` 负责协议路由和超时。这是可复用的真实协议，而非需要从零实现的 mock。

`pages/editor/TransformableBox/TransformableBox.tsx` 使用 react-moveable 支持拖动、缩放、旋转及预览坐标转换；`dragTransformResolver.ts`/`referenceBoxGeometry.ts` 提供稀疏变换和参考框计算。`SetTransform.tsx` 的效果编辑器通过 `onSubmit` 写回原生命令，预览操作使用 `EditorPreviewClient.setEffect`。`dragEndUtils.ts` 中旧的 `syncCommandToFile` 全部是注释，不应把它误认为当前持久化实现。

尚未验证：重复预览终态、依赖变量的中段恢复、预览与正式存档隔离、动画取消、舞台拖动后的源码与再次开启一致性。已有请求 ID 或 preview snapshot 不证明这些契约已满足。

## Windows 导出边界

`packages/terre2/src/Modules/manage-game/manage-game.service.ts:325` 的 `exportGame` 在 win32 路径复制 `assets/templates/WebGAL_Electron_Template`，再复制引擎和作品资源、移除 service worker、按需更新图标、生成 app.asar。玩家模板不随 Git 克隆存在，需要单独完成 `packages/WebGAL-electron` 的 frozen 安装和 electron-builder。

玩家 `main.js` 使用 `BrowserWindow.loadFile('./public/index.html')`，`contextIsolation: true`、`nodeIntegration: false`，方向上支持本地离线运行。启动依赖 `steamworks.js`；Steam 初始化/overlay 有错误捕获，但不能据此宣称无 Steam 环境已通过。尚需检查普通用户数据目录、中文空格路径、禁网启动、保存退出再读取及包内素材/依赖许可。

`release.sh` 和 `build-electron.sh` 使用 Bash 的 `rm/cp/mv` 并含下载/Android 克隆，不适合原样传给 PowerShell。本轮未运行它们。`terre2/update-webgal.ts` 会删除和复制模板中的四个引擎生成项；后端构建前应验证绝对目标都在该模板目录下。`prebuild` 删除的 `dist` 仅允许是本 checkout 的产物目录。

## 本机开发安全与数据隔离

根 `yarn dev` 会启动固定 80 端口的额外代理（`packages/dev-server/index.js`），Origine 的 dev 使用 `vite --host`，Terre `src/main.ts` 的 `app.listen(port+1)` 未限制 host 且 CORS 为 `*`。下一单元需要明确仅本机绑定和预览访问校验，不能将这些默认启动参数误称为安全的本机独占服务。

`UserDataService` 默认在 `os.homedir()/.webgal_terre` 写配置/作品，存在 data 目录时改用 portable 作品路径，但仍保存默认根的配置。本轮不启动会写全局作者数据的服务。后续基线启动应给该子进程独立 profile 目录或经审查的启动适配器，并确认所有作者写盘均在任务测试目录内。

## 下一可验证工作单元

1. 在独立小改动中修复 Jest 对 ESM trash 的加载兼容性，保留原业务断言，再执行全部后端测试。
2. 扩展实际 helper/parser 探针到稳定身份与重排；已确认的行尾、未知命令语义、参数重建限制保留为 G1 修复目标。
3. 接上游持久化链路验证 expected revision、稳定 ID、草稿闸门，再做真实 UI 往返，不能以独立库测试代替编辑器验收。
4. 单独构建玩家 Electron 模板并做 Windows 离线验收；这与作者编辑器 exe 包是两个不同交付物。

## 后续记录

以上是0.0.1原版基线。0.0.2已用根仓兼容层解决测试加载问题，并添加可重放的隔离启动/场景保存补丁，11套66项测试通过；GUI保存与冲突验证见 [第二轮证据](evidence/2026-10-07-round2.md)。原版失败日志仍保留，不把补丁结果倒写为原版通过。
