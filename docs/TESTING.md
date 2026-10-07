# 测试入口与证据

日期：2026-10-07。Windows / PowerShell 7.6.5 / Node 22.17.0 / Yarn 1.22.22。来源提交见 `upstream.lock.json`，硬件见 `PERFORMANCE.md`。

## 可重放命令

首次克隆使用 `git clone --recurse-submodules`；已有 checkout 执行 `git submodule update --init --recursive`。在项目根运行：

```powershell
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Install
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Build
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Test
npm.cmd test
node experiments/source-roundtrip/demo.mjs
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Preview
```

Preview 对应原版 `webgal-engine` 的 `vite preview`，限定 `127.0.0.1:3000`，端口占用时失败。它显示上游示例，尚不是 MakeNovel 导演界面。验证后可 Ctrl+C 停止。脚本在运行前校验源码提交与锁文件 hash，原生命令失败会立即抛出错误。

Terre 入口（两次 build 串行，避免共享协议生成目录冲突）：

```powershell
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL_Terre -Action Install
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL_Terre -Action Build
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL_Terre -Action Test
```

冷缓存安装在当前 Windows 上有大量小文件解包，不能仅凭控制台短时无新输出判定挂死。本轮 Terre 共享缓存发生 EEXIST，改用项目内隔离缓存重试，命令和结果见 `TERRE_BASELINE.md`。未运行根 `yarn dev`：其服务器绑定、端口及全局作者数据需先隔离。Terre Build 会更新模板及生成本地化文件，只在确认未含用户修改的上游 checkout 中使用。

## 本轮实际结果

| 检查 | 结果 | 实际证据 |
| --- | --- | --- |
| 两份用户原文件复制与忽略 | 通过 | SHA-256 相等；`git check-ignore` 同时命中；提交集合另行核查 |
| WebGAL frozen install | 通过 | 退出 0，497.51 s；`evidence/local/webgal/install.log` |
| WebGAL 原版 `corepack.cmd yarn build` | 通过 | 退出 0；parser + TypeScript + Vite；Vite 40.10 s、整体 86.13 s；`evidence/local/webgal/build.log` |
| 上游 parser | 通过 | 4 文件、34 测试、0 失败；`evidence/local/webgal/parser-tests.log` |
| 源码实验 | 通过，有限范围 | 核心 + 真实上游 parser；最终数量见实验 README 和 `evidence/local/source-roundtrip-tests.log`；不算完整 AT-03/23 |
| PowerShell 入口语法 | 通过 | PowerShell Parser 无语法错误；Preview 实際进入 localhost 服务 |
| 运行时 browser smoke | 部分通过 | 标题 → 开始 → 简体中文 → 首段对白成功；存档菜单裁切待复核，未执行存读档恢复验收 |
| Terre frozen install / 后端 / 前端 build | 通过 | 隔离安装 940.69 s；后端 31.55 s；前端 142.45 s；专项命令和日志见 `TERRE_BASELINE.md` |
| Terre 后端原版 tests | 失败 | 6 suites / 24 tests 通过，另 3 suites 因 Jest CJS 加载 `trash` ESM 在加载期失败；这些套件不算已测试 |
| Windows 独立包 / 普通用户 / 离线重启 | 未执行 | 尚未构建 Electron 模板与导出作品，不把 Web build 当成成品验证 |
| 完整 AT-01—34 / 音频节奏 / 人工审美 | 未执行 | 各项保留在需求追踪中 |

WebGAL 安装包含上游 peer dependency 警告，构建包含 Vite CJS API 废弃和大 bundle 提示。未通过升级依赖或改警告阈值掩盖这些信息。

浏览器使用 Codex 内置浏览器，最终有效窗口读取为 1280×720。曾尝试 1920×1080 override，但后续标签重建后实际仍为 1280×720，**不声称完成 1920×1080 或 DPI 矩阵**。菜单捕获中 root/menu 的 y 约为 -332.67，尚未区分上游布局与自动化浏览器行为。可选 Live2D 两个库未加载，普通示例能进入对白，Live2D 不在本轮通过范围。

原始命令输出与浏览器截图在 `docs/evidence/local/`，被 Git 忽略，避免将本机路径、缓存和上游素材截图公开。公开证据汇总见 `docs/evidence/2026-10-07-baseline.md`。

## 下一轮必须补的实测

1. 使用隔离作者 profile、loopback 服务和已锁定引擎模板，实际打开 Terre 并完成创建/保存/重开。
2. 定位存档菜单裁切；测试桌面浏览器与目标窗口尺寸，再验证存档、关闭、重启、读取。
3. 接入带版本校验和原子替换的保存 API，再执行图形/源码/外部编辑冲突链路。
4. 制作 Windows 离线包，停止开发服务器，验证中文空格路径、非管理员写盘和持久化。
