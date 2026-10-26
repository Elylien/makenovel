# 有限独立动画样片

先完成受控 runtime → Terre 构建，再生成不存在的新目录。请勿在 parser 重建期间运行生成器或测试。

```powershell
node integrations/animation-demo/generate.mjs --output .local/editor-profile/games/makenovel-round15
node --test integrations/animation-demo/animation-demo.test.mjs
```

生成器拒绝覆盖既有路径，使用独立 Game_key 和 projectId 隔离玩家数据。22 个游戏文件在生成时封存；收据记录初始场景、配置、模板和动画哈希。场景为原生 WebGAL 文本，人物来自 stage-demo 原创 LIN/YU，背景标尺与动画 JSON 为本生成器原创。没有嵌入第二套播放器。

| 段落 | 前句 / 动画 / 目标对白 | 目标及动画 | 身份 |
| --- | --- | --- | --- |
| 主段 | 5 / 6 / 7 | r15-hero，move-right，next | 行内 ID，保留显式 keep=false、parallel=false、transformFrom=current |
| 手动继续 | 13 / 16 / 17 | fig-left，move-left，next=false | 第 15 行独立 legacy ID |
| 背景 | 19 / 20 / 21 | bg-main，nested.json/move.json-side，next | 动画起初未登记 ID |

主段开始时右侧橙色人物的目标是 `r15-hero`，左侧蓝色人物的目标是 `fig-left`。可以在第 7 行导演面板将资源改为 `move-left`、目标改为 `fig-left`，与对白一起应用、撤销和重做，再保存重开核对。第 8 行 STABLE 是稳定存档点，第 11 行 CLOSED 已关闭两个人物，可用于读取后核对目标和最终位置。第二段 next=false 的动画自然结束后仍需手动推进，不能误写为“结束后自动继续”。第三段观察背景标尺移动。

四个资源均登记在动画表：`move-left`、`move-right`、`nested.json/move.json-side`、`upper`。前三个文件以 `.json` 结尾，`upper` 的文件名为 `upper.JSON`，用于大写后缀选择器边界检查。锁定 runtime 请求 `upper.json`，因此 Windows 文件服务能否加载须实测，区分大小写的部署需先改为小写后缀。登记和解析测试不等于实际加载验收。目录或文件名中间的 `.json` 必须保留。

每个 JSON 配置总时长为 3000 毫秒，只包含原生位置关键帧；时长不由 `setAnimation` 命令覆盖，新表单也不编辑 JSON。配置值不是实测时长。正常播放必须从 READY 推进，编辑器“执行到此句”不证明动画过程，还会隔离玩家存储。有限动画运行中保存应被拒绝；稳定状态保存恢复最终 effects，不代表动画相位续播。

改稿后暂停写入，显式重新封存，再刷新游戏、从标题正常开始进行存读档验证：

```powershell
npm.cmd run game:seal -- -GamePath .local/editor-profile/games/makenovel-round15 -Action Update
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round15
```

`readonly.txt` 与主路线隔离，仅用于显式检查 keep、parallel、continue、旧 false 参数、动态插值、保留 stage-main、未知参数、默认变换，以及缺失资源/目标和省略 next。部分语法可在原生入口表达，并不代表本轮导演入口支持。缺失资源/目标导致无可见结果不能计为动画通过。BOM、CRLF、行内和独立身份、未登记行及不透明注释均保留供往返检查。

生成器测试验证原生解析、资源登记、文件清单、防覆盖和变更检测；真实表单、播放、存读档、菜单中断、中文 IME 和 Windows 包必须分别记录结果。
