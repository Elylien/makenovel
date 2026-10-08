# 交接与恢复

记录：2026-10-08，MakeNovel `0.0.7` / `main`。公开远程 `https://github.com/Elylien/makenovel.git`。提交/推送以本地 Git 和远程现场查询为准。

## 恢复先核查

```powershell
git status --short --branch
git submodule status
npm.cmd run patch:check
npm.cmd run patch:runtime:check
Get-Content -LiteralPath .local/editor-runtime/process.json
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue
```

先读 PROJECT_STATUS、DEVELOPMENT_PLAN、TESTING、DIRECTOR_EDITING、STAGE_LIFECYCLE、SAVE_COMPATIBILITY、KNOWN_ISSUES。两份原始文件仅在被忽略的 `docs/private/`，不得 stage/upload。两个 vendor HEAD 仍是锁定原版提交，工作树有意应用审查补丁；不要 reset/clean、暂存 gitlink 或创建未推送的嵌套提交。

## 第七轮结果与来源

本轮代码回归 **646/646**（runtime 339、作者 304、导演样片 3）；最终两端构建、HTTP 引擎 **25/25**、服务 **22/22**、两个 vendor 各 **18/18** 独立重放通过。Terre 前端/后端构建 103.01 s / 12.95 s；最后 SVG 修复后的 runtime 构建 47.76 s，Vite 22.17 s，并再次受控同步。完整结果见 [第七轮证据](evidence/2026-10-08-round7.md)。

| 目标 | 锁定 HEAD | 四补丁完整 tree | 新 0004 SHA-256 |
| --- | --- | --- | --- |
| WebGAL | `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85` | `77f3336c288448ccc5bc1a3986df91a91f3f79f8` | `26e2a99113bd084c4cefdce1f8bde0088ddb044416488e2deb7885bc23e07b86` |
| Terre | `cf73dd58535d3ef15bddf0852adee153fa92d7da` | `bf2524446919f35385194a1e7b9a3dab3c0aa09a` | `8d9f4c93e176ef47ca372b9b804a190ba1f225859cf3aca058801e759f92aafb` |

各前三补丁原字节保留；最终独立 clone 无 alternates/hardlinks，顺序应用、幂等、逆向及开发树/两个真实 index 保持均通过。源码改动按根仓库 patch 交付。

有限导演面板聚合本句前紧邻的已有背景、立绘/差分、BGM、SE 和普通对白/语音。局部草稿一次应用、一次共享撤销，取消不改正文；Ctrl+S 在面板内仅应用草稿，仍需保存脚本。未知语法/注释保持，全文与历史版本拦截过期写入，面板关闭前同步释放自己的预览占用。实际多字段修改、取消、整步撤销/重做、保存重开和原生预览通过；源码独立 16/16 核验保留 BOM、CRLF、8 条注释、未改行，只给五个改动节点登记 ID。

当前静态主图 pending/failed 时拒绝普通/快速存档，旧槽不变；主图 setup 完成才 ready，旧请求与辅助纹理不污染状态。实际损坏 SVG 揭示锁定 Pixi 只 emit onError 不 reject 的路径，新增桥接已使实际坏图进入 failed。浏览器与 Windows 均验证正常档→坏图两种拒存→旧快档仍可读→换回正常图两种保存恢复。

未实现命令插入/删除/重排、跨对白/分支继承舞台、完整时间轴、完整 AI 接力、最近稳定检查点回退/排队保存或全资源恢复事务。图片加载不暂停剧情时钟；同 URL 失败不因每次舞台提交自动重试，需重开或实际换图。SVG onload 内异步异常、无响应超时、GIF/视频/模型、GPU 与任意插件另列边界。

## 进程、作品和本地产物

最终测试 EXE 已正常关闭，核验精确包路径 0 进程。编辑器重新启动，PID **15436**、UTC `2026-10-08T14:05:18.8871126Z`，入口为 `vendor/WebGAL_Terre/packages/terre2/dist/src/main.js`，仅 `127.0.0.1:3001`；专用 3000 预览未启动。恢复先核查 PID/启动时间/入口，不按陈旧记录杀进程。启动/停止用 `npm.cmd run editor:start` / `npm.cmd run editor:stop`。

本轮作者作品 `.local/editor-profile/games/makenovel-round7`，显示名“MakeNovel 第七轮导演与资源验证”，projectId `f016aa0c-cc38-4dcc-b149-c3eecf943b46`，Game_key `makenovel-round7-4dcb7a6a-ab25-4627-a56b-28527c5f123d`。GUI 改稿后已显式重新封存，最终 manifest `e12992a7ff9576e43278d60fa7c45e80cf3a7facec5301914d612a8b173a2142`，20 个登记文件加清单共 21 个 game 文件，根收据/许可合计 24 文件。生成器收据是最初起点，不能作为最终改稿身份；旧清单副本保留在 `.local/manifest-backups/`。

编辑入口 `http://127.0.0.1:3001/#/game/makenovel-round7`；玩家入口 `http://127.0.0.1:3001/games/makenovel-round7/`。作者页预览开关已关闭以停止循环测试音，需要时再勾选并使用原生预览。浏览器普通槽 1 是 BASE（21:32:44），槽 2 是早期恢复路径，槽 3 是最终 RECOVER（21:50:38）；最终快档为 RECOVER。Windows 与浏览器存储独立：普通槽 1 是 BASE（21:57:55），槽 2 是 RECOVER（22:01:38）；重启后实际读取槽 2 恢复日景、双角色和该句。

最终 Windows 开发包 `.local/exports/MakeNovel 第七轮导演样片 20261008-214756-a0409b/WebGAL.exe`，必须保留完整目录。ASAR SHA-256 `94a04dd2576fe453a7f51f28f74250fa20e69d31cc6756eef8e0276839ace9a1`。此前 `212947-5cffb8` 包保留为 SVG 修复前诊断，不作为最终交付。GUI 继续使用原生 `%APPDATA%/webgal-electron-project`；不要删除玩家数据。本轮仅验证本机停开发服务和正常退出重启，不代表全机断网、干净机器、异常断电、多槽完整矩阵或正式发行。占位 SVG 和测试音不等于正式美术/配音。

最终引擎 25 文件签名 `aa10038a666fcea893a5501f09723d2427aabee4b433bd0122060e0ea7264e93`，凭据 `.local/runtime-sync/runtime-build.json`；最新同步前模板备份 `.local/runtime-sync/20261008-134630-c590fc8dcc474cd5b6c41ea49fa0e923/previous-template`。原始日志/截图在 `docs/evidence/local/round7/`；前轮作品、旧模板、清单备份和玩家键全部保留。

## 下一具体单元

先只读确认现有样片，不重新生成覆盖：

```powershell
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round7
npm.cmd run test:director
npm.cmd run test:resource-lifecycle
```

下一单元优先给导演面板增加有限的命令新增及继承来源展示，先明确哪些单行原生命令允许创建、身份/撤销/源码保留和预览验收边界。历史/流程图恢复、复杂 hold 及 Windows 真实 IME 候选交互继续分别验收，不以本轮局部会话替代。大作品 hash、音频 DOM 握手和永久资源挂起超时各自分项。

修改作品后停止其他写入，再 `npm.cmd run game:seal -- -GamePath '<作品目录>' -Action Update` 并重开页面；新版本不读取旧版本槽，旧值保留供备份。重新封存不推断跨版本兼容；备份校验尚不执行恢复导入。

修改 vendor 后先重新导出审查 patch，再停止 editor → `baseline:build` → `editor:build`；Terre 无变动且已构建时，runtime build 后执行 `Sync-Runtime.ps1 -Action Sync` 即可。不要并发 Terre 两 workspace build，也不要并发 runtime 重建与依赖 parser 产物的测试/封存。共享模板影响普通无自带入口作品；自带引擎需单独升级。

用户已确认 Windows 优先、Steam 中文参考、公开 Git/工具/Computer Use 授权；付费服务、正式发行、商业素材另行处理。
