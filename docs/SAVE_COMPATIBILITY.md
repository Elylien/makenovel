# 存档版本与完整备份

更新：2026-10-08，MakeNovel `0.0.6`；首次源码核查为 2026-10-07，基线为 WebGAL `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`（4.6.5），最初核查时该子仓无修改。第四轮随后新增根画布 CSS 补丁，未改存档协议。下文保留当时的源码审查；第五轮已实施版本门禁、完整备份与异步恢复，跨版本迁移仍未实现。第五轮已对最终新包完成同一导出作品的一槽正常退出重启及父子场景返回验证；浏览器也已实测版本变化拒绝。两者不证明跨版本迁移或异常退出耐久性。

## 第五轮协议

作者停止修改作品后，运行 `npm.cmd run game:seal -- -GamePath '.local/editor-profile/games/作品目录' -Action Init`。已有清单使用 `-Action Update`；只读复核使用 `-Action Verify`。入口默认 Verify，不隐式创建或替换身份。工具需要已构建的锁定原生 parser；例如先完成 `npm.cmd run baseline:build`。

`game/makenovel-manifest.json` 记录 schema 1、稳定 projectId、原生 Game_key、runtimeCompatibilityId、所有 game 文件的原字节 SHA256/大小以及清单 hash。清单本身及零字节 `.gitkeep` 占位文件不纳入文件集；非空 `.gitkeep` 拒绝封存。再次登记保留 projectId 和 Game_key；身份变化、未知字段、链接/目录联接、不安全路径或并发修改均拒绝。旧清单原字节备份保存在作品外 `.local/manifest-backups/`。锁只协调本工具，作者应暂停其他写入；不承诺非协作 writer 最后瞬间竞态隔离。

播放器使用 `makenovel-v1:<projectId>:<manifestHash>` 作为原生存储前缀，ISaveData 及 backlog 增加 `makenovel` 元数据，保留原生舞台、调用帧和数字索引。不同版本的槽、已读、鉴赏、全局变量、设置和流程图分开存储，不自动继承。没有有效清单时进入以 Game_key 的 SHA256 隔离的未核验命名空间，允许游玩与设置，暂停存读档。修改剧情后需要重新登记版本并重开游戏；旧版本进度不会被猜测迁入新剧情。

在原生用户数据规范化、槽加载和流程图初始化之前，播放器会完整读取旧 Game_key 组、由该旧键 SHA256 唯一派生的未核验设置根键，以及同 projectId 的全部版本数据，生成追加式备份，写后读回校验。内容未变化可复用已经校验的副本；容量不足、不可序列化值、读回失败会阻止后续初始化写入，并显示错误。系统设置提供“导出完整备份”和“校验备份文件”，替代原先只导出内存已加载槽、无验证导入覆盖的入口。导出涵盖全部持久化槽、快档、设置、已读、鉴赏、流程图及历史副本；只校验备份，不直接导入或迁移。旧 Game_key 若被多个作品复用，其来源仍不确定，备份不认证作者或原始归属。

保存与恢复前重新读取清单、验证所有已列文件的字节，并复读清单防止校验时重封。启动时也做相同复读。恢复还验证版本元数据、舞台基本结构、变量、演出类型、当前场景、全部父调用帧和 backlog 的原生解析指针。所有异步预检完成后才提交；失败保留当前原生状态。会话 epoch 处理慢请求、连续读档以及标题/开始/编辑器跳转旧回调。已经开始的数据库写入无法取消，过时完成不会提交到新 UI；不把这个边界声称为跨标签数据库事务。

## 启动、作者预览与两种 Game_key 用途

启动最早的 axios 配置响应用于取得原生 Game_key 并定位作品身份；通过 manifest 核对后，`infoFetcher` 必须改用本次已核验的配置原字节重新解析设置，不能把早先响应与更新后的版本混合。动画表、动画 JSON、模板 JSON 和模板 SCSS 同样使用校验期间保留的文本缓存，避免验证后立刻发出第二次请求取得另一版内容。未封存的作品没有这些已核验缓存，沿保守隔离模式加载。

`initializeScript` 等待 infoFetcher 完成版本选择和备份/存储初始化，再载入首场景、模板与动画；模板 loader 会等待样式请求完成。三者就绪后才绑定运行工具/编辑器同步并释放 `waitForRuntimeReady`。开始游戏等入口等待这个独立初始化屏障，不能只凭 manifest 的 ready 状态抢先执行。启动异常禁用玩家存储、报告原因、释放渲染 fallback 与初始化屏障，避免页面永久等待；这表示可继续显示错误/入口，不承诺任何缺失资源仍有完整演出。

作品的原生 `Game_key` 与运行时 `WebGAL.gameKey` 现在有不同职责：config、封存清单及编辑器预览注册的 gameId 保留作者的原始 Game_key；运行时玩家存储使用 `makenovel-v1:<projectId>:<manifestHash>`，由初始化协议赋值。显示配置的 React hook 可以更新标题、背景、Logo/BGM，但不能再把全局配置中的原 Game_key 写回存储字段，也不能因配置 effect 重读旧 namespace。发现原 Game_key 改变时应报告并使当前页面进入不可持久化状态，重新打开正确作品。

会修改变量/演出的作者预览指令（包括 legacy JMP、已读覆盖）在执行前调用 `markPreviewSession`。自动字体优化初始化 `preview.command.set-font-optimization` 是明确豁免项，不能因为页面正常设置字体而误禁玩家存档；只读查询同样不触发禁写。该标记在当前页面持续有效：清除已绑定存档版本、禁用玩家存储、增加 epoch，并取消等待中校验的有效性。稍后的 `setSaveStorageEnabled(true)`、初始化完成、返回标题或重新开始都不能解除；只读预览查询不触发这项禁写。这样预览注册仍能按原 Game_key 找到页面，同时作者试播不能写入正式玩家进度。重新打开独立玩家页面后才重新建立正常初始化链路。

已核验缓存和预览禁写并非所有并发源的事务快照：HTTP 上未列文件不可枚举，资源/任意外部插件的异步副作用仍需单独约束。三层门禁以及实际用户操作的测试边界见 [TESTING.md](TESTING.md)。

## 第六轮稳定对白存档门禁

精确版本协议继续生效。第六轮额外在原生快照生成前拒绝混合状态：已覆盖的有限演出（背景/立绘/差分切换、变换/动画、等待）尚未结束、Pixi 退场临时对象仍存在，或者菜单中保留待推进剧情时，普通存档和快档都失败并保留原槽。提示玩家返回剧情，在演出结束后的稳定对白处重新保存。

这个门禁不会把保存请求排队，也不自动回退最近检查点。第五轮存储层按 key 串行确认落盘的队列仍只是持久化机制，不是演出检查点选择。原生普通对白和持续环境演出沿既有行为；不能因此宣称任意 hold/插件状态均能安全保存。

菜单打开期间，演出可以按自身时钟结束，但等待结束的推进留在当前会话，不能在菜单背后越过剧情。返回时只执行一次仍有效的推进；会话切换、读档或标题会使过时请求失效。即使画面动画已结束，只要待推进尚未消费，菜单中的保存仍拒绝。

浏览器已验证：R6-06 后的 8 秒平移/等待期间打开菜单，等待结束仍停在 R6-06，保存被拒；返回只推进到 R6-07，稳定对白存档后可读回两角色姿态。另观察黑场清除立绘、BGM 停止与两路线 route=1/2。12 套本轮代码入口 301/301，包含既有七入口现 231 项与新五入口 70 项，相比第五轮净增 81 项；三补丁独立重放 18/18 另计。音频 DOM 状态不证明听觉质量，Windows 新包按 [第六轮记录](evidence/2026-10-08-round6.md) 独立记账，不沿用下文第五轮通过结论。

## 使用与限制

- 版本清单不是数字签名，不用于执行不可信游戏或验证发布者。game 内可信插件仍有完整原生权限。
- 浏览器只能验证清单列出的 HTTP 文件；新增未列文件由 CLI Verify 完整枚举发现。外部 URL 资源、清单以外文件及恶意同时写入不在完整性承诺内。
- 当前采用保守的整作品精确匹配。清单变化即新存储版本，未实现 nodeId 迁移、旧位图迁移或逐句收藏。
- 校验会读取全部已列资源，尚未优化大作品成本。beforeunload 不保证等待异步快档；关闭前应等待显式存档成功，异常退出/断电耐久性另验。
- 恢复同步渲染失败会尝试重建此前原生状态；任意插件、音频和外部副作用不能保证完全回滚。场景切换中明确拒绝发起恢复，避免跳过未完成的 call。资源失败、复杂 hold、全部菜单/快进组合及异常退出仍待补验。
- 浏览器存储清理、换 origin/profile、磁盘满及跨设备同步另有边界。下载备份应由玩家保管；本轮没有覆盖式导入。

## 第五轮实际验证范围

七个本轮代码入口合计 220 项：清单 33、备份 35、兼容 34、存储 35、初始化 16、原生恢复 55、UI 12。最后两项恢复回归分别证明自动字体优化不会误触预览禁写，而已读覆盖仍会禁写；旧逻辑下字体用例先失败，修复后通过。各套件与替身边界见 [TESTING.md](TESTING.md)。

本轮真实浏览器已验证普通槽的父子场景恢复：子场景 `letter=7`，返回父场景显示 `42/1`；读回再返回仍为 `42/1`。快档能从父场景回到子场景第二句。更改父场景 start 原始字节后，读槽被内容校验拒绝，当前子场景第二句保持；还原文件后继续执行返回 `42/1`。这验证了同版恢复与已列文件变化拒绝，没有做跨版本指针映射。

系统设置真实下载的完整备份包含 8 records 和 2 preserved；选择该下载文件后本地校验成功，未执行写回式导入。最终 Windows 开发包 40/40 文件核对一致；停止本项目 3000/3001 服务后，实际 EXE 子场景存槽 2、Alt+F4 正常退出并确认进程消失，再启动同一包读槽，恢复 `letter=7`→子场景第二句→父场景 `42/1`。

现场步骤与证据见 [第五轮记录](evidence/2026-10-08-round5.md)。上述没有覆盖全机断网、无开发工具的干净机器、异常终止/断电、声音或完整 DPI/输入法矩阵；普通退出成功和服务停止分别按实际范围记账，不能扩大为 Windows 完整发行验收。

## 上游原始协议（保留审查依据）

| 对象 | 锁定源码确认的行为 | 兼容含义 |
| --- | --- | --- |
| 普通槽 / 快速槽 | `ISaveData` 包含舞台、backlog、槽号、时间、`sceneData` 和缩略图；`sceneData` 为数字 `currentSentenceId`、当前 sceneName/URL、sceneStack、可选 currentLocals。没有 nodeId、源码 hash、构建号或存档 schemaVersion。[类型](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/store/userDataInterface.ts#L56-L74)、[生成快照](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/controller/storage/saveGame.ts#L17-L66) | 持久编辑 ID 尚未进入运行时协议。 |
| 指针 / 调用栈 | 执行器通常先递增 `currentSentenceId` 再记录 backlog；稳定停点里的数字常为下一条原生语句索引。调用帧 `continueLine` 保存调用点；返回时使用 `continueLine + 1`。[执行器](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/controller/gamePlay/scriptExecutor.ts#L131-L173)、[压栈](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/Modules/scene.ts#L54-L77)、[返回](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/controller/scene/restoreScene.ts#L14-L25) | 不能把这些数字统一当“当前显示台词所在行”，更不能全都替换为同一个 nodeId。注释和多行占位仍占原生索引。 |
| 读档 / 历史回跳 | 按保存的 sceneUrl 异步取得**当前文件**再解析；旧指针、栈、舞台与演出在请求完成前便开始恢复。没有场景版本匹配或完整异步失败回滚。[读档](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/controller/storage/loadGame.ts#L28-L75)、[历史恢复](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/controller/storage/jumpFromBacklog.ts#L20-L96) | 新源码配旧舞台可能恢复到错误位置；断网、慢请求、连续读两个槽还需独立验证。 |
| 已读 | 用户数据中的 `readHistory` 是 sceneName → Base64 位图，bit 对应数字语句索引；剧情变长只扩容，不重定位。场景切换/调用取路径末段为 sceneName。[位图](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/Modules/readHistory.ts#L87-L130)、[名称来源](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/gameScripts/changeSceneScript.ts#L9-L12) | 插入/删除/移动可误标已读；不同目录同名场景存在键碰撞风险。改台词而保留 ID 也不应自动继承已读。 |
| 流程图 / 收藏 | 流程图另存解锁集与 `ISaveData` 快照，键使用 flowchartId/nodeId；此 nodeId 是流程图节点 ID。快照创建未写 currentLocals，普通槽/backlog 则有。所核对的运行时类型和存储路径未找到逐句收藏结构；CG/BGM 鉴赏、历史和流程图均不能代替它。[流程图](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/Modules/flowchart.ts#L159-L189)、[用户数据](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/store/userDataInterface.ts#L76-L100) | 跨场景局部变量恢复和未来收藏迁移都不能由一槽验收替代。 |

实际 localforage 键为 `Game_key-savesN`、`Game_key-saves-fast`；用户设置、全局变量、鉴赏和已读放在 `Game_key`；流程图使用 `Game_key-flowchart...`。`Game_key` 从 config 读取，缺失时为空字符串；`gameName` 不是普通槽的命名空间。[槽存储](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/controller/storage/savesController.ts#L8-L35)、[配置读取](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/util/coreInitialFunction/infoFetcher.ts#L18-L29)。因此同一浏览器存储或 Electron profile 内，复制模板后复用 Game_key 可能串档；改名不自动隔离。存储 origin/profile 与作品身份必须分别核对。

## 第五轮不混用的五种标识

| 标识 | 用途与当前状态 |
| --- | --- |
| 作品身份 | 作者明确 Init 创建 projectId，Update 保留 projectId 与原 Game_key；二者和 runtimeCompatibilityId、manifestHash 一起绑定原生快照。复制已有清单仍表示同一作品副本，不自动当作新作品。 |
| 场景身份 / 场景版本 | 清单按 game 相对路径和完整原字节 hash 绑定整个作品版本；恢复时按 sceneUrl 取已核验文本交给原生 parser。场景 basename 和相同正文都不能证明跨版本兼容。 |
| nodeId | 当前注释 ID 表示作者认定的同一剧情节点；移动保留、复制新建。它不证明前文变量、分支和舞台仍兼容，也不等于流程图 nodeId。 |
| 源码修订 revision | 当前编辑器用整文件 SHA256 阻止陈旧写入；换行、注释或身份登记也会改变它。不是内容语义版本，更不是旧档可加载证明。 |
| 原生索引 / 槽号 | currentSentenceId、continueLine 和 UI lineNumber 有各自推进边界；槽号仅决定保存位置。它们都不提供持久剧情身份。 |

作者节点 ID 与源码 revision 仍由 Terre 的 scene-identity/text-file-transaction 维护；第五轮 WebGAL 接入的是独立的作品清单与原生快照元数据，并未把玩家数字索引替换成作者 nodeId。两类机制通过各自根补丁维护，不能互相充当迁移证据。

## 第四轮提出的保守策略及后续迁移约束

以下保留原设计的覆盖要求；第五轮已实现其中的精确版本门禁、备份与原生恢复预检。跨版本映射、恢复导入和插件事务仍不是已完成事项。

1. 新档在原生快照增加 `makenovel` 元数据，记录 projectId、Game_key、manifestHash 与运行时兼容常量，保留原生指针语义。普通槽、快存、父调用场景、backlog 和流程图快照共同检查。game 内插件文件受清单字节校验，game 外引擎/插件改动需另审兼容常量，不宣称已有独立插件迁移协议。
2. 第一阶段只自动接受身份与 manifest **精确匹配**的档。新版本中的节点都还在，也不能推出旧舞台、变量、返回值和演出可继续；新增前置 setVar、改分支/资源/插件、拆合节点均默认不兼容。
3. 无元数据旧档标为“来源版本未验证”，不得用当前行号、相邻节点、相同文本或模糊匹配静默迁移。只有拿到确切旧构建与源码，才能建立旧索引→旧节点→新节点候选映射；涉及重排/控制流变化仍需作者审查和实际恢复测试。丢失/重复 ID、缺失旧源、无法确定指针阶段时停止迁移。
4. 旧档保留为可导出的不可变备份；迁移结果写到新命名空间/新槽，不覆盖输入。版本不兼容提供“保留并导出 / 用旧版本作品恢复 / 从明确的新起点开始”，不能把失败当空档或自动清除已读、鉴赏、流程图进度及未来收藏。旧版本运行使用备份的可写副本，保留原备份。
5. 备份必须覆盖整个相关命名空间和来源标识，不能只复制一个槽。原生启动会补齐用户数据字段并可能写回，因此备份应先于升级程序初始化；Electron 文件级 profile 备份需在程序退出后进行。schema 不认识、坏 JSON、存储失败和迁移中断均保留原始数据。[现有补字段行为](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/controller/storage/storageController.ts#L101-L149)
6. 已读迁移按明确的作品/场景/节点与正文修订处理；不能直接把旧 bitset 套到新索引。正文变更可失去“已读”判定，但不应删除未来收藏本身；收藏需保留原文/语音引用与失效原因，而不是指向任意相似台词。

## 第四轮提出的最小验收目标（历史）

下面保留第四轮对后续单元的要求，不表示第五轮代码仍未实现，也不自动授予其中的实际 GUI/EXE 验收。第五轮已沿锁定执行器和可重放补丁接入兼容检查、备份与恢复门禁；仍不自动重定位不同剧情版本。最终构建/传播与现场证据需沿 [RUNTIME_PATCHES.md](integrations/RUNTIME_PATCHES.md) 核验。

- 给一个两场景 `callScene → return` 样片生成版本 manifest，在原生保存快照旁记录元数据；普通槽/快存的读入口先完成校验与场景加载，再原子切换本次会话状态。并发读档以会话代号取消过期请求，失败保留当前可玩状态。
- 新存储适配提供只读列举、完整导出、备份摘要与恢复验证；复用原生 `generateCurrentStageData` / `loadGameFromStageData`，不另造剧情执行器。只增加必要等待/错误处理和验证入口。
- 先做“同 manifest 可恢复、不同 manifest 明确拒绝、未验证旧档可完整导出”，再决定任何 ID 映射。全局用户数据和流程图旧快照保留，不混成已实现的逐句收藏。

| 最小验收 | 必须观察的结果 |
| --- | --- |
| 同版本正常槽与快存，真实 EXE 退出重启 | 对白、舞台、局部/全局变量按其原生范围恢复；子场景返回后续句仅执行一次。 |
| 当前场景、父调用场景分别插句/重排/改正文 | 新旧 manifest 不同则拒绝自动加载；旧槽、backlog、已读等备份摘要不变。inline ID 登记也先按版本变化处理。 |
| 缺旧源码、ID 缺失/重复、同名场景或错作品 | 给出具体不兼容原因，不猜匹配、不写回旧档。 |
| 慢加载、缺场景文件、连续读两槽 | 最后一次有效请求才生效；错误或过期请求不留下新旧场景混合状态。 |
| 坏档、未知 schema、写入失败/迁移中断 | 输入和备份均保留；可重试或导出；不清空进度、鉴赏或收藏。 |

以上是第四轮提出的验收目标；第五轮实现与实测状态以文首及 TESTING 为准。跨版本节点映射待取得确切旧构建、控制流与状态兼容证据后再推进；当前不承诺自动迁移。
