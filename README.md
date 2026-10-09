# MakeNovel

面向 Windows 的视觉小说创作工具链：传统玩家体验、人工导演模式，以及共享同一份源码的 AI 创作接口。

**当前版本 0.0.12：导演面板增加有限静态背景转场编辑，可设置入场回退、入场时间、下次退场与连续执行。** 已有和本次新增的受支持图片均可使用，和等待、素材及对白修改共用整批应用与撤销，保留作者注释与节点身份。原生脚本、精确版本存档、完整玩家备份、共享编辑历史、草稿恢复及静态主图片保存门禁继续沿用。实际构建、GUI、Windows 和代码回归范围见 [当前状态](docs/PROJECT_STATUS.md) 与 [第十二轮证据](docs/evidence/2026-10-09-round12.md)；旧轮现场结果不自动适用于新版本。G0-B、完整 G1/G2、完整导演工具与正式发行仍未整体验收。

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

普通对白旁的“舞台与声音”可集中修改紧邻其前的背景、立绘/差分、BGM、音效和本句语音，也可在本句前新增静态背景、静态立绘、BGM 和 SE。先选素材再设置参数；整批应用一次进入草稿，可整步撤销，再保存预览。前文来源只读显示最近可确认的源码设置与行号，遇到流程、变量或未知语法即停止，不推算跨分支舞台。有具体源行的设置可定位、展开并高亮原语句，再返回原对白；需先应用或取消局部修改，文档改变会使旧定位失效。点击弹窗外侧不会取消草稿，仍可明确取消或按 Escape 退出。已有设置可先查看影响再移除；作者行内注释留为独立注释，身份元数据随命令移除。上下移仅交换紧邻舞台命令，不跨等待、独立注释、空行或对白；变量和连续执行参数保持原编辑入口。顺序变化可能影响演出及后续对白，保存后预览确认。范围与操作见 [导演编辑说明](docs/DIRECTOR_EDITING.md)。

已有普通等待可修改 `0–2147483647` 的整数毫秒，以及“禁止跳过”选项。禁止跳过阻止点击和快进提前结束该等待，自动播放始终等待结束；菜单打开时计时继续，结束后的剧情推进延后到菜单关闭。带 `next`、`continue`、条件或变量的等待保持只读或收集边界。等待不能在面板中新增、删除或移动。展开“执行顺序”可查看原生命令及等待说明；“立即继续”允许演出重叠，面板不累加总时长。范围见 [第十一轮证据](docs/evidence/2026-10-09-round11.md)。

静态背景卡片的“背景转场”支持 `duration`、`enterDuration`、`exitDuration` 的 `0–2147483647` 整数毫秒，留空移除该项覆盖。入场优先使用 `enterDuration`，再使用 `duration`，两项均空时当前引擎默认 `1500` 毫秒；`exitDuration` 配置这个背景下一次被替换或关闭时的退场，留空默认 `1500` 毫秒。当前旧背景仍使用它先前的退场配置。连续执行 `next` 允许后续命令立即开始，时长不能简单相加。切换不同图片或关闭后重新显示，才能观察新的转场；含自定义效果、变量、CG 解锁名称/系列、视频等的转场区保留原参数并提示使用原有编辑方式。完整动作、立绘转场和动画编辑仍待后续单元，详见 [导演编辑说明](docs/DIRECTOR_EDITING.md)。

图形/源码共用场景撤销与重做，默认保留最多 100 步、2 MiB 文本增量，保存后仍可撤销；窗口关闭后不保留撤销栈。发生外部版本冲突时保留草稿并拒绝覆盖，先下载备份再载入磁盘版本。

同一标签页刷新可自动恢复 session 草稿；关闭浏览器标签页后，在相同浏览器、工作区和场景的“本机恢复副本”中手动选择 localStorage 副本。各窗口副本独立，旧版无工作区身份的 session 数据只作为手动候选；容量不足会提示下载备份，不自动淘汰其他副本。这不是作品目录中的崩溃恢复或跨设备同步。JSON/模板仍沿用上游保存方式；多行、不安全参数与未知代码保留源码编辑。完整限制见 [已知问题](docs/KNOWN_ISSUES.md)。

两个 submodule 的 HEAD 仍是锁定原版提交，工作树有意保留应用后的改动；公开来源分别在 [patches/terre](patches/terre/) 和 [patches/webgal](patches/webgal/)。`npm.cmd run patch:check` 检查 Terre，`npm.cmd run patch:runtime:check` 检查 WebGAL。最终导出与重放结果见 [当前状态](docs/PROJECT_STATUS.md)；不要 reset 预期的补丁工作树。详见 [Terre 补丁](docs/integrations/TERRE_PATCHES.md) 和 [运行时补丁与模板同步](docs/integrations/RUNTIME_PATCHES.md)。

## 登记可存档的作品版本

在作品编辑完成后暂停写入，登记包含剧情、配置和资源的完整版本：

```powershell
npm.cmd run game:seal -- -GamePath '.local/editor-profile/games/你的作品目录' -Action Init
npm.cmd run game:seal -- -GamePath '.local/editor-profile/games/你的作品目录' -Action Verify
```

已有清单的作品修改后使用 `-Action Update`，然后重开游戏。作品身份保留，剧情版本变化会使用新的原生存储前缀；旧存档、已读和鉴赏保留在原版本，可以从系统设置“导出完整备份”。未登记作品可游玩，但暂不能存读档。共享模板更新后，旧普通作品也遵守此规则；工具不自动改写已有作者作品或迁移旧档。

详细协议、备份覆盖与限制见 [存档版本说明](docs/SAVE_COMPATIBILITY.md)。导出的备份可以校验，本轮不提供覆盖式导入或跨版本位置猜测。

## 演出开发样片

受控构建和共享模板就绪后，生成一个独立的新作品：

```powershell
npm.cmd run demo:stage -- --output .local/editor-profile/games/makenovel-round6
npm.cmd run test:stage-demo
```

目标已存在时生成器会拒绝覆盖；重做请使用新的目录名。样片采用原生脚本和原创程序生成素材，包含两角色及差分、跳跃/平移、日夜转场/黑场、两分支，以及 BGM、SE、voice 通道测试音。voice 测试音不是配音，音频元素状态正确也不代表听觉质量通过。停靠点和来源说明见 [样片说明](integrations/stage-demo/README.md)。

有限演出、退场临时对象或菜单待推进状态存在时，普通与快速存档都会拒绝，原槽保持。请返回剧情，在演出结束后的稳定对白处重新保存；当前没有保存请求排队或自动回退到旧检查点的功能。

静态背景/立绘的主图片仍在加载或已失败时，同样拒绝普通/快速存档。修复资源后需重开作品或实际换到正常图片；当前不自动重试同 URL，也未覆盖 GIF、视频和模型。导演与故障样片可用 `npm.cmd run demo:director -- --output .local/editor-profile/games/<新的目录>` 生成，内含故意损坏的图片，仅作开发验证。

新增与来源样片使用另一个独立目录：

```powershell
node integrations/director-insertion-demo/generate.mjs --output .local/editor-profile/games/makenovel-round8
node --test integrations/director-insertion-demo/director-insertion-demo.test.mjs
```

它先建立前文画面，再提供没有局部设置的 R8-02 供新增；后继对白和标签/未知参数场景用于检查来源边界。新作品身份、BOM/CRLF 和作者注释单独保留，目标存在即拒绝覆盖。详情见 [第八轮样片说明](integrations/director-insertion-demo/README.md)。

第九轮来源定位样片有 80 句间隔，供测试虚拟列表之外的来源与返回：

```powershell
npm.cmd run demo:director-navigation -- --output .local/editor-profile/games/makenovel-round9
npm.cmd run test:director-navigation-demo
```

生成器拒绝覆盖既有目录，包含已登记与未登记的来源、边界未知和差分来源。详见 [第九轮样片说明](integrations/director-navigation-demo/README.md)。

第十轮删除与重排样片提供同位置双立绘、等待/注释边界、旧独立身份标记与前文来源：

```powershell
npm.cmd run demo:director-structure -- --output .local/editor-profile/games/makenovel-round10
npm.cmd run test:director-structure-demo
```

既有目录拒绝覆盖；目标对白为第 17 行。见 [第十轮样片](integrations/director-structure-demo/README.md)。

第十一轮等待样片提供禁止跳过、允许跳过和 legacy 身份三个等待案例，并以夜景、日景和目标对白标识播放进展：

```powershell
npm.cmd run demo:director-timing -- --output .local/editor-profile/games/makenovel-round11
npm.cmd run test:director-timing-demo
```

既有目录拒绝覆盖；目标对白初始位于第 12、16、21 行。保存后的计时需从前一句正常播放，编辑器快速执行到目标不作为时长证据。源码保留 BOM/CRLF，另有变量、条件和连续执行的只读场景。见 [第十一轮样片说明](integrations/director-timing-demo/README.md)。

第十二轮背景转场样片提供暖色入场、后续退场、关闭连续执行及混合节点身份，另有自定义效果与变量等只读场景：

```powershell
npm.cmd run demo:background-transition -- --output .local/editor-profile/games/makenovel-round12
npm.cmd run test:background-transition-demo
```

目标目录必须不存在。初始目标对白在第 5、11、15 行；入场与这个背景之后的退场需分别正常播放观察，不能用“执行到此句”代替。生成和改稿后的封存要求见 [第十二轮样片说明](integrations/background-transition-demo/README.md)。

## 导出 Windows 开发包

完成编辑器构建后，使用实际作品目录运行：

```powershell
npm.cmd run game:export -- -GamePath '.local/editor-profile/games/你的作品目录'
```

入口调用原 Terre 导出服务，将包含 Electron 的未签名包放入 `.local/exports/`；首次构建壳需要下载依赖。玩家直接运行生成的 EXE，无需 Node/Yarn。当前开发包保留默认 Electron 图标/元数据，尚不是签名安装发行版。

第七轮新包已在本机 Windows 11 x64 验证关闭项目开发服务后的导演改稿显示、坏图普通/快速拒存与旧槽保护、换回正常背景后的保存恢复，以及正常退出重启读档。具体过程见 [第七轮记录](docs/evidence/2026-10-08-round7.md)。全机断网、干净机器和全部存档边界尚未验收；导出边界见 [Windows 导出说明](integrations/windows-export/README.md)。

## 项目导航

- [当前状态](docs/PROJECT_STATUS.md) / [交接入口](docs/HANDOFF.md)
- [开发计划](docs/DEVELOPMENT_PLAN.md) / [需求追踪](docs/REQUIREMENTS_TRACEABILITY.md)
- [引擎评估](docs/ENGINE_EVALUATION.md) / [Terre 实测](docs/TERRE_BASELINE.md)
- [对标范围](docs/REFERENCE_PARITY.md) / [决策](docs/DECISIONS.md)
- [存档版本与完整备份](docs/SAVE_COMPATIBILITY.md)（跨版本迁移尚未实现）

`vendor/` 使用 Git submodule 固定上游提交，`upstream.lock.json` 记录版本和锁文件摘要。实验不创建第二套剧情执行器或存档系统。

## 开源与素材

本仓库自有代码采用 MPL-2.0，详见 [LICENSE](LICENSE)。WebGAL、Terre 及其依赖和演示素材保留各自许可，见 [第三方说明](THIRD_PARTY_NOTICES.md)。上游示例仅用于本地验证，不视为本项目正式作品素材。

用户提供的两份原始规划文件只保存在被忽略的 `docs/private/`，不属于公开仓库。公开文档是本项目独立维护的工程计划与证据；未通过项不会标成完成。
