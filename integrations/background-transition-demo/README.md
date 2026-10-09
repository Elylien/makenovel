# 第十二轮背景转场样片

独立新建的原生背景转场作品，仅用背景和无语音对白观察时长与立即继续的关系。暖色圆环、冷色三角和只读案例的淡入动画是本目录生成的原创素材；其他未使用的基础素材来自 `integrations/stage-demo/generate.mjs` 的纯工厂。没有商业素材，也不注入执行器、事件计时脚本或自带引擎入口。

```powershell
node integrations/background-transition-demo/generate.mjs --output .local/editor-profile/games/makenovel-round12
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round12
node --test integrations/background-transition-demo/background-transition-demo.test.mjs
```

生成器要求父目录已存在且为普通目录，拒绝任何已存在的目标，使用独立 `Game_key` 和 `projectId`，从锁定 WebGAL 提交读取四份 GUI 模板文本和许可证。普通作品使用审查后的共享引擎；runtime 构建重建 parser 期间不要执行生成器或测试。作品保存修改后须显式重新封存。

`start.txt` 为18行 UTF-8，首行 BOM，全部行和文件末尾 CRLF。三个背景各有一条正常播放起点、目标对白、后续关闭与黑场对白。入场和退场必须分别观察，不能用编辑器“执行到此句”作为转场过程证据。

| 位置 | 初始配置与用途 |
| --- | --- |
| 第3→4→5行 | 从 `R12-BEFORE` 进入暖色背景。`duration=1200`、`enterDuration=2200`、`exitDuration=2600`、`next=true`。第4行含行内身份 `r12-warm` 和作者注释；入场使用2200ms，目标对白与转场重叠 |
| 第5→6→7行 | 从暖色目标继续到关闭背景，观察先前第4行配置的2600ms退场。第6行自身没有 `exitDuration`，避免误把关闭命令参数当作此前对象配置 |
| 第7→10→11行 | 黑场稳定后进入冷色背景，`duration=2400`、`exitDuration=2100`、`next=false`。第9行是独立 legacy 身份 `r12-cool`；第8行作者注释包含未知外形的文本。转场结束后仍需玩家/自动推进才到第11行 |
| 第11→12→13行 | 冷色背景按此前设置淡出至黑场；待黑场稳定后进入下一段 |
| 第13→14→15行 | 未登记的暖色背景，`duration=1800`、`exitDuration=2200`、`next=true`。只有实际修改第14行时才登记新身份 |
| 第15→16→17行 | 最后一次淡出及后继对白；第18行结束 |

建议在第5行导演面板将第4行入场/退场调整到约3000ms，并与对白一并应用、单次撤销/重做。第11行验证 legacy 身份与显式 `next=false`；第15行验证未登记节点的按需身份。检查非法输入和取消后共享稿不变，保存刷新重开，再封存改稿后的作品。

正常播放观察时先等前一句文字完整，关闭自动、快进和菜单。从第3行点击，抓暖色入场中途与终态；从第5行点击，抓暖色退场中途与黑场。从第7行点击观察冷色入场，等待其自然完成后确认尚未自动进入第11行，再点击推进。另一次播放在冷色入场中点击，观察提前结算；点击与自动模式要分开登记。可在长转场中尝试存档并记录原生拒绝提示，稳定后保存读回；代码测试本身不授予这些 GUI 行为通过。

背景普通入场参数优先级为 `enterDuration` → `duration` → 锁定 `changeBg` 中的1500ms默认值。内部 `generateTransformAnimationObj` 的500ms仅为通用函数备用值，正常 `changeBg` 已传入数字并覆盖它；Pixi同步函数的1000ms也是另一条缺省路径。退出设置跟随将来被关闭的背景，不能将本轮所有字段数字累加成总时间。

`readonly.txt` 不从主场景进入，需作者显式打开。第3/5/8/10/12/14行目标前分别为自定义入场动画、变换、变量时长、未知参数、条件和 `continue`。自定义动画实际帧总和1700ms，而命令 `duration=700`，用于说明不能仅按数字参数推断动画时长。上述原文保持本轮局部转场编辑边界，不能自动规范化。

`background-transition-demo-receipt.json` 记录初始 manifest、项目身份、源码/config/模板哈希与全部案例行号。三项测试使用真实锁定 parser、runtime `assetSetter`、共享身份模块和 manifest 工具，验证输入语义、资源映射、混合身份/注释/BOM/CRLF、独立身份和拒绝覆盖。源码事务、真实控件输入、播放时间和存档需各自验收。
