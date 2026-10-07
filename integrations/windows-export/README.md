# Windows 最小作品导出

这是 G0-B 的本地开发验证入口，目标是把已保存的 Terre 作品打成可以直接运行的 Windows x64 文件夹。使用锁定仓库里的 `WebGAL-electron` 和真正的 `ManageGameService.exportGame()`；没有另做播放器。它不读取编辑器尚未保存的草稿，也不发布 release。

```powershell
# 先应用已审查补丁并构建 Terre 后端；依赖安装见 docs/TESTING.md。
pwsh -NoLogo -NoProfile -File scripts/Export-Game.ps1 -GamePath '.local/editor-profile/games/makenovel-round2'

# 将上一条输出的完整目录传入；两个受限网络进程启动/结束回合。
pwsh -NoLogo -NoProfile -File integrations/windows-export/Verify-Package.ps1 -PackagePath '.local/exports/<本次输出目录>'
```

`GamePath` 是包含 `game/config.txt` 的作品根目录。导出器先复制到新的隔离 profile，前后核对源文件与副本摘要，拒绝链接/junction 源文件。原作品不受更改；每次输出新目录，失败保留诊断现场。二进制、临时 profile、包和日志全部在忽略的 `.scratch/`、`.local/`、`docs/evidence/local/` 中。

第一遍会在 `.scratch/windows-export/upstream-shell` 冻结安装 `WebGAL-electron/yarn.lock`，使用 Electron 29.3.3 和 electron-builder 24.12.0。Electron 从官方 GitHub 下载，`@electron/get` 核验包内 checksum。存在标准 HTTP(S) 代理变量时启用其代理支持；构建器复用已安装的 Electron distribution，避免再用上游镜像重新下载。缓存位于壳源码目录外，避免打进成品。后续可复用来源摘要相同的已构建壳；`-RebuildShell` 强制重建。

普通权限下，builder 默认资源修改工具的压缩包包含 macOS 符号链接，Windows 解压曾因权限失败。因此此入口明确设置 `win.signAndEditExecutable=false`：保留默认 Electron 可执行文件图标/元数据，没有 MakeNovel 发布者签名。它不需要管理员权限、修改系统策略或付费证书。正式发行的图标/版本资源、签名、安装器、SmartScreen 和干净用户环境须另验。

打包步骤沿用 Terre：复制壳 → 复制引擎或作品自带引擎 → 修改 manifest → 移除 service worker → 复制作品 game 目录 → 创建 ASAR。只跳过结束时自动打开 Explorer 的副作用。原服务在 Windows 上的 `unpack` 正斜杠 glob 未能匹配规范化路径；已审查补丁改用宿主分隔符的 `unpackDir`，确保 Steamworks `.node` 与相邻 DLL 实际存在于 `app.asar.unpacked`。脚本要求后端已编译此修复，并逐一核对包内 `game/` 下所有作品文件、壳脚本与原文件字节。

成功输出包含 `WebGAL.exe`、`resources/app.asar`、`resources/app.asar.unpacked` 及 Electron 运行依赖。**需完整复制整个目录**，不能只发一个 EXE。`makenovel-export.json` 包含本次源/产物摘要与有限验收状态。

`Verify-Package.ps1` 直接运行包内 EXE，并给子进程仅保留 Windows 系统 PATH，使用独立本地 profile；Chromium 通过不存在的 loopback 代理端口阻断 HTTP(S)，去除隐式 loopback 代理绕过；核对真实渲染器进程、读取场景/游戏信息的日志、file 协议不连接编辑器的日志，并记录网络连接和 NetLog。它先请求正常关闭；隐藏窗口没有可用的 `MainWindowHandle` 时，只结束核验过身份的自建进程并明确记为 `controlled-process-termination`，随后重启。强制结束的 NetLog 可能没有完整 JSON 尾部，不能当作完整网络录制。

它不关闭编辑器/其他服务，不断开全机网络，不测试点击/存读档，不代替实际 GUI、无编辑器服务器、全机断网重启、音频或正式普通用户验收。日志需与实测画面一起审查，不能把“进程活着”直接记成游戏可玩。

2026-10-07 已另用 Windows computer-use 从实际 EXE 完成 GUI 验证：停止本项目 3001 服务并确认 3000/3001 无 listener 后，选择简中、开始游戏、槽 1 存档、Alt+F4 正常退出并确认进程归零，再次启动恢复语言与槽 1 场景对白；1600×900 内容窗口存档菜单未顶部裁切。该 GUI 使用本次新建的默认 `%APPDATA%/webgal-electron-project` 玩家目录，CLI 烟测使用独立目录，两组证据分开记录。机器网络仍开启，未验全部存档边界、DPI 矩阵或无开发工具的干净机器。结果与截图索引见 [实测记录](../../docs/evidence/2026-10-07-windows-export.md)。

参考：锁定[上游壳](https://github.com/OpenWebGAL/WebGAL_Terre/tree/cf73dd58535d3ef15bddf0852adee153fa92d7da/packages/WebGAL-electron)、[Terre 原导出服务](https://github.com/OpenWebGAL/WebGAL_Terre/blob/cf73dd58535d3ef15bddf0852adee153fa92d7da/packages/terre2/src/Modules/manage-game/manage-game.service.ts)、Electron [ASAR 分发结构](https://github.com/electron/electron/blob/main/docs/tutorial/application-distribution.md)、[受支持的网络诊断/代理参数](https://www.electronjs.org/docs/latest/api/command-line-switches)。
