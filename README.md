# MakeNovel

面向 Windows 的视觉小说创作工具链：传统玩家体验、人工导演模式，以及共享同一份源码的 AI 创作接口。

**当前版本 0.0.2：Terre 场景编辑已接入共享草稿、显式保存和外部修改冲突保护。** 图形编辑 → 源码编辑 → 保存重开已实机验证；完整导演工具、语法闸门与 Windows 离线发行包仍在开发。

## 开始

需要 Git、Node.js 22、Corepack 和 PowerShell 7。开发基线使用 Yarn 1.22.22，依赖版本来自上游锁文件。

```powershell
git clone --recurse-submodules https://github.com/Elylien/makenovel.git
cd makenovel
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Install
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Build
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Test
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Preview
```

预览仅绑定 `http://127.0.0.1:3000`，显示的是上游示例。Terre 安装与构建说明见 [测试入口](docs/TESTING.md)。独立源码写回实验运行 `npm test`，其边界见 [实验说明](experiments/source-roundtrip/README.md)。

## 启动当前编辑器

完成上述 WebGAL 基线安装后，继续安装 Terre 并应用审查过的补丁：

```powershell
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL_Terre -Action Install
npm.cmd run patch:apply
npm.cmd run editor:build
npm.cmd run test:editor
npm.cmd run test:documents
npm.cmd run editor:start
```

访问 `http://127.0.0.1:3001`。数据隔离在本项目 `.local/editor-profile/`，停止用 `npm.cmd run editor:stop`。这是本机开发预览，不是独立安装包。

场景图形/源码模式共享草稿，修改后点击“保存脚本”（源码支持 Ctrl+S）。发生外部版本冲突时保留草稿并拒绝覆盖，先下载备份再载入磁盘版本。浏览器 sessionStorage 支持本标签页刷新恢复；关闭浏览器后的恢复和跨设备同步尚未验收。JSON 资源/模板仍沿用上游保存方式。完整限制见 [已知问题](docs/KNOWN_ISSUES.md)。

Terre submodule 的 HEAD 仍是原版提交，工作树有意保留应用后的改动；公开源码在根仓库 [patches/terre](patches/terre/)。`npm.cmd run patch:check` 应报告完整匹配，不能把预期的 dirty 状态当成外部修改，也不能 reset。详见 [补丁机制](docs/integrations/TERRE_PATCHES.md)。

## 项目导航

- [当前状态](docs/PROJECT_STATUS.md) / [交接入口](docs/HANDOFF.md)
- [开发计划](docs/DEVELOPMENT_PLAN.md) / [需求追踪](docs/REQUIREMENTS_TRACEABILITY.md)
- [引擎评估](docs/ENGINE_EVALUATION.md) / [Terre 实测](docs/TERRE_BASELINE.md)
- [对标范围](docs/REFERENCE_PARITY.md) / [决策](docs/DECISIONS.md)

`vendor/` 使用 Git submodule 固定上游提交，`upstream.lock.json` 记录版本和锁文件摘要。实验不创建第二套剧情执行器或存档系统。

## 开源与素材

本仓库自有代码采用 MPL-2.0，详见 [LICENSE](LICENSE)。WebGAL、Terre 及其依赖和演示素材保留各自许可，见 [第三方说明](THIRD_PARTY_NOTICES.md)。上游示例仅用于本地验证，不视为本项目正式作品素材。

用户提供的两份原始规划文件只保存在被忽略的 `docs/private/`，不属于公开仓库。公开文档是本项目独立维护的工程计划与证据；未通过项不会标成完成。
