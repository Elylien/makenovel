# 交接与恢复

记录：2026-10-07，MakeNovel `0.0.1` / `main`。远程 `origin` 为 `https://github.com/Elylien/makenovel.git`，公开可读。提交以 `git log -1 --oneline` 和 `git status -sb` 的现场结果为准，不能只依据本文件认定工作树干净。

## 恢复前先核查

```powershell
git status --short --branch
git submodule status
git -C vendor/WebGAL status --short
git -C vendor/WebGAL_Terre status --short
node --version
corepack.cmd yarn --version
```

先读 `PROJECT_STATUS.md`、`TESTING.md`、`TERRE_BASELINE.md`、`KNOWN_ISSUES.md` 和 `DEVELOPMENT_PLAN.md`。本地原需求在 `docs/private/`；公开 clone 不含原件，请用公开追踪表继续，禁止要求用 `git add -f` 发布原文件。

## 工作边界

本目录开始时没有用户代码。当前仓库文件由本轮新建，vendor 是未修改的上游来源；构建产物、依赖、日志、缓存、截图不进入 Git。若恢复时出现新修改，先识别来源，禁止 reset/clean 或还原用户变动。

已完成 G0-A：环境/仓库、双上游 frozen 安装、原版构建、测试与失败定位、局部源码实验和需求账本。部分完成 G1-A 的内存文本机制；没有接入 Terre、磁盘事务、稳定存档或完整可视化往返。

## 最后实际测试

- WebGAL 原版 build：通过，整体 86.13 s；parser：34/34 通过。
- 自有实验：19/19 通过，0 skip；源码变成 `-next` 参数的边界问题已修复并有原生回归。
- Terre backend/frontend build：通过（31.55 s / 142.45 s）。
- Terre backend tests：退出 1，6 suites/24 tests 通过，3 suites 加载 `trash` ESM 失败；继续时保留该失败基线。
- 浏览器标题/中文首段对白通过；存档面板裁切记录在 `docs/evidence/local/webgal/save-menu-1280.jpg`，未通过完整存档恢复。
- 原始输出在 `docs/evidence/local/`；公开摘要在 `docs/evidence/2026-10-07-baseline.md`。上游和项目锁文件都必须现场重验。

## 进程与产物

WebGAL preview 测试使用 `127.0.0.1:3000`，本轮结束前已核验并停止该任务进程，端口无监听。不要按旧 PID 停止任何新进程。Terre 未启动全局作者服务。浏览器测试页已关闭、临时 viewport 设置已复位。

已构建目录：`vendor/WebGAL/packages/webgal/dist`、`vendor/WebGAL/packages/parser/build`、Terre `packages/origine2/dist` 与 `packages/terre2/dist`。不是离线 Windows exe 包。需要查看播放器时运行 `npm.cmd run baseline:preview`。

## 最可能的下一条工作

先复现并在隔离小补丁中处理 Jest/ESM 配置，不升级整个工程；相关失败命令：

```powershell
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL_Terre -Action Test
```

随后实现仅本机绑定和独立作者 profile 的启动器，确认不写既有 `~/.webgal_terre`，再开 Terre 做原版图形/源码/重开与 Windows 导出基线。将局部补丁的 expected-hash 与结构化失败接入真实后端，处理磁盘原子替换与跨进程竞态；内存库的 hash 检测不能替代落盘事务。

下一轮不要再次询问：项目定位、Windows 优先、Steam 中文版参考、允许开源/环境安装。当前需要用户处理事项：无。具体参考 build/补丁、正式素材和最终审美仍在对应后续验收收集。
