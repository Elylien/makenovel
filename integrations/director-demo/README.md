# 第七轮导演与资源故障样片

生成独立的新作品，复用第六轮代码生成的原创 SVG 角色、背景和 PCM 测试音。背景标识改为 `ROUND 7`，新 `Game_key` 和 `projectId` 与旧轮隔离；不会读取或改写第六轮生成目录。

```powershell
node integrations/director-demo/generate.mjs --output .local/editor-profile/games/makenovel-round7
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round7
node --test integrations/director-demo/director-demo.test.mjs
```

仅接受 `--output`，目标父目录须存在。输出路径只要已经存在就拒绝，包含普通文件、目录或链接。生成器不复制引擎，作品使用经过审查构建的共享 runtime；GUI 四个模板文本与许可从锁定 WebGAL 提交读取。

`start.txt` 首行是 UTF-8 BOM 加注释，全文件使用 CRLF，并包含固定的行尾注释，用于实际编辑后检查字节保留；初始没有节点 ID。两句对白均明确写为原生 `say:`，附 `speaker`、`vocal` 与位置参数。

| 停靠点 | 场景与操作 |
| --- | --- |
| R7-01 | 日景、音量 28/立即进入的 BGM、左林右羽中性表情；林的高音 voice 测试音。作为导演面板首句编辑与预览入口 |
| R7-02 | 两名角色换笑脸；羽的低音 voice 测试音 |
| 选择 | “继续资源失败验证”经原生 `changeScene:failure.txt` 进入故障场景；“结束”走原生 end |
| R7-BASE | 正常日景和角色显示后，建立普通/快速旧槽 |
| R7-FAIL | 背景切换为存在但不是有效图像的 `broken.svg`；等待最终失败后普通/快存应明确拒绝，旧槽保留 |
| R7-RECOVER | 切回 `day.svg` 创建新主图请求；图像就绪后普通/快存应再次可用 |

`broken.svg` 是**故意制作的解码失败文件**，已登记于 manifest，并非漏文件。这样完整性检查正常通过后，才能验证主图片加载失败门禁。原生预取也可能提前记录该文件加载失败；预取失败本身不应影响之前正常舞台的保存。

根目录只有 `director-demo-receipt.json` 表示生成时的最终身份、manifest、scene/config 和模板哈希，不会写入中间第六轮收据。后续作者操作修改源文件后，必须显式重新封存；原生成收据是起点记录，不能充作改稿后的新收据。新作品根目录另有素材说明与 WebGAL MPL-2.0 许可。生成文件和玩家数据不提交 Git。

3 项测试使用真正的锁定 parser、runtime `assetSetter` 与 manifest 工具，检查原生参数/跳转、媒体路径、BOM/CRLF/注释起点、最终收据一致、身份隔离与拒绝覆盖。测试不声称浏览器解码、导演界面提交、普通/快速存档或 Windows 包已经验收；这些需要真实交互证据。所有图片仍是开发占位图，voice 文件为诊断音，不是真人配音。
