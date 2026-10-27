# 交接与恢复

记录：2026-10-27，MakeNovel `0.0.18` / `main`，远端 `https://github.com/Elylien/makenovel.git`。提交与推送以现场 Git 核对为准。

## 恢复先核查

```powershell
git status --short --branch
git submodule status
npm.cmd run patch:check
npm.cmd run patch:runtime:check
Get-Content -LiteralPath .local/editor-runtime/process.json
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue
```

先读 PROJECT_STATUS、DEVELOPMENT_PLAN、PROJECT_REVIEW_AND_ROADMAP、TESTING、KNOWN_ISSUES。私有输入只留 docs/private，禁止stage/upload。两vendor HEAD保持锁定上游，工作树有意应用补丁；不要reset/clean、暂存gitlink或创建嵌套提交。状态与交接文末毕业设计尾注属于外部未提交任务，保留且不要顺带提交。

## 第十八轮结果

N1：用图片/舞台/演出等原生就绪事件唤醒单对白流程图待解锁请求，重查场景、会话、存储世代和安全门禁；取消后清理订阅，不用定时轮询。旧引擎READY锁定已实机复现；新引擎图片就绪和MOTION唯一对白的8秒动画自然结束后，节点均无需推进下一句即解锁。

N3：原生历史可收藏/取消，列表可检索、仅语音筛选、按时间排序和试听。文本/声音快照独立于存档，缺少稳定身份时标注版本内位置；版本间不自动迁移。声音按当前清单及字节校验后使用Blob试听，原剧情声仅静音且继续计时，停止恢复原值。Web Locks串行写入；不可用时修改拒绝；未知/损坏收藏不覆盖。玩家备份包含同作品不同版本收藏，清档保留收藏，清全部包含收藏。详情见[收藏说明](PLAYER_FAVORITES.md)。

15个代码入口451/451通过，runtime七补丁独立重放18/18通过；baseline:build→editor:build依次成功，共享模板已同步。服务22/22、HTTP25/25、保留441项和最终runtime7/7、Terre11/11检查通过。真实页面完成五条收藏、取消再新增、搜索/筛选/排序、位置回退说明、有效试听/停止、坏音频报错；旧快档和刷新后仍保留五条。原始结果在 `docs/evidence/local/round18/`，公开范围见[第十八轮证据](evidence/2026-10-27-round18.md)。

本轮没有新Windows开发包或原生窗口验收，不沿用旧包代替0.0.18验收。真实IME、完整作者流程、声音听感、全机断网/异常退出和性能未测。GUI也未另测跨标签竞争或重复点击去重；这些代码覆盖不能冒充实机。Live2D缺库和Pixi重复纹理警告继续保留。

## 当前进程、作品与补丁

构建前按身份停止旧编辑器PID48840，构建后恢复新进程：PID **20576**，UTC启动 **2026-10-27T06:29:58.5616584Z**，入口 `vendor/WebGAL_Terre/packages/terre2/dist/src/main.js`，仅 `127.0.0.1:3001`，3000无监听。停止前重核PID、时间和完整入口；记录及日志在 `.local/editor-runtime/`。本轮没有启动Windows包。

新样片编辑入口 `http://127.0.0.1:3001/#/game/makenovel-round18`；独立播放器 `http://127.0.0.1:3001/games/makenovel-round18/`，已保留浏览器预览。不要覆盖旧作品。新样片为程序生成SVG、合成测试音和原生脚本，不含商用素材或真人配音。

- projectId：`d8e42a57-745b-49f3-8c23-9fe3ab1dfe28`。
- Game_key：`makenovel-round18-dee98519-5af6-4a74-9832-6c839e91055e`。
- manifest：`876a927a2b4fe83cf57f218a812b8e074fd78aeb767189df1ae97d7cf27d8cc0`，18登记文件。
- WebGAL HEAD：`d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`；Terre HEAD：`cf73dd58535d3ef15bddf0852adee153fa92d7da`。
- 运行时七补丁完整树：`cfcb56adef2eff807372ad3de7beaaccf3f24e0c`；Terre十一补丁完整树：`f1dbce8b346b235e96da095beee935341c77aa40`。
- 0007补丁：`6679062bf1bc118d7ad84b1d66cb103128e15c99a0f4e24fec1111bcea17f3d4`。后续runtime0008从七补丁完整树导出，Terre0012仍从十一补丁完整树导出。
- 收据：`.local/runtime-sync/runtime-build.json`，builtAt `2026-10-27T06:26:16.5942188Z`；25引擎文件签名 `5bace677fc357d14e96096fea6fb18fafd6cb9ac6eda1819cdbc7a53c182fe26`。

收藏演示操作保留在当前新作品玩家空间，READY快档早于所有收藏。重新测试时创建新隔离作品，不清空既有玩家数据。作者跳句预览不应写入正式玩家收藏；需要验证时从独立播放器正常标题进入。

## 下一具体单元

用户希望一轮合并更多功能后测试。下一批优先N2作者完整操作/真实IME，并推进N4本地AI接口的首个可审阅草稿流程。先确认当前作品与原生编辑会话，再选择新的隔离作品执行新建→逐句改稿→素材配置→保存/切换→预览→导出；记录真实输入法事件和失败场景，不能用合成composition事件代替IME验收。

```powershell
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round18
npm.cmd run test:source-input
npm.cmd run test:director
```

先完成本批实现再集中运行相关检查；只有新失败、源码变化或剩余风险才扩展重测。AI草稿仍须保持原生来源身份、版本冲突和用户可审阅写回，不让未完成草稿进入活动运行时；不把外部服务、收费或正式发行默认为已配置。

需要构建时先停editor，再baseline:build→editor:build；不并发Terre两个workspace构建。导出补丁后冻结来源再做独立重放；后续改动须重新导出与构建。普通作品共享引擎已更新，自带入口的旧作品不会自动换引擎。作品改稿后暂停写入，再显式 `npm.cmd run game:seal -- -GamePath '<作品目录>' -Action Update` 并重开。

N5及完整G1—G5仍见[总回顾与路线](PROJECT_REVIEW_AND_ROADMAP.md)。第十七轮Windows目录包、旧模板备份、旧样片、玩家备份和文档外部尾注全部保留。
