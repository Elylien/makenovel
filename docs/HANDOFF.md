# 交接与恢复

记录：2026-10-07，MakeNovel `0.0.3` / `main`。公开远程为 `https://github.com/Elylien/makenovel.git`。提交以 `git log -1 --oneline` 和远程现场结果为准。

## 恢复先核查

```powershell
git status --short --branch
git submodule status
git -C vendor/WebGAL status --short
git -C vendor/WebGAL_Terre status --short
npm.cmd run patch:check
Get-Content -LiteralPath .local/editor-runtime/process.json
```

Terre HEAD 仍为原版，工作树有意保留审查改动；根仓补丁是公开源码来源，不创建未推送的子仓提交。第三轮保留 `0001` 原摘要并增加 `0002`，检查已匹配已应用 2/2。独立对象 clone 产品重放 17/17 通过，最终树为 `00be9825e28de33ef40b8e10bd2b7642fdfe9b35`，与开发树一致，两真实 index 摘要未变。恢复仍须读取实际清单与检查结果。不要 reset/clean，不要把已知补丁状态当作外部修改。两份私有原件仍在 `docs/private/`，任何情况下不公开。

先读 `PROJECT_STATUS.md`、`TESTING.md`、`KNOWN_ISSUES.md`、`DEVELOPMENT_PLAN.md` 和第三轮证据。公开 clone 先应用补丁，再按 README 安装/构建/测试；两个 workspace 的构建必须串行。

## 本轮完成

- 核心语法与身份诊断已进入真实保存和源码界面；错误草稿不落盘，未知前缀不自动作为角色名或插件执行。
- 持久注释身份、图形局部 token 写回、复制新 ID、移动保留 ID 已接入。GUI 验证作者尾注释双空格保留、独立副本修改与键盘拖动。
- GUI 错误草稿 `wait:not-a-number;` 产生第 10 行诊断，磁盘 hash 保持 `c1029804c3b739d23417029b64f45e2c2a81300129d2e643b4146f28c5e4bad6`；修为 `wait:100;` 并显式注释停用 `futureFx` 后保存通过。这是测试时历史 hash，恢复时不得用它覆盖后续编辑。
- 代码测试 198 项通过：后端 121、文档 27、消息 3、身份 28、源码实验 19。最终后端/前端 build 通过（13.04 / 101.38 s）；最终刷新保留身份对白、新增普通对白自动新 ID 保存、同 SPA 跨作品切换不误拦截均通过。
- 最终源码字节检查：BOM 保留、10 个 CRLF、无单独 LF、旧/新节点 ID 与作者尾注释双空格保留。产品重放记录为 `docs/evidence/local/round3/product-patch-replay.json`。
- Windows 原链路导出及 ASAR 修复通过；实际 EXE 在没有本项目开发服务时完成一槽存档、正常退出、重启和读档。详情见 [Windows 证据](evidence/2026-10-07-windows-export.md)。

## 当前进程和数据

编辑器入口 `http://127.0.0.1:3001`，记录在 `.local/editor-runtime/process.json`。最终现场为 PID 8908，只监听 127.0.0.1:3001；无本项目 3000 listener、无 WebGAL.exe，作者全局 `~/.webgal_terre` 不存在。恢复必须重查，禁止按旧 PID 停止。最终编辑器截图为 `docs/evidence/local/round3/editor-ready.png`。

启动 `npm.cmd run editor:start`，已有受管进程会被识别。停止 `npm.cmd run editor:stop`，会核验入口、PID、启动时间，不杀其他Node进程。服务只监听127.0.0.1，只有本项目 `.local/editor-profile` 保存作者作品；未创建全局 `~/.webgal_terre`。

第二轮作品 `makenovel-round2` 和第三轮作品 `makenovel-round3` 均在 `.local/editor-profile/games/`。恢复时先查看真实文件和当前页面，不覆盖用户后续编辑。背景/立绘来自上游示例，不是正式素材；原始日志、截图和草稿备份均在忽略目录。

Windows 产物在 `.local/exports/MakeNovel 离线样片 20261007-220449-3e6978/WebGAL.exe`。CLI 烟测使用项目内独立玩家 profile；实际 GUI 存读档使用 `%APPDATA%/webgal-electron-project`，二者不得混写为同一证据。前者两次受控进程终止，后者真实 Alt+F4 正常退出。截图与输出在 `docs/evidence/local/round3/`，临时导出副本在 `.scratch/windows-export/`。

## 下一单元

先核对现场文件/进程和两补丁状态，再继续 G1 剩余边界：多场景/IME/撤销恢复、角色转换与高级代码边界、更多局部写回案例。ID 已持久化，下一步独立定义运行时与旧档迁移，不能猜相邻行或把注释存在当作迁移完成。

并行补 G0-B 的全机断网或干净用户环境、1280×720 浏览器裁切与 DPI。保留一槽 EXE 恢复证据，扩大到分支/跨场景/覆盖/坏档和音频；随后推进两角色演出、等待取消和转场。

重放入口为 `npm.cmd run test:editor`、`npm.cmd run test:documents`、`npm.cmd run test:identity`、`npm.cmd test`。导出已有作品用 `npm.cmd run game:export -- -GamePath '.local/editor-profile/games/makenovel-round2'`；调用真实 Terre 导出服务，生成本地未签名开发包。

保留边界：完整表达式/插件校验、JSON/模板事务、效果临时预览、项目级崩溃恢复、三方合并、非协作 writer 竞态、物理磁盘满、断电耐久性和孤立锁恢复仍未验收。G0/G1 与完整 AT 均未整体通过。

不要重问已确认方向：Windows优先、Steam中文参考、公开仓库/环境工具/Computer Use授权。当前没有必须由用户处理的阻塞；具体参考build/补丁、正式素材和最终美术体验仍在后续收集。
