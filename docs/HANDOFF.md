# 交接与恢复

记录：2026-10-09，MakeNovel `0.0.10` / `main`，远端 `https://github.com/Elylien/makenovel.git`。提交与推送以现场 Git 核对为准。

## 恢复先核查

```powershell
git status --short --branch
git submodule status
npm.cmd run patch:check
npm.cmd run patch:runtime:check
Get-Content -LiteralPath .local/editor-runtime/process.json
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue
```

先读 PROJECT_STATUS、DEVELOPMENT_PLAN、TESTING、DIRECTOR_EDITING、KNOWN_ISSUES。私有输入仅在忽略的 `docs/private/`，不得 stage/upload。vendor HEAD 保持锁定上游，工作树有意应用补丁；不要 reset/clean、暂存 gitlink 或创建嵌套提交。

## 第十轮结果

已有安全舞台命令可确认删除、相邻原块交换，作者注释保留，legacy 身份随所属命令，未登记行不因结构改动补 ID。等待/独立注释/空行/对白和动态/continue 均有边界。所有保留原生句子/位置复核；失焦/IME/pending/错误/旧确认与文本历史守卫生效。源文分析按不可变会话缓存。

真实界面执行夜景及 legacy SE 删除、表情顺序交换；取消无副作用，一次撤销回原已保存稿，重做保存重开成功。目标与后继原生预览从夜景/笑脸变为日景/常态；BGM缓冲和确认失效、高级/变量边界现场通过。两作者注释保留，14条其他原行原字节保持，剩余3个ID无新增。详见 [第十轮证据](evidence/2026-10-09-round10.md)。

代码 **531/531** = 作者415（导演82/图形81）+样片12+资源/恢复104。前端tsc、受控runtime→Terre构建/同步、HTTP25/25、服务22/22、七补丁独立重放18/18通过。未重跑完整runtime339，未出新Windows包；第八轮EXE验收保持历史性质。

新0007 SHA `32d9a1cd5bca8394e1b1e701d8572b2171b6652722139da7590a696786396ae4`，完整tree `88fc8d1c98e50326f2028d390683bb2fece1ca37`，增量基树 `cae19ae2f2d9619016fbb726b442923a28fdbb4d`。Terre1–6与runtime1–4旧字节不变。两上游HEAD：Terre `cf73dd58535d3ef15bddf0852adee153fa92d7da`，WebGAL `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`。

## 当前进程与作品

编辑器 PID **27532**，启动UTC **2026-10-08T17:53:45.2043555Z**，入口 `vendor/WebGAL_Terre/packages/terre2/dist/src/main.js`，仅 `127.0.0.1:3001`，无3000服务。停止前重新核对PID/时间/入口。无本轮测试EXE。

作品 `.local/editor-profile/games/makenovel-round10`，显示名“MakeNovel 第十轮导演删除与排序验证”，projectId `6b240ecf-6024-4f6c-a150-e7b0984e6b1f`，Game_key `makenovel-round10-4982aa24-fa7b-42ad-98fa-84170e069281`。初始manifest `1b6abc47729eec3000b3a15b628aa02b178883d4d1c312a837c3e8fb45dc3d69`；GUI真实保存后已Update封存并verify，最终manifest **`0a81a06bf67b1d2260e1aa3e095ffa4df163d2729bf2b9c7acd93d76fe418193`**，19文件。原manifest备份位于 `.local/manifest-backups/6b240ecf-6024-4f6c-a150-e7b0984e6b1f/`，不要重新生成覆盖作者目录。

start最终SHA `6acc359007854a2f7a073648db0a011f5a765a32569f57309eed872115130e26`，目标已从17移到16，后继17；smile仍带r10-smile在12、neutral未登记在13，注释在9/15。readonly未变，SHA `83dde74c379af86e6022890016c9b31d597be0d1c1b6d214c71cbf65b30079ff`。GUI最后处于start场景、已保存、无撤销/重做、预览关闭、面板关闭。浏览器tab11为本轮交付，截图 `docs/evidence/local/round10/07-final-panel.png`；日志、初末源码与GUI记录同目录，均忽略。

引擎25文件签名 `aa10038a666fcea893a5501f09723d2427aabee4b433bd0122060e0ea7264e93`，收据 `.local/runtime-sync/runtime-build.json`，同步备份 `.local/runtime-sync/20261008-175320-20e1be6f7af846689fd49d1f26f4a0aa/previous-template`。旧轮作者作品、Windows开发包、槽位与 `%APPDATA%/webgal-electron-project` 数据继续保留。

## 下一具体单元

```powershell
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round10
npm.cmd run test:director
npm.cmd run test:graph-input
```

下一作者单元优先检查原生 `wait`、`next`、动作时长及 `nobreak` 的实际关系，设计**有限等待时长编辑及执行顺序说明**。新契约落地前等待仍只读、不可删不可跨越。对每条可编辑时序明确单位、局部影响、IME缓冲、完整原生语义与一批撤销；实际执行和保存恢复另测。跨分支舞台、完整时间轴、面板内历史/恢复、AI接力保持独立范围，不用独立解析器或执行器替换上游。

修改vendor后从本轮完整tree增量导出新补丁，停editor后 `baseline:build` → `editor:build`。不并发Terre两workspace，不在runtime重建parser时运行依赖parser的测试/封存/生成器。保留模板备份和作者文件；普通作品共用模板，自带入口另行升级。

作品实际保存改动后暂停写入，显式 `npm.cmd run game:seal -- -GamePath '<作品目录>' -Action Update` 并重开。版本门禁不推断旧档兼容。用户已授权公开Git、工具安装与Computer Use；付费服务和正式发行另行处理。
