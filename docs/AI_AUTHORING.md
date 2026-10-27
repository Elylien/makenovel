# 本地 AI 创作工具与人工接力

本工具把现有 Terre 作者工作区提供给本地 AI 调用者：查询作品、命令、素材与源码，按稳定身份提出有限修改，查看差异，校验并提交。它使用同一份原生脚本、解析器和带版本的写入事务。没有内置聊天、模型服务、密钥托管或另一套剧情执行器；MCP适配、路线执行与自动预览留待后续。

## 入口与可用范围

先按项目 README 安装锁定依赖并启动受控编辑器。所有命令在项目根目录执行，默认连接 `http://127.0.0.1:3001`。网络命令可显式传 `--origin http://127.0.0.1:<端口>`；工具不自动连接提案里写的地址，也不连接远程域名或携带账号凭据的URL。

```powershell
node integrations/author-tools/cli.mjs capabilities
node integrations/author-tools/cli.mjs commands
node integrations/author-tools/cli.mjs projects
node integrations/author-tools/cli.mjs assets --game '<从projects取得的gameName>' --category all
node integrations/author-tools/cli.mjs source --game '<gameName>' --path game/scene/start.txt
```

`capabilities`给出当前可调用操作及限制；`commands`从锁定原生定义读取命令，并区分能查询和本工具能插入的命令。素材查询只列各类别第一层目录的文件元数据；看见文件不等于它已成功解码或可播放。`source`返回完整原文、字节修订、工作区身份、原生诊断和节点身份，查询不执行剧情。

所有修改按 `nodeId` 定位，不依赖行号。诊断行号目前沿用两种原生约定：`source.nodes` 的 `startLine` / `markerLine` 从0计数，`analysis.blocks.startLine` 从1计数；比较显示位置时须先换算，不能把两者直接当成同一行号。

本批修改操作只有三类：

| 操作 | 输入与行为 |
| --- | --- |
| `registerIds` | 为已知、可编辑且缺少身份的命令登记新ID；保留已有ID和未知高级邻居。提交后重新读取，不在同批猜测刚生成的ID |
| `patchDialogue` | 由实际 `nodeId` 精确定位并替换有限单行对白正文，保留说话人、参数、注释与其他字节；不能用行号或相同文字代替身份 |
| `insertBefore` | 在观察到的节点前或 `null` 所代表的文件末尾插入一条允许的原生命令，分配新的身份；不会沿用传入旧ID |

插入集合为 `say`、`changeBg`、`changeFigure`、`bgm`、`playEffect`、`wait`、`end`、`label`、`jumpLabel`、`setVar`。命令存在不代表所有动态参数都支持；不明确或需要高级源码处理的输入会被拒绝。`choose`、`callScene`、`changeScene`等仍可查询和诊断，本批不通过工具插入，不声称执行或验证了路线。新建作品和场景仍用原生编辑器。

## 一次可审阅修改

先让作者保存当前编辑，或明确保留未保存草稿。工具读取磁盘版本，不读取浏览器内存中的未保存内容。下面的目录只放本地提案，不进入Git：

```powershell
New-Item -ItemType Directory -Path '.local/author-proposals' -Force
```

根据刚读到的节点身份创建UTF-8 `operations.json`。示例中的两个ID是占位符，须替换为 `source` 实际返回的ID：

```json
[
  { "type": "patchDialogue", "nodeId": "observed.dialogue.id", "text": "雨停以后，我们再读一页。" },
  { "type": "insertBefore", "beforeNodeId": "observed.next.id", "statement": "say:这是新增的一句 -speaker=林;" }
]
```

若没有可靠ID，先以 `[{"type":"registerIds"}]` 做单独提案，按下述流程提交，再重新读取身份。不要按台词相似度补造ID。

```powershell
node integrations/author-tools/cli.mjs propose --game '<gameName>' --path game/scene/start.txt --operations .local/author-proposals/operations.json --out .local/author-proposals/proposal-01.json
node integrations/author-tools/cli.mjs review --proposal .local/author-proposals/proposal-01.json
node integrations/author-tools/cli.mjs validate --proposal .local/author-proposals/proposal-01.json
```

`propose`只创建新提案文件，拒绝覆盖同名文件，不修改作品。提案包含目标、基准原文与修订、操作、预期结果、差异和摘要。`review`重新执行声明的有限操作，核对提案内容与差异，输出可复查的 `proposalHash`。调用方应核对目标、修改范围及差异；如果要改变提案，就重新生成并审阅。

`validate`重新核对当前源码和工作区，检查涉及的资源目录，并给出 `valid`、`diagnostics` 和 `resourceChecks`。命令成功返回JSON不等于 `valid: true`；存在缺素材等错误时不能提交。静态诊断和目录存在性检查都不会执行剧情。

确认差异和验证结果后，将 `review` 输出的完整摘要传给提交命令：

```powershell
node integrations/author-tools/cli.mjs commit --proposal .local/author-proposals/proposal-01.json --review-hash '<review输出的proposalHash>'
```

提交再次校验提案、当前版本、工作区与素材，再调用原有 `saveTextSnapshot`，带上精确 `expectedRevision` 和 `expectedWorkspaceId`。成功结果明确给出 `committed: true`、新修订及 `requiresReseal: true`。审阅摘要用于绑定本次具体内容，不是数字签名，也不代表远程身份认证。

提交后在编辑器重开或重新读取场景，确认图形与源码视图一致；浏览器已有旧草稿时，保留其冲突副本，不强行覆盖。用原生预览检查实际行为。对正常玩家路径做验收前，应停止该作品写入，再按 [存档与封存规则](SAVE_COMPATIBILITY.md) 显式更新清单并重新打开播放器；工具不会自动封存或绕过玩家版本隔离。

## 人工与 AI 接力

1. AI先查询真实源码和素材，提出一段有限修改，审阅并提交。
2. 作者在原生图形编辑器或源码编辑器中微调、保存；若原页仍是旧版本，先按冲突提示保留草稿和重新读取。
3. AI重新调用 `source`，使用作者保存后的修订和保留的稳定ID制作新提案，再审阅和提交。
4. 保存接力前后原文与修订，检查注释、未知邻居、BOM、换行和节点身份，随后走正常预览、封存及播放路径。

第二步之后不能继续提交第一步遗留的提案。即使节点ID相同，文本修订变化也必须重新读取。测试程序里替换字符串只覆盖版本边界，不代替作者真实操作或系统中文输入法验收。

## 拒绝、冲突和恢复

| 结果 | 处理 |
| --- | --- |
| `REVISION_CONFLICT` | 保留原提案和当前作者内容，重新读取后重新提案；不把摘要或revision改成新值来强行覆盖 |
| `WORKSPACE_CHANGED` | 确认当前作者工作区，再重新读取。相同路径和相同文字也不能证明是同一工作区 |
| `RESOURCE_NOT_FOUND` / `PROPOSAL_VALIDATION_FAILED` | 根据结构化诊断补齐素材或修正操作，重新校验；目录存在性仍需实际播放验证 |
| `PROPOSAL_HASH_MISMATCH` / `PROPOSAL_CONTENT_MISMATCH` | 提案已变化或内部结果不一致，保留原文件排查并重新生成，不直接改摘要来掩盖差异 |
| `REVIEW_HASH_REQUIRED` / `REVIEW_HASH_MISMATCH` | 先审阅当前提案，传回与其内容一致的摘要 |
| `NO_CHANGES` | 源码无需修改，例如可编辑节点都已有ID。保持原文，不生成空提交 |
| `INVALID_PATH` / `INVALID_OPERATION` / `UNSUPPORTED_STATEMENT` | 查阅能力声明，采用受支持的本地目标和操作；高级编辑交给原生源码流程 |
| `HTTP_REQUEST_FAILED` | 可能尚未送出，也可能服务端已经接收写入。先重新读取源码和revision确认结果，再决定下一步，不能盲目重放提交 |

JSON成功结果写到stdout；工具异常的结构化JSON写到stderr，退出码为1。调用脚本应检查原生命令退出码，同时检查 `validate.valid` 与 `commit.committed`。

当前限制为单场景、最多64个明确操作、源码2 MiB、输入/响应16 MiB。资源限支持类别顶层的静态名称；复杂或嵌套资源、自动合并、多文件原子事务、路线模拟、模型/MCP、预览取证和Windows验收均不由本工具授予完成。素材目录可能在校验后继续变化，外部非协作进程也仍有底层最终写入竞争边界；已有事务与完整限制见 [作者源码说明](DIRECTOR_EDITING.md)。

测试入口使用真实原生解析、身份与提案代码。`author-tools.test.mjs`的HTTP层为确定性替身；`cli.test.mjs`执行真实CLI进程，并对临时模拟服务器发起真实HTTP请求，检查提案文件、摘要传递和事务协议。它们不等同于真实Terre服务、GUI、输入法、播放器或Windows包。实际本轮接力和未完成项由 [项目状态](PROJECT_STATUS.md) 与 [测试记录](TESTING.md) 分别登记。
