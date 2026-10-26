# 交接与恢复

记录：2026-10-27，MakeNovel `0.0.16` / `main`，远端 `https://github.com/Elylien/makenovel.git`。提交与推送以现场 Git 核对为准。

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

## 第十六轮结果

流程图首对白遇到瞬态舞台门禁时保留同场景/会话/存储范围的解锁请求，下一安全原生提交重试；初始化完成也可处理仍有效请求，动画完成本身不触发。永久失败一次，清除进度取消旧请求。普通/快速存档仍明确拒绝不稳定快照，不增加玩家存档队列。单句场景可能没有重试机会，已开始落盘不能撤销。

聚焦代码 355/355（恢复87、播放12、样片3等十三项），受控构建通过，runtime 六补丁独立重放18/18；最终 runtime6/6、Terre11/11检查，HTTP25/25、服务22/22、保留28/28。新 GUI 确认稳定点历史/流程图/快存恢复、刷新后恢复及有限自动/快进边界。完整证据和未运行项见 [本轮证据](evidence/2026-10-26-round16.md)。

runtime 0006 SHA256 `9977e84d68d9593df0d5bf83e0bb18880bbfd526f5e3328319ed2c1d8fc3d11c`，10502 字节，六补丁完整树 `c81482167623cae5204a999f720ae6877be0f4ac`。Terre 十一补丁完整树仍为 `f1dbce8b346b235e96da095beee935341c77aa40`，本轮未重做 Terre 独立重放。WebGAL HEAD `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`，Terre HEAD `cf73dd58535d3ef15bddf0852adee153fa92d7da`。

## 当前进程与作品

构建前受控停止 PID14260，完成 runtime → Terre 构建和模板同步后重启。当前 PID **36088**，UTC 启动 **2026-10-26T15:38:34.6777003Z**，入口 `vendor/WebGAL_Terre/packages/terre2/dist/src/main.js`，仅 `127.0.0.1:3001`，3000 无监听。停止前重新核对 PID/时间/入口；记录与日志在 `.local/editor-runtime/`。本轮未生成 EXE。

编辑入口 `http://127.0.0.1:3001/#/game/makenovel-round16`；独立播放器 `http://127.0.0.1:3001/games/makenovel-round16/`。作品 `.local/editor-profile/games/makenovel-round16`，projectId `22e62d06-9df3-44af-b54a-46417522f8e2`，Game_key `makenovel-round16-8b9dc5a4-1ce1-4dda-80b4-ffde81533979`。14 文件 manifest `e3598c67cc66be7e393129cd2fbbe256068c46c5db9349a558ed85fc29b08259`。start SHA256 `750a55bc9a1f092974f23d1c7791571fae149b646d9f362eefadf0de227e2bfb`，motion SHA256 `3d19e6b30b05f0eca074612fd4bf9f397670d56f946e2bbb5de0c23557e016ce`，未做作者改稿。

播放器从正常标题进入，未用作者跳句验证存档。快速槽停在 STABLE；流程图“动画章节”快照为同一稳定点。整页刷新后两者实际读回。最终停在已解锁流程图界面，独立播放器标签保留为本轮输出；原 Round13 播放器与 Round15 编辑标签未替换，未改变测试视口。恢复时以现场标签为准。

本地证据 `docs/evidence/local/round16/`，关键截图 `18-final-unlocked-flowchart.png`，GUI记录 `gui-observations.json`。有缺失 Live2D 与 Pixi 缓存警告。收据 `.local/runtime-sync/runtime-build.json`，引擎25文件签名 `6ad117b5dd65caa8895ef06cd7fb8bc07ead0960d4562ac369c74e417b2f341b`。最终模板备份 `.local/runtime-sync/20261026-153749-0615e093aa0742199b0e0b669929127e/previous-template`。保留旧样片、模板备份、玩家数据及开发包。

## 下一具体单元

先核查现场与封存，再为当前0.0.16建立一个新的Windows开发包：

```powershell
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round16
npm.cmd run game:export -- -GamePath '.local/editor-profile/games/makenovel-round16'
```

对本次返回的完整输出目录运行 `integrations/windows-export/Verify-Package.ps1 -PackagePath '<本次输出目录>'`。先检查导出源码和当前引擎凭据，再验证关闭本项目开发服务后的正常启动、稳定点保存、正常退出和重新启动恢复。保留已有 APPDATA 玩家数据，精确区分同版重启与跨版本隔离；旧 Windows 记录不能代替当前版本。全机断网、强杀/断电、真实中文 IME 和完整矩阵继续单列。若发现更高优先级原生缺口，先复现并收窄单元，不顺带扩大范围。

下一 Terre 补丁0012从 `f1dbce8b346b235e96da095beee935341c77aa40` 导出，下一 runtime 补丁0007从 `c81482167623cae5204a999f720ae6877be0f4ac` 导出。停 editor 后 baseline:build → editor:build；不并发 Terre 两 workspace，不在 parser 重建时运行依赖测试或封存；独立重放时冻结 patch/manifest。

作品改稿后暂停写入，再显式 `npm.cmd run game:seal -- -GamePath '<作品目录>' -Action Update` 并重开。用户已授权开源 Git、工具安装和 Computer Use；付费与正式发行分开处理。
