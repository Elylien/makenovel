# 交接与恢复

记录：2026-10-09，MakeNovel `0.0.13` / `main`，远端 `https://github.com/Elylien/makenovel.git`。提交与推送以现场Git核对为准。

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

## 第十三轮结果

- 原生 ChangeFigure 增加三项时长与连续执行的局部编辑；仅普通单行静态图片开放，已有和本次新增图片共用契约。
- 毫秒输入限空值或0–2147483647十进制整数。enterDuration优先duration；两项空时默认入场200毫秒。exitDuration配置本对象之后被替换或关闭时的退场，留空默认160毫秒。
- 时长修改保留标准单位置、非保留静态ID、作者注释与身份；非空ID定位独立立绘，位置仍决定基准。无ID换位置不会自动关闭旧槽。同目标/图片/位置重复执行不会重新淡入。
- 同步初始化受支持位置；显式center切换left/right时移除旧center。完整语义无操作和往返保留原字节；原生折行、显式next=false及转义素材名继续受保护。
- 高级模型/差分/关闭/变换/关联动画/自定义动画/多位置与未知语法保持原入口或边界。原始时长先校验；素材、时长和对白在局部草稿汇合，沿用取消、IME、迟到回调、过期及整批应用/撤销门禁。

代码 **653/653** = 作者495（导演125、图形/执行说明118）+七套样片21+runtime菜单/perform/资源/恢复137。独立tsc、受控runtime→Terre构建/共享模板同步、十补丁独立重放18/18、HTTP引擎25/25和服务22/22通过。

新补丁 `0010-director-figure-transition.patch`，SHA256 `5e3ba82f9b9e2245634803837ea9dbe8e882da5f9cfb672e3129cb1c6fc4ea29`，24373字节；增量基树 `7863611a8c1e2a566a84a0162b6aa0e7d3570f7a`，十补丁完整树 `23c07e4ee8229c7d413493128420e745c1d10865`，manifestSHA `8cc89a8478e78fd73db98ba2c6b2f62feadb793aa9d2e49cf0ea9d94fdae7df5`。仅四个前端文件，原Terre1–9/runtime1–4、上游HEAD及锁文件不变。

上游HEAD保持Terre `cf73dd58535d3ef15bddf0852adee153fa92d7da`、WebGAL `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`。真实GUI、失败修正与未运行范围见 [本轮证据](evidence/2026-10-09-round13.md)。

## 当前进程与作品

编辑器PID **4296**，UTC启动 **2026-10-09T04:53:13.7494745Z**，入口 `vendor/WebGAL_Terre/packages/terre2/dist/src/main.js`，仅127.0.0.1:3001。停止前核对PID/时间/入口，进程和日志在 `.local/editor-runtime/`。本轮未生成EXE。

作品 `.local/editor-profile/games/makenovel-round13`，标题“MakeNovel 第十三轮立绘转场验证”，projectId `657ccded-2935-454d-bbd9-76ef2651f9cf`，Game_key `makenovel-round13-f9a5faec-e340-4377-90e5-adbe605a2271`。初始manifest `ce5cc3736c70f5850d55f8aabd0bf1a269b80a05fe1b74c8fe8800308e87eafb`，改稿后Update封存并verify，最终19文件hash `35c747df2044957bd48cecd81f5c50af9774dd7b70e17c7df4d0c22734b2a83c`。备份在 `.local/manifest-backups/657ccded-2935-454d-bbd9-76ef2651f9cf/`。

磁盘18行中14行原字节不变，仅第4/5/10/14行修改。左槽保留-left，自定义目标保留-id=r13-hero和-right，中间仍省略位置。BOM、18个CRLF、作者注释和旧身份保持；仅第14行新增身份 `node-5e79cebc-c140-45d1-8a41-34704116ebf3`。readonly保持原字节。

start最终SHA `7121fcbbb387464c2457358d6be4e64234a0c3496e202fd3e0089b277912e116`，readonlySHA `152d14e0322acb6944452ea4d174b1347ae0cd1d9004fe26171ac8e3ecf228d0`。第4行enter3200/exit3000、第10行duration3000且next=false、第14行duration1600；第5行改对白。

start已保存；撤销、重做、保存按钮禁用；面板与预览关闭。IAB tab7保留交付，独立快速槽为RIGHT对白并已在重开播放器后读回。

本地截图/GUI/逐字节/构建/重放记录 `docs/evidence/local/round13/`，最终截图 `22-final-figure-panel.png`。原作品和玩家存储保留，快速存读档仅针对独立新作品版本。原生存档悬浮预览可能遮挡文本中心；正常推进点可见canvas区域。

runtime收据 `.local/runtime-sync/runtime-build.json`，引擎25文件签名 `aa10038a666fcea893a5501f09723d2427aabee4b433bd0122060e0ea7264e93`。模板备份见本轮editor-build.log。保留所有旧备份、样片和Windows开发包。

## 下一具体单元

```powershell
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round13
npm.cmd run test:director
npm.cmd run test:graph-input
```

编辑器执行到此句建立锚点后，末段一次快速读档未观察到RIGHT恢复，原因未确认；正常首次读回及整页重开后读回均成功。该混合预览路径未计为通过，下一轮先复查该组合，再扩展独立动画。

下一作者单元先审查 `setAnimation` 的目标、资源、keep/parallel、完成推进与跨句持续契约，再确定有限编辑入口；不要直接扩成时间轴。历史/流程图恢复及真实IME矩阵继续单列，完整G1/G2尚未验收。

修改vendor后从本轮完整tree增量导出0011。停editor后baseline:build→editor:build；不并发Terre两个workspace，不在runtime重建parser时运行parser依赖测试/生成/封存。构建后检查生成源码，不忽略未知改动；独立重放期间冻结patch/manifest。普通作品共用模板，自带入口需另行升级。

作品改稿后暂停写入，显式 `npm.cmd run game:seal -- -GamePath '<作品目录>' -Action Update` 并重开。用户已授权开源Git、工具安装和Computer Use；付费与正式发行分开处理。
