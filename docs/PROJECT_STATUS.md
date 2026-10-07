# 项目状态

更新：2026-10-07。项目版本 `0.0.1`，分支 `main`；实际提交读取 `git log -1 --oneline`。公开仓库：[Elylien/makenovel](https://github.com/Elylien/makenovel)。

**已完成本轮 G0-A 准备与基线诊断，并完成一项 G1 方向的隔离源码实验。G0 全部实机验证、完整 G1 和最终框架均未验收。**

## 已核实

- 初始目录为空，没有用户原有代码或未提交修改。两份输入已逐字节复制到本地 `docs/private/`，hash 相同、Git 忽略命中；原件不属于公开仓库。
- WebGAL 与 Terre 官方 4.6.5 源码锁定为 Git submodule；提交、Yarn 版本、锁文件摘要可追踪。保留 MPL-2.0 及第三方许可说明。
- WebGAL frozen install、原版生产构建、34 项 parser 测试通过；真实浏览器能从标题进入中文示例首段对白。
- Terre frozen install（隔离缓存重试）、后端构建、前端构建通过。
- 新增原生源码写回实验：显式节点 ID、保留字节的局部对白修改、hash 冲突拒绝和内存事务。19 项测试通过，其中 5 项导入真实 WebGAL parser。它没有 UI 或磁盘保存功能。
- 需求追踪包含 121 个原 ID、34 个 AT 和 51 个无编号规范主题；参考已按用户补充固定为 Steam 中文 Windows 版《千恋＊万花》。

## 当前失败与缺口

- Terre 后端测试整体失败：6 套件 / 24 测试通过，3 套件因 Jest CJS 与 `trash` ESM 导入兼容在加载期失败。源码和断言未为通过而改写。
- IAB 的实际 1280×720 窗口打开存档菜单后出现 root/menu 向上偏移裁切，原因待定位；普通桌面浏览器、其他尺寸和 DPI 未复核。
- 可选 Live2D 库加载警告保留；声音、存档重启、Terre GUI、作者 profile 隔离、Windows 离线包、全部产品 AT 均未验收。
- 正式角色素材、商业游戏具体 build/补丁及最终美术体验尚未确认。这些不阻塞下一工程单元。

## 下一步

G0-B 与 G1-A 接续：先修复可回归的测试环境问题，建立本机隔离的 Terre 启动链路，复核菜单布局，并做第一条“图形修改 → 源码 → 保存重开”流程。持久节点身份、外部变更冲突和有效草稿闸门优先；Windows 导出同步安排，先做可离线重启的最小作品。

运行入口见 [TESTING.md](TESTING.md)，源码实验见 [实验说明](../experiments/source-roundtrip/README.md)，完整范围见 [开发计划](DEVELOPMENT_PLAN.md)。构建产物仍保留在两个 submodule 的生成目录内，不发布二进制。

本轮临时 WebGAL 预览服务已停止，浏览器测试页已关闭，未启动 Terre 后端服务；没有需要用户现在处理的阻塞。后续准备实机对标时再收集具体 build/补丁信息。
