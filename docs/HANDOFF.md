# 交接与恢复

记录：2026-10-07，MakeNovel `0.0.2` / `main`。公开远程为 `https://github.com/Elylien/makenovel.git`。提交以 `git log -1 --oneline` 和远程现场结果为准。

## 恢复先核查

```powershell
git status --short --branch
git submodule status
git -C vendor/WebGAL status --short
git -C vendor/WebGAL_Terre status --short
npm.cmd run patch:check
Get-Content -LiteralPath .local/editor-runtime/process.json
```

根仓除预期 submodule dirty 外应无未提交修改；Terre HEAD仍为原版，但工作树有22个审查文件的改动，应匹配已应用1/1补丁。不要 reset/clean，不要为了“干净”删去新模块。新增未知修改时检查真实diff；`patch:check`会拒绝未知树。两份私有原件仍在 `docs/private/`，任何情况下不公开它们。

先读 `PROJECT_STATUS.md`、`TESTING.md`、`KNOWN_ISSUES.md`、`DEVELOPMENT_PLAN.md` 和第二轮证据。公开clone应先应用补丁，再按README安装/构建/测试；submodule指针没有改到本地私有提交。

## 本轮完成

- ESM测试兼容；后端66/66、源码实验19/19、前端共享草稿22/22和消息边界3/3通过。
- 后端/最终前端build通过（10.73/106.90 s）；真实HTTP/WS22项、启停重启通过。
- 补丁工具11项夹具测试、真实产品patch独立重放10项通过。
- 场景版本快照与事务保存、同文件串行/共同锁、临时文件fsync+rename、冲突与写失败原文保留。
- 图形/源码共享草稿、显式保存、下载/载入磁盘、预览入口草稿闸门；原作者全局profile不使用。
- IAB实测图形改对白→源码追加→保存重开→外部修改409→下载草稿→载入磁盘，文件字节核对通过；最终预览实际显示修改后的对白。

## 当前进程和数据

本轮保留可操作编辑器 `http://127.0.0.1:3001`，运行记录在 `.local/editor-runtime/process.json`（结束时PID26744；恢复时必须重查，禁止按此旧PID停止）。测试浏览器页作为交付页保留。无WebGAL单独3000预览服务。

启动 `npm.cmd run editor:start`，已有受管进程会被识别。停止 `npm.cmd run editor:stop`，会核验入口、PID、启动时间，不杀其他Node进程。服务只监听127.0.0.1，只有本项目 `.local/editor-profile` 保存作者作品；未创建全局 `~/.webgal_terre`。

测试作品为 `.local/editor-profile/games/makenovel-round2`，背景/立绘使用上游示例，不是正式素材。页面现为已保存外部版本，冲突草稿下载已备份到 `docs/evidence/local/round2/ui-downloaded-draft.txt`；用户Downloads中也有该次测试下载文件。所有这些均被排除于公开Git（Downloads位于项目外）。

## 下一单元

优先补S-05：区分已保存文本与有效执行版本，未知命令只读高级块，语法错误保留草稿并可修复。然后把原型局部写回和持久节点身份接入正式编辑路径，不能依赖行号或把注释ID存在当成迁移完成。

并行补G0-B的Windows离线导出/无开发服务器重启，以及上轮1280×720菜单裁切复测（当前只是滚动/缩放线索，未定位）。随后再验完整舞台、声音、存档/历史等玩家能力。

范围限制：编辑语句serializer仍可能规范化重复参数/注释空格；JSON与模板仍为旧保存链路；效果面板首次提交前临时预览仍待统一；sessionStorage不是项目级崩溃恢复；外部不协作writer最后hash与rename竞态、物理磁盘满、断电耐久性、孤立lock恢复未验收。G0/G1及完整AT均未整体通过。

不要重问已确认方向：Windows优先、Steam中文参考、公开仓库/环境工具/Computer Use授权。当前没有必须由用户处理的阻塞；具体参考build/补丁、正式素材和最终美术体验仍在后续收集。
