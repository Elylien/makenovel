# 测试入口与证据

更新：2026-10-09，MakeNovel `0.0.8`。实测环境：Windows 11 x64 / PowerShell 7.6.5 / Node 22.17.0 / Yarn 1.22.22。来源提交见 `upstream.lock.json`，硬件见 `PERFORMANCE.md`。

第八轮完成对白前四类素材命令新增、仅撤掉本次新增行与前文源码来源参考。本轮实际代码回归 **456/456**：作者侧 346、两个导演样片 6、运行时资源/恢复回归 104。runtime 源码与四份补丁未改变，本轮重新受控构建，但没有重新执行完整 339 项运行时套件。Terre 五补丁独立重放 18/18、HTTP 引擎 25/25、服务 22/22、源字节核验 16/16，以及浏览器作者闭环和 Windows 最终包正常退出重启恢复均有独立证据；重放、文件数与 GUI 步骤不加入代码总数。完整 G0/G1/G2、AT 与正式发行仍未整体验收，详见 [第八轮证据](evidence/2026-10-09-round8.md)。

历史摘要（第七轮）：增加原生导演局部会话、图形控件重同步、静态主图片加载失败保存门禁，以及导演与资源故障样片。最终代码回归 **646/646**：运行时 339、作者侧 304、导演样片 3；SVG 原生错误桥接后十三个运行时入口已完整重跑通过。受控构建、模板传播、HTTP 25/25、服务 22/22、两端独立重放各 18/18，以及有限导演与资源故障浏览器实测均有独立证据。Windows 最终包文件核对 21/21；全程停开发服务后，真实 EXE 的改稿呈现、资源失败拒存/旧槽保留、恢复保存及正常退出重启读档通过本机有限路径。第六轮 301 项、第四至六轮的有限现场验证和第四轮 259 项作者工具回归保留为历史证据；本轮作者入口已重新执行，按本轮数量另计。任何子项通过都不表示 G0、G1、G2 或完整 AT 整体验收通过。

## 安装、补丁与构建

首次克隆使用 `git clone --recurse-submodules`；已有 checkout 执行 `git submodule update --init --recursive`。恢复工作先核验 Git、submodule 和正在运行的进程。在项目根运行：

```powershell
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL_Terre -Action Install
pwsh -NoLogo -NoProfile -File scripts/Apply-Patches.ps1 -Check
pwsh -NoLogo -NoProfile -File scripts/Apply-Patches.ps1 -Apply
pwsh -NoLogo -NoProfile -File scripts/Apply-Patches.ps1 -Target WebGAL -Check
pwsh -NoLogo -NoProfile -File scripts/Apply-Patches.ps1 -Target WebGAL -Apply
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Install
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Build
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL_Terre -Action Build
```

补丁工具检查锁定 SHA、补丁摘要和已知补丁前缀；未知 tracked、untracked 或 staged 改动会拒绝，不会 reset/clean 用户修改。默认目标是 Terre，WebGAL 必须显式传 `-Target WebGAL`。`-Check` 成功只代表当前为合法 base 或补丁前缀，剩余补丁需执行 `-Apply`。第四轮 Terre 3/3、WebGAL 1/1 清单与独立重放为历史已核实结果；第五轮追加 runtime 补丁的准确状态读取当前清单与本轮报告，不沿用旧树的通过状态。规则和导出流程见 [TERRE_PATCHES.md](integrations/TERRE_PATCHES.md)。

已有运行中的编辑器须先用 `npm.cmd run editor:stop` 停止，再构建/同步模板。WebGAL Build 经 `scripts/Sync-Runtime.ps1 -Action Build` 核验补丁与锁定来源，构建后记录源码和非 game 产物 hash 至 `.local/runtime-sync/runtime-build.json`。Terre Build 先检查凭据，串行构建前后端，最后同步已核验的 runtime；缺失、源码过期或产物改动的凭据均拒绝同步。

同步保留模板的 game 内容和非管理文件，不遍历或改写作者作品。没有自带 index.html 的普通作品运行/导出时使用共享模板，因此模板更新也影响这些旧作品的实际引擎；自带入口或衍生引擎作品保留其引擎。更新模板前停止服务，脚本不自动终止用户进程。

不要并发运行 Terre 两个 workspace build。若直接运行上游 workspace build，其后端会刷新 npm 引擎模板；完成后必须在根目录运行 `pwsh -NoLogo -NoProfile -File scripts/Sync-Runtime.ps1 -Action Sync` 才恢复已核验 runtime。仅核查凭据用 `-Action Check`，源码/产物已改变时先重新 `npm.cmd run baseline:build`。

依赖锁定 parser 产物的清单、封存、样片及相关回归也必须与 runtime 重建串行。构建会删除并重建 `packages/parser/build`；第七轮曾在并行执行时得到真实的 `PARSER_UNAVAILABLE`，不能把这种时序失败当成已通过或靠重复并行消除。

完整同步来源、目录备份和失败边界见 [RUNTIME_PATCHES.md](integrations/RUNTIME_PATCHES.md)。

## 自动化回归

在项目根运行，各原生命令应检查退出码，失败时停止依赖步骤：

```powershell
node integrations/terre-tests/run.cjs --no-cache
node integrations/scene-document-tests/run-tests.mjs
node integrations/scene-document-tests/run-message-tests.mjs
npm.cmd run test:source-input
npm.cmd run test:graph-input
npm.cmd run test:director
npm.cmd run test:director-insertion-demo
npm.cmd run test:identity
npm.cmd run test:manifest
npm.cmd run test:save-backup
npm.cmd run test:save-compatibility
npm.cmd run test:save-storage
npm.cmd run test:save-initialization
npm.cmd run test:runtime-restore
npm.cmd run test:save-ui
npm.cmd run test:menu-lifecycle
npm.cmd run test:perform-lifecycle
npm.cmd run test:audio-lifecycle
npm.cmd run test:stage-exit
npm.cmd run test:resource-lifecycle
npm.cmd run test:stage-demo
node --test integrations/director-demo/director-demo.test.mjs
pwsh -NoLogo -NoProfile -File integrations/patch-tests/Test-PatchReplay.ps1
npm.cmd test
```

后端兼容入口执行全部原断言与新增 spec，转换真实 ESM 依赖，不 mock 掉文件系统或业务模块，不升级锁文件。前提是 Terre 依赖已安装、共享协议已构建。`Invoke-Upstream.ps1 -Target WebGAL_Terre -Action Test` 仍是原版入口，保留用于复现 CJS/ESM 加载失败；当前回归使用 `run.cjs`。详见 [测试适配](../integrations/terre-tests/README.md)。

机器可读报告：

```powershell
$resultPath = Join-Path (Get-Location).Path 'docs/evidence/local/round8/terre-backend-all.json'
node integrations/terre-tests/run.cjs --no-cache --json --outputFile $resultPath
if ($LASTEXITCODE -ne 0) { throw 'Terre tests failed' }
```

场景机制测试打包真实前端模块后使用 Node test runner；消息/源码输入测试对 React、网络和 Monaco 边界使用测试替身，检查实际注册的回调、组合输入隔离及 iframe 脚本。`test:graph-input` 由 `integrations/scene-document-tests/run-graph-input-tests.mjs` 加载生产 TSX 事件处理逻辑，以边界替身验证图形控件输入。它们不能替代浏览器渲染、Windows 真实 IME 候选输入或实际预览验收。补丁夹具在 `.scratch/` 新 clone 测试，不修改开发 vendor；夹具通过也不能替代最终产品补丁的独立重放。

## 启动与真实服务检查

应用补丁并构建后，在项目根运行：

```powershell
pwsh -NoLogo -NoProfile -File scripts/Start-Editor.ps1 -Background
node integrations/terre-launcher/verify-editor.mjs
pwsh -NoLogo -NoProfile -File scripts/Start-Editor.ps1 -Stop
```

默认编辑器为 `http://127.0.0.1:3001`，`-Port 3011` 可选择空闲端口。作者数据置于 `.local/editor-profile/`，进程状态和日志置于 `.local/editor-runtime/`；不使用既有全局作者目录，也不运行上游开放 host/80 代理入口。停止命令核对 PID、启动时间、进程名和入口。当前进程状态以现场为准，不依赖旧 PID。

HTTP API 与两个 WebSocket gateway 使用同一个 loopback listener，并核验准确的 Host、Origin/Referer 与 Fetch Metadata。命令行 API 请求需带 `Origin: http://127.0.0.1:3001`；PowerShell 请求同时用 `-NoProxy`。这些限制防止其他网页从浏览器驱动本机接口，不认证可自行构造请求头的本地进程，也不隔离可信本地代码。详见 [启动器说明](../integrations/terre-launcher/README.md)。

## 第八轮 0.0.8 当前代码回归与验收状态

本轮串行记录在 `docs/evidence/local/round8/checks-summary.json`，12 个入口全部退出 0，**456/456** 通过。下表只累计本轮重新执行的代码回归；不把第七轮完整 339 项运行时结果、独立补丁重放、服务断言、文件核对或现场操作重复加入总数。

| 入口 / 检查 | 本轮结果 | 执行范围与边界 |
| --- | --- | --- |
| 根源码实验 / documents 与 vault / messages | 19 / 66 / 3 项通过 | 保留的源码实验、真实共享文档与恢复副本模块、消息边界 |
| `test:source-input` / `test:identity` / 后端 | 12 / 28 / 124 项通过 | 输入与身份模块、真实 parser、后端原断言及事务回归；不将合成事件视为 Windows IME 验收 |
| `test:director` | **51 项通过** | 新增四类完整命令、撤掉本会话新行、未改行/身份/legacy 标记与 BOM/混合行尾保留、原生语义守卫、来源边界及整步撤销 |
| `test:graph-input` | **43 项通过** | 含新增待选材拦截、取消/撤行迟到回调、长路径的原生折行、控制字符拒绝、明确关闭后重选及旧控件缓冲隔离；真实生产 TSX 回调，React/Fluent/DOM 边界为替身 |
| 作者侧小计 | **346 项通过** | 19 + 66 + 3 + 12 + 28 + 124 + 51 + 43 |
| 第七轮导演样片 / `test:director-insertion-demo` | 3 / 3 项通过 | 两个独立生成器均使用真实 parser、assetSetter、manifest 与临时文件；第八轮覆盖空局部新增目标和标签/不透明参数边界 |
| 两个样片小计 | **6 项通过** | 保留旧样片回归与新增样片分别计数 |
| `test:resource-lifecycle` / `test:runtime-restore` | 38 / 66 项通过 | 本轮重新执行静态主图/SVG 与恢复门禁回归，共 104 项；runtime 源码未改，未重新跑完整十三入口 339 项 |
| 代码总计 | **456 项通过** | 346 + 6 + 104；无失败或跳过 |
| 受控 runtime / Terre 构建 | 通过 | runtime Yarn 130.48 s / Vite 56.05 s；Terre 前端外层 248.22 s（内层 247.55 s）、后端外层 27.00 s（内层 26.52 s）；来源为本轮两份 build 日志 |
| 共享模板 / HTTP / 服务 | 25 文件同步、25/25、22/22 | runtime 文件签名保持 `aa10038a666fcea893a5501f09723d2427aabee4b433bd0122060e0ea7264e93`；模板 game 保留，真实 round8 HTTP 逐文件摘要匹配，服务与 WebSocket 来源检查通过 |
| Terre 最终五补丁独立重放 | **18/18 通过** | 独立对象 clone，无 alternates/hardlinks；0/5→5/5、幂等、临时 index 逆序恢复 base、开发树和两个真实 index 不变；源码重放不替代构建或 GUI |
| 浏览器导演新增闭环 | 有限真实 GUI 通过 | 四类新增、待选材阻止应用、撤掉新行、关闭后重选、取消不改稿；四条新增及对白修改整批应用，一次撤销/重做，保存刷新重开 |
| 浏览器来源与原生预览 | 有限真实 GUI 通过 | R8-03 重开后显示来源；标签前来源保持未知，不透明参数构成边界；原生执行到修改后的第 13 行，显示夜景、左侧 smile、右侧 neutral 与改稿对白 |
| 源码字节与原清单拒绝 | **16/16 通过** | 原 17 行增为 21 行；只加 4 行和修改 1 条目标对白，其余 16 条原行连同行尾字节不变；BOM/CRLF/作者注释与独立 readonly 场景保留；仅 5 个实际变动节点获得唯一 ID；旧 manifest 拒绝改稿且检查不写文件 |
| 重新封存 / 最终导出核对 | verify 通过；game **20/20** | 最终 manifest `20254c8bac4269ad92b142ec596b2174738121d4b1b7cb9361c3fffe30342e30`，19 个登记文件加清单；导出读取 23 个源文件，最终包标识 `20261009-002045-13935b` |
| Windows 最终 EXE 保存与重启恢复 | 本机有限真实 GUI 通过 | 停 3000/3001 后从日景推进到新增夜景和 R8-03，快存及普通槽 1（2026/10/9 00:25:28）成功；正常退出精确进程归零后重启同包，读槽 1 恢复夜景/左 smile/右 neutral/R8-03；推进到选择后快速读档同样恢复 |
| 收尾进程 | 测试 EXE 正常关闭；编辑器恢复 | `windows-final-exit.json` 记录精确包路径 0 进程、3000/3001 为 0 listener；随后编辑器恢复 PID 28592、UTC `2026-10-08T16:27:56.8502082Z`，入口仅 loopback 3001。恢复时重新核验，不使用陈旧 PID 操作 |
| 全机断网 / 干净机器 / 真实 IME / 全设备与正式发行 | 未执行或未整体验收 | 停本项目服务、合成输入、正常退出重启与有限视口不授予物理断网、全输入法、设备/编解码器矩阵、强杀/断电或签名发行通过 |

本轮 Terre 新增 `0005-director-insertion-source-context.patch`，SHA-256 为 `ea937296a3d21d9d0d9a1a1c495b06a4276a83c36bfe792963877f7306415d22`；五补丁完整 tree 为 `40dc0cb9472a10018d43e16eb462dc2d5e4ba79e`，与独立 clone 和开发工作树一致。重放入口：

```powershell
pwsh -NoLogo -NoProfile -File integrations/patch-tests/Test-RuntimePatchReplay.ps1 -Target WebGAL_Terre -ExpectedPatchCount 5 -EvidencePath docs/evidence/local/round8/terre-independent-replay.json
npm.cmd run test:director-insertion-demo
npm.cmd run demo:director-insertion -- --output .local/editor-profile/games/<新的独立目录>
```

生成目录必须不存在；实际第八轮作品为 `.local/editor-profile/games/makenovel-round8`，不要重新生成覆盖。生成收据保留最初 manifest `f831fb86…cdddb6f`；GUI 改稿完成后显式重新封存，使用上表最终清单。改稿后 start SHA-256 为 `a03313a62dd56899131036a81a4786ad9ea1cf0ebddc1c1de313fcfbe81db867`。源码检查 16 项只证明该次实际变更，不扩展到任意语法或插件。

第八轮新增卡仅允许静态图片与音频，完整素材选择前不产生占位行；已有语句不能通过“撤掉本次新增”删除。只读来源展示最近可确认的源码行，不证明舞台或声音的实时状态。遇到标签、变量、条件、未知参数和高级源码即停止向更早前文查找；没有来源、明确关闭与未知分别处理。差分与音效不推断执行终态，不跨场景或分支还原舞台，来源跳转仍未实现。

审查期间修复三条实际可复现边界：长合法素材名经原生 serializer 折行导致新增被拒；新卡明确关闭后原控件隐藏选材入口；原始路径中的回车被原生预处理剥除而接受另一个文件名。最终处理在序列化前拒绝路径控制字符/BOM，仅接受原生续行占位的单条提案，并为关闭或错误的新卡提供重选入口；重选后退休旧表单回调。43 项图形回归包含这些路径，实际 none→重选另由浏览器操作验证。

实际 HTTP 与服务日志分别为 `final-http.json`、`service-check.log`；封存与导出为 `final-seal.log`、`final-manifest-verify.json`、`windows-export.log`。最终包 ASAR SHA-256 为 `b6355ea63769921c5b536a664c174e310853d8098574085474c7d965a3a6e2a2`，必须保留完整导出目录。构建模板备份为 `.local/runtime-sync/20261008-161233-d2a6ede840a245b9b673cff3d2cb819a/previous-template`。完整现场步骤及截图索引见 [第八轮证据](evidence/2026-10-09-round8.md)。

## 第七轮 0.0.7 历史代码回归与验收状态

本轮最终代码回归 **646/646**（运行时 339 + 作者 304 + 导演样片 3），上述入口均退出 0、无失败。SVG 桥接后十三个运行时入口已完整串行重跑；此前 329/329 仅保留为修复前记录。历史测试、重放断言、构建文件数和 GUI 步骤不加入代码总数。原始本机日志位于忽略目录 `docs/evidence/local/round7/`；最终运行时汇总为 `runtime-suites-summary.json`。作者串行七入口 `author-tests-summary.json` 记录 274 项，另加 `graph-input.log` 最终 30 项，得到作者侧 304 项。

| 入口 / 检查 | 本轮代码结果 | 执行范围与边界 |
| --- | --- | --- |
| `test:manifest` / `test:save-backup` / `test:save-compatibility` | 33 / 35 / 34 项通过 | 实际文件与封存、完整备份、精确版本协议；网络及持久化边界使用各套件原有夹具 |
| `test:save-storage` / `test:save-initialization` | 35 / 16 项通过 | 原生存储、初始化及启动接线；不代表真实配额或断电验收 |
| `test:runtime-restore` / `test:save-ui` | 66 / 12 项通过 | 原生恢复、稳定存档拒绝边界及 UI 回调；保留第六轮套件数量 |
| `test:menu-lifecycle` / `test:perform-lifecycle` / `test:audio-lifecycle` / `test:stage-exit` | 15 / 18 / 23 / 9 项通过 | 菜单推进、演出实例、音频回调和退出对象回归；渲染、时钟或媒体边界仍为替身 |
| `test:resource-lifecycle` | **38 项通过** | 原 28 项真实 PixiController/舞台/存档回归，加 10 项真实 Pixi SVGResource/BaseTexture/Texture 与生产 asset parser 测试。覆盖 SVG onError 拒绝、监听释放、原错误、并发隔离、非 SVG、真实缓存同 URL 重试。首批 28 项旧源码红测 6 通过 / 22 失败；最终同 38 项在桥接前为 31 通过 / 7 失败，修后 38/38 |
| `test:stage-demo` | 5 项通过 | 第六轮原创样片生成器本轮重新验证；不重复计入作者侧 |
| 运行时十三入口小计 | **339 项通过** | 原十二入口 301 项，加资源门禁与 SVG parser 38 项；最终 SVG 修复后十三入口完整串行重跑，均退出 0 |
| 后端 / documents 与 vault / messages | 124 / 66 / 3 项通过 | 后端 14 套 Jest；共享文档、历史和草稿副本；消息边界。66 包含文档与 vault，不再额外叠加历史 56/10 |
| `test:source-input` / `test:identity` / 根源码实验 | 12 / 28 / 19 项通过 | 实际生产输入/身份模块与真实 parser，以及保留的根源码实验；不将实验称为新增产品能力 |
| `test:graph-input` | **30 项通过** | 原 7 项加本轮 23 项：导演表单提交、错误保留、组合输入、预览 owner、过期拒绝、批量后控件刷新及三个舞台图片选择器的 SVG 支持。含真实 Say/Bgm/ChangeBg/ChangeFigure/ChangeFigureDiff 控件回调；React/Fluent/DOM 边界替身，不代替浏览器或真实 IME |
| `test:director` | **22 项通过** | 真实锁定 parser、保守局部写回和 SceneDocument；固定分组边界、按需身份、取消/no-op、BOM/CRLF/注释/未知外段保留、完整源码与历史拒绝过期写入、一次共享撤销和保存前隔离 |
| 作者入口小计 | **304 项通过** | 124 + 66 + 3 + 12 + 28 + 19 + 30 + 22；七入口串行日志为 `author-*.log`，图形入口单独记录 |
| 导演与故障样片生成器 | **3 项通过** | `director-demo-tests.log`；真实 parser、assetSetter、封存工具与临时文件，验证参数/跳转、媒体路径、BOM/CRLF/注释、收据、隔离身份和拒绝覆盖 |
| 代码总计 | **646 项通过** | 339 + 304 + 3；只计本轮实际执行的代码回归 |
| 最终构建 / 模板 / 服务 / 产品补丁重放 | 构建通过；HTTP 25/25、服务 22/22、两端各 18/18 | 最终 runtime Yarn 47.76 s / Vite 22.17 s，Terre 前后端已完整重建；25 个最终引擎文件同步且 template game 保留，两端独立重放匹配最终 SHA/tree |
| 浏览器导演编辑 / 源码字节 | 有限实际 GUI 通过；字节核验 16/16 | 实际多参数应用、取消、一次撤销/重做、保存重开及预览隔离通过；五个修改节点独立 ID，BOM/CRLF、八条注释和未触及行原字节保留，见第七轮证据 |
| 实际资源失败保存 | 最终浏览器有限实测通过 | 坏 SVG 明确进入 failed，普通/快存均拒绝；旧普通槽 1 时间 21:32:44 保持，快读回到 R7-BASE。正常 day 图恢复后快存与普通槽 3 保存成功，时间 21:50:38 |
| 最终作品 / Windows 新包文件 | manifest verify 通过；包文件 21/21 | 最终作品 manifest `e12992a7…a2142`；最终包 `20261008-214756-a0409b` 与源 game 字节一致，来源见第七轮证据 |
| Windows 最终 EXE：故障拒存 / 恢复 / 重启读档 | 本机有限实际 GUI 通过 | 全程 3000/3001 停服务；改稿夜景/笑脸/对白正确。BASE 快存及普通槽 1（21:57:55）保留于坏 SVG 普通/快存拒绝之后，快读回 BASE；RECOVER 日景恢复快存与普通槽 2（22:01:38），正常退出后重启同包读槽 2 恢复日景与两角色 |
| 收尾进程 | 最终包已正常关闭；编辑器恢复 | 精确测试 EXE 进程 0；编辑器 PID 15436、启动 UTC `2026-10-08T14:05:18.8871126Z`，仅 `127.0.0.1:3001`。恢复先核验 PID/入口/时间；提交与远程以 Git 现场核对为准 |
| Windows 真实 IME / 声音与完整离线 | 未由本轮授予验收 | 停本项目服务不等于全机断网或干净机器；普通退出重启不证明强杀/断电、完整多槽矩阵、输入法与听觉质量 |

导演面板只聚合当前简单对白前相邻的 `changeBg`、`changeFigure`、`changeFigureDiff`、`bgm`、`playEffect`；等待和独立注释只读，其他命令、条件、未知参数与多行是边界。不新增/删除/重排命令，不推算分支继承。局部未应用输入不会写共享文档或进入预览；一次应用产生一个共享撤销步，并使旧图形控件缓冲失效。面板关闭释放自己的预览 hold；未应用缓冲参与页面关闭提示，但没有独立的跨关闭恢复承诺。沿用现有 BOM 首行命令边界，样片首行采用 BOM 加注释。

实际 GUI 发现原生选择器过滤 SVG 后，仅背景、立绘、差分三个舞台选择器改用 `stageImageExtensions`。新增一项实际控件回归，确认三者允许 `.svg`、保留 `.png` 且拒绝音频；仅背景继续允许视频，仅立绘继续允许 JSON 模型，BGM 选择器仍允许音频且不接受 SVG。该项使图形套件从 28 增至 29；随后补取消/成功应用在关闭前同步释放预览 hold，父回调立即观察释放且重复清理幂等，最终 30 项；未修改通用资源分类来扩大其他选择器范围。

静态主图片尚未完成或明确失败时，普通/快速保存均拒绝覆盖旧槽；加载与剧情时钟仍独立，没有资源等待事务、自动排队存档或最近稳定检查点回退。实际坏 SVG 暴露锁定 Pixi 的 `SVGResource.load()` 只发 `onError` 而不拒绝 Promise；最终 parser 仅对实际 SVGResource 在 load 前订阅 BaseTexture error，事件、Promise 或同步异常首次结算后移除本次监听，保持原错误对象并沿原路径销毁失败纹理。真实 Texture.from 缓存测试验证同 URL 失败后重新创建资源；非 SVG 沿用原加载路径。锁定 Assets Loader 外层仍按上游行为包装错误。

10 项新增测试使用真实锁定 Pixi SVGResource/BaseTexture/Texture 和生产 parser，Image/canvas 及 Assets 注册边界受控；没有声称真实浏览器 GPU 验收。最终红测 `resource-svg-before-final-tests.log` 为 31 通过 / 7 失败（早期 `resource-svg-before.log` 37 项为 31/6），修后 `resource-svg-after.log` 为 38/38。仍无资源超时策略；SVG onload 内零尺寸或 drawImage 异步抛错、永久不触发回调的资源、GIF、视频、Live2D、Spine、音频及 GPU 上下文丢失不在本单元验收内。说明见 [导演会话测试](../integrations/director-session-tests/README.md)、[资源生命周期测试](../integrations/resource-lifecycle-tests/README.md) 和 [导演样片](../integrations/director-demo/README.md)。

本轮保留的失败诊断：`manifest-build-race.log` 记录清单测试与 runtime build 并行时 parser 的 `build/cjs/index.cjs` 被重建流程暂时移除，CLI 报 `PARSER_UNAVAILABLE`，当次 32 通过 / 1 失败。停止并行重建后串行重跑，`manifest.log` 为 33/33，当时十三运行时入口为 329/329；该记录早于最终 SVG 桥接；最终构建完成后已再次串行重跑十三入口 339/339。没有删除断言或放宽预期。后续应先完成构建，再运行依赖该 parser 产物的回归。

独立生成样片时使用新的、尚不存在的目录，不覆盖既有作品：

```powershell
npm.cmd run demo:director -- --output .local/editor-profile/games/makenovel-round7
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round7
```

样片包含刻意不可解码但已登记清单的 `broken.svg`，用于把图片解码失败与清单完整性失败分开验证。生成器通过只证明起点文件正确；编辑后必须重新封存，原生成收据不能充当改稿后的凭据。本轮改稿已显式重新封存并 verify 通过，最终 manifest 为 `e12992a7ff9576e43278d60fa7c45e80cf3a7facec5301914d612a8b173a2142`。最终 runtime 引擎签名为 `aa10038a666fcea893a5501f09723d2427aabee4b433bd0122060e0ea7264e93`，构建、独立重放、GUI 与包核对见 [第七轮证据](evidence/2026-10-08-round7.md)。

## 第六轮 0.0.6 历史代码回归与验收状态

第六轮执行十二个代码入口，共 **301/301**：七个既有存档入口为 231 项，五个新增入口为 70 项。相对第五轮同组 220 项净增 81 项，不能把第四轮作者工具 259 项再加入该轮总数。原始本机日志位于忽略目录 `docs/evidence/local/round6/`。

| 入口 / 检查 | 当前结果 | 执行范围与边界 |
| --- | --- | --- |
| `test:manifest` / `test:save-backup` / `test:save-compatibility` | 33 / 35 / 34 项通过 | 作品文件、完整备份与精确版本协议；各自边界沿用下方第五轮说明，不等于媒体或 IndexedDB 实机验收 |
| `test:save-storage` / `test:save-initialization` | 35 / 16 项通过 | 实际生产存储、备份初始化与启动接线；外部存储/网络/渲染仍使用边界替身 |
| `test:runtime-restore` / `test:save-ui` | 66 / 12 项通过 | 原生恢复及存档 UI；恢复套件比第五轮新增 11 项，含未结束演出、退出对象和待恢复剧情推进的存档拒绝边界 |
| 七个既有入口小计 | **231 项通过** | 33 + 35 + 34 + 35 + 16 + 66 + 12 |
| `test:menu-lifecycle` | 15 项通过 | 真实 nextSentence 的遮挡层门禁、延迟继续、重复通知、手动点击及会话失效；Redux/执行器边界可控，不证明 GUI 视觉 |
| `test:perform-lifecycle` | 18 项通过 | 真实 PerformController、StageStateManager 和背景/立绘 handler；继续合并、卸载重入、启动/重置取消、迟到回调、并行演出精确身份及独立入退场时间；不证明 GPU 帧 |
| `test:audio-lifecycle` | 23 项通过 | 真实语音/SE/AudioContainer：取消期间异步恢复、旧回调、DOM/source 复用、拒播释放、淡出与换曲、UI 声清理。媒体、AudioContext、时钟和 React 生命周期是替身；不代表真实播放/听感 |
| `test:stage-exit` | 9 项通过 | 真实退出生命周期、syncPixiStageState 与 stopAllPerform 接线；定时结束、取消、对象身份、同毫秒退出、背景/角色退出和快速结束。原接线红测为 3/9，修后 9/9 |
| `test:stage-demo` | 5 项通过 | 生成器使用真实锁定 parser、运行时 assetSetter 和临时文件；原创资源/WAV、脚本路径参数、身份隔离、封存与拒绝覆盖，不替代样片播放验收 |
| 五个新增入口小计 | **70 项通过** | 15 + 18 + 23 + 9 + 5；十二入口合计 **301 项** |
| runtime 受控生产构建 | 通过：Yarn 61.56 s，Vite 33.01 s | 25 个非 game 引擎文件；构建签名 `1d2cd946ce91a2fb816e771812ea51269931c94576c58c66b3c0e0e40eb1381b`。源码再改变会使旧凭据失效 |
| Terre / 模板传播与真实服务 | 通过：HTTP 25/25 文件、服务 22 项 | Terre 源码未改，沿用已构建的后端；本轮完成 runtime 同步与实际 HTTP 核对，不能写成完整 editor:build 本轮重跑 |
| runtime 最终补丁独立重放 | 18 项通过 | 最终冻结源码的独立重放；不将重放检查数加入 301 项代码测试 |
| 浏览器双角色 / 差分 / 运动 / 背景 | 通过有限实际 GUI | 同台双角色、表情差分、运动；夜景转黑场后清立绘并停止 BGM。只证明这份样片的实际路径，不覆盖所有 GPU/素材 |
| 浏览器菜单等待 / 存档拒绝 | 通过实际 GUI | 菜单内 8 秒 wait 结束后仍停在 R6-06，尝试保存被拒；返回剧情仅继续到 R6-07，未重复跳句 |
| 浏览器稳定槽恢复 | 通过有限实际 GUI | 演出完成后的槽可保存，读回后恢复样片姿态；未宣称动画中途检查点恢复 |
| 浏览器 A/B 分支 / 快进 | 通过实际 GUI | A/B 路线分别显示 1/2；快进到选择后等待人工选择。快进按钮仍保持已开启状态，没有自动关闭 |
| 浏览器媒体状态 | 通过可观察播放状态 | voice a/b 的 `readyState=4`、播放状态与约 3.2 s 时长已观察，BGM 时间推进；没有听觉或声音审美验证 |
| Windows 第六轮开发包 | 通过：19/19 作品文件一致 | 最终 `195608-cc6624` 包的作品文件核对；独立运行与重启恢复另以下行实际操作为证据 |
| Windows 停服务后的保存 / 退出 / 重启读档 | 通过本机一槽 / 分支恢复 | 关闭 3000/3001 后启动最终包，自动播放至稳定选择，槽 1 在 20:11:32 保存成功；Alt+F4 正常退出后核对该精确包 0 进程及 0 开发端口。重启同包、标题读取槽 1，角色及两个选项恢复；选择右线后 R6-10 显示路线 2 |
| Windows / 媒体剩余范围 | 未验收 | 上述只覆盖本机正常退出、一槽和分支恢复；未验证全机断网、干净机器、崩溃/断电、完整窗口/输入法矩阵及听觉质量 |

音频红绿证据分别为 `local/round6/audio-red.log`（首 13 项 4 绿 / 9 红）、`audio-container-red.log`（22 项中 17 绿 / 5 红，含真实 unhandled rejection）、`audio.log`（最终 23/23）。套件说明见 [菜单生命周期](../integrations/menu-lifecycle-tests/README.md)、[演出生命周期](../integrations/perform-lifecycle-tests/README.md)、[音频生命周期](../integrations/audio-lifecycle-tests/README.md) 与 [样片生成器](../integrations/stage-demo/README.md)。

本轮 Windows 原始证据位于 `docs/evidence/local/round6/`：`windows-choice.png`、`windows-save-slot.png`、`windows-restored-choice.png`、`windows-route-b.png` 与 `windows-normal-exit.json`。关闭本项目服务不等于全机断网，正常退出的成功不证明异常终止耐久性。

菜单、历史、流程图和全局遮挡层打开时，原生音画继续计时；自然结束触发的剧情推进先记住，最后一层关闭后只继续一次。用户点击不会在遮挡下消费剧情；读档/回标题/会话改变会使旧继续失效。普通/快速保存拒绝未结束的非 hold 视觉演出或 wait、待清理退出对象，以及菜单中尚未恢复的剧情继续；失败不覆盖已有槽。当前没有自动回退到稳定检查点或排队保存。

已知保留边界：失败读档也会推进会话 epoch，先前菜单中的自动继续因而取消，关闭菜单后可能需要手动继续；清理函数或动画终态抛错可能中断剩余退出对象的清理。语音仍保留原生 1 ms 等待 React 音频 DOM 的时序，没有元素就绪握手。样片 voice 通道是代码生成测试音，不是真人配音；浏览器媒体状态检查不等于真实听感、完整激活/编解码器矩阵或 Windows 音频验收，详见 [KNOWN_ISSUES.md](KNOWN_ISSUES.md)。

## 第五轮 0.0.5 历史代码回归与验收状态

下表记录本轮最终代码检查及对应的有限现场验证。原始日志、构建与包核对、截图和操作步骤统一记在 [第五轮证据](evidence/2026-10-08-round5.md)；不把历史轮次测试数直接相加为“本轮全仓通过”。

| 入口 / 套件 | 本轮最终记录 | 执行范围与边界 |
| --- | --- | --- |
| `test:manifest` | 33 项 | `integrations/game-manifest/manifest.test.mjs`；真实临时文件、锁定原生 parser、清单字节/身份/增删、路径和备份写入边界。只封存作者作品，不读写玩家数据 |
| `test:save-backup` | 35 项 | 生产 saveBackup：全部相关持久化键、同项目旧版本、原始值/损坏值保留、摘要/跨键拒绝、配额/读回/并发变化。包括从原 Game_key 严格派生的隔离设置根键；localforage 使用可控替身 |
| `test:save-compatibility` | 34 项 | 生产兼容模块 + 作者工具实际封存夹具、WebCrypto、HTTP fetch/Response 边界；精确清单/文件、原生舞台结构、父子场景/历史、预览锁定与已核验启动字节。不是完整浏览器或执行器验收 |
| `test:save-storage` | 35 项 | 生产用户/槽/快档存储的 27 项顺序、失败、过时读取、namespace/epoch 检查；另 8 项执行 bgm/changeBg/unlockBgm/unlockCg 原生 handler、userDataReducer 与 storageController，验证禁写仍保留内存解锁及启用后仅写版本空间 |
| `test:save-initialization` | 16 项 | 生产 infoFetcher/backup/storage 接线 9 项，加 initializeScript/templateLoader/useConfigData 启动与 hook 7 项；备份读回前不开门、失败仍释放渲染、verified config 替换旧响应、等待动画/模板、缓存零重复请求、hook 不重写版本空间。React/DB/渲染等边界为替身 |
| `test:runtime-restore` | 55 项 | 生产 SceneManager、原生快照/保存/普通和快速恢复、历史/流程图、call/return、perform、标题/开始/作者预览接线，使用实际 parser 预检。含原 Game_key 预览注册与玩家 namespace 分离、字体优化初始化豁免及已读覆盖仍禁存；网络/存储/渲染失败由替身控制 |
| `test:save-ui` | 12 项 | 生产 Save/Load/BottomControlPanel 的事件处理：等待成功才播放成功反馈/写设置、坏缩略预览可渲染、异步拒绝已处理。React/JSX/服务边界替身，不证明浏览器焦点、布局、实际声音或可访问性 |
| 上述七入口小计 | **220 项** | 33 + 35 + 34 + 35 + 16 + 55 + 12；不含既有作者编辑器回归，也不计构建、文件数、GUI步骤或补丁重放项 |
| 最终补丁、受控构建与模板传播 | 单独验收 | 读取本轮最终日志/凭据；源码继续变化时旧构建凭据失效。不能用第四轮单补丁树证明第五轮存档接入已构建或传播 |
| 浏览器普通槽 / call-return | 通过有限实际 GUI | 子场景 `letter=7`，返回父场景显示 `42/1`；读回子场景槽后继续返回，仍为 `42/1`，没有重复累计 |
| 浏览器快档 | 通过有限实际 GUI | 从父场景读取快档回到子场景第二句；沿原生执行器恢复 |
| 浏览器版本变化拒绝 | 通过实际负例与恢复 | 改动父场景 start 原字节后读槽报告内容变化，原先子场景第二句保持；恢复该文件原字节后继续返回 `42/1` |
| 系统完整备份下载 / 校验 | 通过真实文件操作 | 下载文件包含 8 records / 2 preserved；选择该文件后仅本地校验成功，没有执行覆盖式导入 |
| Windows 最终开发包核对 | 通过：40/40 文件一致 | 本轮新包独立核对；不沿用第三轮旧包的 37/37 结果 |
| Windows 新包普通退出重启 | 通过一槽实际 GUI | 停止 3000/3001 后启动最终 EXE；子场景存槽 2、Alt+F4 后进程退出，重启同包读槽恢复 `letter=7`→子场景第二句→父场景 `42/1` |
| 全机断网 / 干净机 / 异常退出 / 声音 | 未验收 | 停止本项目服务不等于全机断网；正常退出不证明异常终止或断电耐久性。声音、完整窗口/输入法矩阵及正式发行仍独立验收 |

套件细节见 [作品封存](../integrations/game-manifest/README.md)、[备份](../integrations/save-backup-tests/README.md)、[兼容门禁](../integrations/save-compatibility-tests/README.md)、[存储](../integrations/save-storage-tests/README.md)、[初始化](../integrations/save-initialization-tests/README.md) 和 [原生恢复/UI](../integrations/runtime-restore-tests/README.md)。根目录 `.scratch/round5-save-backup.log`、`round5-save-storage.log`、`round5-save-initialization.log` 保存相应运行输出；后续恢复/解锁检查在 `.scratch/round5-save-review/restore-tests.log` 与 `unlock-storage-tests.log`。归档位置和最终结果见 [第五轮证据](evidence/2026-10-08-round5.md)，历史 scratch 输出不单独充当新的通过证明。

本轮运行验收需分清三个门禁：清单/文件核对决定版本兼容；备份写入并读回成功才开放原生存储；首场景、模板样式与动画完成后才释放运行时初始化。修改剧情/变量的作者预览指令会在当前页面持续禁用玩家持久化，晚到的初始化完成或启用调用不能解除；自动字体优化初始化命令 `preview.command.set-font-optimization` 豁免，不能因此误禁普通玩家存档。清单状态正常也不能越过后两个门禁。

尚未由上述代码测试覆盖：IndexedDB/Electron 真正配额或断电耐久性、跨标签原子快照、大作品全资源 hash 时间/内存、beforeunload 等待、任意插件副作用回退、完整舞台/音频、真实 Windows 中文 IME、DPI/全屏、全机断网/干净机器和正式发行。静态 HTTP 只能核验清单列出的文件，新增文件需本地 verify/重新封存。具体协议与限制见 [SAVE_COMPATIBILITY.md](SAVE_COMPATIBILITY.md)。

## 第四轮 0.0.4 实际结果

| 检查 | 当前结果 | 范围与限制 |
| --- | --- | --- |
| 后端完整回归 | 通过：14 suites / 124 tests | 原业务与新增工作区 HTTP 防错写检查；`local/round4/round4-backend.log` |
| 工作区真实 HTTP 回归 | 通过：9 项，其中本轮新增 3 项 | 同 root 的 workspaceId 读写稳定；不同 profile 同字节 revision 仍拒绝旧身份写入、双方文件不变；读取完成后切换 profile 返回 409、不贴错误标签 |
| 共享文档 / 历史 | 通过：56 项 | history 100 步/2 MiB 增量、保存保留、冲突与异步完成保护 |
| 浏览器 draft vault | 通过：10 项 | 工作区/路径/owner 隔离、手动恢复候选、旧 session 与单个存储失败降级；不淘汰其他副本 |
| 源码输入 / 图形输入 | 通过：12 / 7 项 | 生产事件处理逻辑与边界替身；快捷键/组合输入等机制，不代替真实 Windows 中文候选交互 |
| 消息 / 持久身份 / 源码实验 | 通过：3 / 28 / 19 项 | 真实 parser 身份/源范围与既有原型分别记账 |
| 代码测试合计 | **259 项通过** | 124 + 56 + 10 + 3 + 12 + 7 + 28 + 19；不把构建、GUI、同步文件数或补丁重放项计入代码测试数 |
| runtime 受控生产构建 | 通过：174.1 s，Yarn 97.9 s / Vite 47.0 s | 生成源码/非 game 产物凭据；前一次独立 GUI 构建为 76.38 s，不与受控整流程混记 |
| 原菜单裁切复现 | 通过复现 | 1280×720、DPR 1.5，开始→简中→`getByText('存档').click()` 后 body.scrollTop 332.666656，root/menu.top -332.666687；`local/round4/menu-before-fix.json` 与 PNG |
| 修复后浏览器视口 | 通过三个视口 | 1280×720、1600×900 存档菜单正常；1280×960 的 root/menu 为 (0,120,1280,720)，body 滚动均为 0；`menu-after-fix-1280.*`、`menu-after-fix-1600.json`、`menu-after-fix-4by3.*` |
| 图形/源码历史 GUI | 通过有限场景 | 图形填中文后立即 Ctrl+S；源码撤销→图形旧值→重做回已保存；源码粘贴后 Ctrl+Z/Y/Z。撤销期间磁盘 hash 不变，`local/round4/undo-disk-check.json` |
| 草稿恢复与隔离 GUI | 通过有限场景 | chapter-two 未保存后切 start/撤销不串稿；关闭真实标签后新开页面显示磁盘原文和恢复列表，明确选择恢复全句再保存；另一作品同名场景原文及副本不混入 |
| runtime → Terre 模板同步 | 通过：25 个非 game 引擎文件 | 模板 game 逐文件 hash 不变；已保留 previous-template 和 sync-result。普通无自带入口作品随共享模板变化，不改作者文件 |
| 同步负例 | 通过：缺失凭据、过期源码凭据、额外产物三类拒绝 | 原始检查见 `local/round4/runtime-sync-negative-checks.json`，临时负例改动已恢复 |
| 完整 editor:build 与最终前端 | 通过：前端 262.08 s、后端 46.31 s、最后 Sync 25 文件；最终前端重编 2m53s | 最终真实页面使用重编产物；backend/runtime 沿用通过的同一源码 |
| 新作品实际传播 | 通过 HTTP 25 文件与实际游戏 GUI | `makenovel-round4-template` 仅 game 目录、独立 Game_key；实际请求逐文件匹配 receipt，游戏菜单 fixed/root (0,0,1280,720)/body 0；`final-http-and-bytes.json`、`shared-template-menu.json` |
| 最终场景字节 | 通过有限场景 | 两场景 BOM/节点 ID/CRLF 保留，start 10 个 CRLF、chapter-two 2 个，无单独 LF；`local/round4/final-http-and-bytes.json` |
| 真实服务检查 | 通过：22 项 | PID 33200 仅监听 127.0.0.1:3001，专用 3000 已停，全局作者目录不存在；最后页面已保存，`local/round4/editor-ready.png` |
| runtime 单补丁独立重放 | 通过：18 项，无 alternates / hardlinks | 0/1→1/1→幂等、临时 index 逆向回 base、fsck、开发树一致及两真实 index 保持；`local/round4/runtime-independent-replay.json`。此前 shared 报告仅为历史 |
| Terre 三补丁独立重放 | 通过：17 项，无 alternates / hardlinks | 0/3→3/3→幂等、临时 index 逆序 3→2→1 回 base；最终树 `18b0104c074def8309016c95b9e6e173d743bd47` 与开发一致、两真实 index 不变；`local/round4/product-patch-replay.json` |
| 存档兼容 | 源码审查与设计完成 | 第四轮时尚未实施版本门禁、旧档迁移或已读/收藏映射；第五轮新增门禁见上表，迁移仍未完成 |
| 真实 Windows 中文候选输入、DPI/全屏、断网/干净机、新 EXE | 本轮未验收 | 中文填写/合成事件、浏览器三视口和第三轮 EXE 结果不能替代这些验收 |

本轮记录见 [第四轮证据](evidence/2026-10-07-round4.md)。针对工作区回归，在根目录运行 `node integrations/terre-tests/run.cjs --no-cache --runTestsByPath src/Modules/webgal-fs/text-snapshot-api.spec.ts`。runner 的工作目录是 Terre backend，因此测试路径从 `src/` 开始。

恢复副本验收应分别测试同标签刷新、关闭后新标签的手动选择、另一标签并行修改、旧 revision 冲突、另一工作区同名文件，以及 session/localStorage 单独不可用。不删除其他副本来制造容量通过；不得把浏览器存储称为项目文件系统恢复仓。

## 第三轮 0.0.3 实际结果

| 检查 | 结果 | 范围与限制 |
| --- | --- | --- |
| 后端完整回归 | 通过：14 suites / 121 tests | 包含原业务、事务/API、54 项核心分析/真实写入保护，以及真实 ASAR 旁置回归 |
| 前端共享文档 | 通过：27 项 | 草稿保存、冲突、诊断阻断、预览状态与当前作品范围；机制测试不代替真实浏览器 |
| iframe 消息边界 | 通过：3 项 | 原准确来源与载荷边界回归 |
| 持久身份/局部写回 | 通过：28 项 | 真正调用锁定 parser；身份歧义/复制/移动与 token 保真等有限源编辑机制 |
| 源码实验 | 通过：19 项 | 独立原型回归仍保留，不与正式产品接入混记 |
| 代码测试合计 | **198 项通过** | 121 + 27 + 3 + 28 + 19；不把构建、GUI 步骤或包中文件数算入代码测试数 |
| 最终后端构建 | 通过，13.04 s | 真实生产构建，未升级依赖锁 |
| 最终前端构建 | 通过，101.38 s | 含当前作品范围的预览阻断修复；最终真实页面已复查 |
| 图形身份/写回 GUI | 通过有限场景 | `凛:` 经明确操作转换为 `say` 后沿用 `rain-001`；登记 ID、改正文保留作者双空格尾注释；复制 `rain-002` 得新 ID，单独修改副本、键盘移动后身份不变 |
| 错误草稿 GUI | 通过有限场景 | 第 10 行 `wait:not-a-number;` 被诊断且保存阻断；磁盘 hash 保持 `c1029804c3b739d23417029b64f45e2c2a81300129d2e643b4146f28c5e4bad6`；修复 `wait:100;` 并显式注释停用未知指令后保存成功 |
| 最终刷新/跨作品 GUI | 通过有限场景 | 刷新后身份对白保持；新增普通对白自动新 ID 保存；同一 SPA 在含高级块 round2 和有效 round3 来回切换，后者无错误阻断；`local/round3/editor-ready.png` |
| 两级补丁检查与产品重放 | 通过：2/2 匹配、17/17 重放检查 | 独立对象 clone，0/2→2/2→幂等→逆向恢复 base；最终树与开发一致，两真实 Git index SHA256 不变；`local/round3/product-patch-replay.json` |
| 最终源码字节核对 | 通过有限场景 | BOM、10 个 CRLF、无单独 LF；旧/新节点 ID 与作者双空格尾注释保留 |
| Windows 真实导出 | 通过有限本机范围 | 实际 Terre 导出链路，37/37 作品文件一致，原作者作品 hash 不变，.node/DLL 真实旁置 |
| Windows 实际 GUI | 通过一槽闭环 | 无 3000/3001 listener，EXE 开始游戏→槽 1 存档→Alt+F4 退出→进程归零→重启读档恢复；语言也保留 |
| 原 1280×720 浏览器裁切 | 未复测 | 1600×900 EXE 没有裁切不能记为同条件修复 |
| 全量语言/插件、旧档迁移、音频、完整 AT | 未验收 | 核心诊断与注释身份不能替代完整语言或运行时协议验收 |
| 全机断网/干净用户机器/签名安装发行 | 未验收 | CLI 子进程限制网络/PATH，与 GUI 停开发服务分别记录，未物理断网或卸载开发工具 |

详情见 [第三轮记录](evidence/2026-10-07-round3.md) 与 [Windows 导出记录](evidence/2026-10-07-windows-export.md)。第三轮 UI 原始文件和截图在忽略目录 `docs/evidence/local/round3/`；各自动回归日志位置以第三轮记录为准。

### 第三轮新增边界与复现

`validateSceneSnapshot` 只分析、不写入或执行。`saveTextSnapshot` 对 `game/scene/**` 强制检查：无效核心语法/身份返回 `422 SCENE_VALIDATION_FAILED`，新增/改动未知前缀返回 `422 ADVANCED_CODE_REQUIRES_REVIEW`。已有高级块可以原样保留并修改邻段，整个分析仍不可预览。旧场景文本更新/替换、覆盖上传和清空已有文件返回 `428 SCENE_REVISION_REQUIRED`；新建与新文件导入保留，模板/config 不按对白解析。

分析复用原生范围，不执行表达式；仅拒绝确定的续行、JSON/shape、括号引号和尾运算符、赋值目标、有限数值、会使原生 choose 出错的缺分隔符等问题。完整表达式 token、变量实际值、资源存在性和插件未验证。未知前缀与人物名短写有歧义，只有作者明确转换才生成显式 `say`。首行 BOM 紧贴命令沿用原生风险，GUI 样例采用 BOM 加首行注释。

```powershell
npm.cmd run game:export -- -GamePath '.local/editor-profile/games/makenovel-round2'
pwsh -NoLogo -NoProfile -File integrations/windows-export/Verify-Package.ps1 -PackagePath '.local/exports/<本次输出目录>'
```

Windows GUI 用 `%APPDATA%/webgal-electron-project` 玩家目录；CLI 烟测用 `.local/exports/player-profile-.../chromium`。CLI 两次受控终止与 GUI 正常退出属于不同证据。未签名开发包保留默认 Electron 图标/元数据，不记为正式发行。

## 第二轮 0.0.2 历史结果

以下表格和其后的事务说明保留第二轮时点；“未完成/未执行”不能覆盖第三轮已经明确增加的子项。

| 检查 | 结果 | 证据与范围 |
| --- | --- | --- |
| Terre 后端完整回归 | 通过：11 suites / 66 tests，0 pending，25.616 s | `evidence/local/round2/terre-backend-all.log` 与 `.json`；上游 37 条、profile 3 条、事务与 HTTP 26 条 |
| 后端生产构建 | 通过，退出 0，10.73 s | `terre-backend-build.log`；锁定 Yarn 1.22.22 |
| 最终前端构建 | 通过，退出0，106.90 s | `terre-frontend-final-build.log`；包括最终iframe/草稿改动 |
| 场景文档机制 | 通过：22 项 | `run-tests.mjs` 本轮输出；草稿、冲突、失败重试、保存中继续编辑、过期完成、存储失败、BOM/混合行尾等有限机制 |
| postMessage 边界 | 通过：3 项 | `run-message-tests.mjs`；准确 origin/source、载荷类型、准确目标 origin、程序载入快照不触发写入 |
| 实际 HTTP / WebSocket 服务 | 通过：22 项 | `verify-editor.mjs` 本轮输出；隔离 profile、同源允许、外来源/错误 Host/无来源拒绝、阻止真实写路由和错误来源升级 |
| 补丁工具夹具 | 通过：11 项 | `patch-replay-result.json`、`patch-replay-promoted.log`；重叠补丁、新文件/二进制、幂等、逆向恢复、脏改拒绝 |
| 真实编辑器基本链路 | 通过有限场景 | 建立隔离作品 → 图形改对白保存 → 源码追加注释手动保存 → reload 后保留；`ui-original.txt`、`ui-after-graph.txt` |
| 草稿与外部修改冲突 | 通过有限场景 | 草稿切换图形视图仍保留；外部 shell 追加磁盘注释后保存返回 409；草稿保留、磁盘 hash 未被冲突保存改变；`ui-external.txt`、`editor-conflict.png` |
| 草稿下载 | 通过 | 实际下载到本机 Downloads 后检查内容；证据副本 `ui-downloaded-draft.txt` |
| 根源码实验 | 本轮复测19/19，0 skip | `npm.cmd test`；`source-roundtrip-final.log` |
| 完整语法闸门、稳定 ID、存档迁移 | 未完成 | 显式保存和 dirty 不执行不能代替 S-05；UI UUID 尚未成为持久身份 |
| Windows 独立包、离线重启、普通用户验收 | 未执行 | Web build 与 loopback GUI 不等于成品验收 |
| 存档菜单裁切、声音、完整 AT、人工审美 | 本轮未复测 / 未验收 | 裁切原因未知；G0/G1 仍未整体通过 |

以上本地日志、JSON、`ui-*.txt` 与截图位于 `docs/evidence/local/round2/`。原始输出、截图、Downloads 草稿和本地 profile 不属于公开产品素材；证据目录和运行数据被 Git 忽略。

### 保存事务的已验证范围

新场景主路使用 `textSnapshot` / `saveTextSnapshot`：真实 UTF-8 字节 SHA256 作为 revision；同文件请求串行，共同写入者使用 lockfile；同目录临时文件写入、fsync 后替换，再返回成功。真实测试覆盖中文空格路径、BOM/CRLF、未知内容、缺失文件、Windows 只读失败、路径/junction 拒绝、非法 UTF-8、同进程与独立 Node 进程双 writer，以及 HTTP 409 结构化冲突。

未物理制造磁盘满；fsync 临时文件不等于已验证断电后的目录元数据持久性。非协作外部进程仍可在最后 hash 检查与 rename 之间写入，不宣称任意进程之间的严格 CAS。异常遗留锁需先检查，不能自动抢锁。旧 JSON 资源、模板及内部通用写接口仍不享有 revision 事务；postMessage 来源校验不改变其保存语义。

图形编辑已验证简单场景中未修改的行和 BOM/CRLF 保留；修改语句仍使用上游 serializer，可能标准化空格、丢失重复参数或改变注释间距。因此不能据此宣称任意原生源码无损往返。

## 第一轮基线与保留诊断

WebGAL frozen install、原版生产构建、parser 34 项、根源码实验 19 项，以及 Terre frozen install/前后端构建均在上一轮通过，证据见 [基线汇总](evidence/2026-10-07-baseline.md) 与 [TERRE_BASELINE.md](TERRE_BASELINE.md)。本轮未重复执行的项目保留历史日期。

原版 Terre Jest 仍有 3 套件加载 ESM-only `trash` 失败的可复现基线；本轮独立兼容配置使原断言全部执行通过。shared-cache 的 EEXIST 已通过隔离缓存重试处理，未删除全局缓存或更换锁文件。Vite CJS 废弃、大 bundle 和可选 Live2D 库警告仍保留。

首轮 IAB 实际窗口为 1280×720，打开存档菜单后 root/menu 的 y 约 -332.67；该历史现象已在第四轮同条件复现并修复，结果见上表。DPI/全屏和完整窗口矩阵仍未验收。需要启动当前锁定播放器与已应用补丁时：

```powershell
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Build
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Test
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Preview
```

Preview 限定 `127.0.0.1:3000`，端口占用时失败，显示上游示例与当前应用的 runtime 补丁，结束后 Ctrl+C 停止。

## 下一轮具体补测

1. 扩大核心语法与未知代码边界用例，验证导入/多场景/所有预览入口；完整语言与插件能力单独登记。
2. 完成真实 Windows 中文 IME 与多场景历史/恢复边界；100 步/2 MiB 历史及浏览器副本不代替全套作者操作验收。
3. 对已实现的原生版本门禁、完整备份与两场景恢复补齐最终 GUI/下载文件/新 EXE 故障验证；测量大作品 hash 与自动快存成本，不猜旧索引映射。项目文件系统恢复、三方合并和其他资源事务独立推进。
4. 扩大 DPI/全屏与窗口矩阵，核对 runtime 修复进入新模板/新 EXE，补声音、分支、跨场景、多槽与异常存档验收。
5. 用既有 Windows 导出入口验证全机断网或干净用户机器、只读安装位置与异常写盘；正式签名/安装仍为独立发行工作。

第二轮正式产品补丁独立重放 10 项检查通过，开发树与全新 clone 树相同；见 `local/round2/product-patch-replay.json`。第二轮最终浏览器运行已保存对白通过；这些历史结果不替代第三轮两补丁与最终页面复查。
