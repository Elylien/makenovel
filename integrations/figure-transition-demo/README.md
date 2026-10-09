# 静态立绘转场样片

先完成受控 runtime 和 Terre 构建，启动隔离编辑器，再生成不存在的新目录：

```powershell
npm.cmd run demo:figure-transition -- --output .local/editor-profile/games/makenovel-round13
npm.cmd run test:figure-transition-demo
```

生成器不会覆盖作品。它写入原生场景、原创 SVG、锁定的上游 GUI 模板文本及许可证；19 文件初始清单在生成时封存，独立 Game_key 和 projectId 隔离玩家数据。开发占位人物来自 stage-demo 的原创 LIN/YU，未复制商业素材。

| 段落 | 前句 / 命令 / 目标对白 | 原生目标 | 初始时间（毫秒） | 身份 |
| --- | --- | --- | --- | --- |
| 左侧 | 3 / 4 / 5 | fig-left | duration 1200，enter 2200，exit 2600，next | 行内 |
| 自定义 ID + 右侧 | 7 / 10 / 11 | r13-hero，right 基准 | duration 2400，exit 2100，next=false | 独立 legacy |
| 中间 | 13 / 14 / 15 | fig-center | duration 1800，exit 2200，next | 起初未登记 |

每段后面都按对应目标关闭；退出时间来自此前的入场设置。导演面板目标是第 5、11、15 行，可依次改为 enter 3200 / exit 3000、duration 3000、duration 1600。保存后重新封存，再重开游戏进行存读档检查：

```powershell
npm.cmd run game:seal -- -GamePath .local/editor-profile/games/makenovel-round13 -Action Update
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round13
```

自然播放从前句进入，编辑器“执行到此句”会跳过过程，不能证明转场时长。next=false 不会在演出结束时自动进入下一句。ID 决定独立目标，位置决定基准；两者同时存在时都必须保存。同目标、图片、位置重复执行不重新淡入。配置值并非实测时长。

`readonly.txt` 仅供显式打开检查：自定义 enter、差分、保留 ID、多位置、模型参数、未知参数、关联动画。它不是正常游玩路线，部分参数只构成源码边界。起始文件使用 BOM+CRLF、注释和混合身份；生成收据记录初始哈希，不在之后改稿时悄悄重写。

本轮实际代码、构建、浏览器与磁盘证据见 [第十三轮记录](../../docs/evidence/2026-10-09-round13.md)。完整 Windows、自动/快进/菜单组合和正式素材仍需单独验收。
