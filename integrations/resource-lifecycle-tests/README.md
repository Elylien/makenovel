# 静态主图片资源与保存门禁

运行 `node integrations/resource-lifecycle-tests/run-tests.mjs`。

套件编译真实 WebGAL `PixiController` 的 `addBg`、`addFigure`、`loadStageAsset`、对象移除方法，真实 `syncPixiStageState` 与普通/快速保存入口。渲染容器、纹理下载、GPU 边界和持久化被替换为可控夹具；测试没有另写一个加载器来替代被测生产方法。

38 项检查由原资源生命周期 28 项与 SVG 错误传播 10 项组成。前 28 项覆盖：有限演出已结束但主图仍 pending 时拒存、两次失败、原生一次重试后恢复、缓存命中、真实立绘挂载异常、同步/异步 setup 异常、同 UUID 请求身份、替换/重置后的迟到成功与失败、临时 owner 清理、辅助口眼纹理隔离、静默自动快存保留旧记录。普通/快存都断言没有覆盖旧槽。

SVG 10 项直接执行生产 `assetParsers.ts` 注册的 parser，使用锁定 `@pixi/core` 的真实 SVGResource、ImageResource、BaseTexture 和 Texture，仅 Image/canvas 与 Assets 注册边界受控。真实 SVGResource 在 `onerror` 后原 load Promise 仍 pending 的缺陷被复现；桥接通过 BaseTexture 公开 error 事件使 parser 原样拒绝 Error/Event，不改 node_modules。测试检查成功/错误监听清理、同步抛错、原生 Promise 拒绝、事件先到后 Promise 拒绝、并行实例隔离、非 SVG 原通路、大写扩展/查询参数，以及同 URL 失败后真实 TextureCache/BaseTextureCache 清理并创建新资源。

这是静态图片背景/立绘的保守保存门禁。状态附着当前舞台对象，不写进原生存档；setup 完成才 ready。加载、演出时钟和剧情仍独立，本补丁不把全场景变成等待资源的事务，也不暂停或回滚脚本。

相同 URL 的已失败对象继续保留失败状态；后续普通 stage commit 不触发新的隐式重试。修复资源后重新打开作品，或显式退场/切换成另一图片再显示，才会创建新的主请求。单独切场景若保留原对象，不能当作已重试。本单元不提供自动重试按钮、自动排队保存或最近稳定检查点回退。

GIF、视频、Live2D、Spine、GPU 上下文丢失、永久无响应的网络超时、音频、预取失败本身均不由此门禁验收；口型/眨眼辅助图失败不污染成功的主图片。SVG 桥接只传播已发出的原生错误事件或 load 异常，没有新增超时，也不把缺失回调或任意原生 onload 内异常变成完整加载事务。真实解码/浏览器网络与 Windows 包须另验。

旧源码红测试可通过环境变量 `ORIGINAL_RESOURCE_CONTROLLER` 和 `ORIGINAL_RESOURCE_SAVE` 指向第六轮两个原文件重放；新增 `ORIGINAL_ASSET_PARSER` 可只替换 SVG 桥接前的 parser。测试 runner 读取它们替换构建输入，不修改工作树。首次 28 项旧资源门禁日志为 6 通过/22 失败；最终 38 项仅回退 SVG 桥接为 31 通过/7 失败，当前源码为 38/38 通过，不混用两次故障基线。对应日志为被忽略的 `docs/evidence/local/round7/resource-before-final-tests.log`、`resource-svg-before-final-tests.log` 和 `resource-svg-after.log`，不提交本地日志。
