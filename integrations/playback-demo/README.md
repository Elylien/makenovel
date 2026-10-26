# 原生播放与恢复样片

使用已受控构建的共享引擎，生成一个不存在的新目录：

```powershell
node integrations/playback-demo/generate.mjs --output .local/editor-profile/games/makenovel-round16
node --test integrations/playback-demo/playback-demo.test.mjs
```

生成器拒绝覆盖既有文件或目录，使用独立的 projectId 与 Game_key。14 个 game 文件经清单封存；收据保存源码、动画、流程图和锁定上游模板的哈希。两段原生场景都有 BOM、CRLF、作者注释及稳定节点 ID。沿用 stage-demo 的原创双人占位与 animation-demo 的原创背景标尺，没有商业资源、音频或独立播放器。

| 场景与行号 | 标识 | 用途 |
| --- | --- | --- |
| start.txt:5 | R16-READY | 双人和静态背景就绪；下一步原生 changeScene 进入 motion.txt |
| motion.txt:2 / :3 | 动画 / R16-MOVING | 场景首对白与右侧橙色 r16-hero 的八秒平移重叠 |
| motion.txt:4 | R16-STABLE | 动画结算后的同场景稳定提交，核对流程图解锁与保存 |
| motion.txt:5–7 | 关闭两人 / R16-CLOSED | 核对历史、流程图或存档恢复后的双人和最终位置 |
| motion.txt:9–11 | R16-MANUAL-READY / next=false / R16-MANUAL | 关闭自动/快进时，动画自然结束仍等待手动推进 |
| motion.txt:12–19 | R16-MODE-01 至 08 | 观察自动/快进推进，关闭模式后检查停靠 |
| motion.txt:20 | R16-END | 样片终点 |

`game/flowchart.json` 提供一张 main 图，两个节点分别指向 start.txt 的“准备起点”和 motion.txt 的“动画章节”。从标题正常开始、在 READY 进入章节，才能覆盖 first-dialogue → 动画运行 → 稳定提交链路；编辑器“执行到此句”会隔离玩家存储，不能充当这条链路的验证。首句有限演出期间不可生成混合快照，预期在同场景的稳定提交后才解锁“动画章节”，而非放宽存档门禁。开始场景的主图加载也可能暂时阻止首个快照，不据此判断加载时机或立即解锁。

打开菜单、历史或流程图时观察剧情停在 MOVING，动画本身仍按原生时钟继续。关闭后可在稳定点保存，推进至 CLOSED，再从稳定历史记录、流程节点或存档返回观察。历史中点击 MOVING 具有与稳定点不同的原生恢复语义，应单独记录，不以稳定恢复外推。两个动画都配置 8000ms、线性位移 180 像素；配置不是精确墙钟测量，主动画目标是橙色自定义 ID，手动段为蓝色 fig-left。

生成器测试只证明语法、来源、资源/图节点引用、清单、独立身份及防覆盖。GUI、菜单/自动/快进、恢复、实际中文输入法和 Windows 离线必须独立实测。修改作品后暂停写入，显式重新封存并重开游戏：

```powershell
npm.cmd run game:seal -- -GamePath .local/editor-profile/games/makenovel-round16 -Action Update
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round16
```
