# 第八轮导演新增与继承样片

生成独立的新作品，复用第六轮代码生成的原创 SVG 角色、背景和 PCM 测试音；不执行旧生成器、不读取或覆盖旧作品。背景标识为 `ROUND 8`，`Game_key` 和 `projectId` 每次新建，输出只有本轮收据。

```powershell
node integrations/director-insertion-demo/generate.mjs --output .local/editor-profile/games/makenovel-round8
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round8
node --test integrations/director-insertion-demo/director-insertion-demo.test.mjs
```

仅接受 `--output`，目标父目录须存在；目标已经存在（文件、目录或链接）即拒绝。作品不自带引擎，使用经过审查构建的共享 runtime。四个 GUI 模板文本和许可取自锁定 WebGAL 提交。

`start.txt` 第一行含 UTF-8 BOM，全部 17 行使用 CRLF 并保留末尾换行。初始未写入节点 ID；固定行尾注释和独立不透明作者备注用作编辑后字节比对。`readonly.txt` 另有 7 行 CRLF，不含 BOM。

| 停靠点 | 目的与预期 |
| --- | --- |
| R8-01 | 日景、音量 28 的 BGM、左林右羽中性表情，明确建立前文来源 |
| R8-02（初始第 9 行） | 前一对白后只有一行作者备注，没有局部舞台命令。导演面板应显示来源；可新增夜景、左侧林笑脸、BGM 音量 41 和 SE，再一次应用 |
| R8-03 | 本句前只有等待。检查新增后的画面和 BGM 来源继续传播；一次性 SE 不表示持久继承效果 |
| 选择/标签 | “查看来源边界”进入 R8-LABEL；“结束”直接结束。标签是流程入口，面板不得跨越它推断确定来源 |
| R8-COMMAND | 独立场景中执行原生 `setVar` 后的对白，用于检查导演范围以外命令构成来源边界 |
| R8-OPAQUE | 原生 `changeBg` 含不认识的 `-r8Opaque=kept` 参数和作者尾注释。运行时仍显示夜景；作者面板须保留未知参数并停止推算来源 |

新增操作建议先验证取消不改主稿/磁盘，再应用、整步撤销/重做、保存重开、查看 R8-03 来源及原生预览。初始语句不预先包含新增结果。样片中的文本描述只是操作入口，不代表导演 UI、插入事务或预览已经验收。

`director-insertion-demo-receipt.json` 记录生成时的身份、manifest、source/config 和模板哈希，以及初始插入目标。后续作者改稿须显式重新封存；生成收据不冒充改稿后的最终收据。许可与素材来源写在根目录的 `WEBGAL-LICENSE.txt`、`ASSET-CREDITS.txt`。作品、原始证据和玩家数据不提交 Git。

3 项测试使用真实锁定 parser、runtime `assetSetter` 与 manifest 工具，验证原生语法和资源映射、跳转与未知参数保留、BOM/CRLF/注释、新身份和拒绝覆盖。实际图形提交、声音听感、存读档和 Windows 包需要另行操作。角色/背景仍为原创开发占位图，voice 文件是诊断音，并非真人配音。
