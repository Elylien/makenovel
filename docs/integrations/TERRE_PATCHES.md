# Terre 补丁重放

`scripts/Apply-Patches.ps1` 在原版提交 `cf73dd58535d3ef15bddf0852adee153fa92d7da` 上应用根仓库审查过的补丁。submodule 仍锁定上游提交，根仓库保存补丁与清单。测试兼容适配单独位于 `integrations/terre-tests/`，不需要修改上游测试配置。

清单位置为 `patches/terre/manifest.json`，格式：

```json
{
  "baseCommit": "cf73dd58535d3ef15bddf0852adee153fa92d7da",
  "patches": [
    { "file": "01-reviewed-change.patch", "sha256": "64-digit SHA-256 of the exact patch bytes" }
  ]
}
```

补丁文件按清单顺序应用；清单与实际补丁需由维护者一起审查和提交。工具不会自动生成或接受缺失清单，不会静默更新 hash。

## 使用

在项目根、停止对 vendor 源码的并行写入后运行：

```powershell
pwsh -NoLogo -NoProfile -File scripts/Apply-Patches.ps1 -Check
pwsh -NoLogo -NoProfile -File scripts/Apply-Patches.ps1 -Apply
```

无参数等价于 `-Apply`。`-Check` 报告已经应用的数量和剩余可应用数量；返回成功表示当前状态是已审查的 base 或补丁前缀，不代表所有补丁已经应用。`Already applied` 表示全部补丁已在工作树中，重复调用不再写文件。测试新 clone 可额外指定绝对 `-RepositoryPath` 和 `-ManifestPath`。

## 状态校验与失败处理

1. 验证固定上游 SHA、清单 baseCommit、每份补丁 SHA-256 和清单目录边界；工作树里的暂存改动会被拒绝。
2. 用独立临时 Git index 从上游构建 base 与各补丁前缀的树。另一个临时 index 收集真实工作树的 tracked 文件和未忽略的新文件；必须完全匹配其中一个已知树。
3. 对已应用的前缀，在第三个临时 index 逆序执行 `git apply --reverse --check` 和反向应用，要求最后回到原版树。该步骤兼容重叠补丁、新增文本文件及 binary diff。
4. 正式应用前再次比对工作树，每份应用后比对预期树。未知改动、缺文件、额外未忽略文件、hash 不符或应用失败均停止，不执行 reset/clean，也不自动抹掉用户修改。

临时 index 放在根 `.local/patch-tools/` 并在结束时删除。工具可能向 Git object database 写入 blob/tree，但不更新真实 index、HEAD 或分支。Git 自身负责路径校验与正常 attributes 行尾规范化；忽略的构建产物不参与树比较。不要在并行进程持续写源码时使用该工具：应用前后检查能发现变化，但不构成跨进程文件锁。中途失败时已应用的已知前缀会保留，确认现场后可再次调用。

拒绝未知修改时，先查看 `git -C vendor/WebGAL_Terre status --short` 和实际差异，保存/审查修改。不要通过删除文件、强制覆盖或扩大忽略规则绕过检查。

## 导出已审查修改

Git 默认 diff 不包含未跟踪的新文件。建议在单独 PowerShell 进程中用临时 `GIT_INDEX_FILE`，从固定 HEAD `read-tree`，再把**明确审查过的路径** `git add --all -- <paths>` 放入临时 index，最后执行：

```powershell
git -C $checkout diff --cached --binary --no-ext-diff --output=$patchPath HEAD --
if ($LASTEXITCODE -ne 0) { throw 'Patch export failed' }
```

使用 Git 的 `--output` 直接落盘，避免 PowerShell 重定向改变补丁编码。随后计算 `Get-FileHash -Algorithm SHA256 -LiteralPath $patchPath`，生成清单；恢复调用进程原本的 `GIT_INDEX_FILE` 并删除临时 index。不要向真正的 submodule index 暂存改动来导出，也不要把 root 的私有输入文档加入补丁。

公开之前至少在干净 clone 检查和应用，并在当前开发工作树运行 `-Check` 验证其准确等于清单补丁树。通过测试不等于依赖升级或 Windows 发布验收。

## 工具回归证据

可重复测试入口 `integrations/patch-tests/Test-PatchReplay.ps1` 在新的 shared clone 中生成两份有重叠修改的夹具补丁，包含新增 UTF-8 文本和二进制文件。测试覆盖纯检查、前缀识别、顺序应用、结果字节比对、二次幂等、真实 index 保持、反向恢复，以及 tracked、untracked、staged 用户改动拒绝。测试只操作新 clone，不修改工作中的 vendor。夹具保留在根 `.scratch/`，机器结果保留在忽略的证据目录，脚本不是发行验收。

结果与原始日志：`docs/evidence/local/round2/patch-replay-result.json` 和 `patch-replay.log`。真实产品补丁的独立重放应在导出清单后另行执行并记录。
