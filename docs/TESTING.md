# 测试入口与证据

更新：2026-10-07，MakeNovel `0.0.2`。实测环境：Windows / PowerShell 7.6.5 / Node 22.17.0 / Yarn 1.22.22。来源提交见 `upstream.lock.json`，硬件见 `PERFORMANCE.md`。

本轮完成隔离 Terre 的第一条图形修改、源码修改、手动保存、重开和外部修改冲突链路。子项通过不表示 G0、G1 或完整 AT 整体验收通过。

## 安装、补丁与构建

首次克隆使用 `git clone --recurse-submodules`；已有 checkout 执行 `git submodule update --init --recursive`。恢复工作先核验 Git、submodule 和正在运行的进程。在项目根运行：

```powershell
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL_Terre -Action Install
pwsh -NoLogo -NoProfile -File scripts/Apply-Patches.ps1 -Check
pwsh -NoLogo -NoProfile -File scripts/Apply-Patches.ps1 -Apply
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL_Terre -Action Build
```

补丁工具检查锁定 SHA、补丁摘要和已知补丁前缀；未知 tracked、untracked 或 staged 改动会拒绝，不会 reset/clean 用户修改。`-Check` 成功只代表当前为合法 base 或补丁前缀，剩余补丁需执行 `-Apply`。规则和导出流程见 [TERRE_PATCHES.md](integrations/TERRE_PATCHES.md)。

Terre Build 串行构建前后端，避免共享 preview protocol 生成目录冲突；会更新引擎模板及本地化生成文件。不要并发运行两个 workspace build。需要单独构建时，在 `vendor/WebGAL_Terre` 运行 `corepack.cmd yarn workspace webgal-origine-2 build`，结束后再运行 `corepack.cmd yarn workspace webgal-terre-2 build`。

## 自动化回归

在项目根运行，各原生命令应检查退出码，失败时停止依赖步骤：

```powershell
node integrations/terre-tests/run.cjs --no-cache
node integrations/scene-document-tests/run-tests.mjs
node integrations/scene-document-tests/run-message-tests.mjs
pwsh -NoLogo -NoProfile -File integrations/patch-tests/Test-PatchReplay.ps1
npm.cmd test
```

后端兼容入口执行全部原断言与新增 spec，转换真实 ESM 依赖，不 mock 掉文件系统或业务模块，不升级锁文件。前提是 Terre 依赖已安装、共享协议已构建。`Invoke-Upstream.ps1 -Target WebGAL_Terre -Action Test` 仍是原版入口，保留用于复现 CJS/ESM 加载失败；当前回归使用 `run.cjs`。详见 [测试适配](../integrations/terre-tests/README.md)。

机器可读报告：

```powershell
$resultPath = Join-Path (Get-Location).Path 'docs/evidence/local/round2/terre-backend-all.json'
node integrations/terre-tests/run.cjs --no-cache --json --outputFile $resultPath
if ($LASTEXITCODE -ne 0) { throw 'Terre tests failed' }
```

场景机制测试打包真实前端模块后使用 Node test runner；消息测试对 React、网络和 Monaco 边界使用测试替身，检查实际注册的回调及 iframe 脚本。不能替代浏览器渲染、IME 或实际预览验收。补丁夹具在 `.scratch/` 新 clone 测试，不修改开发 vendor；夹具通过也不能替代最终产品补丁的独立重放。

## 启动与真实服务检查

应用补丁并构建后，在项目根运行：

```powershell
pwsh -NoLogo -NoProfile -File scripts/Start-Editor.ps1 -Background
node integrations/terre-launcher/verify-editor.mjs
pwsh -NoLogo -NoProfile -File scripts/Start-Editor.ps1 -Stop
```

默认编辑器为 `http://127.0.0.1:3001`，`-Port 3011` 可选择空闲端口。作者数据置于 `.local/editor-profile/`，进程状态和日志置于 `.local/editor-runtime/`；不使用既有全局作者目录，也不运行上游开放 host/80 代理入口。停止命令核对 PID、启动时间、进程名和入口。当前进程状态以现场为准，不依赖旧 PID。

HTTP API 与两个 WebSocket gateway 使用同一个 loopback listener，并核验准确的 Host、Origin/Referer 与 Fetch Metadata。命令行 API 请求需带 `Origin: http://127.0.0.1:3001`；PowerShell 请求同时用 `-NoProxy`。这些限制防止其他网页从浏览器驱动本机接口，不认证可自行构造请求头的本地进程，也不隔离可信本地代码。详见 [启动器说明](../integrations/terre-launcher/README.md)。

## 本轮 0.0.2 实际结果

| 检查 | 结果 | 证据与范围 |
| --- | --- | --- |
| Terre 后端完整回归 | 通过：11 suites / 66 tests，0 pending，25.616 s | `evidence/local/round2/terre-backend-all.log` 与 `.json`；上游 37 条、profile 3 条、事务与 HTTP 26 条 |
| 后端生产构建 | 通过，退出 0，10.73 s | `terre-backend-build.log`；锁定 Yarn 1.22.22 |
| 最终前端构建 | 通过，退出0，106.90 s | `terre-frontend-final-build.log`；包括最终iframe/草稿改动 |
| 场景文档机制 | 通过：22 项 | `run-tests.mjs` 本轮输出；草稿、冲突、失败重试、保存中继续编辑、过期完成、存储失败、BOM/混合行尾等有限机制 |
| postMessage 边界 | 通过：3 项 | `run-message-tests.mjs`；准确 origin/source、载荷类型、准确目标 origin、程序载入快照不触发写入 |
| 实际 HTTP / WebSocket 服务 | 通过：22 项 | `verify-editor.mjs` 本轮输出；隔离 profile、同源允许、外来源/错误 Host/无来源拒绝、阻止真实写路由和错误来源升级 |
| 补丁工具夹具 | 通过：11 项 | `patch-replay-result.json`、`patch-replay-promoted.log`；重叠补丁、新文件/二进制、幂等、逆向恢复、脏改拒绝 |
| 真实编辑器基本链路 | 通过有限场景 | 建立隔离作品 → 图形改对白保存 → 源码追加注释手动保存 → reload 后保留；`ui-original.txt`、`ui-after-graph.txt` |
| 草稿与外部修改冲突 | 通过有限场景 | 草稿切换图形视图仍保留；外部 shell 追加磁盘注释后保存返回 409；草稿保留、磁盘 hash 未被冲突保存改变；`ui-external.txt`、`editor-conflict.png` |
| 草稿下载 | 通过 | 实际下载到本机 Downloads 后检查内容；证据副本 `ui-downloaded-draft.txt` |
| 根源码实验 | 本轮复测19/19，0 skip | `npm.cmd test`；`source-roundtrip-final.log` |
| 完整语法闸门、稳定 ID、存档迁移 | 未完成 | 显式保存和 dirty 不执行不能代替 S-05；UI UUID 尚未成为持久身份 |
| Windows 独立包、离线重启、普通用户验收 | 未执行 | Web build 与 loopback GUI 不等于成品验收 |
| 存档菜单裁切、声音、完整 AT、人工审美 | 本轮未复测 / 未验收 | 裁切原因未知；G0/G1 仍未整体通过 |

以上本地日志、JSON、`ui-*.txt` 与截图位于 `docs/evidence/local/round2/`。原始输出、截图、Downloads 草稿和本地 profile 不属于公开产品素材；证据目录和运行数据被 Git 忽略。

### 保存事务的已验证范围

新场景主路使用 `textSnapshot` / `saveTextSnapshot`：真实 UTF-8 字节 SHA256 作为 revision；同文件请求串行，共同写入者使用 lockfile；同目录临时文件写入、fsync 后替换，再返回成功。真实测试覆盖中文空格路径、BOM/CRLF、未知内容、缺失文件、Windows 只读失败、路径/junction 拒绝、非法 UTF-8、同进程与独立 Node 进程双 writer，以及 HTTP 409 结构化冲突。

未物理制造磁盘满；fsync 临时文件不等于已验证断电后的目录元数据持久性。非协作外部进程仍可在最后 hash 检查与 rename 之间写入，不宣称任意进程之间的严格 CAS。异常遗留锁需先检查，不能自动抢锁。旧 JSON 资源、模板及内部通用写接口仍不享有 revision 事务；postMessage 来源校验不改变其保存语义。

图形编辑已验证简单场景中未修改的行和 BOM/CRLF 保留；修改语句仍使用上游 serializer，可能标准化空格、丢失重复参数或改变注释间距。因此不能据此宣称任意原生源码无损往返。

## 上一轮基线与保留诊断

WebGAL frozen install、原版生产构建、parser 34 项、根源码实验 19 项，以及 Terre frozen install/前后端构建均在上一轮通过，证据见 [基线汇总](evidence/2026-10-07-baseline.md) 与 [TERRE_BASELINE.md](TERRE_BASELINE.md)。本轮未重复执行的项目保留历史日期。

原版 Terre Jest 仍有 3 套件加载 ESM-only `trash` 失败的可复现基线；本轮独立兼容配置使原断言全部执行通过。shared-cache 的 EEXIST 已通过隔离缓存重试处理，未删除全局缓存或更换锁文件。Vite CJS 废弃、大 bundle 和可选 Live2D 库警告仍保留。

上一轮 IAB 实际窗口为 1280×720，打开存档菜单后 root/menu 的 y 约 -332.67；没有完成 1920×1080、DPI 矩阵或存读档恢复验收，本轮没有复测该裁切。需要重放原版播放器时：

```powershell
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Build
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Test
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Preview
```

Preview 限定 `127.0.0.1:3000`，端口占用时失败，显示原版示例，结束后 Ctrl+C 停止。

## 下一轮具体补测

1. 建立可诊断的草稿语法/命令有效性闸门，验证无效源码保存、预览、恢复的边界，继续保留未知命令原文。
2. 补齐图形所编辑语句的局部写回、持久节点身份及插入/复制/移动证据；独立设计旧存档映射和迁移。
3. 扩展 IME、更多语句类型、恢复重启与冲突合并；记录旧 JSON/模板写路径的事务改造范围。
4. 定位存档菜单裁切，验证普通桌面视口、声音和真实存档关闭重启恢复。
5. 制作 Windows 离线包，停止开发服务器，实测中文空格路径、非管理员写盘、异常写盘和离线重启。

正式产品补丁独立重放10项检查通过，开发树与全新clone树相同；具体见 `local/round2/product-patch-replay.json`。最终构建的浏览器重开及运行已保存对白通过，检查时控制台error记录为空；这不扩大为完整玩家验收。
