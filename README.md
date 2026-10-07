# MakeNovel

面向 Windows 的视觉小说创作工具链：传统玩家体验、人工导演模式，以及共享同一份源码的 AI 创作接口。

**当前版本 0.0.4：共享撤销/重做、关闭标签后手动恢复草稿，以及播放器菜单裁切修复已通过有限真实界面验证。** 259 项代码回归、构建与两子仓独立补丁重放通过；已有 Windows 开发包和一槽退出重启读档证据来自第三轮。完整导演工具、插件、旧档迁移与正式发行仍在开发。

## 开始

需要 Git、Node.js 22、Corepack 和 PowerShell 7。开发基线使用 Yarn 1.22.22，依赖版本来自上游锁文件。

```powershell
git clone --recurse-submodules https://github.com/Elylien/makenovel.git
cd makenovel
pwsh -NoLogo -NoProfile -File scripts/Apply-Patches.ps1 -Target WebGAL -Apply
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Install
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Build
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Test
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL -Action Preview
```

预览仅绑定 `http://127.0.0.1:3000`，显示锁定上游示例及本项目 runtime 补丁。Terre 安装与构建说明见 [测试入口](docs/TESTING.md)。独立源码写回实验运行 `npm test`，其边界见 [实验说明](experiments/source-roundtrip/README.md)。

## 启动当前编辑器

完成上述 WebGAL 基线安装后，继续安装 Terre 并应用审查过的补丁：

```powershell
pwsh -NoLogo -NoProfile -File scripts/Invoke-Upstream.ps1 -Target WebGAL_Terre -Action Install
npm.cmd run patch:apply
npm.cmd run editor:build
npm.cmd run test:editor
npm.cmd run test:documents
npm.cmd run test:identity
npm.cmd run editor:start
```

访问 `http://127.0.0.1:3001`。数据隔离在本项目 `.local/editor-profile/`，停止用 `npm.cmd run editor:stop`。这是本机开发预览，不是独立安装包。

升级已有 checkout 时，先停止编辑器，再执行 `npm.cmd run baseline:build` 和 `npm.cmd run editor:build`。前者生成经过源码与产物 hash 校验的 runtime 构建凭据，后者将该引擎同步到内置模板；缺失或过期凭据会拒绝同步。作者作品文件不会被改写，但没有自带 `index.html` 的普通作品会使用更新后的共享模板运行和导出；自带入口或衍生引擎的作品保留自己的引擎。

场景图形/源码模式共享草稿，修改后点击“保存脚本”（源码支持 Ctrl+S）。核心语法或身份错误会显示位置并保留未应用草稿。未知前缀显示高级块；确认是人物台词后，可明确转换为 `say`，不自动把未知插件指令改成对白。已登记的节点复制时分配新 ID，移动时保留原 ID。

图形/源码共用场景撤销与重做，默认保留最多 100 步、2 MiB 文本增量，保存后仍可撤销；窗口关闭后不保留撤销栈。发生外部版本冲突时保留草稿并拒绝覆盖，先下载备份再载入磁盘版本。

同一标签页刷新可自动恢复 session 草稿；关闭浏览器标签页后，在相同浏览器、工作区和场景的“本机恢复副本”中手动选择 localStorage 副本。各窗口副本独立，旧版无工作区身份的 session 数据只作为手动候选；容量不足会提示下载备份，不自动淘汰其他副本。这不是作品目录中的崩溃恢复或跨设备同步。JSON/模板仍沿用上游保存方式；多行、不安全参数与未知代码保留源码编辑。完整限制见 [已知问题](docs/KNOWN_ISSUES.md)。

两个 submodule 的 HEAD 仍是锁定原版提交，工作树有意保留应用后的改动；公开来源分别在 [patches/terre](patches/terre/) 和 [patches/webgal](patches/webgal/)。`npm.cmd run patch:check` 检查 Terre，`npm.cmd run patch:runtime:check` 检查 WebGAL。第四轮最终导出与重放结果见 [当前状态](docs/PROJECT_STATUS.md)；不要 reset 预期的补丁工作树。详见 [Terre 补丁](docs/integrations/TERRE_PATCHES.md) 和 [运行时补丁与模板同步](docs/integrations/RUNTIME_PATCHES.md)。

## 导出 Windows 开发包

完成编辑器构建后，使用实际作品目录运行：

```powershell
npm.cmd run game:export -- -GamePath '.local/editor-profile/games/你的作品目录'
```

入口调用原 Terre 导出服务，将包含 Electron 的未签名包放入 `.local/exports/`；首次构建壳需要下载依赖。玩家直接运行生成的 EXE，无需 Node/Yarn。当前开发包保留默认 Electron 图标/元数据，尚不是签名安装发行版。

已在本机 Windows 11 x64 验证无本项目开发服务时开始游戏、槽 1 存档、正常退出并重启读档；全机断网、干净机器和全部存档边界尚未验收。重放与限制见 [Windows 导出说明](integrations/windows-export/README.md) 和 [实际证据](docs/evidence/2026-10-07-windows-export.md)。

## 项目导航

- [当前状态](docs/PROJECT_STATUS.md) / [交接入口](docs/HANDOFF.md)
- [开发计划](docs/DEVELOPMENT_PLAN.md) / [需求追踪](docs/REQUIREMENTS_TRACEABILITY.md)
- [引擎评估](docs/ENGINE_EVALUATION.md) / [Terre 实测](docs/TERRE_BASELINE.md)
- [对标范围](docs/REFERENCE_PARITY.md) / [决策](docs/DECISIONS.md)
- [存档兼容边界与下一步](docs/SAVE_COMPATIBILITY.md)（设计审查，未实现迁移）

`vendor/` 使用 Git submodule 固定上游提交，`upstream.lock.json` 记录版本和锁文件摘要。实验不创建第二套剧情执行器或存档系统。

## 开源与素材

本仓库自有代码采用 MPL-2.0，详见 [LICENSE](LICENSE)。WebGAL、Terre 及其依赖和演示素材保留各自许可，见 [第三方说明](THIRD_PARTY_NOTICES.md)。上游示例仅用于本地验证，不视为本项目正式作品素材。

用户提供的两份原始规划文件只保存在被忽略的 `docs/private/`，不属于公开仓库。公开文档是本项目独立维护的工程计划与证据；未通过项不会标成完成。
