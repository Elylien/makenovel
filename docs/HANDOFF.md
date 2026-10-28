# 交接与恢复

记录：2026-10-28，MakeNovel **0.0.19** / `main`，产品代码基线 `588bd81`。远端 `https://github.com/Elylien/makenovel.git`。下一会话由 **ChatGPT Astra** 接手；这是项目交接安排，本次没有更改会话模型或创建新会话。

## 接手方式

用户已授权自主规划、开源源码维护、必要工具安装、工具调用与 Computer Use，并要求一批多做功能后集中测试。项目取消固定轮数/单元大小、无关任务串行、旧轮次范围禁令和重复确认要求。可根据工程事实调整方案、改进 vendor、使用并行代理；N/M/G 是追踪标记。现有正确性机制与未实现能力如实记录，需要改变时连同实现和验证一起推进。

[当前状态](PROJECT_STATUS.md)概括完成/未完，[总回顾与安排](PROJECT_REVIEW_AND_ROADMAP.md)列全部工作线，[测试入口](TESTING.md)列可运行检查。私有原件继续按用户原要求留在 `docs/private/`，不提交或上传。

## 已核实的现场

- 2026-10-28：3000/3001 无监听；旧 PID48968 不存在。`process.json` 留有旧身份，不能据此判断服务运行或直接杀进程。本次没有重启服务、操作 GUI 或导出新包。
- 开始本次文档整理时，根仓只有 STATUS/HANDOFF 的外部毕业设计尾注及两个预期 dirty vendor；产品代码为已推送 `588bd81`。提交后状态以 Git 为准。
- 本次检查 Terre **12/12**、runtime **7/7** 已应用补丁反向通过，原有 **464 项**保留摘要通过。没有重跑独立补丁重放、579 项业务回归、构建或实机验收。
- 文末外部尾注原样保留，排除公开提交。副本在 `.scratch/round17-external-*.md`；尾注提及的 DOCX 当前原路径缺失，需另行找回或定位。

恢复可先执行：

```powershell
git status --short --branch
git submodule status
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue
npm.cmd run patch:check
npm.cmd run patch:runtime:check
```

## 已完成的最新功能与证据

第十八轮交付单对白就绪解锁和最小台词/语音收藏。第十九轮交付空场景作者往返、7 个 Enter 入口的组合态保护、BOM 首节点修复、本地 AI 查询/提案/提交及真实 GUI 接力；过期提案和缺素材写入拒绝，17 个节点 ID 与无关字节保留。round19 从标题分别走通两路线并回标题。

第十九轮历史验证：8 个唯一代码入口 **579/579**；Terre 十二补丁独立重放 **18/18**；runtime 构建 106.066 秒、Terre 构建 277.898 秒；服务 **22/22**、HTTP 引擎 **25/25**；39 文件封存。公开记录见[第十九轮](evidence/2026-10-27-round19.md)，原始记录在 `docs/evidence/local/round19/`。`checks-summary.json` 是最终去重汇总，frontend 文件保留修复前失败，backend 的通用 TAP 计数器 0 不代表实际 Jest 没运行（14 套/124 项）。

这些不等于真实 IME、完整 N2/N4/N5、全部 AT、当前 Windows 包或正式发行。当前 AI 是 loopback CLI/内部函数；无模型聊天、MCP、路线执行、自动画面检查或多文件事务。

## 可直接推进的下一批

| 工作线 | 可做的具体结果 | 验证出口 |
| --- | --- | --- |
| 当前 Windows 包 | 用 round18 检验收藏/单对白解锁，用 round19 检验作者/AI 两路线；选用现有作品或制作新的集成作品，导出到新目录 | 来源/ASAR 核验后，停止本项目开发服务，实际 EXE 普通/快速保存→正常退出→重启→恢复；新增收藏和解锁各自留证 |
| 作者与 AI 合批 | 从实际常规制作断点选择无代码分支/站位等作者功能，同时补相应 AI 原生命令、素材/配音清单或运行验证 | 图形→源码→AI→图形、保存重开和正常播放；冲突/未知内容/缺资源有对应结果 |
| 中文输入与工具排查 | 在可用宿主记录真实候选选词、Enter/Escape、焦点/组合键；按工具返回重测桌面通道 | 系统候选与最终文本的实际证据；不可用时记该项阻塞，继续独立工程工作 |
| N5 集成 | 合流两人物、两路线、音画/天气/动作、调用返回/变量结局、三类存档、历史/收藏/流程图及恢复 | 从标题正常运行，两路线及播放模式/恢复组合有浏览器与当前 EXE 分层证据 |

上表是建议切入点，不是固定顺序或每轮上限。可把共享依赖的功能一次完成后集中测试。中长期作者、玩家、资源、恢复、插件、第二作品、性能与发行清单见总回顾。

当前服务已停；需要作者界面/CLI 时启动并核对实际 URL：

```powershell
npm.cmd run editor:start
npm.cmd run author:tools -- capabilities
```

Windows 导出脚本可在开发服务未启动时运行，先复核候选作品和当前构建凭据：

```powershell
npm.cmd run game:seal -- -GamePath '.local/editor-profile/games/makenovel-round18' -Action Verify
pwsh -NoLogo -NoProfile -File scripts/Sync-Runtime.ps1 -Action Check
npm.cmd run game:export -- -GamePath '.local/editor-profile/games/makenovel-round18' -OutputName 'MakeNovel Current Windows Check'
```

这些是下一步命令，本次未执行导出。导出目录由脚本加入时间/随机后缀；实际 GUI 验证前核对 profile 并保留已有玩家数据。若来源或构建凭据过期，按脚本流程停编辑器，`baseline:build`→`editor:build` 后再导出。普通作品使用共享模板，自带入口作品使用自己的引擎。作品改稿后显式更新封存清单，旧 Verify 结果不沿用。

## Windows 与 Computer Use 的准确边界

最近实际 Windows 包是 `.local/exports/MakeNovel Round17 20261027-120942-bee75e/`，对应 0.0.17 与六补丁 runtime，已有正常重启恢复证据。当前七补丁引擎尚未重新导出/验收，**不是当前新包验收失败**。Web 构建不更新旧 EXE；该包是播放器，不包含完整桌面编辑器与 AI 服务。

上次工具诊断中，Chrome 标签截图坐标点击链接成功；新开 Chrome 原生窗口并绑定窗口时，工具因不能可靠识别当前 URL 强制停止。定位到原生浏览器窗口校验阶段，内部原因尚不明。本次没有重试，不能宣布修复；也不能推导 WebGAL.exe 同样被阻止。遵从当时工具结果，并在后续允许的会话继续独立任务。详见[复核记录](evidence/2026-10-28-documentation-review.md)。

## 来源与作品定位

| 对象 | 当前记录 |
| --- | --- |
| WebGAL HEAD | `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85` |
| Terre HEAD | `cf73dd58535d3ef15bddf0852adee153fa92d7da` |
| runtime 七补丁完整树 | `cfcb56adef2eff807372ad3de7beaaccf3f24e0c` |
| Terre 十二补丁完整树 | `1881fb345e93da773e7381be80f89201fabfdd16` |
| Terre0012 | 8 文件，11261 bytes，SHA256 `1e72d5297fd7594b97d4463730ab2d165169f26764a395b418c9a68e36f9aa28` |
| runtime 构建收据 | `.local/runtime-sync/runtime-build.json`，builtAt `2026-10-27T08:06:50.9419104Z` |
| round19 projectId / Game_key | `17eef852-e529-4915-90b5-1ca991d4e96a` / `313d6ec912f2104` |
| round19 manifest | `ff210e88930911871363999ca8545a36bf3ebf9119cb8c119c6511836c0a6c56`，39 文件 |
| round19 story revision | `e162066a811d380cf4b6647150f922bdb294d995a537f213f0ee527e8dcb19cf` |

启服后编辑器路径 `http://127.0.0.1:3001/#/game/makenovel-round19`，播放器路径 `http://127.0.0.1:3001/games/makenovel-round19/`。round18 用于收藏/单句就绪专门回归，round19 用于作者/AI/两路线；当前标签页不证明服务可达。两作品保留原模板和原创占位素材，部分图上有旧 Round18 字样，未交付新正式美术。

下一补丁可从上述完整树导出 Terre0013 / runtime0008。`.scratch/round19-preserve.py check` 可复核旧数据，不重新初始化旧基线。提交公开文档时仅暂存 STATUS/HANDOFF 外部尾注之前的内容，尾注与私有资料继续留在工作区。
