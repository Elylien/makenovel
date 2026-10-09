# 交接与恢复

记录：2026-10-09，MakeNovel `0.0.11` / `main`，远端 `https://github.com/Elylien/makenovel.git`。提交与推送以现场Git核对为准。

## 恢复先核查

```powershell
git status --short --branch
git submodule status
npm.cmd run patch:check
npm.cmd run patch:runtime:check
Get-Content -LiteralPath .local/editor-runtime/process.json
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue
```

先读PROJECT_STATUS、DEVELOPMENT_PLAN、TESTING、DIRECTOR_EDITING、KNOWN_ISSUES。私有输入仅在忽略的 `docs/private/`，不得stage/upload。vendor HEAD保持锁定上游，工作树有意应用补丁；不要reset/clean、暂存gitlink或创建嵌套提交。

## 第十一轮结果

已有普通等待支持整数毫秒0–2147483647及布尔nobreak；next/continue/when、变量和未知形式保持只读或收集边界。等待不可结构编辑。原始输入在序列化前检查，保留注释、身份与原生解析；等价操作不改稿。执行说明使用原生ADD_NEXT_ARG_LIST，不累加重叠时长。全文/历史ABA、IME/缓冲/错误、取消和关闭守卫继续生效。

真实错误输入、取消、等待与对白整批应用、单步撤销/重做、保存刷新、未登记与legacy等待、next/变量只读通过。正常播放测得nobreak点击不截短、普通等待可提前点击结束及三段自然推进。23行保留19行原字节，BOM/CRLF及原身份保留，未登记等待只增加1个ID。详见 [第十一轮证据](evidence/2026-10-09-round11.md)。

代码600/600（作者448、样片15、runtime子集137）、tsc、受控runtime→Terre构建/同步、HTTP25/25、服务22/22、八补丁最终独立重放18/18通过。未运行完整runtime339、新Windows包或完整输入/快进/自动/菜单GUI矩阵。

0008 SHA `90461f066ba5e6fe5f2e21a90557b873a4c5d6d883f49df78f481c4acbb1a5ae`，完整tree `9251575c495fe730b409526f0af9e07cbbf14d3e`，增量基树 `88fc8d1c98e50326f2028d390683bb2fece1ca37`，manifestSHA `91274b87c08fb8543b22e33f6798c1f579ef6293aada2dff057e7b7bd78ff252`。首次构建生成4个新增标签PO条目导致patch:check拒绝未知状态，审查后已补入0008并重新通过最终重放。原Terre1–7/runtime1–4字节不变。上游HEAD：Terre `cf73dd58535d3ef15bddf0852adee153fa92d7da`，WebGAL `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`。

## 当前进程与作品

编辑器PID **15796**，UTC启动 **2026-10-09T03:54:45.9802856Z**，入口 `vendor/WebGAL_Terre/packages/terre2/dist/src/main.js`，仅127.0.0.1:3001；停止前重查PID/时间/入口。无本轮EXE。进程和日志入口 `.local/editor-runtime/`。

作品 `.local/editor-profile/games/makenovel-round11`，标题“MakeNovel 第十一轮导演等待时序验证”，projectId `d51623a7-5da3-45cb-85d6-6bba2f6bbd88`，Game_key `makenovel-round11-c7c4cdf4-a19e-4b95-9360-a3f821c22dbf`。初始manifest `a2659086449bbd2794fe913ed3defc9af66e23cdd2b39f6e84742a17a327c95c`；保存后Update封存并verify，最终 **`3f8e2567998878ef184ad707f4163c0180f3d51ca9f710c754feb0f2d4f9401a`**，19文件。旧manifest备份保留在 `.local/manifest-backups/d51623a7-5da3-45cb-85d6-6bba2f6bbd88/`。

start最终SHA `6f89b1c8ff29a70bf1183cdac0191694d8202e1be20f02aeb48713ee5e96f5ee`；等待第10/14/19行3200/3500/1600毫秒，目标第12/16/21行。第10行开关往返后原生表示为 `-nobreak=true`；legacy第18行不变。readonly SHA `dc4f80f2a2ab6ed30bc91097503133f5e04722f008c47c420d6a86197927d223`。新身份 `node-61f7b725-65f9-475a-a79a-c6dd895d5183` 仅属于第14行等待。最后start已保存、无撤销/重做、面板关闭、预览关闭。IAB交付tab2，保留用户原round7标签；截图 `docs/evidence/local/round11/08-final-wait-panel.png`，观察/计时和初末字节证据同目录，均忽略。

runtime25文件签名 `aa10038a666fcea893a5501f09723d2427aabee4b433bd0122060e0ea7264e93`，收据 `.local/runtime-sync/runtime-build.json`，模板备份 `.local/runtime-sync/20261009-035421-322e7883944d485b873d7c31053b2dc8/previous-template`。旧轮作者作品、Windows开发包、槽位与APPDATA玩家数据保持。

## 下一具体单元

```powershell
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round11
npm.cmd run test:director
npm.cmd run test:graph-input
```

下一作者单元优先审查一种原生动作/转场的集中编辑路径，明确目标、资源、时长单位、next及完成/跳过关系，继续复用原生控件和局部写回。先制定有限契约再实现，保存/重开/实际播放独立验收。跨分支、完整时间轴、面板内历史/恢复和AI接力仍为独立范围。

修改vendor后从本轮完整tree增量导出下一补丁。停editor后 `baseline:build` → `editor:build`；不并发Terre两workspace，不在runtime重建parser时执行parser依赖测试/生成器/封存。构建后再次检查翻译目录等生成源码并审查进补丁，不能忽略未知改动。保留模板备份和作者文件；普通作品共用模板，自带入口另行升级。

作品改稿后暂停写入，显式 `npm.cmd run game:seal -- -GamePath '<作品目录>' -Action Update` 并重开。用户已授权公开Git、工具安装和Computer Use；付费及正式发行另行处理。
