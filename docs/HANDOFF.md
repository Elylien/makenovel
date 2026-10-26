# 交接与恢复

记录：2026-10-26，MakeNovel `0.0.15` / `main`，远端 `https://github.com/Elylien/makenovel.git`。提交与推送以现场 Git 核对为准。

## 恢复先核查

```powershell
git status --short --branch
git submodule status
npm.cmd run patch:check
npm.cmd run patch:runtime:check
Get-Content -LiteralPath .local/editor-runtime/process.json
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue
```

先读 PROJECT_STATUS、DEVELOPMENT_PLAN、TESTING、DIRECTOR_EDITING、KNOWN_ISSUES。私有输入只留 docs/private，禁止 stage/upload。两 vendor HEAD 保持锁定上游，工作树有意应用补丁；不要 reset/clean、暂存 gitlink 或创建嵌套提交。

## 第十五轮结果

已有有限 setAnimation 的资源、静态目标、next 已接入原导演事务；已知模型/非静态目标只读，动画为结构边界，原生执行器与保存格式未变。代码 756/756，最终导演 144 与图形输入 132 在审核修复后重跑；构建通过，Terre 十一补丁独立重放 18/18，HTTP 25/25、服务 22/22、保留检查 24/24，实际 GUI 十二条路径。细分及未运行项见 [本轮证据](evidence/2026-10-26-round15.md)。

Terre 0011 SHA256 `5eef4d6325a523a4df649f331502af2c6455bc90eea3a2a100fbcfe49dbf0c0c`，38618 字节，完整树 `f1dbce8b346b235e96da095beee935341c77aa40`。运行时五补丁完整树 `a0c22cb27d5e4c7d270d39efd34b10f8c6ca32ad`。WebGAL HEAD `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`，Terre HEAD `cf73dd58535d3ef15bddf0852adee153fa92d7da`。四份 locale 的五个新消息 ID 随构建提取并纳入补丁；非中文翻译仍为空。

## 当前进程与作品

收尾恢复时旧 PID 8800 已退出、3001 无监听；已使用受控启动器恢复。当前 PID **14260**，UTC 启动 **2026-10-26T15:15:28.2954154Z**，入口 `vendor/WebGAL_Terre/packages/terre2/dist/src/main.js`，仅 `127.0.0.1:3001`。停止前核对 PID/时间/入口；日志与记录在 `.local/editor-runtime/`。本轮未生成 EXE。

编辑入口 `http://127.0.0.1:3001/#/game/makenovel-round15`。作品 `.local/editor-profile/games/makenovel-round15`，projectId `44838d2c-4e81-4c9c-9267-5c46b1cc01bd`，Game_key `makenovel-round15-2e238397-d268-46fb-9677-bf15769b318c`。22 文件最终 manifest `6092fde1d47334e597cbb2c4553d7ed76829d782d5809c2e16eb0c16819a0965`；初始清单及更新前备份保留。

实际 GUI 仅改 start.txt 第 6、7 行：move-left、fig-left、next=true 和验证对白。最终 start SHA256 `e20099adebe10c66e6cbd22882cc5cd4cacfa2b4d44fc15510787e7a1a92c13c`；BOM、CRLF、其余字节及 readonly.txt 保持。稳定快速槽已在关闭人物和整页刷新后实际读回，恢复最终位置，不宣称动画相位续播。

最后 GUI 保存完成、实时预览关闭、导演面板关闭；临时播放器已关闭，测试视口已重置，原 Round13 标签保留。中断恢复后的标签状态以现场为准，不自动替换用户当前页。本地证据 `docs/evidence/local/round15/`，关键截图 `11-final-editor.png`，GUI 记录 `gui-observations.json`。

收据 `.local/runtime-sync/runtime-build.json`，引擎 25 文件签名 `ccad2e12c7464780574fffc9ec06f8eb736b55ab8961a27de6f8ed3e7764d5f3`。最终模板备份 `.local/runtime-sync/20261026-085248-69f6420292c347bd9832d2d3739410d4/previous-template`。保留全部旧样片、备份、玩家数据和开发包。

## 下一具体单元

```powershell
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round15
npm.cmd run test:perform-lifecycle
npm.cmd run test:menu-lifecycle
npm.cmd run test:runtime-restore
```

下一轮优先补有限动画与菜单、自动、快进中断及历史/流程图恢复的组合证据，先审查原生入口和现有生命周期测试，再确定一个有限单元。真实 IME、Windows 离线包和高级动画继续单列，不把本轮通过范围外推。

下一 Terre 补丁 0012 从 `f1dbce8b346b235e96da095beee935341c77aa40` 导出，下一 runtime 补丁 0006 从 `a0c22cb27d5e4c7d270d39efd34b10f8c6ca32ad` 导出。停 editor 后 baseline:build → editor:build；不并发 Terre 两 workspace，不在 parser 重建时运行依赖测试或封存；独立重放时冻结 patch/manifest。

作品改稿后暂停写入，再显式 `npm.cmd run game:seal -- -GamePath '<作品目录>' -Action Update` 并重开。用户已授权开源 Git、工具安装和 Computer Use；付费与正式发行分开处理。
