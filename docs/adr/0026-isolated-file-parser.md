# ADR0026：固定 Node 文件解析适配器

日期：2026-10-06；状态：采纳，P03-01实施中。

不可信格式解析在P00验证过的AppContainer/Job/无网络边界内执行。Core仅编排不可变版本与有界JSON结果；目标主机nativeExecution不可用时直接失败关闭并保留原件，不在Host/Core内回退解析。

独立构建packages/retrieval/dist/parse.cjs，将当前文本/CSV/XML/ZIP代码和所需纯JS依赖打入单个固定适配器。Core使用锁定Node runtime，复用NativeSandboxExecutor的固定diagnostic.execute协议；参数仅为自建只读inputRoot内的parse.cjs、inputRoot和私有workspace，Renderer/模型不能指定路径、argv、脚本或终端。上传字节固定名original，版本/名称/hash为Core生成的严格input.json，避免上传文件名参与模块加载。公开接口仍使用ADR0025中的Host token及资源ID。

ZIP复用项目已锁定yauzl3.4.0，只新增retrieval importer，不改变版本/integrity。任何解压前验证完整中央目录，拒绝穿越、ADS、Windows别名/大小写冲突、符号链接、加密及数量/大小/比例超限；读取有界并验证CRC，不提取文件。嵌套ZIP共享总条目/展开容量预算和两层深度限制。XML拒绝DTD/外部实体；HTML只输出纯文本，不加载远程资源或执行源代码。

大小、批量、ZIP、表格、PDF页数与120秒解析上限统一放在resources/catalogs/defaults.json的files段并通过FileLimitsSchema校验；不扩大原规格限额。结构/失败原因/版本协议保持共享契约。解析JSON限制在既有BlobStore单blob100MiB内，超限明确失败。输出必须是当前workspace中的有界普通文件并匹配版本/hash，再交由ADR0025的有效租约事务发布；原件解析前后校验不变，临时目录不复用。

构建、便携合成文件进程、模拟编排边界分别验证，不能替代实际AppContainer或标准用户验收。本检查点已注册Core handler；PDF/OOXML/image、Host/UI及P03真实原生/E2E仍待交付，不代表任务完成。P00宏回归的21d3924完整CI成功仅证明其指定源码/原有安全路线；本机应用控制拒绝保持。
