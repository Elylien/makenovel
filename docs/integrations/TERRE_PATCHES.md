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

无参数等价于 `-Apply`，默认目标为 `WebGAL_Terre`。`-Target WebGAL` 使用独立的运行时清单，见 [运行时补丁与模板同步](RUNTIME_PATCHES.md)。`-Check` 报告已经应用的数量和剩余可应用数量；返回成功表示当前状态是已审查的 base 或补丁前缀，不代表所有补丁已经应用。`Already applied` 表示全部补丁已在工作树中，重复调用不再写文件。测试新 clone 可额外指定绝对 `-RepositoryPath` 和 `-ManifestPath`。

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

## 第三轮产品补丁

`0.0.3` 保留 `0001-local-editor-versioned-scenes.patch`，按顺序追加 `0002-scene-contract-identities-windows-export.patch`。第二份包含核心场景分析、持久节点身份及图形局部编辑、源码诊断和 Windows native ASAR 旁置修复。两个 submodule 的锁定提交均未改变。

| 文件 | SHA256 |
| --- | --- |
| 0001 | `eb998275cca8241be8206ce85e3a0a9d1bb6371d72ea87d289906657d55a7da5` |
| 0002 | `0a61e99b72608d91a28d63b7411ef95e84670a496a5e399004cb8ed449e23459` |

2026-10-07 在无 alternates、无共享对象的独立干净 clone 中通过 17 项检查：纯检查 `Ready 0/2`、顺序应用 `Verified 2/2`、重复调用幂等、最终工作树和开发树一致、临时 index 逆序撤销 `0002 → 0001` 回到上游树。两个仓库的真实 index 前后 SHA256 完全一致。最终树为 `00be9825e28de33ef40b8e10bd2b7642fdfe9b35`；本地机器报告在 `docs/evidence/local/round3/product-patch-replay.json`。

这是源码可重放检查，产品构建、198 项代码测试与 GUI 子项另见 [第三轮证据](../evidence/2026-10-07-round3.md)。

## 第四轮产品补丁

`0.0.4` 保留前两份补丁的原始字节和摘要，追加 `0003-document-history-draft-recovery.patch`。内容包括场景共享历史、组合输入边界、草稿恢复面板与存储，以及保存工作区前置条件。第三份从第二份应用后的完整树导出，不能直接相对原版 HEAD 导出后再追加，否则会重复包含旧修改。

| 文件 | SHA256 |
| --- | --- |
| 0003 | `78408e0d6fbd4596a043616823a4eb6e6d3bf1cb3902dd04461f906ade677926` |

三份补丁的最终树为 `18b0104c074def8309016c95b9e6e173d743bd47`。构建、独立重放和真实编辑器结果统一见 [第四轮证据](../evidence/2026-10-07-round4.md)。WebGAL 的画布修复使用自己的清单，不能与 Terre 补丁混用。

## 第七轮有限导演补丁

本轮在前三份原字节之后追加 `0004-dialogue-director-session.patch`，从第三份完整树 `18b0104c074def8309016c95b9e6e173d743bd47` 导出增量；submodule HEAD 仍为原版 `cf73dd58535d3ef15bddf0852adee153fa92d7da`。第四份不能直接应用到裸上游，也不重复包含前三份修改。

| 来源 | 第七轮审查值 |
| --- | --- |
| `0004` SHA-256 | `8d9f4c93e176ef47ca372b9b804a190ba1f225859cf3aca058801e759f92aafb` |
| 四份补丁后的完整 tree | `bf2524446919f35385194a1e7b9a3dab3c0aa09a` |

范围是普通单行对白及其紧邻的既有安全舞台/声音命令：局部导演会话复用原生 parser 与已有 token 编辑器，编辑时独立草稿，按需登记节点身份；一次应用到共享文档、整步撤销，主文档或历史版本改变时拒绝过期应用。等待与独立注释只读，未知/条件/多行语法继续作为边界，不推断早先对白或分支的继承舞台。面板打开期间禁用舞台执行入口，应用后仍须显式保存再预览，不新增直接写盘通道。

同份补丁包含导演弹窗的限定样式优先级修正，避免 Fluent 默认宽度和 grid 布局覆盖面板；`stageImageExtensions` 仅给背景、立绘与差分三个选择器增加 SVG，可选视频/模型入口仍沿用原限制，不全局放宽图像选择类型。图形控件代码回归 30 项通过，包含实际控件 SVG 参数和关闭面板前同步释放预览占用的检查。最终浏览器已独立验证修复后布局、选材、取消、整步撤销/重做、保存重开及原生预览；真实 Windows 中文 IME 候选输入仍未验收。

本轮最终构建和独立重放已完成。后续修改第四份补丁时仍需重新构建，并在构建/导出/写源码/Git index 刷新停止后执行完整独立重放：

```powershell
pwsh -NoLogo -NoProfile -File integrations/patch-tests/Test-RuntimePatchReplay.ps1 -Target WebGAL_Terre -ExpectedPatchCount 4 -EvidencePath docs/evidence/local/round7/terre-independent-replay.json
if ($LASTEXITCODE -ne 0) { throw 'Terre independent replay failed' }
```

最终独立重放 **18/18** 通过，准确匹配上表 `0004` 摘要和完整树，未沿用旧补丁或前轮树的检查结论。新脚本使用无 hardlinks/alternates 的独立 clone、临时 index 验证正反向和幂等，并核对开发树及真实 index 不变；完整语义见 [补丁回归说明](../../integrations/patch-tests/README.md)。最终 GUI、模板同步和 EXE 结果分别记录，不由补丁应用成功推定。第七轮最终 EXE 在开发服务全程停止时独立通过坏 SVG failed 后两种拒存、原槽保留、快读 BASE、换 day 恢复两种保存，以及正常退出重启后槽 2 恢复 RECOVER 和双角色；未全机断网，详细有限证据见 [第七轮记录](../evidence/2026-10-08-round7.md)。
