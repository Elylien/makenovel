# 交接与恢复

记录：2026-10-27，MakeNovel `0.0.17` / `main`，远端 `https://github.com/Elylien/makenovel.git`。提交与推送以现场 Git 核对为准。

## 恢复先核查

```powershell
git status --short --branch
git submodule status
npm.cmd run patch:check
npm.cmd run patch:runtime:check
Get-Content -LiteralPath .local/editor-runtime/process.json
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue
```

先读 PROJECT_STATUS、DEVELOPMENT_PLAN、TESTING、DIRECTOR_EDITING、KNOWN_ISSUES。私有输入只留 docs/private，禁止 stage/upload。两 vendor HEAD 保持锁定上游，工作树有意应用补丁；不要 reset/clean、暂存 gitlink 或创建嵌套提交。状态与交接文末的毕业设计任务尾注属于另一个未提交任务，继续保留且不要顺带提交。

## 第十七轮结果

普通作品导出新增当前源码/构建收据→共享模板→最终 ASAR 的精确文件校验，覆盖壳入口、原生 manifest 替换、SW移除及作品全部字节。自带入口的作品保留自身引擎并标记 self-contained，不冒用共享构建凭据；没有 manifest 的引擎明确拒绝。

16/16导出回归通过，runtime6/6、Terre11/11反向检查、收据检查、HTTP25/25、服务22/22和保留29/29通过。本轮复用已有构建，没有新增 vendor patch、runtime/Terre构建或独立重放；第十六轮355项不算本轮重跑。范围见 [本轮证据](evidence/2026-10-27-round17.md)。

新Windows包 `.local/exports/MakeNovel Round17 20261027-120942-bee75e/`，运行整个目录中的 `WebGAL.exe`；未签名开发包。ASAR `e799b1c045f4acd44d8560bab4ccfe3da60014e82dcc75d27737ac5348d45090`，EXE `1094293cd271c3ae2d29cf55c664adca0a0260c2e21983846691f13a19fd309d`。最终41个public文件、15个game文件通过校验。

开发服务无监听时，真实Windows窗口完成普通槽1和快档保存、人物关闭后的快读、Alt+F4退出、重新启动后的普通档/快档/流程图恢复。普通槽1时间为 `2026/10/27 12:16:05`，检查点STABLE，两人物与橙色人物终态正确；“动画章节”已解锁，“准备章节”仍锁定。第二次正常退出后该包进程为零。CLI两次12秒启动采用受控结束，仅是独立冒烟；全机断网、强杀/断电与完整恢复矩阵未验收。

## 当前进程与作品

本轮开始时旧记录PID36088不再对应受控编辑器，停止命令曾因身份不匹配拒绝，未停止未知进程；后续核对该PID已不存在，项目入口及3000/3001均无进程/监听。GUI验收始终在开发服务不存在时进行。

结束后已恢复编辑器：PID **48840**，UTC启动 **2026-10-27T04:23:01.2316257Z**，入口 `vendor/WebGAL_Terre/packages/terre2/dist/src/main.js`，仅 `127.0.0.1:3001`，3000无监听。停止前重新核对PID/时间/入口；记录与日志在 `.local/editor-runtime/`。Windows包当前已正常关闭，未改变用户浏览器标签。

编辑入口 `http://127.0.0.1:3001/#/game/makenovel-round16`；独立播放器 `http://127.0.0.1:3001/games/makenovel-round16/`。本轮复用该样片没有改稿，projectId `22e62d06-9df3-44af-b54a-46417522f8e2`，Game_key `makenovel-round16-8b9dc5a4-1ce1-4dda-80b4-ffde81533979`，14文件manifest `e3598c67cc66be7e393129cd2fbbe256068c46c5db9349a558ed85fc29b08259`。start SHA256 `750a55bc9a1f092974f23d1c7791571fae149b646d9f362eefadf0de227e2bfb`，motion `3d19e6b30b05f0eca074612fd4bf9f397670d56f946e2bbb5de0c23557e016ce`。

本地证据 `docs/evidence/local/round17/`：`windows-acceptance.json`、`06-windows-restart-restored.png`、`09-windows-restart-quick-restored.png`、两份normal-exit进程记录及独立CLI报告。导出时收据保留当时not-run字段，后续GUI结论看独立验收记录。既有APPDATA的58文件备份位于 `.local/player-backups/round17-before-20261027-120008`，不要覆盖或用它清空当前玩家数据。

运行时六补丁完整树 `c81482167623cae5204a999f720ae6877be0f4ac`；Terre十一补丁完整树 `f1dbce8b346b235e96da095beee935341c77aa40`。WebGAL HEAD `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`，Terre HEAD `cf73dd58535d3ef15bddf0852adee153fa92d7da`。运行时收据 `.local/runtime-sync/runtime-build.json`，引擎签名 `6ad117b5dd65caa8895ef06cd7fb8bc07ead0960d4562ac369c74e417b2f341b`，旧模板备份与所有旧样片继续保留。

## 下一具体单元

先核对现场与清单，再复现单对白场景在主图/有限演出结束后没有后续安全提交的流程图解锁边界：

```powershell
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round16
npm.cmd run test:runtime-restore
rg -n 'pendingUnlock|deferred|unlockNode|commit' vendor/WebGAL/packages/webgal/src/Core
```

沿原生生命周期选取明确安全事件，先写失败回归，再考虑runtime0007；不要新增播放器存档请求队列，不用定时轮询猜测稳定，不改变旧作品源码来掩盖问题。下一Terre0012从 `f1dbce8b346b235e96da095beee935341c77aa40` 导出，下一runtime0007从 `c81482167623cae5204a999f720ae6877be0f4ac` 导出。需要构建时先停editor，再baseline:build→editor:build；不并发Terre两workspace。独立重放时冻结patch/manifest。

作品改稿后暂停写入，再显式 `npm.cmd run game:seal -- -GamePath '<作品目录>' -Action Update` 并重开。真实IME、全机断网、异常退出及发行验收保持独立。用户已授权开源Git、工具安装和Computer Use；付费与正式发行分开处理。

## 2026-10-27 规划交接

用户要求先回顾整个流程并把后续安排写入文件。本次仅完成 [总回顾与路线](PROJECT_REVIEW_AND_ROADMAP.md) 以及文档入口同步，没有执行第十八轮实现。恢复产品开发时先读该路线，再按上面的下一具体命令开展N1；之后按N2作者真实操作、N3收藏、N4本地AI接口和N5集成样片推进，不能跳过原有完整目标。

本次重新核对两子模块HEAD、runtime6/6和Terre11/11已登记补丁、Git原有修改及实际进程；编辑器PID48840/UTC启动2026-10-27T04:23:01.2316257Z仍匹配，未重启、未重建。没有重跑产品GUI或Windows包测试；最后产品结果见第十七轮。两份毕业设计尾注和私有输入继续排除于本次提交。
