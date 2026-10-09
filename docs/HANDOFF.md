# 交接与恢复

记录：2026-10-09，MakeNovel `0.0.12` / `main`，远端 `https://github.com/Elylien/makenovel.git`。提交与推送以现场Git核对为准。

## 恢复先核查

```powershell
git status --short --branch
git submodule status
npm.cmd run patch:check
npm.cmd run patch:runtime:check
Get-Content -LiteralPath .local/editor-runtime/process.json
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue
```

先读PROJECT_STATUS、DEVELOPMENT_PLAN、TESTING、DIRECTOR_EDITING、KNOWN_ISSUES。私有输入仅在忽略的docs/private，禁止stage/upload。vendor HEAD保持锁定上游，工作树有意应用补丁；不要reset/clean、暂存gitlink或创建嵌套提交。

## 第十二轮结果

- 复用原生 ChangeBg 控件，普通单行静态图片背景可编辑入场回退 duration、入场 enterDuration、下次退场 exitDuration 和布尔 next；已有及本次新增图片共用契约。
- 时长仅接受空字符串或0–2147483647十进制整数毫秒。空值移除覆盖；入场优先 enterDuration，其次 duration，两项均空时锁定引擎默认1500毫秒；下次退场留空也默认1500毫秒，作用于这个背景之后被替换/关闭时。
- 新转场区保守接受三个时长、布尔 next 及原校验允许的 order；自定义动画、CG解锁名称/系列、变换、变量、条件、连续组合、重复/未知参数、关闭背景及非静态图片保持只读或原收集边界。
- raw输入在原生序列化前验证，素材/时长/对白仍在局部草稿中合流；等价修改不改字节、不登记身份，整句语义复原才恢复原文。长原生折行保留显式next=false；高级只读行继续使用原有控件初值。
- 复用取消、失焦/IME、稳定身份、全文/历史过期与整批应用/撤销门禁；未替换原生运行时或存档模型。

代码625/625（作者470、样片18、runtime子集137）、最终构建含tsc、受控runtime→Terre构建/同步、HTTP25/25、服务22/22和最终九补丁独立重放18/18通过。真实非法输入/取消、背景与对白整批撤销/重做、三类身份保存刷新、自定义动画只读、next往返无操作、正常淡入/关闭淡出、提前点击结算、演出中快存拒绝及稳定快速存读档通过有限路径。完整证据和未运行范围见 [第十二轮证据](evidence/2026-10-09-round12.md)。

新0009 SHA `086b3406d25f587b1d9903acada47911b635aedc7fbef75612266b3c1a76f487`，完整tree `7863611a8c1e2a566a84a0162b6aa0e7d3570f7a`，增量基树 `9251575c495fe730b409526f0af9e07cbbf14d3e`，manifestSHA `2cfa7a0efe518b76164f339d5350931126eea517c7d6fde9e3713bfb06dbca67`。首次重放恰逢根修复只读初值并重新导出0009，hash门禁拒绝中途变化；固定最终补丁后重放18项全部通过。此失败和最终结果分别保留；新补丁只含五个前端文件，构建未引入新PO变更。

原Terre1–8/runtime1–4字节不变。上游HEAD：Terre `cf73dd58535d3ef15bddf0852adee153fa92d7da`，WebGAL `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`。

## 当前进程与作品

编辑器PID **9188**，UTC启动 **2026-10-09T04:25:24.3132764Z**，入口 `vendor/WebGAL_Terre/packages/terre2/dist/src/main.js`，仅127.0.0.1:3001；停止前核对PID/时间/入口。无本轮EXE。进程/日志 `.local/editor-runtime/`。

作品 `.local/editor-profile/games/makenovel-round12`，标题“MakeNovel 第十二轮背景转场验证”，projectId `10736bd7-0c50-44a1-b44c-67b0e8ddcf9c`，Game_key `makenovel-round12-cb72aa57-c644-4b22-9180-56f1a196178c`。初始manifest `050171fc807ff44d65e030a35c5d5cd5993aa3b923dc7389e45caa7d15a32a12`；改稿后Update封存并verify，最终 `5044bcc51e193062df0928dd8207d420cd05f135308743a1fce5e24805220862`，20文件。manifest备份在 `.local/manifest-backups/10736bd7-0c50-44a1-b44c-67b0e8ddcf9c/`。

start最终SHA `645063012183152829dd44a1d9e79551fb4f923565311192099792b27e52a92e`；第4行enterDuration3200/exitDuration3000、第10行duration3000且next=false、第14行duration1600；第5行改对白。18行中14行原字节保留，BOM/CRLF和第9行legacy标记不变，新增身份 `node-a987c5a0-48ce-4cbc-9589-98e5119e2cde` 只属于第14行。readonlySHA `5b576487728564fa4ec74f02a884c6c7dd7d8c24f8976578d93f1bdcced6c026` 不变。

最终start已保存、无撤销/重做/待保存，面板和预览关闭。IAB交付tab5；原round7、round11标签保留。启动期间误提前访问生成的失败临时tab4未标记交付，随工具清理。最终截图 `docs/evidence/local/round12/16-final-background-panel.png`，逐字节/GUI记录同目录，均忽略。新作品IAB快速存档保存于COOL稳定对白，已推进后读回；旧作品和玩家槽位未修改。存档悬浮预览会盖住文本中心，本次改点背景canvas完成推进，未更改上游提示层。

runtime25文件签名 `aa10038a666fcea893a5501f09723d2427aabee4b433bd0122060e0ea7264e93`，收据 `.local/runtime-sync/runtime-build.json`，模板备份 `.local/runtime-sync/20261009-042444-dddea217f6cf498cb9e6af75ba291cd0/previous-template`。旧轮作品、Windows开发包、模板备份和玩家数据保留。

## 下一具体单元

```powershell
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round12
npm.cmd run test:director
npm.cmd run test:graph-input
```

下一作者单元优先审查静态立绘的同类转场，明确位置/ID、差分及退场目标；setAnimation再独立定义资源、目标、keep/parallel和外部动画时长。保持源码、身份、局部事务和正常播放验收。完整时间轴、跨分支、AI接力及独立恢复仍为独立范围。

修改vendor后从本轮完整tree增量导出0010。停editor后baseline:build→editor:build；不并发Terre两workspace，不在runtime重建parser时运行parser依赖测试/生成/封存。构建后检查生成源码，不忽略未知改动；重放运行期间冻结patch/manifest。普通作品共用模板，自带入口另行升级。

作品改稿后暂停写入，显式 `npm.cmd run game:seal -- -GamePath '<作品目录>' -Action Update` 并重开。用户已授权开源Git、工具安装和Computer Use；付费与正式发行分开处理。
