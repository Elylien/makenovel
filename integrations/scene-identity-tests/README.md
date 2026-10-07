# 场景身份与局部源码写回

产品代码位于 `vendor/WebGAL_Terre/packages/terre2/src/Modules/scene-identity/scene-identity.ts`，通过根仓 Terre 补丁公开。它没有 Node、文件系统或执行器依赖，可由前后端共同引用。它使用上游解析器给出的物理行范围，不替代 WebGAL 的剧情解释器。

```powershell
node integrations/scene-identity-tests/run-tests.mjs
```

运行器使用已锁定 Terre 的 esbuild，以 browser / ES2017 编译同一份产品代码；测试调用 Terre 安装的 `webgal-parser@4.6.5` 和锁定 WebGAL 实际构建出的 parser。缺依赖或缺原生构建时测试失败，不静默跳过。编译产物位于被忽略的 `.scratch/scene-identity-tests`。本轮 28 项测试通过，单文件严格 ES2017 TypeScript 检查通过。

## 编辑器接入合同

每次调用都从同一份当前 `source` 重新取得原生 `sentenceList`。范围使用原生 0-based `startLine/endLine`，包括占位语句也可传入。源码偏移使用 UTF-16 字符串索引，不能误用作 UTF-8 字节偏移。原始有效 UTF-8 经 UTF-8 重新编码时，未改字符串片段保持原字节；BOM、混合 LF/CRLF、最后一行无换行均显式保留。

| 函数 | 作用 |
| --- | --- |
| `inspectSceneIdentity(source, ranges)` | 只读产生 `nodes` 与诊断；不按台词或行号推断身份 |
| `assignMissingNodeIds(source, ranges, idFactory, { eligibleStartLines })` | 显式登记调用方已确认的命令；未知高级块可保留未登记状态 |
| `patchNodeDialogue(source, ranges, { nodeId, text })` | 只替换单行显式 `say:` 正文；重复/未知参数、注释原样保留 |
| `patchNodeStatement(source, ranges, { nodeId, replacement }, parseNative)` | 将图形 serializer 的单行提案映射到原 token；再用真实 parser 校验整场景 |
| `insertSceneStatement(source, ranges, beforeStartLine, statement, idFactory, parseNative)` | 在当前原生语句首行前插入；`null` 表示 EOF。原文件只作零宽插入，新命令登记一个新 ID |
| `moveNode(source, ranges, nodeId, beforeNodeId)` | 移到另一稳定节点之前；`null` 移到文件尾部 |
| `duplicateNode(source, ranges, nodeId, idFactory)` | 紧邻原节点复制，生成新 ID |
| `deleteNode(source, ranges, nodeId)` | 删除命令和紧邻的旧式独立身份注释，避免留下悬挂标记 |
| `compareSceneIdentities(before, after)` | 报告明确的 added/removed/retained，不静默修复丢失身份 |

编辑结果是 `{ source, changes }`，不会自行写磁盘；保存仍必须经过场景有效性与原有 SHA256 乐观并发事务。生成器建议 `() => 'mn-' + crypto.randomUUID()`；ID 与文本修订分离。复制使用新 ID，移动保留 ID，修改正文不更换 ID。

图形绑定以 `SourceNode.nodeId` 作为稳定 key，以 `startLine/endLine` 仅作当前源码定位；旧式独立 marker 行本身不要显示为可删除剧情节点。`blockStart/blockEnd` 包含其相邻的旧式 marker；`start/end` 仅表示命令正文段。

`patchNodeStatement` 的第四参必须使用同一原生 parser 配置。现有 Terre 图形层先经 `sceneBody` 剥除 transport BOM，因此可传 `text => parseScene(sceneBody(text)).sentenceList`。原生 parser 自身直接读取 BOM 会把首行 `\uFEFFsay` 当角色前缀；模块不伪造这个事实，也不改写原文件 BOM。产品的场景分析仍保留该原生差异，把受影响的首行命令作为高级块拒绝图形改写；含 BOM 的注释首行不受此问题影响。长句 serializer 提案先用原生 `sceneTextPreProcess` 折回单个命令；源文件本来为多行命令时，本轮正文/参数控件仍拒绝局部改写并引导源码模式。

## 身份载体与边界

新身份使用命令末尾的原生行内注释：`; @makenovel-node mn-...`。已有作者尾注释、空白和分号均不重写，新增分号仍位于原生注释区。双原生 parser 测试证明注册前后的可执行 command/content/args、物理范围、占位数和总 sentence 数不变；多行占位注释的非执行 `content` 会携带新增元数据，这是明确预期。保留已有 `; @makenovel-node id` 独立行，以兼容早期实验；不自动把它转换或删行。

畸形、重复、同时存在两种载体、悬挂和被续行吞入的 marker 都产生 error；缺失 ID 产生 warning。全局身份 error 拒绝结构或局部修改。未登记的高级块仍可原样保留，不能成为按 ID 指定的操作目标。新 ID 不允许包含原生续行开关 `-concat`，因为它出现在缩进续行中会改变解析边界。

正文局部修改拒绝可能变成参数/命令的分隔符、控制字符、高级反斜杠和保留值。整句 token 改写保留原命令前缀、参数顺序、未改参数的数值拼写/空白和全部尾注释；`say:` serializer 输出角色前缀时，将所需角色保留为 `-speaker` token。重复参数、隐式来源不明、无法复现原生目标语义或影响邻句的提案被拒绝。被拒绝的修改不会返回部分结果。

结构移动可能需要添加分隔换行，防止原本无终止换行的末行与下一命令拼接；不重新序列化任何命令。BOM 始终留在文件开头。

插入函数只接受一条未携带身份的原生命令（可为多行），原文件所有 EOL 保持原样，生成的命令使用相邻行的换行方式。插入位置若是旧式 marker 所属命令，则把新命令放在 marker 之前，避免新句继承旧 ID。EOF 仅在需要时加入分隔 EOL，不会产生裸 CR；再次调用真实 parser 检查节点数与身份，拒绝被相邻续行吞入的插入。调用方负责判断该命令是否已获安全投影确认；本模块不猜未知前缀是角色名还是扩展命令。

这些能力是正式编辑数据的身份和局部写回基础，不是旧存档/收藏迁移协议。没有改动 WebGAL 存档格式、运行索引、执行器或历史恢复。
