# 作品版本封存

此工具给明确选择的作品生成 `game/makenovel-manifest.json`。它读取 `game/` 原始文件字节，包括配置、场景、资源、模板及位于 game 内的插件，排除 manifest 自己和**零字节的普通 `.gitkeep` 占位文件**。其余文件的新增、删除、换行、注释、节点登记和资源变化都会改变版本。封存前停止编辑与资源写入；完成后先验证再分发。

Terre HTTP 不提供点文件；`.gitkeep` 仅用于在 Git 中保留空目录，因此零字节占位不属于运行资源。非空 `.gitkeep`、名为 `.gitkeep` 的目录或链接会拒绝封存，不把它们静默隐藏。其他点文件不扩大排除范围，仍参与 hash；若发布端不提供它们，运行时门禁仍会拒绝。原始占位文件不会被删除。以前清单中的零字节 `.gitkeep` 条目可以通过明确 `--update` 去除，保留原 UUID 并备份旧清单；不自动改变版本。

```powershell
# 新作品：明确创建不可变身份。此操作不修改 Game_key 或任何剧情文件。
pwsh -NoLogo -NoProfile -File scripts/Seal-Game.ps1 -GamePath '.local/editor-profile/games/my-new-game' -Action Init

# 已有作品改稿后：保留 projectId / Game_key，显式封存本次修订。
pwsh -NoLogo -NoProfile -File scripts/Seal-Game.ps1 -GamePath '.local/editor-profile/games/my-new-game' -Action Update

# 默认只读，检查文件增删与原始字节是否仍匹配。
pwsh -NoLogo -NoProfile -File scripts/Seal-Game.ps1 -GamePath '.local/editor-profile/games/my-new-game'

node --test integrations/game-manifest/manifest.test.mjs
```

也可直接使用 `node integrations/game-manifest/cli.mjs seal --game <作品根> --init`、`seal --game <作品根> --update` 和 `verify --game <作品根>`。PowerShell wrapper 的相对路径以仓库根为基准；直接 CLI 的相对路径以当前工作目录为基准。`--backup-root` 可指定作品目录以外的备份目录。CLI 失败返回非零退出码并提供原因，不自动修复未知数据。

配置读取复用已构建的锁定 WebGAL parser，首次使用前应完成受控 `baseline:build`。只接受原生 parser 实际识别的唯一、非空、无多参数或 options 的 `Game_key`；BOM 紧贴 `Game_key` 导致原生无法识别时拒绝。不会自行 trim 命令名或重写配置来掩盖语义差异。

`Game_key` 不能以保留的 `makenovel-v1:`、`makenovel-unverified-v1:` 或 `makenovel-backup-v1:` 开头，避免与运行时版本和备份命名空间重叠；CLI 与运行时清单校验均拒绝这些前缀。

## 精确协议

`manifest.mjs` 导出 `canonicalManifestPayload`、`computeManifestHash`、`validateManifest`、`scanGame`、`sealGame`、`verifyGame`，以及文件路径和兼容常量，供契约测试使用。

```json
{
  "schemaVersion": 1,
  "projectId": "612e1c48-e933-4c68-844a-e51061511212",
  "gameKey": "作品实际原生键",
  "runtimeCompatibilityId": "makenovel-webgal-save-v1:d0318e6c4cdb8b04bb5d891f40368cff3c6efc85",
  "files": [
    { "path": "game/config.txt", "size": 123, "sha256": "原始字节的64位小写十六进制SHA256" }
  ],
  "manifestHash": "canonical payload的64位小写十六进制SHA256"
}
```

`manifestHash` 是 UTF-8 编码的 `JSON.stringify({schemaVersion,projectId,gameKey,runtimeCompatibilityId,files})` 的 SHA256。字段顺序必须如上；每条文件项字段顺序为 `path,size,sha256`；files 按 path 的 JavaScript 默认 UTF-16 顺序排序，不能使用 locale 排序。没有生成时间、目录绝对路径或 manifest 自身 hash，因此同内容保留身份时完全确定。读取验证不依赖输入 JSON 属性顺序。

文件路径统一以 `game/` 开头、使用 `/`。拒绝路径穿越、控制字符、Windows 设备名、尾部点/空格、链接和大小写碰撞；根目录及其祖先也拒绝符号链接/junction。运行时通过 URL 读取文件时应逐路径段做 `encodeURIComponent`，避免中文、空格、`#`、`%` 改变 URL 的含义。

## 身份与写入边界

- 第一次 `--init` 随机生成小写 UUID，已有 manifest 即拒绝；`--update` 只保留已验证的既有 UUID，缺文件、坏 JSON、未知 schema、hash 错误或 Game_key 变化都拒绝。不会为旧作品暗中补身份。
- 复制已有 manifest 意味着同一作品的副本；`--update` 不会把它偷偷变成新作品。独立新作品需要作者明确处理复制关系与原生 Game_key；本工具不提供重置身份或猜迁移命令。
- 更新先把旧 manifest **原字节** exclusive 写入 `.local/manifest-backups/<projectId>/`，文件名包含协议 hash 和 JSON 原字节 hash。已有不同备份、备份目录不安全或写入失败会阻止替换。备份永远不在作者作品内部，不会循环进入版本 hash。
- 同目录所在卷上写临时文件并 fsync；初次用原子 create-if-absent 建立目标，更新用原子 rename 替换。无变化不重写 manifest；正常失败不删除旧版本。原子操作和 fsync 不等于所有设备上断电耐久性已经验收。
- 作品根的 `.makenovel-manifest.lock` 只互斥此 CLI。已有锁不会自动清除，异常退出后应核对其 PID 和实际进程再手动恢复。封存多次扫描文件集/内容并复查旧 manifest，以拒绝常见并发改稿；不宣称能事务锁住不合作的外部编辑器在最后检查后的写入。

这是版本标识，不是数字签名，也不是自动兼容证明。兼容常量表示审查过的运行时存档协议；根外引擎或插件改动必须重新审查并按需要升级兼容常量，不能因为 game 文件相同就默认兼容。资源过大时全部逐字节验证会有耗时，此工具不做未经证明的 mtime 快捷放行。

manifest 备份仅保存版本描述，**不备份剧情源码/素材，也不包含玩家存档**。更新前仍须独立保留完整旧作品和玩家命名空间备份。精确版本门禁、旧档导出和运行时恢复属于另外的运行时接入；本工具自身不读写玩家数据，也不自动进行索引或节点迁移。
