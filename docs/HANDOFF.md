# 交接与恢复

记录：2026-10-23，MakeNovel `0.0.14` / `main`，远端 `https://github.com/Elylien/makenovel.git`。提交与推送以现场Git核对为准。

## 恢复先核查

```powershell
git status --short --branch
git submodule status
npm.cmd run patch:check
npm.cmd run patch:runtime:check
Get-Content -LiteralPath .local/editor-runtime/process.json
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue
```

先读PROJECT_STATUS、DEVELOPMENT_PLAN、TESTING、DIRECTOR_EDITING、KNOWN_ISSUES。私有输入只留docs/private，禁止stage/upload。两vendor HEAD保持锁定上游，工作树有意应用补丁；不要reset/clean、暂存gitlink或创建嵌套提交。

## 第十四轮结果

第十四轮明确作者预览与玩家存档隔离：跳句后持续显示预览标识，快存、快读和继续游戏的拒绝说明给出刷新指引。隔离门禁与原生存档协议保持原行为。

相关代码 **198/198**（兼容34、资源38、恢复70=原66+组合4、预览提示11、存档UI12、菜单15、perform18）；受控runtime→Terre构建通过，运行时五补丁独立重放18/18、HTTP引擎25/25、服务22/22、实际GUI八条路径通过。

新运行时补丁 `0005-author-preview-storage-notice.patch`，SHA256 `5ccd3c3199f69f3d17efa31d6ccc31fb1d449ad7a008ce6feb1710475da7803a`，9297字节；增量基树 `77f3336c288448ccc5bc1a3986df91a91f3f79f8`，五补丁完整树 `a0c22cb27d5e4c7d270d39efd34b10f8c6ca32ad`。Terre十补丁完整树仍为 `23c07e4ee8229c7d413493128420e745c1d10865`，未增加编辑器补丁。原WebGAL1–4/Terre1–10、上游HEAD与锁文件保持。

WebGAL HEAD `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`，Terre HEAD `cf73dd58535d3ef15bddf0852adee153fa92d7da`。实际GUI与未运行项见 [本轮证据](evidence/2026-10-23-round14.md)。

## 当前进程与作品

编辑器PID **42952**，UTC启动 **2026-10-23T05:30:00.7763335Z**，入口 `vendor/WebGAL_Terre/packages/terre2/dist/src/main.js`，仅127.0.0.1:3001。停止前核对PID/时间/入口。日志与进程记录 `.local/editor-runtime/`；本轮未生成EXE。

作品仍为 `.local/editor-profile/games/makenovel-round13`，入口 `http://127.0.0.1:3001/#/game/makenovel-round13`。projectId `657ccded-2935-454d-bbd9-76ef2651f9cf`，Game_key `makenovel-round13-f9a5faec-e340-4377-90e5-adbe605a2271`。19文件manifest `35c747df2044957bd48cecd81f5c50af9774dd7b70e17c7df4d0c22734b2a83c`。

start SHA `7121fcbbb387464c2457358d6be4e64234a0c3496e202fd3e0089b277912e116`，readonly SHA `152d14e0322acb6944452ea4d174b1347ae0cd1d9004fe26171ac8e3ecf228d0`。本轮未改作品，BOM/CRLF/注释/节点身份保持。原RIGHT快速槽已在新构建刷新后实际读回。页面最终预览关闭，保存/撤销/重做禁用；临时独立播放器已关闭，测试视口覆盖已重置，原编辑器标签保留。

收据 `.local/runtime-sync/runtime-build.json`，引擎25文件签名 `ccad2e12c7464780574fffc9ec06f8eb736b55ab8961a27de6f8ed3e7764d5f3`。模板备份 `.local/runtime-sync/20261022-180701-c68613d5f6644378a544099a5d82036b/previous-template`。保留所有旧备份、样片、玩家存储和开发包。

本地证据 `docs/evidence/local/round14/`，关键截图 `07-preview-notice-full-player.png`，GUI八条记录 `gui-observations.json`。本轮两个代理曾因额度中断；实际测试与主代理GUI后来完成，额外独立只读review未完成，不计为通过。

## 下一具体单元

```powershell
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round13
npm.cmd run test:director
npm.cmd run test:graph-input
```

先读 [独立动画范围](ANIMATION_AUTHORING_SCOPE.md)，按其中有限契约实现已有静态setAnimation的资源/目标/next局部编辑，先处理来源分类、旧参数语义与资源后缀差异。保留原生执行器和源码，不扩成时间轴。历史/流程图恢复、真实IME、全播放器验收仍单列。

下一Terre补丁0011从完整树 `23c07e4ee8229c7d413493128420e745c1d10865` 导出；下一runtime补丁0006从 `a0c22cb27d5e4c7d270d39efd34b10f8c6ca32ad` 导出。停editor后baseline:build→editor:build，不并发Terre两个workspace，不在parser重建时运行依赖测试或封存；独立重放期间冻结patch/manifest。

作品改稿后暂停写入，再显式 `npm.cmd run game:seal -- -GamePath '<作品目录>' -Action Update` 并重开。用户已授权开源Git、工具安装和Computer Use；付费与正式发行分开处理。
