# WebGAL 运行时补丁与模板同步

更新：2026-10-08，MakeNovel `0.0.6`。运行时仍锁定 WebGAL `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`；依赖版本不变。根仓 [清单](../../patches/webgal/manifest.json) 管理顺序补丁：

- `0001-fixed-player-viewport.patch`：fixed 根画布，修复 body 滚动带走缩放后的存档菜单；此补丁自身不改存档协议。
- `0002-versioned-player-saves.patch`：第五轮精确作品版本门禁、初始化前玩家备份、等待原生存储确认、异步恢复预检与界面错误/备份入口。保留原生脚本、槽、舞台、调用栈及执行器。
- `0003-stage-audio-lifecycle.patch`：第六轮演出、菜单待推进、退场临时对象及音频生命周期修复；在已覆盖的有限演出或不稳定推进状态存在时拒绝普通/快速存档，保留旧槽，要求回到稳定对白后重新保存。

当前清单为 3/3。第三份补丁 SHA-256 为 `7eaa09925ce1516d714d0a418d5f7153f7bcb9d27f4619781e36629b397703f2`；独立重放与开发树均为 `c7acf8bad114dd10bc29800b2af4920884d38c14`。受控构建、模板传播与现场结果见 [第六轮记录](../evidence/2026-10-08-round6.md) 和 [TESTING.md](../TESTING.md)；下文第四轮数字只对应当时的单补丁树。

Terre 使用单独的 [补丁链](TERRE_PATCHES.md)。两个 submodule 保持原版 HEAD，已审查修改保留在工作树；不要 reset/clean，也不要把补丁状态误当外部修改。

## 第五轮玩家兼容与备份顺序

作者显式用 [Seal-Game.ps1](../../scripts/Seal-Game.ps1) 为作品生成 `game/makenovel-manifest.json`。协议记录 schemaVersion、随机 projectId、原生 Game_key、运行时兼容常量、game 文件的原字节 hash 及 manifestHash。新作品 `-Action Init`、已有作品改稿后 `-Action Update`、默认只读 verify；不会自动给所有作者作品登记身份。完整命令和字节协议见 [作品封存说明](../../integrations/game-manifest/README.md)。

运行时先核对清单及文件，再选择 `makenovel-v1:<projectId>:<manifestHash>`；无法核对时选择隔离的 `makenovel-unverified-v1:<旧 Game_key 摘要>`，暂不允许存读档，设置可在备份成功后使用隔离空间。原 Game_key 命名空间始终保留，不自动读入或规范化。

打开原生存储门禁之前，先把旧用户数据、普通槽、快档、流程图进度/快照以及同作品旧 manifest 命名空间做完整值副本，追加新 key 后读回校验。相同完整记录集可以复用已核验副本。只有成功后才依次初始化原生用户数据、快档、槽与流程图；配额或读回失败保留旧数据、禁用后续存储并显示错误，渲染入口仍可继续。导出包含保留的初始化前副本；离线文件只校验，不覆盖当前 namespace，不猜旧索引迁移。

新快照绑定 projectId、Game_key、运行时兼容常量与 manifestHash；不同/未知版本拒绝读取。同版恢复也先校验当前场景、父调用栈和历史的源码与索引，随后才在原生执行器中替换状态。普通/快速存档按 key 等待落盘成功后发布，初始化 epoch 与 namespace 检查排除切换后的过时结果。上述是代码与边界接线范围，真实浏览器/Windows 的完整流程须单独记录。

仍有明确边界：HTTP 校验只能读取清单已有路径，不能发现未列入的新增文件；本地 verify 才做文件集增删核对。大作品的全部资源 hash 成本尚未验收，`beforeunload` 不能等待其完成。已提交给 localforage 的写入不能撤销，数据库确认不等于断电耐久性。同步恢复异常只尝试重建原生状态，不能承诺回退任意插件与外部副作用。更多限制见 [KNOWN_ISSUES.md](../KNOWN_ISSUES.md)。

## 第六轮演出与独立重放

菜单打开时完成的等待不能在菜单背后继续剧情；返回剧情后只消费当前会话的一次待推进。有限演出、退场临时对象或待推进状态存在时，普通槽与快档都拒绝保存；没有保存请求队列，也不自动选取最近检查点。完整规则见 [存档版本说明](../SAVE_COMPATIBILITY.md)。

公开脚本按当前清单处理任意数量的已审查补丁，第六轮执行：

```powershell
pwsh -NoLogo -NoProfile -File integrations/patch-tests/Test-RuntimePatchReplay.ps1 -ExpectedPatchCount 3 -EvidencePath docs/evidence/local/round6/runtime-independent-replay.json
```

在构建、导出、源码写入和 Git index 刷新均停止后执行。18/18 核心检查通过：独立 clone 使用 `--no-hardlinks --no-checkout`、无 alternates，首次应用/重复应用/后续 Check 一致；临时 index 逆序还原得到 base tree `e6c2458a927c4679d2f20d693c8f2c1f2028ca19`，开发工作树与两个真实 index 文件字节均不变。脚本最后再次核对清单和补丁原字节没有变化。脚本及命令边界见 [补丁测试说明](../../integrations/patch-tests/README.md)。

`npm.cmd run demo:stage -- --output <不存在的新作品路径>` 提供独立原生演出样片。素材生成源随仓库提供，只在生成时从锁定上游复制 GUI 模板文本；两角色/背景/PCM 音均为原创开发占位。浏览器子项和音频 DOM 核验不替代声音试听、新 Windows 包或完整演出验收。

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

## 第四轮历史证据边界

独立 runtime 的原裁切已复现；1280×720、1600×900 和 1280×960 重新打开存档菜单的回归已通过，后者保留正常上下留白。受控 Build 174.1 s；25 个引擎文件已 Sync，模板 game 逐文件 hash 不变。缺失凭据、源码凭据过期、额外产物三类负例均拒绝，临时改动已恢复。

runtime 单补丁已在 `--no-hardlinks --no-checkout`、无 alternates 的独立 clone 通过 18 项：0/1→1/1、幂等、临时 index 逆向回 base、fsck、开发树一致及两个真实 index 字节不变。最终树为 `8561dc40298a2b72704255d25325b0aefd2aa617`，本地报告为 `docs/evidence/local/round4/runtime-independent-replay.json`；此前 shared clone 报告保留作历史。

完整 editor:build 已完成 Check→前端/后端构建→Sync 25 文件，最终前端重编 2m53s 通过；Terre 三补丁独立重放 17 项也通过。仅含 game 的新作品实际 HTTP 请求验证 25 个引擎文件全部匹配凭据，实际游戏菜单 fixed/root (0,0,1280,720)/body 滚动 0。记录见 [第四轮证据](../evidence/2026-10-07-round4.md)。这些数字属于第四轮；DPI/全屏和新 Windows EXE 未由该轮验收，不能由独立浏览器或模板传播替代，也不能沿用为第五轮新存档协议的结果。

最新状态、命令与限制见 [TESTING.md](../TESTING.md) 和 [PROJECT_STATUS.md](../PROJECT_STATUS.md)。第五轮的精确版本与旧数据保留机制见 [SAVE_COMPATIBILITY.md](../SAVE_COMPATIBILITY.md)；跨版本旧档迁移仍未实现。

## 第七轮静态主图片保存门禁补丁

在前三份补丁原字节后追加 `0004-static-image-save-readiness.patch`，增量来源为第六轮完整树 `c7acf8bad114dd10bc29800b2af4920884d38c14`；锁定上游仍为 `d0318e6c4cdb8b04bb5d891f40368cff3c6efc85`，依赖和存档格式不变。第七轮完整清单是四份顺序补丁，前文 3/3 与第六轮 tree 属于历史结果。

| 来源 | 第七轮审查值 |
| --- | --- |
| `0004` SHA-256 | `26e2a99113bd084c4cefdce1f8bde0088ddb044416488e2deb7885bc23e07b86` |
| 四份补丁后的完整 tree | `77f3336c288448ccc5bc1a3986df91a91f3f79f8` |

生产改动涉及原生 PixiController、普通/快速保存共用的快照生成入口，以及 assetParsers 的 SVG 错误桥接。静态背景/立绘主请求在当前对象上记录 pending、ready、failed，setup 完成才 ready；对象 UUID 与本次请求身份隔离迟到结果。有限演出列表已清空但主图仍 pending/failed 时，普通和快速保存仍拒绝，旧槽不变；辅助口型/眨眼纹理不污染成功主图，状态不写入存档数据。

真实浏览器发现损坏 SVG 会发出原生 onError，但锁定 Pixi 的 SVGResource.load Promise 不结束，导致一直 pending。assetParsers 对实际 SVGResource 订阅 BaseTexture 的公开 error 事件并以原错误对象拒绝；成功、原生拒绝、同步抛错和事件失败均释放自身监听，迟到原生拒绝仍被消费。非 SVG 保留原加载路径，失败沿用纹理销毁与缓存清理；未修改 node_modules 或另写加载器。

图片加载仍与脚本及演出时钟独立。保留原生一次失败重试，不在每次 stage commit 重试同 URL 失败对象；修复资源后重开作品，或实际退场/换图后生成新请求。此补丁不是全场景资源事务，不暂停或回滚剧情；GIF/视频/模型、GPU 上下文丢失、永久无响应超时和自动检查点回退未覆盖。SVG onload 中零尺寸或 drawImage 的异步抛错若不发出 onError，也未覆盖；未加入超时。完整约定见 [舞台生命周期](../STAGE_LIFECYCLE.md)。

资源边界套件 **38/38**：原 28 项真实生产方法回归，加 10 项接真实锁定 Pixi 的 SVG/parser 回归。原 28 项加载第六轮原文件为 **6 通过 / 22 失败**；最终 38 项仅恢复桥接前 assetParsers 为 **31 通过 / 7 失败**。本地日志分别为 `docs/evidence/local/round7/resource-before-final-tests.log`、`resource-svg-before-final-tests.log` 和 `resource-svg-after.log`，日志不提交。

最终来源的 runtime **339/339**（含资源 38 项）回归通过，受控构建为 **Yarn 47.76 s / Vite 22.17 s**，记录 25 个引擎文件；实际 HTTP **25/25**、服务 **22** 项和最终补丁独立重放 **18/18** 通过。桥接前的 runtime 329 项及 Yarn 52.09 s / Vite 27.16 s 构建保留作历史结果。

浏览器已确认桥接前持续 pending 拒存；最终构建对损坏 SVG 显示明确 failed，普通/快速各自拒存，旧普通槽 1 字符串不变，快读仍到 R7-BASE。重走故障并换回 day 后，快档预览 R7-RECOVER，普通新槽 3 保存成功。这些子项不等于完整解码、导演预览或新 Windows 包验收。

```powershell
pwsh -NoLogo -NoProfile -File integrations/patch-tests/Test-RuntimePatchReplay.ps1 -Target WebGAL -ExpectedPatchCount 4 -EvidencePath docs/evidence/local/round7/runtime-independent-replay.json
if ($LASTEXITCODE -ne 0) { throw 'Runtime independent replay failed' }
```

上表最终 SHA 已在无 hardlinks/alternates 的独立 clone 完成 **18/18**，报告中的完整 tree 与开发树一致；不是沿用 SVG 桥接前的旧报告。检查包含四份顺序应用、幂等、完整树匹配、临时 index 逆序回到原版、开发工作树与两个真实 index 字节不变。源码重放不会自行改写共享模板或作品目录；本轮另完成受控构建、模板同步与实际 HTTP 摘要核对。Terre 最终导演补丁也按自身独立链完成 18/18，见 [补丁测试说明](../../integrations/patch-tests/README.md)。
