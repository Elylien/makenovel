# 原生源码局部写回实验

状态：**G0 中的有限实验**。对应 S-03、S-04、S-07、S-08、I-03/I-09 的部分机制，以及 AT-03/AT-23 的自动测试片段。尚未构成 G1：没有导演面板、源码同步 UI、文件持久化、运行时预览、存档迁移或完整场景语法验证。

## 已实现

`source-roundtrip.mjs` 接受原始 UTF-8 `Buffer`，从独立注释标记建立可重建的节点索引，只替换所选对白的有效文本字节范围：

```text
; @makenovel-node rain.opening
say:  雨还在下。  -speaker=凛 -vocal=rin-001.ogg; 作者备注
```

标记必须紧邻下一条非空、非注释命令，ID 必须符合 `[A-Za-z][A-Za-z0-9._:-]{0,95}`。ID 是显式身份；移动标记和其命令后 ID 保持，复制必须由调用方生成新 ID。当前实验不会自动添加、复制或修复标记，也不要求未编辑的高级块全部有 ID。

写回以整个原始文件的 SHA-256 为预期版本。空白、注释或换行的外部变更都会导致 `VERSION_CONFLICT`，必须重新载入；不做隐式合并。多条修改先全部检查，再合成新 Buffer，输入不变，任一错误不产生部分结果。返回原始字节位置、修改前后文本和新旧 hash，可供调用方展示差异。

其余字节直接从原 Buffer 拼接，保留 BOM、CRLF/LF、无末尾换行、缩进、注释、参数顺序、未知命令和未编辑多行命令。它是有限词法扫描和局部补丁实验，不是完整保留文本语法树，更不是剧情执行器。

## 当前支持边界

- 只允许编辑独立、无前导缩进的显式 `say:` 命令。`角色名:文本`、连续对白、动作参数、跳转和插件命令暂作为高级源码；不根据上游的说话人回退逻辑猜测命令类别。
- 只替换现有非空文本，不更改说话人、语音、参数或注释。原文保留的 `\;` 可以解码为字面分号；新文本的分号自动编码为 `\;`。
- 新文本不允许换行、控制字符、外侧空白、反斜杠、**以 ASCII `-` 开头**、字符串 ` -`，以及上游会解释为空内容的 `none`。拒绝开头 `-` 是保守边界：保留的原始前导空格可能与新文本拼成参数起点，例如 `say: 原文` 换成 `-next` 会被上游解析为空正文加 `next=true`。不支持的内容返回结构化错误；多条事务中出现此错误也全部拒绝。不检验上游富文本或变量插值的运行语义，也不声称已经支持所有 WebGAL 文本演出。
- 编辑目标参与显式末尾反斜杠续行、缩进 `|` / `-` 续行时拒绝。位于续行中的标记直接拒绝，以免定位到已被原生预处理吞并的伪节点。不编辑的多行高级块可以原样保留。
- 文件必须是有效 UTF-8，可含 BOM；单独 CR 换行拒绝。GBK 等遗留文件要先以独立、明确的导入流程转换，此实验不会猜测编码。
- 重复 ID、损坏标记、标记后无命令、缺失目标 ID、同一节点重复请求、缺失或过期 hash 均拒绝。`inspectScene` 可返回高级节点的不可编辑原因；不会执行内容。
- **没有磁盘写入**。这里的事务仅限单次同步内存计算。调用方之后的保存仍须实现文件锁/版本复查、原子替换、失败恢复和权限/磁盘错误处理；当前函数不能消除另一个进程在实际落盘时产生的竞态。

## 原生证据

锁定：WebGAL `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`，`packages/parser` 4.6.5。

- [scriptParser.ts](../../vendor/WebGAL/packages/parser/src/scriptParser/scriptParser.ts)：先在第一个未被紧邻反斜杠转义的 `;` 处截出注释，再解码 `\;`。纯注释返回 `comment` 和 `next=true`；参数从正文第一个字面 ` -` 开始。
- [sceneTextPreProcessor.ts](../../vendor/WebGAL/packages/parser/src/sceneTextPreProcessor.ts)：**注释解析之前**合并显式和隐式续行。上一行末尾反斜杠会吞并下一行标记，这是必须拒绝的定位危险。
- [sceneParser.ts](../../vendor/WebGAL/packages/parser/src/sceneParser.ts)：注释与续行占位符仍占 `sentenceList` 下标。插入 ID 注释会移动下标，**这不是既有行号存档的无损迁移方案**；需要后续版本化映射和迁移设计。
- [commandParser.ts](../../vendor/WebGAL/packages/parser/src/scriptParser/commandParser.ts)：未登记命令回退为 `say`/说话人，不能把原样保留未知文本解释为“已安全支持插件命令”。
- [contentParser.ts](../../vendor/WebGAL/packages/parser/src/scriptParser/contentParser.ts)：字面 `none` 变为空内容，因此本实验拒绝这个新文本值。

`native-integration.test.mjs` 导入真实构建的上游 parser，核对上游提交与 parser 源码无本地修改；验证标记注释、标记前后执行语义、真实多行 choose、分号文本修改，以及续行吞并标记的真实行为。缺少构建时直接失败，不跳过或使用模拟 parser。构建产物仍须由下述基线命令重新生成，不能仅凭存在就认定与源码同步。

## 执行

在项目根目录，使用 Node 22（本次核心测试环境：Node 22.17.0、Windows、PowerShell 7.6.5）。核心实验不依赖任何额外 npm 库：

```powershell
node --test experiments/source-roundtrip/source-roundtrip.test.mjs
node experiments/source-roundtrip/demo.mjs
```

`demo.mjs` 读取原创 fixture，返回一条对白的差异信息。不会写入或运行场景。素材名只是解析测试数据，不能作为可播放样片或素材授权证据。

完整测试需要先安装、构建锁定的 WebGAL：

```powershell
npm.cmd run baseline:install
npm.cmd run baseline:build
npm.cmd test
```

也可在已完成构建后单独执行集成测试：

```powershell
node --test experiments/source-roundtrip/native-integration.test.mjs
```

## 测试和下一步

2026-10-07 已实际运行：核心测试 **14/14 通过，0 跳过**；真实原生 parser 集成测试 **5/5 通过，0 跳过**。核心覆盖手写 golden 的逐字节比较、中文/emoji/BOM/CRLF、分号转义、混合换行、节点移动、多修改、并发冲突、失败事务、ID 异常、续行边界、错误编码，以及前导 `-` 与原文空白拼接造成参数注入的回归。后者先用真实 parser 确认错误语义，新增的三项回归在修复前均实际失败，再修复验证。集成测试使用当天由基线流程生成的锁定版本 parser 构建；此结论仅指解析与字节写回，不包含真实演出或文件保存。

下一步应先将窄范围补丁接到 Terre 的真实读写流程，完成原子落盘和外部变更冲突 UI，再扩展说话人/参数/多行语句的词法边界、撤销事务与预览版本。稳定 ID 的场景归属、复制、重命名以及旧存档/收藏迁移要单独设计与验证；不能只用本次注释解析成功宣布这些能力完成。
