# 交接与恢复

记录：2026-10-27，MakeNovel `0.0.19` / `main`。远端 `https://github.com/Elylien/makenovel.git`；提交与推送以现场 Git 为准。

## 恢复先核查

```powershell
git status --short --branch
git submodule status
npm.cmd run patch:check
npm.cmd run patch:runtime:check
Get-Content -LiteralPath .local/editor-runtime/process.json
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue
```

先读 PROJECT_STATUS、DEVELOPMENT_PLAN、PROJECT_REVIEW_AND_ROADMAP、TESTING。禁止 stage/upload `docs/private/`。两 vendor HEAD 保持锁定上游，工作树有意应用登记补丁；不要 reset/clean、暂存 gitlink、创建或发布嵌套提交。文末毕业设计尾注属于外部任务，保留但不提交；原始尾注副本在 `.scratch/round17-external-*.md`。

## 第十九轮结果

N2：通过用户新开的 Chrome 窗口，用截图坐标点击完成新建独立作品、原生上传、空场景图形→源码→图形→保存/重开。封存后从标题正常走完两条路线，各自到达共同结尾并回标题。AI 新增后经界面微调再续写的最终台词实际显示。没有使用作者跳句作为路线验收。

七处 Enter 入口补组合态与 229 保护，真实组件回调 21/21；系统候选窗、选词 Enter/取消与各宿主完整矩阵仍未验收。共享分析只在解析副本去首 BOM，原生 parser 本体不改；导演节点 raw/originalRaw 排除文件 BOM，整个文档保留原字节。集中回归发现的首行编辑/恢复失败均已修复并保留失败前后日志。

N4：`integrations/author-tools/` 提供 loopback CLI/函数，查询、提案、审阅摘要、校验和已有 revision/workspace 写回事务；公开入口见 [AI_AUTHORING](AI_AUTHORING.md)。独立空上下文代理经真实工具完成插入→图形界面微调→旧稿冲突拒写→新稿继续，17 ID 和其他字节不变；缺素材拒写且原稿不变。无模型服务、MCP、自动封存/运行路线、多文件事务或递归素材完整检查。

八个代码入口579/579，Terre十二补丁独立重放18/18，最终反向Terre12/12、runtime7/7；两个受控构建均成功，服务22/22、HTTP25/25、保留464项、39文件封存复核通过。原始日志及截图在 `docs/evidence/local/round19/`，公开摘要见[本轮证据](evidence/2026-10-27-round19.md)。不得直接相加各 checks JSON：frontend 是修复前失败记录，backend 的通用 TAP 计数器显示0，实际 Jest 日志是14套/124项；最终去重汇总为 checks-summary.json。

## 进程、作品与来源

构建前按身份停止旧 PID20576；当前 PID **48968**，UTC 启动 **2026-10-27T08:16:28.7830462Z**，入口 `E:/kaifas/game/makenovel/vendor/WebGAL_Terre/packages/terre2/dist/src/main.js`，仅 `127.0.0.1:3001`；3000 无监听。停止前重核 PID、时间和入口。日志及身份在 `.local/editor-runtime/`。本轮未生成或启动新的 Windows 包。

- 编辑器：`http://127.0.0.1:3001/#/game/makenovel-round19`；播放器：`http://127.0.0.1:3001/games/makenovel-round19/`，已保留标签页。
- projectId：`17eef852-e529-4915-90b5-1ca991d4e96a`；Game_key：`313d6ec912f2104`。
- manifest：`ff210e88930911871363999ca8545a36bf3ebf9119cb8c119c6511836c0a6c56`，39 文件。
- 最终 story revision：`e162066a811d380cf4b6647150f922bdb294d995a537f213f0ee527e8dcb19cf`。已停止作者写入并封存；继续改稿后需显式 Update，不自动沿用旧清单。
- WebGAL HEAD：`d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`；Terre HEAD：`cf73dd58535d3ef15bddf0852adee153fa92d7da`。
- runtime 七补丁完整树：`cfcb56adef2eff807372ad3de7beaaccf3f24e0c`；Terre 十二补丁完整树：`1881fb345e93da773e7381be80f89201fabfdd16`。
- 0012：8 文件，11261 bytes，SHA256 `1e72d5297fd7594b97d4463730ab2d165169f26764a395b418c9a68e36f9aa28`。下一 Terre0013 从十二补丁完整树导出；runtime0008 从七补丁完整树导出。
- runtime 收据：`.local/runtime-sync/runtime-build.json`，builtAt `2026-10-27T08:06:50.9419104Z`；25 个共享引擎文件已由真实作品 URL 比对。

新作品保留原生模板资源，人物/背景复用旧轮次原创 SVG，画面上旧 Round18 字样是测试素材，不是新的美术交付。没有复制商业参考游戏素材。旧作品、私有输入、旧补丁和毕业文档尾注464项摘要保持。

## 下一具体单元

```powershell
python .scratch/round19-preserve.py check
npm.cmd run game:seal -- -GamePath '.local/editor-profile/games/makenovel-round19' -Action Verify
npm.cmd run author:tools -- capabilities
```

不要重新初始化保留基线。后续用新隔离作品做系统 IME 和剩余作者流程，再扩展必要 AI 原生提案能力与运行验证，推进 N5 的完整演出/声音、路线、存读档/历史/收藏和接力；不能把本轮静态双路线替代完整 N5。真实 IME 需系统候选和实际选词/取消证据，粘贴、模拟 composition 和浏览器按键不能替代。当前代码回归入口见 TESTING，历史Windows验收仍只适用于0.0.17。

Computer Use 已通过用户新开 Chrome 窗口正常控制；优先使用当前实际可读的标签和截图坐标。旧自动导航403来自来源守卫，未改守卫；历史原生窗口无法确定 URL 的安全停止不代表所有浏览器都不可用。如果原生输入法检查再次被工具强制停止，遵守停止并如实记录，不绕过策略。

需要构建时先停编辑器，再 `baseline:build`→`editor:build`；冻结来源并重新导出补丁后重放。普通作品共享模板，自带入口的旧作品不会自动换引擎。修改作品后暂停写入，再显式 `game:seal -Action Update`，重开并核验。完整未完范围见 [PROJECT_REVIEW_AND_ROADMAP](PROJECT_REVIEW_AND_ROADMAP.md)。
