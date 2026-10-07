# 存档兼容边界与下一步

核查日期：2026-10-07；基线为 WebGAL `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`（4.6.5），最初核查时该子仓无修改。第四轮随后新增根画布 CSS 补丁，未改存档协议。本文是源码审查与待实施策略，**不是存档迁移已经完成的声明**。现有 Windows 一槽退出重启证据只覆盖同一导出作品，不能推出改写剧情后仍兼容。

## 当前真实协议

| 对象 | 锁定源码确认的行为 | 兼容含义 |
| --- | --- | --- |
| 普通槽 / 快速槽 | `ISaveData` 包含舞台、backlog、槽号、时间、`sceneData` 和缩略图；`sceneData` 为数字 `currentSentenceId`、当前 sceneName/URL、sceneStack、可选 currentLocals。没有 nodeId、源码 hash、构建号或存档 schemaVersion。[类型](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/store/userDataInterface.ts#L56-L74)、[生成快照](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/controller/storage/saveGame.ts#L17-L66) | 持久编辑 ID 尚未进入运行时协议。 |
| 指针 / 调用栈 | 执行器通常先递增 `currentSentenceId` 再记录 backlog；稳定停点里的数字常为下一条原生语句索引。调用帧 `continueLine` 保存调用点；返回时使用 `continueLine + 1`。[执行器](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/controller/gamePlay/scriptExecutor.ts#L131-L173)、[压栈](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/Modules/scene.ts#L54-L77)、[返回](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/controller/scene/restoreScene.ts#L14-L25) | 不能把这些数字统一当“当前显示台词所在行”，更不能全都替换为同一个 nodeId。注释和多行占位仍占原生索引。 |
| 读档 / 历史回跳 | 按保存的 sceneUrl 异步取得**当前文件**再解析；旧指针、栈、舞台与演出在请求完成前便开始恢复。没有场景版本匹配或完整异步失败回滚。[读档](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/controller/storage/loadGame.ts#L28-L75)、[历史恢复](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/controller/storage/jumpFromBacklog.ts#L20-L96) | 新源码配旧舞台可能恢复到错误位置；断网、慢请求、连续读两个槽还需独立验证。 |
| 已读 | 用户数据中的 `readHistory` 是 sceneName → Base64 位图，bit 对应数字语句索引；剧情变长只扩容，不重定位。场景切换/调用取路径末段为 sceneName。[位图](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/Modules/readHistory.ts#L87-L130)、[名称来源](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/gameScripts/changeSceneScript.ts#L9-L12) | 插入/删除/移动可误标已读；不同目录同名场景存在键碰撞风险。改台词而保留 ID 也不应自动继承已读。 |
| 流程图 / 收藏 | 流程图另存解锁集与 `ISaveData` 快照，键使用 flowchartId/nodeId；此 nodeId 是流程图节点 ID。快照创建未写 currentLocals，普通槽/backlog 则有。所核对的运行时类型和存储路径未找到逐句收藏结构；CG/BGM 鉴赏、历史和流程图均不能代替它。[流程图](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/Modules/flowchart.ts#L159-L189)、[用户数据](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/store/userDataInterface.ts#L76-L100) | 跨场景局部变量恢复和未来收藏迁移都不能由一槽验收替代。 |

实际 localforage 键为 `Game_key-savesN`、`Game_key-saves-fast`；用户设置、全局变量、鉴赏和已读放在 `Game_key`；流程图使用 `Game_key-flowchart...`。`Game_key` 从 config 读取，缺失时为空字符串；`gameName` 不是普通槽的命名空间。[槽存储](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/controller/storage/savesController.ts#L8-L35)、[配置读取](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/util/coreInitialFunction/infoFetcher.ts#L18-L29)。因此同一浏览器存储或 Electron profile 内，复制模板后复用 Game_key 可能串档；改名不自动隔离。存储 origin/profile 与作品身份必须分别核对。

## 不混用的五种标识

| 标识 | 用途与当前状态 |
| --- | --- |
| 作品身份 | 应是跨改名、更新保留的不可变 projectId；当前只有原生 Game_key 命名空间，尚无 MakeNovel 身份绑定协议。新作品与旧作品新版必须区别处理。 |
| 场景身份 / 场景版本 | 场景身份不能只用 basename；版本需要明确相对路径、完整原始字节 hash、原生 parser/运行时及相关依赖。当前未把这种 manifest 绑定到玩家存档。 |
| nodeId | 当前注释 ID 表示作者认定的同一剧情节点；移动保留、复制新建。它不证明前文变量、分支和舞台仍兼容，也不等于流程图 nodeId。 |
| 源码修订 revision | 当前编辑器用整文件 SHA256 阻止陈旧写入；换行、注释或身份登记也会改变它。不是内容语义版本，更不是旧档可加载证明。 |
| 原生索引 / 槽号 | currentSentenceId、continueLine 和 UI lineNumber 有各自推进边界；槽号仅决定保存位置。它们都不提供持久剧情身份。 |

MakeNovel 的 ID 与 SHA256 实现分别在本地 `vendor/WebGAL_Terre/packages/terre2/src/Modules/scene-identity/scene-identity.ts`、`Modules/webgal-fs/text-file-transaction.ts`，通过根仓 Terre 补丁维护；截至此审查，WebGAL 的存读档实现未接入它们。

## 采用的保守策略（待实现）

1. 新档增加版本化包装/旁置元数据，保留原生快照原样作为 payload；记录 projectId、Game_key、构建/场景 manifest hash、运行时与插件版本，以及明确的指针语义。普通槽、快存、每个调用帧、backlog 和流程图快照必须同受检查，不能仅检查当前场景。
2. 第一阶段只自动接受身份与 manifest **精确匹配**的档。新版本中的节点都还在，也不能推出旧舞台、变量、返回值和演出可继续；新增前置 setVar、改分支/资源/插件、拆合节点均默认不兼容。
3. 无元数据旧档标为“来源版本未验证”，不得用当前行号、相邻节点、相同文本或模糊匹配静默迁移。只有拿到确切旧构建与源码，才能建立旧索引→旧节点→新节点候选映射；涉及重排/控制流变化仍需作者审查和实际恢复测试。丢失/重复 ID、缺失旧源、无法确定指针阶段时停止迁移。
4. 旧档保留为可导出的不可变备份；迁移结果写到新命名空间/新槽，不覆盖输入。版本不兼容提供“保留并导出 / 用旧版本作品恢复 / 从明确的新起点开始”，不能把失败当空档或自动清除已读、鉴赏、流程图进度及未来收藏。旧版本运行使用备份的可写副本，保留原备份。
5. 备份必须覆盖整个相关命名空间和来源标识，不能只复制一个槽。原生启动会补齐用户数据字段并可能写回，因此备份应先于升级程序初始化；Electron 文件级 profile 备份需在程序退出后进行。schema 不认识、坏 JSON、存储失败和迁移中断均保留原始数据。[现有补字段行为](https://github.com/OpenWebGAL/WebGAL/blob/d0318e6c4cdb8b04bb5d891f40368cff3c6efc85/packages/webgal/src/Core/controller/storage/storageController.ts#L101-L149)
6. 已读迁移按明确的作品/场景/节点与正文修订处理；不能直接把旧 bitset 套到新索引。正文变更可失去“已读”判定，但不应删除未来收藏本身；收藏需保留原文/语音引用与失效原因，而不是指向任意相似台词。

## 下一轮最小可执行单元

先在锁定原执行器上增加**兼容检查与备份门禁**，暂不自动重定位不同剧情版本。第四轮已为 WebGAL 建立可重放补丁与受控构建/模板同步策略，首份补丁仅修复根画布定位；后续存档修改应沿用该来源、审查和重放流程，见 [RUNTIME_PATCHES.md](integrations/RUNTIME_PATCHES.md)。

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

下一轮建议先实现版本门禁、完整备份及恢复时序，并完成上述最小验收。跨版本节点映射待取得确切旧构建、控制流与状态兼容证据后再推进；当前不承诺自动迁移。
