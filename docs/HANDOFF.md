# 交接与恢复

记录：2026-10-09，MakeNovel `0.0.8` / `main`。公开远程 `https://github.com/Elylien/makenovel.git`。提交/推送以 Git 现场核对为准。

## 恢复先核查

```powershell
git status --short --branch
git submodule status
npm.cmd run patch:check
npm.cmd run patch:runtime:check
Get-Content -LiteralPath .local/editor-runtime/process.json
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue
```

先读 PROJECT_STATUS、DEVELOPMENT_PLAN、TESTING、DIRECTOR_EDITING、KNOWN_ISSUES。两份原始输入只在被忽略的 `docs/private/`，不得 stage/upload。vendor HEAD 是锁定原版，工作树有意应用补丁；不要 reset/clean、暂存 gitlink 或创建嵌套未推送提交。

## 第八轮结果

四类素材命令在普通对白前新增、仅撤掉本次新行、只读前文来源已接入。新增和对白共用局部事务，一次应用/撤销；原行顺序、等待和未知注释保留。来源仅是同场景线性脚本事实，遇到标签/流程/插值/未知语法保守停止；不代表实时舞台，不跨分支推算。来源跳转、原行删除/重排和完整时间轴未做。

实际 GUI 已完成选材、pending 门禁、撤新行、none 后重选、取消、整批应用/undo/redo、保存重开及原生预览。独立源码检查 16/16，四个新行及一个改文节点有唯一身份，其他 16 原行、readonly 场景、BOM/CRLF/注释原字节保留。R8-03 前文来源、标签/未知参数边界均现场确认。细节见 [第八轮证据](evidence/2026-10-09-round8.md)。

当前回归 456/456 = 作者 346 + 两套样片 6 + runtime 资源/恢复 104；本轮无 runtime 源变更，完整 runtime 339 没有重复执行。受控 runtime→Terre 构建与同步通过，HTTP 25/25、服务 22/22、Terre 五补丁独立重放 18/18。第七轮 646 及资源故障 GUI 是历史结果。

Terre 新 0005 SHA-256 `ea937296a3d21d9d0d9a1a1c495b06a4276a83c36bfe792963877f7306415d22`，完整树 `40dc0cb9472a10018d43e16eb462dc2d5e4ba79e`，从旧四补丁树 `bf2524446919f35385194a1e7b9a3dab3c0aa09a` 增量导出；前四份原字节保持。WebGAL 四补丁树仍 `77f3336c288448ccc5bc1a3986df91a91f3f79f8`。锁定 HEAD 分别 Terre `cf73dd58535d3ef15bddf0852adee153fa92d7da` / runtime `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`。

## 当前进程与本地产物

测试 EXE 已正常关闭，精确包路径 0 进程。编辑器恢复 PID **28592**，启动 UTC **2026-10-08T16:27:56.8502082Z**，入口 `vendor/WebGAL_Terre/packages/terre2/dist/src/main.js`，仅 `127.0.0.1:3001`；没有项目 3000 服务。恢复先核查 PID/时间/入口，不凭陈旧记录杀进程。

作者作品 `.local/editor-profile/games/makenovel-round8`，显示名“MakeNovel 第八轮导演新增与继承验证”，projectId `121adbba-2c06-454c-a07c-46b74ffb9878`，Game_key `makenovel-round8-999bb4af-d102-494e-bea1-32dd42840bff`。最终 manifest `20254c8bac4269ad92b142ec596b2174738121d4b1b7cb9361c3fffe30342e30`，19 个登记文件加 manifest 为 20，根收据/许可共 23 来源文件。生成起点 manifest `f831fb86772375ca5bc4360f7a2f2d88ec77cbb2c2b427adb6dbc0683cdddb6f` 不等于最终改稿身份，旧清单备份保留。

编辑入口 `http://127.0.0.1:3001/#/game/makenovel-round8`，玩家入口 `http://127.0.0.1:3001/games/makenovel-round8/`。作者页保存完毕，预览开关已关闭以停止测试音。原生文件选择器使用单击选素材；双击的后续点击可能落到已关闭的浮层外，关闭导演面板而丢弃未应用草稿，当前不宣称此原生双击交互已修复。

最终 Windows 开发包 `.local/exports/MakeNovel 第八轮新增与来源样片 20261009-002045-13935b/WebGAL.exe`，保留完整目录。ASAR SHA-256 `b6355ea63769921c5b536a664c174e310853d8098574085474c7d965a3a6e2a2`。GUI 使用原生 `%APPDATA%/webgal-electron-project` 存储，不能删除玩家数据。普通槽 1 为 R8-03（2026/10/9 00:25:28），快档同句。开发服务全停时已正常退出/零进程/重启，普通与快速读取均实际恢复夜景、左 smile、右 neutral 与 R8-03。未做全机断网、异常退出、干净机器及完整矩阵。

最终引擎 25 文件签名 `aa10038a666fcea893a5501f09723d2427aabee4b433bd0122060e0ea7264e93`，收据 `.local/runtime-sync/runtime-build.json`，同步前备份 `.local/runtime-sync/20261008-161233-d2a6ede840a245b9b673cff3d2cb819a/previous-template`。原始本轮日志/截图 `docs/evidence/local/round8/`；前轮作品、模板、清单及玩家存储均保留。

## 下一具体单元

先只读确认最终样片，不能重新生成覆盖：

```powershell
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round8
npm.cmd run test:director
npm.cmd run test:graph-input
```

下一单元优先完善来源定位跳转和导演新增素材的真实交互边界（含原生选材双击），再设计既有命令删除/重排的明确影响与撤销契约。完整继承、时间轴和 AI 接力仍分开实施；Windows 真实 IME、复杂演出和资源超时继续分别验收。

修改作品后暂停写入，再 `npm.cmd run game:seal -- -GamePath '<作品目录>' -Action Update` 并重开。精确版本改变不读取旧版槽，旧值保留；封存不推断跨版本兼容，备份校验尚不执行恢复导入。

修改 vendor 后重新导出审查 patch，停止 editor，再 `baseline:build` → `editor:build`；保留模板备份和作者文件。不要并发两个 Terre workspace build，不要并发 runtime 重建与依赖 parser 的测试/封存。无自带入口的普通作品用共享引擎，自带入口作品另行升级。

用户已授权 Windows 优先、Steam 中文参考、公开 Git、环境安装和 Computer Use；不必重复询问。付费服务、正式发行与商业素材另行处理。
