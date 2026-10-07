# WebGAL + Terre 初始改造评估

日期：2026-10-07。完整版本目标保留，以下仅陈述锁定源码和本轮实测证据。

## 固定基线

| 仓库 | 版本 | 提交 |
| --- | --- | --- |
| WebGAL | 4.6.5 | `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85` |
| WebGAL_Terre | 4.6.5 | `cf73dd58535d3ef15bddf0852adee153fa92d7da` |

两者为官方仓库当前获取的提交，使用各自 `yarn.lock` 和 Yarn 1.22.22。上游 manifest、LICENSE 和锁文件均在 submodule 中保留；摘要见 `upstream.lock.json`。相同版本号不能替代实际引擎模板配套验证。

## 源码检查与初步取舍

| 能力 | 实际依据（相对 WebGAL） | 结论与下一步 |
| --- | --- | --- |
| 原生剧本 | `packages/parser/src`，真实 parser 测试 | 复用解析与执行语义；新增编辑元数据必须进行真实 parser 兼容实验。 |
| 玩家存档 | `packages/webgal/src/Core/controller/storage/saveGame.ts` | 已有舞台、backlog、场景栈、局部变量、缩略图；当前语句仍是 `currentSentenceId`，不等于持久编辑节点身份。 |
| 切场存档保护 | 同上，`lockSceneWrite` 分支 | 场景写入中直接忽略存档；需求的可见检查点/排队语义仍需实现与交互验证。 |
| 数据落盘 | `.../storage/savesController.ts` | 普通存档异步写 localforage，没有在上层等待成功或统一失败反馈；不能据此宣称磁盘故障可靠。 |
| 读档异步一致性 | `.../storage/loadGame.ts` | 场景 fetch 的回调与恢复同步状态分开；需用连续读档/回标题复现会话取消风险，不把静态怀疑写成已复现错误。 |
| 演出停止 | `.../gamePlay/stopAllPerform.ts` | 已有 performController 清理入口，应扩充生命周期契约，避免另造执行器。 |
| 对象转场 | `.../gameScripts/setTransition.ts` | 命令配置目标的进入/退出动画。尚不等价于整舞台资源准备、原子提交、取消和合法终态。 |
| 图形编辑/预览 | Terre 见 `TERRE_BASELINE.md` | 可复用现有组件；优先修复稳定 ID、写入冲突和草稿隔离。 |
| Windows 壳 | Terre `packages/WebGAL-electron` | Electron 29 范围依赖、electron-builder、`loadFile` 入口可查。未实测打包、离线、关闭重开及普通用户写盘。 |

## 本轮有限实验

`experiments/source-roundtrip/` 验证注释节点标记、字节保留、显式对白的局部补丁、预期内容版本与真实上游 parser 兼容。它不实现拖拽面板、整场语法树、文件事务、旧存档迁移或完整 G1。

结果和命令统一以 `TESTING.md` 及证据记录为准。未知命令可保留并不表示可安全执行；注释被 parser 接受也不表示插入注释不改变旧存档的索引。

## 路线结论

继续验证 WebGAL + Terre，当前没有足够证据支持重造引擎。路线成立仍取决于 G1 双向编辑/冲突闭环以及早期 Windows 离线导出。下一轮以小补丁或明确扩展层接入源码事务，禁止同时升级框架、重写存档和全面重做 UI。

官方入口：[Terre 开发指南](https://docs.openwebgal.com/developers/terre.html)、[WebGAL](https://github.com/OpenWebGAL/WebGAL)、[Terre](https://github.com/OpenWebGAL/WebGAL_Terre)。官方概述只作为调查入口，能力完成状态以本项目证据为准。
