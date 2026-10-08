# 第九轮导演来源定位样片

独立新建用于来源定位、返回与选材草稿边界的长场景作品。复用 `integrations/stage-demo/generate.mjs` 的纯素材工厂，背景标识改为 `ROUND 9`；不运行旧生成器、不读取或覆盖旧作品。每次新建使用独立 `Game_key` 和 `projectId`。

```powershell
node integrations/director-navigation-demo/generate.mjs --output .local/editor-profile/games/makenovel-round9
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round9
node --test integrations/director-navigation-demo/director-navigation-demo.test.mjs
```

目标父目录须已存在且为普通目录；目标只要存在（文件、目录或链接）即拒绝覆盖。作品沿用经过审查构建的共享引擎，四个 GUI 模板文本及许可取自锁定 WebGAL 提交。素材为原创 SVG 与 PCM 诊断音，没有商业图片、音乐或真人录音。

`start.txt` 共 95 行，首行含 UTF-8 BOM，全部行及末尾使用 CRLF。第 2–5 行建立日景、左侧林、右侧羽和音量 28 的 BGM；背景与右侧立绘有节点 ID，左侧立绘和 BGM 未登记。随后 80 句普通对白使目标与来源相隔超过虚拟列表窗口。作者注释和混合身份用于比对定位是否意外改稿或批量登记。

| 停靠点 | 初始行 | 用途 |
| --- | --- | --- |
| R9-TARGET | start.txt 第 88 行 | 查看远处的登记/未登记来源、跳转与返回。前句后只有作者注释，可在此创建 pending 新增、选择素材、撤掉新增并验证草稿保留 |
| R9-AFTER | start.txt 第 89 行 | 前句新增设置应用后成为更早来源，供再次打开检查 |
| R9-LABEL | start.txt 第 92 行 | 标签构成边界。没有具体来源的未知项不能冒充可定位的源行 |
| R9-UNKNOWN | readonly.txt 第 3 行 | 变量命令构成边界，背景、音乐和立绘均无具体来源 |
| R9-DIFF | readonly.txt 第 6 行 | 左侧差分在第 4 行有明确命令和 `r9-diff` 身份，但结果保持未知；可查看来源不等于推断最终舞台 |

原生玩家可经过“查看来源边界”进入第二场景；差分是来源诊断用例，不要求以其执行结果证明作者面板功能。所有 80 句过渡均为简单线性对白，没有变量插值或条件分支。

生成收据 `director-navigation-demo-receipt.json` 记录起点 manifest、作品身份、源码/config/模板哈希、定位目标与来源登记状态。改稿之后须显式重新封存；生成收据不代表后续改稿内容或验收结论。作品、玩家数据和原始本地证据不提交 Git。

3 项测试使用真实锁定 parser、runtime `assetSetter` 及 manifest 工具，覆盖距离与目标行号、混合身份、原生语法和资源映射、BOM/CRLF/注释、来源边界、独立身份及拒绝覆盖。实际虚拟行滚动/聚焦、面板返回、素材双击、取消/应用与 IME 需单独运行 GUI 验证。
