# WebGAL 运行时补丁与模板同步

更新：2026-10-07，MakeNovel `0.0.4`。运行时仍锁定 WebGAL `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`；依赖版本不变。根仓 [清单](../../patches/webgal/manifest.json) 和 `0001-fixed-player-viewport.patch` 记录 fixed 根画布修复，避免缩放后的存档菜单被 body 滚动带出视口。它不改原生剧情执行或存档协议。

Terre 使用单独的 [补丁链](TERRE_PATCHES.md)。两个 submodule 保持原版 HEAD，已审查修改保留在工作树；不要 reset/clean，也不要把补丁状态误当外部修改。

## 顺序与入口

首次 clone 先按 README 安装两套锁定依赖。升级或重建时，**先停止编辑器，再更新源码、构建或同步共享模板**；不要让源码写入、两个 workspace build 或模板同步并行运行。

```powershell
npm.cmd run editor:stop
npm.cmd run patch:runtime:check
npm.cmd run patch:runtime:apply
npm.cmd run patch:check
npm.cmd run patch:apply
npm.cmd run baseline:build
npm.cmd run editor:build
npm.cmd run editor:start
```

`patch:runtime:*` 等价于 `scripts/Apply-Patches.ps1 -Target WebGAL -Check/-Apply`；不带 Target 的 `patch:*` 默认检查 Terre。检查成功表示工作树属于合法 base 或补丁前缀，只有 `Already applied` 表示当前目标全量已应用。工具核验清单/补丁摘要和临时 index 中的顺序、逆向重放，不改真实 index；拒绝未知修改，不能靠删文件或扩大忽略规则绕过。

构建顺序由 [Invoke-Upstream.ps1](../../scripts/Invoke-Upstream.ps1) 和 [Sync-Runtime.ps1](../../scripts/Sync-Runtime.ps1) 连接：

| 入口 | 实际动作 |
| --- | --- |
| `baseline:build` | 委托 Sync-Runtime `Build`：检查锁定 HEAD、yarn.lock 和完整 runtime 补丁状态，执行真实上游构建，校验构建前后源码，再记录产物摘要 |
| `editor:build` | 先 Sync-Runtime `Check`，再串行构建 Terre 前端/后端，最后 `Sync`；避免上游后端刷新 npm 模板后丢失本项目 runtime 修复 |
| Sync-Runtime `Check` | 只核验 runtime 构建凭据与当前来源/非 game 产物；不构建、不同步模板 |
| Sync-Runtime `Sync` | 重新核验凭据，构造并验证完整候选模板，再保留旧模板并切换目录；不构建 |

单独检查或同步：

```powershell
pwsh -NoLogo -NoProfile -File scripts/Sync-Runtime.ps1 -Action Check
pwsh -NoLogo -NoProfile -File scripts/Sync-Runtime.ps1 -Action Sync
```

若直接运行上游 `yarn workspace webgal-terre-2 build`，其 `update-webgal.ts` 会从 npm 依赖刷新内置模板；结束后须显式 `Sync`，不能把该上游命令的成功当作本项目 runtime 已同步。

## 构建凭据验证什么

凭据在被忽略的 `.local/runtime-sync/runtime-build.json`，包含 schema、构建时间、锁定提交、补丁清单摘要、源码摘要，以及 dist 中非 `game` 引擎文件的逐文件 hash/汇总摘要。构建开始前移除旧凭据；失败或构建期间源码变化时不生成新凭据。

`Check`/`Sync` 拒绝缺失或未知格式凭据、源码不匹配、必要产物缺失和任意非 game 产物 hash 变化。需要重新执行受控 `baseline:build`，不能手改凭据 hash 来接受来源不明的产物。凭据绑定本机已审查源码与当前输出，不是签名发行、跨机器可复现二进制证明或玩家存档版本协议。

上游生成的 `webgal-engine.json` 按解析后的内容核验，避免纯 JSON 行尾重写造成误判；其余被纳入的源码/产物仍按实际字节摘要核验。具体覆盖范围以脚本和凭据记录为准。

## 同步范围与作品影响

目标是 `vendor/WebGAL_Terre/packages/terre2/assets/templates/WebGAL_Template`。同步只管理 runtime dist 的非 `game` 顶层条目；先将模板 `game` 与其他不受管理的文件保留到候选目录，再复制已核验引擎。同步前后检查候选引擎、模板剧情及原模板未被并发修改，不扫描或改写作者作品目录。

**作者文件不变，不等于旧作品的运行引擎不变。** 没有自带 `index.html` 的普通作品使用共享模板运行/导出，更新模板也会改变这些旧作品的实际引擎。自带入口或衍生引擎的作品保留自己的引擎；该同步不升级它们，也不据此宣称其窗口问题已修复。

重建/同步前停止编辑器，脚本不会替用户自动停止进程。确认新模板后再启动，并用独立作品验证；已有作者内容、素材与玩家存档不得作为同步夹具覆盖。

## 目录备份与失败边界

每次同步建立 `.local/runtime-sync/<时间戳-随机标识>/`：

- `staged-template/`：切换前已校验的候选；成功切换后移至内置模板路径。
- `previous-template/`：切换时保留的旧模板，不自动清理。
- `sync-result.json`：成功切换后记录来源摘要、引擎摘要、文件数、模板 game 摘要及备份路径。

候选校验失败时不切换原模板。切换先把原模板移到备份，再把候选移入；第二步失败时尝试恢复原模板。路径必须在当前工作区内且无链接/junction。两次目录移动不是跨断电的原子事务，也没有覆盖所有并发外部写入、磁盘满、锁占用或恢复失败场景。

中断后先停止服务，读取日志和对应 run 目录，确认当前模板、候选与备份的实际内容；不要删除 `previous-template` 或覆盖唯一副本来让检查通过。该备份是模板目录备份，不包含作者作品和玩家数据，也不替代它们的备份。备份会占用磁盘，需要在验证完成后由维护者明确管理。

## 当前证据边界

独立 runtime 的原裁切已复现；1280×720、1600×900 和 1280×960 重新打开存档菜单的回归已通过，后者保留正常上下留白。受控 Build 174.1 s；25 个引擎文件已 Sync，模板 game 逐文件 hash 不变。缺失凭据、源码凭据过期、额外产物三类负例均拒绝，临时改动已恢复。

runtime 单补丁已在 `--no-hardlinks --no-checkout`、无 alternates 的独立 clone 通过 18 项：0/1→1/1、幂等、临时 index 逆向回 base、fsck、开发树一致及两个真实 index 字节不变。最终树为 `8561dc40298a2b72704255d25325b0aefd2aa617`，本地报告为 `docs/evidence/local/round4/runtime-independent-replay.json`；此前 shared clone 报告保留作历史。

完整 editor:build 已完成 Check→前端/后端构建→Sync 25 文件，最终前端重编 2m53s 通过；Terre 三补丁独立重放 17 项也通过。仅含 game 的新作品实际 HTTP 请求验证 25 个引擎文件全部匹配凭据，实际游戏菜单 fixed/root (0,0,1280,720)/body 滚动 0。记录见 [第四轮证据](../evidence/2026-10-07-round4.md)。DPI/全屏和新的 Windows EXE 本轮未验收，不能由独立浏览器或模板传播替代。

最新状态、命令与限制见 [TESTING.md](../TESTING.md) 和 [PROJECT_STATUS.md](../PROJECT_STATUS.md)；旧档兼容仍仅为 [设计审查](../SAVE_COMPATIBILITY.md)。
