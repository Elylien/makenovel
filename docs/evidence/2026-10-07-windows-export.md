# Windows 离线导出记录

日期：2026-10-07。来源：Terre `cf73dd58535d3ef15bddf0852adee153fa92d7da` 的 WebGAL-electron 与导出服务，Electron 29.3.3、electron-builder 24.12.0、Node 22.17.0、PowerShell 7.6.5。实际系统 Windows 11 `10.0.26200.0` / x64，当前令牌未提升权限。

## 缺口与修复

1. 根 Terre workspaces 排除了 `packages/WebGAL-electron`；之前安装/构建编辑器并未生成 `WebGAL_Electron_Template`。因此仅原版 Web build 成功不能得到 EXE。新增本地导出入口从锁定壳源码的副本冻结安装并构建，不改上游壳和锁文件。
2. 原始 Node 下载 Electron 时 `ECONNRESET`。启用 `ELECTRON_GET_USE_PROXY=true` 后，使用已有标准代理变量从官方 GitHub 成功取得与校验 29.3.3；重试 frozen install 168.75 秒通过。
3. builder 使用自定义 GitHub mirror 时按镜像布局拼出缺少 `v` 的版本路径并返回 404；最终复用 `@electron/get` 已安装/校验的 `node_modules/electron/dist`，没有换版本或使用非官方二进制。
4. 默认 winCodeSign 解压包含 macOS 的 `libcrypto.dylib`/`libssl.dylib` 符号链接，普通权限 Windows 创建失败。开发包命令设置 `win.signAndEditExecutable=false` 后，原壳构建退出 0（2.17 秒）。包保持默认 Electron EXE 图标/元数据，没有 MakeNovel 发布者签名；正式发行工作仍单独验收。
5. 实际调用原 Terre 导出服务后，原 `unpack: '**/node_modules/steamworks.js/dist/**'` 在 Windows 没有匹配规范化的反斜杠路径。ASAR 实包清单显示原生 `.node` 和相邻 DLL 均为 `pack`，没有 `app.asar.unpacked`。审查补丁改为 `unpackDir: join('node_modules', 'steamworks.js', 'dist')`；真实 ASAR 回归 1/1 通过，检查 DLL 与 `.node` 旁置、中文空格路径、作品 BOM/CRLF 字节和源目录清理。

## 可重放入口

```powershell
pwsh -NoLogo -NoProfile -File scripts/Export-Game.ps1 -GamePath '.local/editor-profile/games/makenovel-round2'
pwsh -NoLogo -NoProfile -File integrations/windows-export/Verify-Package.ps1 -PackagePath '.local/exports/<本次输出目录>'
```

导出器调用实际已构建的 `ManageGameService.exportGame()`，不运行 HTTP 服务，不修改原作者作品或正在运行的编辑器。只有结尾自动打开 Explorer 被跳过。复制、manifest、移除 SW、作品复制、ASAR 均为原链路。构建前要求 backend 已含 native-ASAR 修复；产物验证逐项比较作品文件与原文、原壳脚本、native unpack 文件以及源作品前后 SHA256。

详见 [入口说明](../../integrations/windows-export/README.md)。完整原始日志保存在忽略目录 `docs/evidence/local/round3/windows-export/`；产物在 `.local/exports/`，临时壳与副本在 `.scratch/windows-export/`。这些不进入公开 Git。示例仍使用上游开发素材，不能当作正式素材许可审核完成。

## 实际结果

最终包生成成功，命令退出 0；目录 `.local/exports/MakeNovel 离线样片 20261007-220449-3e6978/`，入口 `WebGAL.exe`。81 个文件合计 318,869,591 字节（约 304.10 MiB）；包含整个 Electron 运行时，普通使用无需 Node/Yarn。37/37 个作品文件与输入逐字节相同、原作者目录前后 hash 一致、native `.node` / DLL 真实旁置、SW 移除均通过。ASAR SHA256 为 `37cdae067bf4593a313a99f4042248a9fd46ad73463181dfe6ac710843782c03`，本次详细清单在包内 `makenovel-export.json`。

过程验证报告 `local/round3/windows-export/player-20261007-220739-d0a727/process-smoke.json`：当前普通权限令牌分别直接启动 EXE 两次，每次观察 12 秒。子进程 PATH 仅含 Windows 系统目录，使用独立 `.local/exports/player-profile-.../chromium`，实际创建 IndexedDB、Local Storage 与日志。两次均有真实 Electron renderer，日志加载 WebGAL 4.6.5、`start.txt`、作品配置、模板、背景/立绘预载，并确认 file 协议跳过编辑器 WebSocket；第二次读取已有本地存储。采样时两次包进程的 TCP 连接集合均为空。

本机按后台工具规则用 `-WindowStyle Hidden` 启动，隐藏窗的 `.NET MainWindowHandle` 为 0。首版测试错误要求可见窗口句柄，失败后已修正为核对真实 renderer 与游戏读取日志；这项修正没有扩大为 GUI 验收。最终两次结束方式均明确为 `controlled-process-termination`，不是用户正常关窗。NetLog 没有完成 JSON 尾部，不能作为完整网络录制；保留作诊断，不能根据未落盘的事件断言完全没有请求。

非 GUI 测试结束时，两个受测进程均已结束；该阶段保留编辑器 3001 和用户另一项目 5173。HTTP(S) 对该 Chromium 子进程指向不存在的 `127.0.0.1:9` 代理且去掉 loopback 绕过，全机网络没有关闭。可选 Live2D 两个库缺失警告沿用既有基线，未误记为通过。

## 独立 EXE 的实际 GUI 与存读档

随后根代理使用 Windows computer-use 直接启动上述产物 EXE。测试前执行受管 `Start-Editor -Stop`，现场核对 3000、3001 均没有 listener；用户另一项目 5173 服务保留。GUI 测试没有物理断网，也没有卸载本机 Node，不把“脱离两个项目开发端口”扩大为整台机器没有开发工具或网络。

首次启动选择简体中文后开始游戏，背景、立绘和凛的对白实际显示正常。在 1600×900 内容窗口打开存档菜单，未观察到上轮浏览器的顶部裁切。点击空槽 1 后，槽位出现缩略图、时间 `2026/10/7 22:16:54` 和完整当前对白。

随后用 Alt+F4 正常关闭窗口，结合 `Get-CimInstance` 和 computer-use 窗口列表确认 WebGAL 进程为 0，再次从同一 EXE 启动。语言设置保留，读档菜单中的槽 1 仍在，点击后恢复同一场景和对白。这个闭环验证的是一个真实存档槽与一个实际场景，不能代替多槽、覆盖、跨场景、分支、坏档、旧档迁移或所有保存时机的验收。

GUI 阶段使用本次首次启动在 22:11 创建的默认玩家目录 `%APPDATA%/webgal-electron-project`；CLI 烟测才使用 `.local/exports/player-profile-.../chromium`。玩家默认目录和作者 `~/.webgal_terre` 是不同用途，本次没有改动后者。恢复证据不能写成在独立 CLI profile 中完成。

已落盘截图（本地忽略目录）：

- `local/round3/windows-dialogue.png`：实际背景、立绘和对白。
- `local/round3/windows-save-menu.png`：1600×900 内容窗口的存档菜单。
- `local/round3/windows-saved-slot.png`：含时间、缩略图、对白的槽 1。
- `local/round3/windows-loaded-slot.png`：正常退出并重启后，从槽 1 恢复的场景和对白。

**通过：Windows 原链路导出、中文空格目录、普通权限及无 Node PATH 的 CLI renderer 启动、独立 CLI 本地写入与进程重启，以及无 3000/3001 开发服务时的实际 EXE 开始游戏→槽 1 存档→正常退出→重启读档恢复。未验收：全机断网、全部存读档边界、DPI/视口矩阵、音频、异常写盘、干净用户机器、正式签名/安装发行。** 以上是 G0-B 与玩家存读档的有限子项证据；1600×900 未裁切不代表上轮 1280×720 浏览器裁切已修复。

参考资料：[锁定原壳](https://github.com/OpenWebGAL/WebGAL_Terre/tree/cf73dd58535d3ef15bddf0852adee153fa92d7da/packages/WebGAL-electron)、[原导出服务](https://github.com/OpenWebGAL/WebGAL_Terre/blob/cf73dd58535d3ef15bddf0852adee153fa92d7da/packages/terre2/src/Modules/manage-game/manage-game.service.ts)、Electron [ASAR 分发](https://github.com/electron/electron/blob/main/docs/tutorial/application-distribution.md)、[网络诊断参数](https://www.electronjs.org/docs/latest/api/command-line-switches)。
