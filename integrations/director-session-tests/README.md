# 导演局部会话回归

运行 `node integrations/director-session-tests/run-tests.mjs`。使用 Terre 已安装的 esbuild，将实际会话、共享文档和锁定 WebGAL parser 打成浏览器目标模块，再由 Node 测试；没有另写剧情解析器或文件保存器。

覆盖已有原生演出命令的有限分组、条件/分支/高级/多行边界、未知源码和注释保留、局部身份按需登记、取消及无变化应用、整份源码与历史代数拒绝过期写入、原生语义往返，以及共享文档的一步撤销/重做、dirty 持久副本与保存前预览隔离。

测试中的 transport 和草稿存储为内存替身，未读写作者作品；会话修改调用的是产品 `editGraphicalStatement`、真实锁定 parser 和 `SceneDocument`。这不代替浏览器表单、真实中文输入、磁盘并发或播放器实测。

保持现有保守入口：未知参数、未知命令、多行或条件语句是分组边界；等待与独立注释只读。选中对白不接受 `when`、`next`、`continue`、`concat`、`notend`。原分析器把 BOM 所在首行命令视为高级源码时，本面板也保留该边界；修改其他行仍精确保留 BOM 与首行原字节。
