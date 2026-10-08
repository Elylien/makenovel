# 补丁工具回归

前提：PowerShell 7、Git，以及已经初始化的锁定 `vendor/WebGAL_Terre` submodule。不需要 Node、依赖安装、产品构建或正式补丁 manifest。

在项目根运行：

```powershell
pwsh -NoLogo -NoProfile -File integrations/patch-tests/Test-PatchReplay.ps1
if ($LASTEXITCODE -ne 0) { throw 'Patch replay regression failed' }
```

脚本根据自身位置定位项目，也可以从任意工作目录用绝对 `-File` 路径运行。每次创建 `.scratch/patch-replay-<uuid>/checkout`，从本地 submodule 共享 Git objects 克隆，固定检出上游 SHA；当前开发 vendor、真实 index 和正式 patch manifest 均不变。

11 项断言覆盖 clean check、已知 patch 前缀、重叠补丁、新增 UTF-8/二进制文件、结果字节一致、重复应用、真实 index 不变、反向恢复和 tracked/untracked/staged 脏改拒绝。输出中每条 `PASS` 对应实际检查；任何失败抛出异常并返回非零。

机器可读结果写入 `docs/evidence/local/round2/patch-replay-result.json`。新 clone 和夹具保留用于诊断，均由 `.gitignore` 排除；不要将其或包含本机路径的日志提交。该夹具验证补丁工具，真实产品补丁仍需独立重放验证。

导出和安全拒绝规则见 [Terre 补丁说明](../../docs/integrations/TERRE_PATCHES.md)。

## 真实 WebGAL 补丁独立重放

`Test-RuntimePatchReplay.ps1` 按当前 `patches/webgal/manifest.json` 重放全部已审查补丁，不固定为两份或三份。可用 `-ExpectedPatchCount` 额外约束本轮数量；默认 `0` 表示采用当前非空清单。也可显式传入 `-ManifestPath` 和 `-EvidencePath`。

```powershell
pwsh -NoLogo -NoProfile -File integrations/patch-tests/Test-RuntimePatchReplay.ps1 -ExpectedPatchCount 3 -EvidencePath docs/evidence/local/round6/runtime-independent-replay.json
if ($LASTEXITCODE -ne 0) { throw 'Runtime replay failed' }
```

**先停止构建、补丁导出、Git index 刷新和源文件编辑，再运行。** 本脚本不能替其他进程加锁；并发刷新真实 index 会让字节不变断言失败，应在写入者结束后重新验证，不覆盖或修复真实 index。

每次建立新的 `.scratch/runtime-independent-replay-<uuid>/checkout`。克隆使用 `--no-hardlinks --no-checkout`，不使用 `--shared` 或 alternates；验证对象数据库完整性。所有 tree 计算和反向应用使用独立临时 index，真实 index 只读取。Git 及补丁工具子进程清除继承的替代 Git 路径并设置 `GIT_OPTIONAL_LOCKS=0`，避免可选的 index 刷新。补丁工具仍可能向 Git 对象库写入用于验证的对象，此处不承诺对象库字节不变。

保留上一轮 18 项核心检查：锁定 base、清单数量与 SHA、开发树一致、干净独立 clone、无 alternates、对象连接、Check 不改工作树、首次应用、重复应用、应用后 Check、完整树幂等、独立树等于开发树、逆向回到 base、逆向不改工作树、开发树不变、两个真实 index 的暂存状态与文件字节均不变。最后复核清单和全部补丁原字节没有在运行期间变化。

默认 JSON 写到 `docs/evidence/local/patch-replay/runtime-independent-replay.json`；第六轮命令将其写到本轮证据目录。结果包括全部补丁 SHA-256、完整 tree、base tree、index 前后哈希与各项检查。失败也会记录已完成检查和错误，不能视为通过。输出的独立 clone 保留，未安装依赖、未构建产品、未改共享模板，因此不能替代浏览器或离线 EXE 验收。
