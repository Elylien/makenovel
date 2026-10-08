# 原运行时存档兼容门禁测试

```powershell
node integrations/save-compatibility-tests/run-tests.mjs
```

Runner 用锁定工作区中的 esbuild 编译**生产** `Core/controller/storage/makenovelCompatibility.ts`，没有测试专用兼容实现。测试用作者 CLI 库实际封存临时作品，读取真实配置、父子场景和二进制资源原字节；执行 Node WebCrypto 与 `Response`，将 `fetch` 和 `document.baseURI` 限定在测试 HTTP origin。所有夹具和 bundle 留在被忽略的 `.scratch/save-compatibility-tests/`，不接触已有作者作品或玩家 profile。

舞台样本从生产 `stageStateManager.ts` 的 `initState` AST initializer 提取，并绑定真实 `baseTransform`。这避免把整个 Pixi/browser 单例图导入 Node，也避免自造与原生类型不一致的简化舞台。原生变量字段为 **`GameVar`**，局部变量在 `sceneData.currentLocals`，调用帧另有 `locals` 与 `writeReturnTo`。

覆盖：

- 作者工具与运行时的 canonical 字段顺序、SHA256、身份、schema、路径、排序、大小写和 hash 校验。
- 精确版本读/存门禁；真实父场景、子场景、资源及配置改动拒绝；封存后新 namespace 与旧快照拒绝。
- 启动和读档校验期间重封；文件读取前发生改稿；缺 manifest、缺资源/404、禁用存储及错误状态通知。
- 真实原生舞台初值形状；当前场景、父调用帧、backlog 的元数据与引用范围；未知旧档和坏指针保持输入对象不变。
- 中文、空格、`#`、`%` 文件路径逐段编码；返回当前原文和所有被引用场景的 `sceneSources` Map，供下一层原生 parser 核对边界。
- 原生 GameVar/当前局部变量/父帧局部变量的有限标量及一层数组；拒绝 NaN/Infinity、危险原型键、类实例、访问器和循环；保留可选旧字段缺省、null prototype 字典与合法共享引用。
- 原生舞台必需字段、常用嵌套演出/立绘/选择项/Live2D 数据的类型；使用真实 parser 构造非空演出列表验证合法样本。限制 64 层原生调用栈与 256 层数据嵌套；不验证美术参数的艺术合理性、插件语义或资源外观。
- getter 只返回本次校验过的配置原字节解码值，避免早先 axios 响应与新 manifest 混用；失败或初始化开始会清空。
- 作者预览本页锁定：初始化之前/途中/完成后收到预览都永久关闭玩家存储，晚到的启用调用不能解除；等待中的版本校验因 epoch 改变而拒绝。`waitForRuntimeReady`/`finishRuntimeInitialization` 是单独的 bootstrap 完成门禁，未封存作品完成初始化后仍可游玩。

这是兼容模块和网络边界测试。它不实例化 IndexedDB、Electron、Pixi、音频或完整执行器，也不代替异步恢复提交/回滚、普通槽/快存写盘、完整命名空间备份、全机断网和真实 Windows GUI 验收。原生 parser 的句号/调用返回索引上界由消费 `sceneSources` 的恢复层负责，不由此测试伪造。

运行时在 HTTP 上检查 manifest **列出的**文件，无法从静态 HTTP 接口枚举新增的未列文件。作者 CLI `verify` 能枚举本地完整文件集；分发前必须重新封存并核对。没有原子服务器快照时，多次网络读取也不能锁住不合作的外部 writer 在最后一次检查后的更改；发布阶段应使用不可变作品目录或停止写入。
