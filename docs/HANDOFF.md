# 交接与恢复

记录：2026-10-08，MakeNovel `0.0.6` / `main`。公开远程 `https://github.com/Elylien/makenovel.git`。提交/推送以本地 Git 和远程现场查询为准。

## 恢复先核查

```powershell
git status --short --branch
git submodule status
npm.cmd run patch:check
npm.cmd run patch:runtime:check
Get-Content -LiteralPath .local/editor-runtime/process.json
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue
```

先读 PROJECT_STATUS、DEVELOPMENT_PLAN、TESTING、STAGE_LIFECYCLE、SAVE_COMPATIBILITY、KNOWN_ISSUES。原始文件只在被忽略的 `docs/private/`，不得 stage/upload。两个子仓 HEAD 是原版锁定提交，工作树有意应用补丁；不要 reset/clean 或创建未推送的嵌套提交。

WebGAL 3/3 补丁，最终树 `c7acf8bad114dd10bc29800b2af4920884d38c14`，0003 SHA256 `7eaa09925ce1516d714d0a418d5f7153f7bcb9d27f4619781e36629b397703f2`。本轮独立 clone 重放 18 项通过，无 alternates/hardlinks、幂等/逆向和两个真实 index 字节不变。Terre 仍为既有 3/3，第四轮树 `18b0104c074def8309016c95b9e6e173d743bd47`，源码本轮未改。不要用旧轮补丁清单覆盖当前修改。

## 第六轮结果

301/301 代码回归，包含第五轮七入口现 231 项和新增五入口 70 项，相对原 220 净增 81；未重跑历史全部作者 259 项。最终 runtime build（61.56 s，Vite 33.01 s）和受控 Sync、25/25 HTTP 引擎、22/22 服务及 18/18 独立重放通过。Terre 沿用前轮构建。

真实浏览器验证双角色、差分、运动、日夜/黑场、菜单等待与拒存/单次继续、稳定槽舞台恢复、两分支值 1/2；音频仅验证媒体状态和时间。Windows 新包 19/19 文件一致，关闭开发服务后一槽正常退出重启，恢复角色/分支并走右线得到 2。详见 [第六轮证据](evidence/2026-10-08-round6.md)。

未结束有限演出、退出对象或菜单后待继续状态禁止新普通/快速存档；未实现最近稳定检查点自动回退或排队。菜单不暂停音画，只阻止剧情。已保存的演出中历史/流程图快照、资源失败、复杂 hold 和异常退出不能由本轮成功推导已支持。

## 进程、作品和本地产物

收尾时测试 EXE 已正常关闭；编辑器重新启动，记录 PID **26324**，启动 UTC `2026-10-08T12:14:28.3127247Z`，仅 `127.0.0.1:3001`。恢复先核验 PID/时间/入口，不能按记录直接杀进程。专用 3000 预览未启动。启动/停止用 `npm.cmd run editor:start` / `npm.cmd run editor:stop`。

新样片 `.local/editor-profile/games/makenovel-round6`，显示名“MakeNovel 第六轮演出验证”，projectId `db2144d8-3d95-405a-afd0-ca85876afb0e`，Game_key `makenovel-round6-07424987-cf60-4467-b75f-698d564ab387`，manifest `e1857aa114f52c4d7fbe45a6a33a33021be92cf662aefc905c46dc5073cb36c6`。18 个登记资源，加 manifest 共 19 个 game 文件；根目录收据/许可合计 22 个源文件。生成器拒绝覆盖既有目录；改稿需显式重新封存。

浏览器入口 `http://127.0.0.1:3001/games/makenovel-round6/`；普通槽 1 在 R6-07、槽 2 在黑场 R6-09。Windows 玩家环境与浏览器独立，槽 1 在第一处分支，保存时间 `2026/10/8 20:11:32`。上轮作品和玩家数据保留，不覆盖。

最终开发包 `.local/exports/MakeNovel 第六轮演出样片 20261008-195608-cc6624/WebGAL.exe`，需要保留整个目录。ASAR SHA256 `b64630067b802313ef5a7dbf3ef03c1db854d31c894d12cad0e7529beaa625e5`。GUI 沿用原生 `%APPDATA%/webgal-electron-project`。未签名、原 Electron 图标/元数据、原创占位素材，不是正式发行。

最终引擎 25 文件签名 `1d2cd946ce91a2fb816e771812ea51269931c94576c58c66b3c0e0e40eb1381b`，收据 `.local/runtime-sync/runtime-build.json`；同步前模板备份 `.local/runtime-sync/20261008-114043-01616a84a62a4f85b5c768c81e3ad976/previous-template`。原始日志/截图在 `docs/evidence/local/round6/`，作者数据/清单旧副本和旧玩家键不得清除。

## 下一具体单元

先运行只读核对，不重建或覆盖现有样片：

```powershell
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round6
npm.cmd run test:menu-lifecycle
npm.cmd run test:runtime-restore
```

下一单元优先补 G2-A 的资源加载失败、复杂持续效果与历史/流程图恢复边界，并把已验证的双角色/声音配置接入导演编辑路径；先明确有限验收，再扩展。最近稳定检查点排队/回退保存、语音 DOM 就绪握手、大作品 hash 成本各自分项。Windows 真正 IME/DPI/全屏、异常退出、多槽和全机离线/干净用户矩阵仍待验收。

改作品源文件/资产后停止其他写入，再 `npm.cmd run game:seal -- -GamePath '<作品目录>' -Action Update` 并重开页面；新版本不读取旧版本槽，旧值保留供备份。备份文件校验不执行恢复导入，重新封存不推断旧档兼容。

修改 vendor 后重新导出审查补丁，再停止 editor → `baseline:build` → `editor:build`；Terre 无变更且已构建时，runtime 重新 build 后 `Sync-Runtime.ps1 -Action Sync` 即可。不得并发 Terre 两 workspace build。共享模板影响普通无自带入口作品；自带引擎需各自升级。

用户已确认 Windows 优先、Steam 中文参考、公开 Git/工具/Computer Use 授权；付费服务、正式发行、商业素材另行处理。
