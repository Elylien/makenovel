# 交接与恢复

记录：2026-10-09，MakeNovel `0.0.9` / `main`，远端 `https://github.com/Elylien/makenovel.git`。提交与推送以现场 Git 核对为准。

## 恢复先核查

```powershell
git status --short --branch
git submodule status
npm.cmd run patch:check
npm.cmd run patch:runtime:check
Get-Content -LiteralPath .local/editor-runtime/process.json
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue
```

先读 PROJECT_STATUS、DEVELOPMENT_PLAN、TESTING、DIRECTOR_EDITING、KNOWN_ISSUES。原始输入只在忽略的 `docs/private/`，不得 stage/upload。vendor HEAD 仍锁定原版，工作树有意应用补丁；不要 reset/clean、暂存 gitlink 或创建嵌套提交。

## 第九轮结果

来源定位与返回已接入，守卫完整源文/历史/真实身份/原文/revision/文档实例/场景生命周期；未登记行不会因定位补 ID。局部草稿、pending、错误输入和 IME 先处理。延迟焦点另复核输入和保存状态。具体差分未知可定位，边界未知不可伪造目标。面板 backdropClick 阻止关闭，明确取消/Escape 保留。

实际第 88 行跨 80 句跳到背景第 2 行、BGM 第 5 行并返回，焦点与高亮通过；双击新素材保留草稿、拒绝未应用跳出、Popover Escape 优先、修改及撤销 ABA 失效、unknown/diff 边界均完成。两份场景最终原始字节不变，清单 verify 通过。详见 [第九轮证据](evidence/2026-10-09-round9.md)。

本轮 **500/500** = 作者 387（导演64/图形71）+ 样片9 + 资源/恢复104。前端 tsc、受控 runtime→Terre 构建、模板同步、HTTP25/25、服务22/22、六补丁独立重放18/18均通过。未重跑完整 runtime339，未导新 Windows 包；第八轮 EXE 正常退出重启恢复是历史证据。

新0006 SHA `90d536c4550d1860944e121ce1e44dd587ed96bc18b466804331b90457bd2ad4`，完整tree `cae19ae2f2d9619016fbb726b442923a28fdbb4d`，增量基树 `40dc0cb9472a10018d43e16eb462dc2d5e4ba79e`；旧Terre1–5与runtime1–4字节不变。两上游 HEAD：Terre `cf73dd58535d3ef15bddf0852adee153fa92d7da`，WebGAL `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`。

## 当前进程与作品

编辑器 PID **11936**，启动 UTC **2026-10-08T17:00:48.9615331Z**，入口 `vendor/WebGAL_Terre/packages/terre2/dist/src/main.js`，仅 `127.0.0.1:3001`；无3000服务。停止前必须重新核对PID/时间/入口。没有本轮新测试 EXE。

作者作品 `.local/editor-profile/games/makenovel-round9`，显示名“MakeNovel 第九轮导演来源定位验证”，projectId `e339ae06-90ed-4987-9de9-7bd7469d1ae2`，Game_key `makenovel-round9-b5842111-27d5-452b-8836-946b3ffea529`，manifest `69d8fd653186ae87d5bdc16fbc0f912b388287fb65288f9f87daaa938debdebe`。起点与最终相同，19个登记文件。start目标初始第88行、readonly差分第4行。不要重新生成覆盖此目录。

入口 `http://127.0.0.1:3001/#/game/makenovel-round9`，页面已刷新重开、无未保存草稿、预览关闭；截图与日志在 `docs/evidence/local/round9/`。start SHA `8abb79693cce0105aa8dd691ceb4ad2e7afd4e90add59897eba6c3b6afa4511f`，readonly SHA `3c1ccb686264e1dda62f66c82f073034235ea31ef65f75f7f63c32b44edf41d9`。

引擎25文件签名 `aa10038a666fcea893a5501f09723d2427aabee4b433bd0122060e0ea7264e93`，收据 `.local/runtime-sync/runtime-build.json`，本轮同步备份 `.local/runtime-sync/20261008-170003-69e7021d69854e1cb2ed00f83d9e2dc8/previous-template`。第八轮作者作品、Windows开发包、槽1与快档继续保留，精确路径与哈希见 [第八轮证据](evidence/2026-10-09-round8.md)，不要删除玩家 `%APPDATA%/webgal-electron-project` 数据。

## 下一具体单元

```powershell
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round9
npm.cmd run test:director
npm.cmd run test:graph-input
```

优先设计并实现**已有导演命令删除/重排**的明确影响、稳定身份、注释/等待保留与整批撤销契约。先划分可安全支持的原生命令和边界，不能通过删除未知语句或重解释原生顺序实现。来源跳转可复用本轮基础，跨分支继承、完整时间轴和AI接力仍分开实施。真实系统IME、复杂演出与资源超时继续独立验收。

修改 vendor 后从本轮完整tree增量导出新补丁，停editor再 `baseline:build` → `editor:build`。不要并发两个Terre workspace build；不要在runtime重建时运行依赖parser的测试/封存/生成器。模板备份和作者文件必须保留，普通作品共用模板，自带入口另行升级。

作品如有实际保存改动，暂停写入后显式 `npm.cmd run game:seal -- -GamePath '<作品目录>' -Action Update` 并重开。版本门禁不推断旧档跨版本兼容。用户已授权公开Git、工具安装与Computer Use，无需重复确认；付费服务和正式发行另行处理。
