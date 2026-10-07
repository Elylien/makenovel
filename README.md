# MakeNovel

面向 Windows 的视觉小说创作工具链：传统玩家体验、人工导演模式，以及共享同一份源码的 AI 创作接口。

**当前状态：项目准备与上游基线验证，尚未完成导演编辑器或独立游戏发行包。** 第一候选是 WebGAL + Terre；先验证已有能力，再做可回归的小范围改造。

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

## 项目导航

- [当前状态](docs/PROJECT_STATUS.md) / [交接入口](docs/HANDOFF.md)
- [开发计划](docs/DEVELOPMENT_PLAN.md) / [需求追踪](docs/REQUIREMENTS_TRACEABILITY.md)
- [引擎评估](docs/ENGINE_EVALUATION.md) / [Terre 实测](docs/TERRE_BASELINE.md)
- [对标范围](docs/REFERENCE_PARITY.md) / [决策](docs/DECISIONS.md)

`vendor/` 使用 Git submodule 固定上游提交，`upstream.lock.json` 记录版本和锁文件摘要。实验不创建第二套剧情执行器或存档系统。

## 开源与素材

本仓库自有代码采用 MPL-2.0，详见 [LICENSE](LICENSE)。WebGAL、Terre 及其依赖和演示素材保留各自许可，见 [第三方说明](THIRD_PARTY_NOTICES.md)。上游示例仅用于本地验证，不视为本项目正式作品素材。

用户提供的两份原始规划文件只保存在被忽略的 `docs/private/`，不属于公开仓库。公开文档是本项目独立维护的工程计划与证据；未通过项不会标成完成。
