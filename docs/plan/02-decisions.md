# 范围、决策与默认行为

2026-10-10 P03-03：[ADR0044](../adr/0044-project-scopes-and-atomic-index-links.md)规定schema11项目/背景范围、resource_links的active/pending索引版本、发送时固定选择、关联自身分类和Host私有ZIP导出。URL保存用户提供的本地正文；网络抓取/自动记忆/工作执行仍按后续任务实施。验收以progress为准。

2026-10-10 P03-02私有路径兼容：[ADR0043](../adr/0043-office-owned-aliases-and-deep-private-paths.md)要求词法验证后的内部Win32长路径句柄，以及Office活跃原生租约提供的短cwd/URI/私有环境；模型payload无新增字段，隔离/ACL/Job/宏与外链策略保留。真实深路径及标准用户未完成前不验收。

2026-10-10 P03-02：[ADR0042](../adr/0042-fixed-version-preview-and-pdf-annotations.md)规定固定版本预览、每窗口受控资产协议、复用AppContainer Office转换、schema10阅读位置/PDF批注和验证过的选区hash；解析版本p03-2补合并区域，历史结构保留。实施/测试状态以progress为准，不视为已验收。

2026-10-09 P03-01：[ADR0041](../adr/0041-isolated-parser-node-entry.md)规定固定受限 Node 主入口/模块加载参数及无解析报告时的启动失败分类；不改 ACL、AppContainer、原件保护或解析上限，候选必须通过真实标准用户与隔离回归。

2026-10-09 P03-01：[ADR0039](../adr/0039-file-original-only-and-generated-notes.md)规定媒体/旧 Office 原件保留、OCR_REQUIRED、确定文本生成笔记与 schema9 旧引用迁移；[ADR0040](../adr/0040-individual-file-cancellation.md)规定按项导入取消/重新选择与固定版本解析取消。真实 native 验收与 R15 保持未收口，不开放延期能力。

[ADR0036](../adr/0036-chat-material-from-pinned-parsed-version.md)：P03文件聊天材料读取固定版本解析结构；项目需明确session/project版本引用，读取前后验证。P02旧文本附件兼容，不以二进制原件UTF-8回退；Host token统一和原生验收仍待收口。

[ADR0031](../adr/0031-private-original-download.md)：saveOriginal只传文件/版本/owner ID，由Host保存框发私有files.export路径授权；Core前后核验资源及独占写入，既有目标不覆盖，失败输出仅按自身身份清理。五项合成integration通过，Electron/UI未验。

[ADR0030](../adr/0030-host-file-selection-and-import-receipts.md)：Host私有files.select生成窗口绑定只读token；fileCommand有限开放文件/目录命令及批次importStatus/cancelImport。导入按项提交收据与解析job；原件成功和内容读取分别呈现。真实native/库UI/E2E仍待收口。

### 2026-10-06 P03-01实施中

[ADR0029](../adr/0029-file-cache-and-storage-footprint.md)：仓库按profile去重计原件/衍生/备份独占blob；清预览批次先全量验证，保留原件/结构/FTS。结构读取在I/O前后检查owner/固定版本，当前版替换拒绝陈旧结果；FileService/UI尚未接入。

[ADR0028](../adr/0028-pdf-text-worker-assets.md)：锁定PDF.js6.3.289 API/worker/CMap/标准字体随bundle打包，Core按清单摘要验证并仅为PDF暂存；在固定AppContainer内读取文本和规范化页坐标，不渲染/执行动作/XFA/系统字体/联网。真实加密合成PDF已用正确公开测试密码交叉读取；501页/坏文件/加密拒绝及原件不变通过便携测试。新PDF原生验收仍待CI，Host/UI/image待实现。

[ADR0027](../adr/0027-read-only-ooxml-structure.md)：固定受限Node新增有界只读OOXML结构；DOCX段落/标题/表格、XLSX公式与缓存、PPTX顺序/备注保留定位。复用锁定FXP/yauzl；外部关系不读取、实体/宏/超限拒绝。已建真实P03 native和独立标准用户验收，但本机未运行，等待新CI；PDF/image及Host/UI仍待实现。

[ADR0026](../adr/0026-isolated-file-parser.md)：已注册固定Node受限解析handler，文本/ZIP独立bundle纳入桌面构建；文件limits统一严格catalog。ZIP复用yauzl3.4.0既有锁定版本，仅追加retrieval importer。无宿主解析回退；PDF/OOXML/image、Host/UI及新P03原生/E2E仍待验收。

[ADR0025](../adr/0025-file-versions-and-ingest-jobs.md)：追加0008/schema8，复用files/file_versions/blob/resource_links/jobs，新增folder/parsed_document及文件库FTS；不可变版本/明确替换目标，file.parse按版本及parserVersion去重。Host选择token为公共入口，不接受路径/其他profile。当前契约和迁移已实现，业务handler/UI/解析与原生依赖验收尚未完成。

版本：1.0；决策依据：用户最后一轮 25 项答复；资料核验日期：2026-09-15。

> **2026-10-05历史实施**：[ADR0024](../adr/0024-history-branches-search-and-temporary-chat.md)确定P02-03的schema7、独立run分支、带普通索引的FTS投影、session/message删除墓碑和临时内存repository。临时调用只汇总每日预算数字；真实模型、原生隔离与P03文档解析门禁保持。

> **2026-10-05桌面实施**：[ADR0022](../adr/0022-desktop-settings-and-metadata.md)确定P02-01的schema5元数据、严格设置patch、每窗口布局、静态头像、有限Host操作和应用内代理。发送/执行与P01/P00门禁保持原范围。

> **2026-10-05用户支持决定**：[ADR0021](../adr/0021-zhipu-flashx-responses-support-policy.md)将智谱标准API + glm-4.7-flashx 的Responses非思考路径暂按不支持使用交接，停止此组合的真人重复验证；不作为推荐或已通过能力，接续优先Chat/disabled。仅为文档与验收口径，不删除通用Responses、不增运行时禁用或自动改账户，不推断其他厂商/Coding Plan支持；内部原因未定，真实验收与阶段缺口保持。

> **2026-10-05连接检测证据**：[ADR0020](../adr/0020-probe-request-and-usage-evidence.md)允许只含固定设置和数字的请求准备摘要/规范化usage进入检测回执；finish后的失败也保留实际HTTP，未知用量不填零，不增加预算/请求或猜测思考执行。用户已恢复本地fixture测试，真实API调用仍另验，阶段状态不由回执字段完成而提升。

> **2026-10-05 API诊断补充**：[ADR0019](../adr/0019-zhipu-responses-json-and-message-compatibility.md)按用户要求修复官方Responses消息必填类型及错误码兼容，并允许成功HTTP/JSON最多64KiB的内存核验，只返回固定分类与受限业务码；不将JSON当流式成功、不增检测请求或改网络/Key配置。替代ADR0018对应JSON不读正文约束，真实结果与回归未验证状态以progress为准。

> **2026-09-30 当前方案补丁（基于旧方案的实测问题和兼容实验优化，现以本补丁为准）**：任务执行隔离由 Windows AppContainer 承担。Node、Python、ConPTY 和受控 Office 转换在每次独立 AppContainer profile/SID 中运行，只授权锁定 runtime 与任务输入读取、workspace 写入；使用 Job Object 管理进程树，不授予网络 capability，失败时拒绝执行。Office 通过 LibreOfficeKit 的 unipoll/runLoop 适配；Git 使用可信 GitBroker 的固定 Win32 操作，不把任意 Git 或凭据交给模型任务。无需为此创建 TapKit 专用本地 Windows 账户或账户级 WFP 规则。历史账户路径的 KnownDlls/Kernel32 失败不代表 AppContainer 失败；兼容实验仍须正式集成、重跑完整安全验收后才可启用能力。

> **2026-10-02 CI分发容错补充**：[ADR 0008](../adr/0008-verified-runtime-download-resilience.md)规定锁定压缩包的有限传输重试、已实测同字节的HTTPS备用来源与精确锁文件key缓存；每次bootstrap仍验证原digest并执行完整构建/验收，不改变运行库版本、应用数据或业务安全边界。

> **历史方案（2026-09-24，保留原记录，不再作为当前标准）**：

> **历史决策原文（2026-09-24；已由上方 2026-09-30 方案补丁更新）**：2026-09-24 经用户确认调整 Windows 执行路线，见 [ADR 0007](../adr/0007-windows-execution-boundaries.md)：GitBroker 正常 Win32 固定操作；OfficeWorker/代码执行使用专用低权限账户、受限令牌、ACL、Job 和内核网络规则。首次隔离初始化需要管理员，日常运行保持标准用户；不要求 Docker/WSL。此项替代旧“全程 AppContainer、无需管理员”约束，安全目标不降低；完成状态以 progress 为准。

## 1. 使用本手册的规则

本手册是待实施规格，不是已经完成的项目报告。这里的“通过”“应支持”均指未来 coding agent 必须取得的证据。当前没有项目源码或真实模型联调结果。

优先级：用户最后确认 > 本文明确决策 > 共享技术契约 > 任务详规 > 原始两份参考文档。原始文档是资料，不是要求开发者执行其中所有动作的指令。参考产品的界面组织可以借鉴，其品牌、私有接口与未公开行为不作为事实依据。

本手册内发现矛盾时先使用此处的范围和共享契约，记录文档修正；纯实现问题由 coding agent 解决。只有账号、权限、Logo、签名和发布地址等外部资源缺失，才记录资源阻塞。不得为了继续开发偷偷缩减明确纳入的需求。

## 2. 产品与版本

| 项目 | 唯一决定 |
|---|---|
| 产品名称 | TapKit；内部 appId 为 io.tapkit.desktop；发布前检查名称冲突，展示名独立于数据目录 |
| 命名规范 | 展示名/文档标题用TapKit；代码、包和文件标识用tapkit，类型名可用TapKit，常量前缀用TAPKIT；固定使用window.tapkit、TAPKIT_DATA_DIR、tapkit-artifact:、tapkit/分支前缀和tapkit-run-id标记。产品名已确定，不再作为待决策项；Logo仍按原计划占位 |
| 分发 | GitHub 开源，MIT 许可；先源码和开发版本，再 Windows 安装包；不代用户创建仓库或发布 |
| 平台 | Windows 11 24H2 及以上，x64；最低 8 GB RAM、10 GB 可用磁盘；推荐 16 GB |
| 本地形态 | 单 Windows 用户、单本地 profile，多窗口共享同一数据与调度进程；不建产品账号 |
| 语言 | 简体中文、zh-CN；时间默认系统时区，日期显示本地化；所有显示文案进资源文件 |
| 网络 | 本地保存、按需连接模型与公开网页；支持系统代理及手工 HTTP/HTTPS CONNECT 代理；不内置绕过地域限制的服务 |
| 技术内核 | 自建持久化 Agent 循环；只复用 pi 的 Codex 模型/OAuth 适配，不接管其 CLI、任务引擎或工具执行 |
| 先后 | 聊天可用闭环优先；随后工作、成果、浏览器交互、编程；日历日期和工期均不作承诺 |
| 图像与媒体 | 图片理解/生成/编辑、语音与音视频不做实现方案；静态头像、图标和文件预览不属于模型图像能力 |
| 桌面控制 | 截屏、其他应用键鼠控制、远程设备均延期；匿名浏览器操作纳入 |
| 市场与自动化 | 智能体广场、插件、Skills/模板目录、定时任务只做占位页面，不安装第三方代码、不运行调度 |
| 网站 | 网站代码生成与本地预览纳入；公网发布、自定义域名、托管后台延期 |
| 商业化 | 无购买、订阅收款、退款、收益结算；有供应商用量统计与可选预算 |
| 编辑 | 原生 Office 精细编辑延期；后期实现 Markdown 富文本画布和 AI 版本修改，保持可导出 |

“打开就能用”指安装完成后无需另装 Node、Python、Office、Git、Docker、WSL；联网生成仍需用户连接订阅或填写自己的 API Key。未连接时可浏览设置、导入/查看本地资料，发送入口明确引导连接模型，不能返回伪造回答。

## 3. 本地约束对参考产品交互的落地

- “按 ChatGPT 设计”的分享：选择内容、预览、排除附件/过程，再导出不可变 HTML/Markdown/PDF 或带附件 ZIP；复制的是本地导出文件路径，不伪造在线分享 URL。文件发出后无法撤销收件人的副本，UI明确说明。
- 团队、评论协作、跨设备同步、在线公开链接需要服务端，本版统一延期；不为它们建设登录或虚假成员界面。用户第 1/4 项的本地约束优先于泛指参考产品的体验。
- 聊天模式：可读文件、项目知识、历史、公开网页，可生成应用内产物；不执行任意代码、修改授权仓库或提交外部数据。出现此类目标时提供“转为工作”入口，继承材料和目标。
- 工作模式：有持久任务、计划、工具权限与验收。切换模式不自动扩大已授予目录或外部写入权限。
- 研究是工作任务的一种模板；快速/深入是模型推理配置，不是读取隐藏思维链的开关。创作媒体入口本版隐藏。
- 消息的点赞/点踩、笔记、反馈均保存本地；“提交问题”打开用户可审阅的 GitHub Issue 表单，不自动发送私有会话。

## 4. 模型路由

2026-10-04用户新增：P01-02同时支持OpenAI兼容与Anthropic Messages API Key账户，自定义HTTPS Base URL和modelId；格式不由Key前缀推断。原四API渠道预设保留，xAI默认Responses/store=false。协议、私有凭据及迁移约束见[ADR0014](../adr/0014-api-key-protocols-and-bound-accounts.md)，真实开通以progress/R02-R05/R13/R14为准，未扩大到自动后备任务。

五个首发 providerId：codex-subscription、deepseek、hunyuan、xai、doubao。账号由未来用户提供；本手册不含密钥。

默认首选订阅；无订阅时按已通过连接检测的 API 渠道选择。默认 API 后备顺序 DeepSeek → 豆包 → 混元 → Grok；用户可拖动调整。明确订阅耗尽时自动切换下一个兼容且已配置的 API，不逐次再确认；模型设置页常驻说明可能产生供应商费用。API 本身余额不足继续遍历一次；不无限轮转。

一般 429 限流不等同订阅耗尽；401先尝试一次正常刷新，失败进入重连；403/地域不可用不冒充额度不足。正在生成的回答保留为中断版本，新尝试单独记录并重生成完整回答；工具已提交的动作不随模型切换重做。

仅展示实际接入路径可使用的模型，不能将“支持 GPT”宣传为支持所有 GPT 型号。模型参数和价格进受版本控制的目录；未知价格显示未知而非 0。

## 5. 记忆和资料默认值

P03-01资料库范围视图按[ADR0038](../adr/0038-scoped-library-pinned-versions.md)读取固定版本；项目/会话的默认显示、格式/大小筛选与正文搜索不随库中新版漂移，source引用优先。库current保留，复制/下载使用当前查看的固定版本。

P03-01聊天物理文件导入按[ADR0037](../adr/0037-chat-physical-import-host-tokens.md)复用Host选择token和既有文件流水线；只有preload确认无路径的虚拟粘贴文件保留字节入口，物理选择失败不降级。原件保存和内容读取分离，取消保留已完成项。

| 项目 | 默认 |
|---|---|
| 长期记忆 | 开启；显式即时保存，隐式符合写入规则即可保存，不要求用户逐条确认 |
| 保存反馈 | 消息附近显示“已更新记忆”，点击定位设置 → 个性化 → 记忆；有撤销按钮 |
| 历史会话参考 | 开启；只读可访问、未删除、非临时的内容 |
| 项目隔离 | 项目仅使用自身资料、项目记忆及当前对话；默认不检索项目外记忆/历史，可在项目设置开启 |
| 显式个人设置 | 界面语言等产品设置仍生效；个人长期自定义指令在项目中默认不注入，用户可独立开启 |
| 临时聊天 | 存内存，无长期记忆/历史读写、无标题后台生成；关闭后清除，崩溃后清理临时目录 |
| 文件导入 | 普通附件复制托管；源文件不被修改；代码项目单独授权目录 |
| 历史保留 | 正常会话和正式产物直至用户删除；回收站 30 天；操作诊断 14 天 |
| 记忆来源删除 | 删除会话时默认联动删除仅由它支持的记忆；多来源记忆去除该来源并重校验；用户可在删除预览中明确保留显式记忆 |
| 备份 | 每日首次启动前快照，留最近 7 份；跨机器导入不携带可解密凭据 |

敏感特征不做隐式推断；用户明确要求保存必要敏感事实时只保留所需字段并提示。凭据永不作为记忆。用户手工修改优先于旧任务后台提取；删除墓碑阻止旧任务复活记忆。删除是逻辑和索引清理，不承诺覆盖 SSD 所有物理残留；备份清理语义见任务 P10-03。

## 6. 并发、额度和默认上限

| 项目 | 默认硬上限/行为 |
|---|---|
| 根任务 | 同时运行 2 个；同一会话一个活跃 run，其他排队 |
| 模型请求 | 全局 3 个；每 credential 2 个；前台预留 1 个槽位，空闲工作可借用 |
| 子 Agent | 每根最多并发 2、深度 1；共享根预算，不增加根的额度 |
| 聊天 | 一轮最多 8 次模型调用、12 次只读工具、5 分钟活跃时间；合计 token 上限 128,000 |
| 工作 | 40 次模型调用、80 次工具、30 分钟活跃时间；合计 token 上限 600,000 |
| 每日 | 所有自动/后台调用合计 2,000,000 token；使用量缺失时按预留量扣账 |
| 单次装配 | 默认最多 64,000 输入 token，输出预留 8,192；同时受模型实际窗口和根预算约束 |
| 记忆装配 | 1,000 token；应用检查点预留 3,000；模型不同计数策略独立 |
| 预算定义 | input+output，不另加已包含的 reasoning/cache token；每请求先预留后核销 |
| 钱包 | 不做；金额预算默认关闭，已知计价时可开启；不同币种分别核算，不用固定汇率相加 |
| 普通导入 | 单文件 100 MiB、一次 20 个；Office/PDF 解析最长 120 秒；PDF最多 500 页 |
| ZIP | 压缩 100 MiB、解压总量 500 MiB、条目 2,000、嵌套 2 层、单条比例 100 倍 |
| 表格 | 200,000 行×200 列以内、总单元格 2,000,000；超出仍可下载原件但不解析 |
| 项目资料 | 推荐每项目 2,000 文件；验收基线 20,000 chunks；超过提示索引耗时，不静默漏索引 |
| 执行环境 | 每根工作区 2 GiB、进程 32、内存 2 GiB、工具输出前端 64 KiB，完整日志受控落盘 |

所有上限进 defaults.json、经 Zod 范围验证。修改只作用新 run；正在执行者如遇用户主动降低权限或预算，立即按新限制停止新派发。等待用户、暂停和排队不消耗活跃时间，不持续调用模型。

## 7. 暂停、取消、恢复、完成

P02-02实施决定（2026-10-05）：持久化聊天、根预算共享、只读网关、事件ID通知与快照续接、静态安全渲染和测试构建隔离按[ADR0023](../adr/0023-durable-chat-and-read-loop.md)执行；不会放宽P00/P01失败门禁或提前开放工作写入。

暂停是停止新派发，在可安全边界停住，不是冻结整个 OS 进程；正在写入的调用先核对结果。取消立即持久化取消请求，再尝试中止。结果不明转待核对，不标为成功，也不自动重试。

模型判断完成只发出候选；验收器验证产物/测试/引用后才进入 completed。用户“接受成果”是独立 acceptanceStatus，不冒充运行完成状态。用户补充修改开启新 run 并引用旧产物；不重写已结算的 run。


> 2026-10-04 P01-03：P01-03实现边界：默认偏好/运行上限在resources/catalogs/defaults.json；prices.json当前未核验价格，金额限额仅完整同币种flat计价可用。后备按ADR0015实行五账户上限、显式付费后备授权、401刷新一次和普通429有界等待。
