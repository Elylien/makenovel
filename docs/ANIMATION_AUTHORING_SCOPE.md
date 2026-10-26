# 独立动画作者入口：源码审计与下一单元契约

记录：2026-10-23。审计基于锁定的 WebGAL `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`、Terre `cf73dd58535d3ef15bddf0852adee153fa92d7da` 及项目已应用补丁。

**本文保留第十四轮的实现前审计与验收契约。第十五轮已实现其中有限作者入口，实际通过与未运行项目以 [第十五轮证据](evidence/2026-10-26-round15.md) 为准；下文审计本身不授予验收状态。**沿用原生执行器、动画文件、场景源码和存档，不引入第二套动画运行时。

## 已核对的原生契约

| 项目 | 锁定实现的行为 | 作者入口应表达的含义 |
| --- | --- | --- |
| 资源与时长 | `setAnimation:move-right` 查找动画表中的同名资源；初始化从 `game/animation/animationTable.json` 加载各 JSON。总时长为各帧 `duration` 之和，命令没有独立 duration 覆盖。 | 选择已存在动画，不能把语句输入框伪装成动画总时长编辑器；选中文件不证明已登记、加载或可见。 |
| target | 按完整 key 查找舞台对象。空值或缺省落到 `default_id`。常规位置立绘使用 `fig-left`、`fig-center`、`fig-right`，背景使用 `bg-main`；自定义立绘使用其 ID。 | 明确填写目标；缺省不是“当前立绘”。源码中的创建记录不证明当前运行路径存在该目标。 |
| next | 脚本执行器立即继续计算后续语句，动画可与后续对白重叠。 | “立即继续”，不能解释成“动画完成后继续”。 |
| continue | perform 启动时设置结束后推进标记；自然结束或提前结算可以请求内部推进，仍受阻塞、菜单和会话状态约束。 | 与 next 分开处理；同时开启可能在立即进入后句后再次产生推进请求，首期不开放。 |
| 两项均关闭 | 演出自然结束不主动推进下一条语句。用户在有限演出中点击，先结算演出；该点击通常不再额外推进一句。自动播放仍等待有限演出结束。 | 不把“无 next”一概写成“结束后自动继续”。 |
| keep | 令 perform 跨句保留，持续时间到达时不自动卸载；timeline 本身只执行一遍，没有 repeat。停止 keep 动画不强制把容器推到终态。 | “跨句保留”不是“循环”。循环、相位恢复和跨句持续另行验收。 |
| parallel | 普通模式替换目标名下已有普通及并行演出；并行模式以目标与动画名区分。相同目标和动画名仍会替换自身。 | 不能承诺任意动画叠加或同名多实例；是否写相同属性也影响呈现。 |
| 变换基准 | `transformFrom` 优先于旧参数。`current` 只写动画涉及的属性；`default` 从默认值开始，非并行时写完整变换。没有新旧参数时按 current。 | 首期固定 current，不自动规范化旧稿的变换基准。 |
| 旧参数 | 存在 `writeDefault` 或 `ignoreDefault` 时进入旧逻辑：`writeDefault` 控制基准，完整写入为 `!parallel && !ignoreDefault`。即便显式 `writeDefault=false`，也不同于完全省略旧参数的默认行为。 | 不因字段值为 false 就删除；未知或旧式组合保持原文。 |

源码依据：[setAnimation](../vendor/WebGAL/packages/webgal/src/Core/gameScripts/setAnimation.ts)、[变换参数解析](../vendor/WebGAL/packages/webgal/src/Core/util/getSentenceArg.ts)、[动画终态和时长](../vendor/WebGAL/packages/webgal/src/Core/Modules/animationFunctions.ts)、[timeline](../vendor/WebGAL/packages/webgal/src/Core/controller/stage/pixi/animations/timeline.ts)、[perform 生命周期](../vendor/WebGAL/packages/webgal/src/Core/Modules/perform/performController.ts)、[推进逻辑](../vendor/WebGAL/packages/webgal/src/Core/controller/gamePlay/nextSentence.ts)、[动画资源加载](../vendor/WebGAL/packages/webgal/src/Core/initializeScript.ts)。

## 接入前必须解决的边界

1. **导演来源分类。** 目前 `setAnimation` 是导演收集边界。不能只把它加入 `stageCommands`：`sourceInheritance` 对未单独分类的舞台命令调用 `figureSourceTarget`，会把动画错误记录为中间立绘的素材来源。应显式区分“动画配置”与“素材来源”，不由源码推算动画当前姿态。参见 [directorSession](../vendor/WebGAL_Terre/packages/origine2/src/pages/editor/SceneDocument/directorSession.ts)。
2. **原生表单规范化。** `SetAnimation.submit` 调用 `getTransformFromArgs`，会删除旧 `writeDefault`、`ignoreDefault`，并可能省略显式 `next=false`；长语句还可能折行。复用控件必须加有限适用性判断及局部写回适配，保证语义无操作和往返恢复原字节，保留注释、BOM、换行和节点身份。不能把原生序列化后的第一行直接当作完整安全提案。参见 [SetAnimation](../vendor/WebGAL_Terre/packages/origine2/src/pages/editor/GraphicalEditor/SentenceEditor/SetAnimation.tsx)、[TransformFromOption](../vendor/WebGAL_Terre/packages/origine2/src/pages/editor/GraphicalEditor/components/TransformFromOption.tsx)。
3. **资源后缀不一致。** 选择器目前用 `replaceAll(".json", "")`，后端动画表只以不区分大小写的方式移除末尾 `.json`。目录或文件中间含 `.json`、末尾为 `.JSON` 时可能产生不同资源名。下一实现应统一末尾后缀处理并验证嵌套路径；未修正前不能承诺这些资源可正确选用。参见 [动画表生成](../vendor/WebGAL_Terre/packages/terre2/src/Modules/manage-game/manage-game.service.ts)。
4. **资源与草稿生命周期。** 不完整选择、原始输入中的分号/换行、动态插值及过期选择器回调不得进入有效草稿。选择资源不应绕过当前作品版本和动画表加载流程；作品文件改变后仍按清单规则封存、重开，再测正常播放。
5. **替换与恢复。** 目标被关闭或身份改变时，原生 `changeFigure` 会清理其动画；不能通过重排绕过目标创建、关闭或替换顺序。有限动画运行中继续拒存，稳定档依赖最终 effects。keep 沿原生路径恢复时会重建演出，并不保存动画播放相位，不能宣称精确续播。参见 [changeFigure](../vendor/WebGAL/packages/webgal/src/Core/gameScripts/changeFigure.ts)、[saveGame](../vendor/WebGAL/packages/webgal/src/Core/controller/storage/saveGame.ts)、[演出恢复](../vendor/WebGAL/packages/webgal/src/Core/controller/storage/jumpFromBacklog.ts)。

上述为实现前识别的问题；第十五轮的来源分类、局部写回、后缀处理与生命周期验证结果另见本轮证据。

## 建议首期范围

- 仅接入已有、单行、静态 `setAnimation` 的动画资源、显式目标和布尔 next 编辑；复用原生素材选择器及现有局部导演事务。
- 适用参数限定为 target、next、keep、parallel、transformFrom，禁止重复参数。keep/parallel 仅允许缺省或 false；transformFrom 仅允许缺省/current。保留显式 false/current 的原始形式，语义不变时不改稿。
- 初期目标限定常规左/中/右立绘、背景及非保留静态自定义 ID；stage-main、其他预设位置和模型目标另行扩展。目标不自动改写为最近一张立绘。
- 条件、动态值、continue、keep/parallel=true、默认变换、旧参数和未知语法保持只读或收集边界，不通过新控件规范化。
- 首期不新增、删除、移动动画行；动画行同时作为结构移动屏障。动画 JSON 编辑、曲线、循环、跨分支继承和完整时间轴不纳入。
- 先处理原始输入与完整提案，再沿现有版本、IME、迟到回调、取消、整批应用/撤销门禁提交；草稿不进入活动播放器。

## 最小原生样片

创建独立作品与原创静态立绘 `hero.svg`。将 `move-right` 登记到动画表，写入 `game/animation/move-right.json`：

```json
[
  { "position": { "x": 0 }, "duration": 0, "ease": "linear" },
  { "position": { "x": 180 }, "duration": 3000, "ease": "linear" }
]
```

场景保留作者注释与节点身份，并包含下列主路径：

```text
changeFigure:hero.svg -id=animation-hero -right -next;
say:READY;
setAnimation:move-right -target=animation-hero -next;
say:MOVING;
say:STABLE;
changeFigure:none -id=animation-hero -next;
say:CLOSED;
```

另设独立场景测试缺省 next、continue、背景目标、未知资源/目标，以及 keep、parallel 和旧参数的只读边界。原生命令场景不等于新入口已支持这些功能。实际动画必须从 READY 正常推进观察；编辑器“执行到此句”只用于作者预览，不作为正常播放或玩家存档验收证据。

## 验收矩阵与退出条件

以下均为待执行项目，代码、真实 GUI 和 Windows 结果分别登记。

| 层次 | 必测路径 | 判据 |
| --- | --- | --- |
| 适用性与源码 | 受支持参数；重复/未知/旧参数；分号、换行、插值；长折行；转义资源名；显式 false/current | 越界拒绝且保留草稿；完整语义无操作不改字节；评论、换行、身份不丢失。 |
| 来源与结构 | 动画前后素材来源；不存在目标；动画紧邻创建/关闭；尝试移动相邻行 | 动画不成为素材来源；不宣称运行时目标存在；结构屏障有效。 |
| 选择器与事务 | 普通、嵌套、中间含 .json、大写后缀；取消、过期回调、IME；资源/目标/对白混合修改 | 动画名与表一致；无效或迟到输入不写入；一次应用、一次撤销/重做；保存重开一致。 |
| 正常演出 | 从 READY 启动；next 开/关；提前点击；缺失目标或资源 | 实际目标、动画与推进符合原生契约；不把无可见结果计为成功；点击结算不重复推进。 |
| 中断与继续 | 菜单覆盖期间结束；返回；目标替换/关闭；场景切换 | 继续请求按会话至多消费一次；旧回调不复活目标；不把 next 与 continue 混同。 |
| 存读档 | 有限演出中快存/普通存档；稳定后保存；关闭目标后读取；刷新后正常开始再读取 | 不稳定保存拒绝且旧槽保留；稳定状态和目标恢复正确；作者预览隔离路径另测。 |
| 高级边界 | keep、parallel、continue、旧变换参数及模型目标 | 新入口明确保持只读/边界；不从原生能力推导新入口或相位恢复已验收。 |
| 工程交付 | 增量补丁、独立重放、类型检查、受控构建、共享模板、HTTP 实际引擎 | 新变更可重放，旧补丁不变；测试与构建证据指向同一最终代码。 |

退出条件：有限入口完成上述适用路径及失败路径，记录未运行部分，更新交接。完整播放器、全部动画组合和 Windows 离线验收仍须独立完成。
