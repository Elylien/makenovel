# 交接与恢复

记录：2026-10-08，MakeNovel `0.0.5` / `main`。公开远程 `https://github.com/Elylien/makenovel.git`。提交/推送以本地 Git 和远程现场查询为准。

## 恢复先核查

```powershell
git status --short --branch
git submodule status
npm.cmd run patch:check
npm.cmd run patch:runtime:check
Get-Content -LiteralPath .local/editor-runtime/process.json
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue
```

先读 PROJECT_STATUS、DEVELOPMENT_PLAN、TESTING、SAVE_COMPATIBILITY、KNOWN_ISSUES。原始用户文件只在被忽略的 `docs/private/`，不得 stage/upload。两个子仓 HEAD 是原版锁定提交，工作树有意应用补丁；不要 reset/clean 或创建未推送的嵌套提交。

WebGAL 当前 2/2 补丁，最终树 `646fda6f874467a892df41f368935fdb00c32ba6`，新补丁 SHA256 `82090d7629b595e484eb09d30afaa3c7aabffe3fdae2faf6316c3acbe3fcdbb4`。本轮独立 clone 重放 18 项通过，无 alternates/hardlinks、幂等/逆向和两真实 index 字节不变。Terre 仍为既有 3/3，第四轮树 `18b0104c074def8309016c95b9e6e173d743bd47`。不要用第四轮单 runtime 补丁覆盖本轮改动。

## 第五轮已完成

精确 manifest 与版本空间、初始化前完整原值备份、串行可靠存储、当前/父场景/历史的恢复预检、异步会话失效、已核验启动资源等待、玩家备份下载及只校验文件、作者预览持续禁存。普通字体初始化免禁存；四个原生鉴赏解锁入口统一使用受控存储。

新增代码 220/220（33 manifest、35 backup、34 compatibility、35 storage、16 initialization、55 restore、12 UI），另有身份 28、源码实验 19、原 parser 34。最终 runtime build 和受控 Sync、完整 Terre build、25 个 HTTP 引擎文件与服务 22 项通过。没有重跑全编辑器历史 259 项。

真实浏览器普通槽和快档、子场景 `letter=7` 与父返回 `answer=42, visit=1`、父文件改动拒绝且原进度保留、备份 8 项/2 副本下载并校验已通过。最终 EXE 40/40 文件一致；3000/3001 服务停止后，一槽正常退出重启读取和 call/return 恢复通过。详细取证见 [第五轮证据](evidence/2026-10-08-round5.md)。

## 进程、作品和本地产物

收尾时已关闭本轮测试 EXE，编辑器重新启动，PID **2812**，仅 `127.0.0.1:3001`。恢复须现场重新核验 PID/启动时间/入口，不能按记录直接杀进程。专用 3000 预览未启动，其他用户进程未动。启动/停止用 `npm.cmd run editor:start` / `npm.cmd run editor:stop`。

新样片 `.local/editor-profile/games/makenovel-round5`，显示名“雨后回信 · 存档验证”，projectId `e731719f-e211-4fe7-9d41-0df5605750a3`，Game_key `makenovel-round5-9e0120660bde`，manifest `3a43048a4659f35a8b07c9879cf17e3d4c8288b615cd514e0cbadc9f2ce027c9`。37 个登记文件；另有 manifest 和 2 个空 `.gitkeep`，总40文件。空普通 `.gitkeep` 不列入 HTTP 核验，其非空/链接形式不放行。先读真实文件，不覆盖用户后续修改。

最终开发包 `.local/exports/MakeNovel 第五轮存档样片 20261008-190446-6619c3/WebGAL.exe`。需要保留整个目录。GUI 使用原生 `%APPDATA%/webgal-electron-project`；浏览器与它属于不同存储环境。早先 184359 / 184656 包已被后续修正取代，不能用它交付或当最终验收。未签名、无正式品牌图标，不是正式发行。

原始日志、截图、备份在 `docs/evidence/local/round5/`；下载备份另在用户 Downloads。编辑器作者数据仍在 `.local/editor-profile/`，模板备份在 `.local/runtime-sync/`。封存前旧清单备份在 `.local/manifest-backups/`，不可清除作者数据或旧玩家键。

## 下一具体单元

先运行以下只读命令核对样片：

```powershell
node integrations/game-manifest/cli.mjs verify --game .local/editor-profile/games/makenovel-round5
npm.cmd run test:runtime-restore
npm.cmd run test:save-storage
```

然后优先补 G2-A 的两角色差分/运动、声音和等待取消、转场中菜单/快进/恢复终态；可先在独立样片中验证。同步测量全资源 hash 的耗时/内存，改善封存与作者预览提示。Windows 真正 IME/DPI/全屏、异常关闭、多槽与流程图/历史恢复、全机离线/干净用户矩阵仍独立推进。

改作品源文件或资产后应先停止其他写入，再 `npm.cmd run game:seal -- -GamePath '<作品目录>' -Action Update` 并重开页面；新版本不会读取旧版本槽，完整旧数据仍保留供备份。校验文件不执行恢复导入，不能靠重新封存推断旧档兼容。

修改 vendor 后重新导出审查补丁，再停止 editor → `baseline:build` → `editor:build`；Terre 无变更且已构建时，重新 runtime build 后 `Sync-Runtime.ps1 -Action Sync` 即可。不得并发 Terre 两 workspace build。共享模板影响普通无自带入口作品的运行/导出；自带引擎需各自升级。

所有完整 AT/G0/G1/G2 仍保留未覆盖边界。用户已确认 Windows 优先、Steam 中文参考、公开 Git/工具/Computer Use 授权；付费服务、正式发行、商业素材另行处理。
