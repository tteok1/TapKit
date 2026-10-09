# P03-01 需求与异常审计（2026-10-09 接续）

基线：PR #6 / codex/p03-files / 47db84726878afc5abb91fc0849543b6c81070a7。本轮工作树新增 ADR0039/0040、schema9 和相应实现。这里的“本地”指实际 Host/preload/Main/Core/SQLite、合成受控文件或便携 parser；不等于 native AppContainer 已通过。

已核对任务列出的 24 项需求。审计发现并修复媒体状态、生成笔记固定引用/正文索引、扫描 PDF 的 OCR 状态，以及按项导入和按版本读取的取消入口。具体命令、退出码、失败轮与截图见 [验证记录](resume-validation-2026-10-09.json)。P03-01 仍 in_progress，不能以本审计或历史 P00 通过代替 P03 native 收口。

| 需求 | 实际实现与本地证据 | 原生/延期边界 |
| --- | --- | --- |
| FR-03-002 | chat-file-import、chat-surface：物理 File 使用 Host token，虚拟粘贴保留；chat-import unit、聊天/导航 Electron | 图片理解延期；可读文档的真实解析待验 |
| FR-13-001 | file-selections/file-service：多选、拖入、明确格式元数据、原件保存；file-service、parser-process、真实 Host Electron | TXT/PDF/OOXML 的 native 成功链仍待验 |
| FR-13-002 | 图片/音频/视频原件不调用 executor，独立 unsupported 状态；orchestration 和媒体下载 Electron；ZIP 安全适配器 unit | 图像/OCR/媒体分析延期；ZIP native 待验 |
| FR-13-003 | 目录只读 token、中文相对路径、目录投影；selections、service、files 和目录 Electron | 不自动关联其他未授权目录 |
| FR-13-005 | importInfo 的锁定 limits/剩余磁盘，导入前格式说明；service integration、响应式 Electron | 100 MiB/20 个等上限未增加 |
| FR-13-006 | 选择/保存按项取消，失败项重新选择；固定版本 cancelParse/retryParse；service 取消、files fencing、选择 Electron | 真正 native 取消/kill/重试待验；不重放旧 token |
| FR-13-007 | imported 与 parseStatus 分离；媒体原件、组件不可用、需 OCR 均不会标正文 ready；orchestration、files、媒体/OCR Electron | OCR Electron 使用持久合成结构，不能证明 native PDF 已成功 |
| FR-13-008 | keep/skip/明确 replace、hash 去重、独立文件、大小写扩展；files/service、版本 Electron | 替换新增版本，固定引用不漂移 |
| FR-13-009 | 具体 EMPTY/ENCRYPTED/MAGIC/CORRUPT/格式/OCR 原因和下载、替换/重选入口；text/archive/pdf/Office unit、parser-process、详情 Electron | 恶意/加密/损坏的真实 native 拒绝待验 |
| FR-13-011 | FileOwner library/session/project 与 Host 导入目标，固定版本 link；service/files/material、范围与聊天 Electron | 无项目权限时拒绝，不扩大范围 |
| FR-13-012 | original/exporter 的前后授权与独占输出，失败和 unsupported 仍下载原件；exporter、失败/媒体/OCR/版本 Electron | 已验证下载，不宣称失败的 native 已修复 |
| FR-14-001 | 上传资料与 messages.saveNote 生成结果同库，列表/网格、来源筛选；history 生成笔记、schema9 迁移、生成笔记与响应式 Electron | 当前可运行生成路径是存储消息笔记；P07 办公生成尚未实现 |
| FR-14-002 | library 类型/来源/owner/日期/收藏筛选；files cursor/filter、service 和范围 Electron | 固定旧版格式/大小/状态一致 |
| FR-14-003 | 文件名及固定版本 file_search_documents/FTS；生成笔记确定正文即时索引；files/history、生成笔记 Electron | 上传正文的 native 结构生产仍待验，不检索未读原件字节 |
| FR-14-004 | FileView/VersionView 的名称、格式、大小、owners、更新时间、hash；契约/范围 integration 与详情 Electron | 历史版保留原始格式与大小 |
| FR-14-005 | folders、rename/move/copy/favorite 的修订和 scope 校验；files/service、目录和版本 Electron | 复制指定所看版本；共享物理父目录保持既定语义 |
| FR-14-006 | 批量 move/download/trash、impact 与逐项结果；files/service、批量下载 Electron | 下载取消不再开启后续对话框，未完成项保留选择 |
| FR-14-007 | resource_links 及已接受 run/message/task_version 使用投影；file-usage、任务使用 Electron | 排队或保存引用不冒充实际任务执行 |
| FR-14-008 | link/unlink 固定 fileVersion，跨范围根目录投影；files/material、目录/项目/会话 Electron | 坏 pin、外部目录、撤权和其他 profile 仍拒绝 |
| FR-14-009 | versions、restoreVersion 新增版本、copy 指定版本；files、版本/范围 Electron | 不覆盖旧原件，不把恢复偷偷重绑引用 |
| FR-14-010 | unlink 与实体 trash 的分别影响预览；files/service、回收站/范围 Electron | 删除实体影响全部关联，移除引用仅当前范围 |
| FR-14-011 | 30 天 purgeAfter、restore/purge、持久 tombstone/journal 和备份恢复防复活；files、storage/history 回归、回收站 Electron | 永久删除实际 fsync journal，原件仍由引用 GC 管理 |
| FR-14-012 | 原件/结构/预览/备份独占占用去重，按 size 排序、clearPreview；files/storage、library Electron | 不把数据库/运行库计为文件原件，不删除备份保留 blob |
| FR-33-008 | DOM File 拖入、Host 文件夹导入与目录授权；selections/service、实际 drop Electron | 本任务部分范围；截图/屏幕功能仍延期 |

## T07/T08/T19 异常对应

中文同名、相同 hash、大小写后缀：files/service 与完整版本 Electron。空文件：text unit、portable parser-process 原件不变。加密 PDF 与 ZIP、损坏 CRC/格式、路径穿越/ADS/Windows 别名/链接/炸弹/嵌套预算：pdf/archive/Office unit 与 portable parser-process；不冒充 native 拒绝证据。

取消半导入/暂存后取消：selections/service 的实际信号和提交 fencing；新按项取消保证其他项继续。磁盘满：service 注入 ENOSPC，源字节保留且无 imported 版本；不是实际填满用户磁盘。导入进程终止、SQLite 重开、原件重选：import-recovery 与实际 Electron 恢复。解析暂存进程终止：file-staging 在 executor 前暂停；不是 native helper kill。

worker 取消/硬 kill/单版本重试测试在 P03-01.native-parser.test.ts 已建立，但最近真实执行仍是 3e569f7 的三项失败。R15：当前 47db847 的 PR run37865577359/check113611382525/startup113611406455 均零步骤账单 failure；新诊断没有执行。必须在受信 Windows 环境运行并修复，保留 AppContainer、无网络、只读输入、Job 回收、源 hash 和原限时。

本机没有执行受阻 unsigned helper，没有调用真实模型，没有读取用户 Key/vault/真实 profile。P03-02/03 未开始，未写 P03-gate，未推进 P04。
