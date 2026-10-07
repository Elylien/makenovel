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
