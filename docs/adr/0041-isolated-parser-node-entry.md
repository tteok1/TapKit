# ADR0041：受限 Node 解析入口与启动失败分类

2026-10-09；P03-01，FR-13-001/006/007/009。CI37923489728 的标准用户三项失败，合成诊断证据确认 Node 在进入固定解析 bundle 前执行 realpathSync，对未授权的磁盘根 D:\\ 调用 lstat 遭 EPERM。helper 正常回收，解析器没有输出阶段，旧默认分类将启动失败显示为 CORRUPT_FILE。

Core 仅对固定的受信 parse.cjs 启动参数增加 --preserve-symlinks-main 和 --preserve-symlinks，分别覆盖主入口与 PDF 动态模块的真实路径解析。采用的是锁定 Node 已有加载行为，不更换运行库，不授予磁盘根 ACL，不改 NativeSandboxExecutor 或 renderer/模型的权限与参数入口。Core 对 bundle、PDF 清单、摘要、源 hash、暂存目录及输出的验证保留，helper 对链接/路径/DACL 的固定句柄验证仍必须通过；Node 加载选项不承担安全校验。

没有合法 parser_failed 原因的非零 worker/loader 退出按已有 SANDBOX_UNAVAILABLE 失败关闭。解析器明确报告的 CORRUPT_FILE、MAGIC_MISMATCH 等业务原因保持。原件保留与下载、租约 fencing、Job 进程回收、零网络、解析上限及输出发布条件不变；解析结构与 parserVersion 不变。

PDF 单测把固定 PDF.js 加载移到有界 beforeAll，解析断言继续使用既有测试预算；Electron 的合成种子子进程单独关闭启动诊断，应用进程诊断保留，成功标记仍严格检查。每项测试重置并清理其应用实例。

原生测试消费 bootstrap/build 已准备的 bundle，不在并行测试期间清空共享 dist。独立标准用户 kit 只复制源码，因此 standard-user-test 在 prepare-native 后、两个探针前顺序构建固定解析 bundle 与 PDF 资源；不从其他主机搬运能力报告，也不扩大 kit 或 AppContainer 权限。

源码6361510已在公开push CI37938112057和PR CI37938119655完成真实验收：P03标准用户三项零跳过/缺项，15种后缀样例、扫描PDF、七项失败输入及取消/helper kill/重试通过；P00标准用户22项、Office宏/外链六轮及启动诊断通过。便携或编排模拟不替代这些证据。原件、隔离及限时条件保持，本机生产能力仍由本机有效probe决定，CI能力报告不转植。
