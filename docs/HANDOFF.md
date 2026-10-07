# 交接与恢复

记录：2026-10-07，MakeNovel `0.0.4` / `main`。公开远程为 `https://github.com/Elylien/makenovel.git`。提交与发布状态以 `git log -1 --oneline`、`git status` 和远程现场结果为准。

## 恢复先核查

```powershell
git status --short --branch
git submodule status
git -C vendor/WebGAL status --short
git -C vendor/WebGAL_Terre status --short
npm.cmd run patch:check
pwsh -NoLogo -NoProfile -File scripts/Apply-Patches.ps1 -Target WebGAL -Check
Get-Content -LiteralPath .local/editor-runtime/process.json
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue
```

两个上游 HEAD 仍为锁定原版，工作树有意保留审查改动；公开补丁在根仓，不创建未推送的子仓提交。第四轮 Terre 3/3 独立重放 17 项通过，树 `18b0104c074def8309016c95b9e6e173d743bd47`；WebGAL 1/1 独立重放 18 项通过，树 `8561dc40298a2b72704255d25325b0aefd2aa617`。均与开发树一致，两个真实 index 不变；本地报告为 `docs/evidence/local/round4/product-patch-replay.json` 与 `runtime-independent-replay.json`。第三轮两补丁树仅为历史基线，不能拿它覆盖本轮工作。不要 reset/clean，不把已知补丁状态当外部修改。两份私有原件在 `docs/private/`，任何情况下不公开。

先读 `PROJECT_STATUS.md`、`TESTING.md`、`KNOWN_ISSUES.md`、`DEVELOPMENT_PLAN.md` 和 `SAVE_COMPATIBILITY.md`。公开 clone 对两个目标分别应用补丁后再构建。更新模板前先停止编辑器；`baseline:build` 生成 runtime hash 凭据，`editor:build` 检查后串行构建并 Sync。直接运行上游后端 build 会刷新 npm 引擎模板，需再显式 Sync；详细命令见 TESTING。

## 第四轮完成范围

- SceneDocument 共用撤销/重做：100 步、2 MiB 增量上限，连续输入合组，图形操作独立，保存不清历史；内存历史不随浏览器关闭保存。图形控件响应历史版本同步。
- localStorage 恢复副本按 workspace/path/document owner 隔离，关闭标签页后手动选择；本标签页 session 刷新自动恢复；无工作区身份的旧 v1 session 只列候选。失败保留可用副本并提示下载，不自动清其他窗口副本；没有项目文件系统恢复仓。
- 保存携带 expectedWorkspaceId 并在后端写前检查，防止同名同 revision 跨工作区误写。新增真实 HTTP 3 项回归，相关套件 9/9；根全后端 14 suites / 124 tests 已通过。
- 代码回归 259 项通过：后端 124、文档 56、vault 10、消息 3、源码输入 12、图形输入 7、身份 28、源码实验 19。不能用合成事件或中文填写代替 Windows 真实候选输入验收。
- 最终 GUI 通过图形填中文立即 Ctrl+S、保存后跨视图撤销重做、源码粘贴后 Ctrl+Z/Y/Z、两场景未保存草稿隔离、真实关标签后手动恢复全句再保存，以及另一作品同名场景原文/副本隔离。撤销期间磁盘 hash 不变，最后主作品为已保存。
- 原 1280×720 存档点击导致 body 滚动 332.666…、画布/菜单上移的问题已复现并修复；fixed 根画布在 1280×720、1600×900 和 1280×960 重开存档菜单通过，后者正常上下留白，body 均为 0。
- 受控 runtime Build 174.1 s，25 个非 game 文件已 Sync；模板 game 逐文件 hash 不变，缺失凭据/过期源码/额外产物三个拒绝测试通过。首轮备份在 `.local/runtime-sync/20261007-152815-43345766645c49dcbf32b418cb35a540/previous-template`。完整 editor:build 已通过（前端 262.08 s、后端 46.31 s、再 Sync 25 文件），最终前端重编 2m53s 通过。
- 新作品实际 HTTP 的 25 个引擎文件均匹配凭据，游戏菜单 fixed/root (0,0,1280,720)/body 滚动 0；两个场景 BOM/ID/CRLF 保留（start 10 个 CRLF，chapter-two 2 个，无单独 LF）。本轮未重新验收 Windows EXE。
- 存档兼容只完成锁定源码审查与下一步策略，未迁移原生槽、调用帧、已读或收藏；详见 [SAVE_COMPATIBILITY.md](SAVE_COMPATIBILITY.md)。

本轮确定结果见 [第四轮记录](evidence/2026-10-07-round4.md)。第三轮已完成的核心诊断、持久节点、局部写回和 EXE 一槽正常退出重启证据保留在 [第三轮记录](evidence/2026-10-07-round3.md) 与 [Windows 记录](evidence/2026-10-07-windows-export.md)。这些不是第四轮新包验收。

## 当前进程和数据

第四轮结束时编辑器 PID 33200，仅监听 `127.0.0.1:3001`，真实服务 22 项检查通过；专用 `3000` runtime 预览已关闭，其他用户服务未动。全局 `~/.webgal_terre` 不存在。最终主作品页面为已保存，截图 `docs/evidence/local/round4/editor-ready.png`。恢复时仍须重查，不能按记录的 PID 直接停止程序。

编辑器 `npm.cmd run editor:start`，停止 `npm.cmd run editor:stop`。启动器核验入口、PID、启动时间，作者数据在 `.local/editor-profile/`，状态在 `.local/editor-runtime/`；不能杀所有 Node 进程。原始证据按轮次保存在被忽略的 `docs/evidence/local/`。

`makenovel-round2`、`makenovel-round3` 和第四轮仅含 game 目录的 `makenovel-round4-template` 位于 `.local/editor-profile/games/`。第四轮样片显示名“雨后回信 · 第四轮”，使用独立 Game_key；它用于验证共享模板链路。先读真实文件，不覆盖用户后续编辑。第三轮 EXE 历史产物位于 `.local/exports/MakeNovel 离线样片 20261007-220449-3e6978/WebGAL.exe`。CLI 独立玩家 profile 与 GUI `%APPDATA%/webgal-electron-project` 不得混写成同一证据；普通退出恢复不等于异常退出耐久性。

## 下一单元候选

下一轮优先做两场景 call/return 的原生存档版本门禁、完整导出备份和可靠异步恢复；同 manifest 允许、不同 manifest 拒绝、来源不明旧档保留导出，暂不猜跨版本节点映射。可并行补 Windows 真实中文 IME、DPI、断网/干净环境及更复杂的多场景草稿操作。

重放入口：`npm.cmd run test:editor`、`npm.cmd run test:documents`、`npm.cmd run test:source-input`、`npm.cmd run test:graph-input`、`npm.cmd run test:identity`、`npm.cmd test`。针对本轮工作区 API：`node integrations/terre-tests/run.cjs --no-cache --runTestsByPath src/Modules/webgal-fs/text-snapshot-api.spec.ts`，路径相对 runner 的 Terre backend 工作目录。

导出已有作品仍用 `npm.cmd run game:export -- -GamePath '.local/editor-profile/games/makenovel-round2'`；它调用真实 Terre 服务，先核对模板同步凭据。同步不改作者文件，但无自带 index.html 的普通作品运行/导出会使用更新后的共享模板；自带入口或衍生作品保留自身引擎。两角色演出、声音、等待取消和转场仍沿原执行器推进。

保留边界：完整表达式/插件、JSON/模板事务、项目级恢复、三方合并、非协作 writer 竞态、物理磁盘满、断电耐久性、孤立锁恢复、完整 G0/G1/AT 与正式发行均未完成。Windows 优先、Steam 中文参考、公开仓库/环境工具/Computer Use 授权已确认，不必重问。
