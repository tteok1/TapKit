# ADR0039：原件保留、OCR 状态与生成笔记的固定版本

2026-10-09；P03-01。接续 PR #6 的 47db847，需求审计发现媒体依赖不可用解析器、扫描 PDF 被标内容 ready，以及 P02 生成笔记在固定范围列表中不可见。

图片与音视频只依据不可变版本的扩展名确定延期范围，在调用任何 executor、读取解析输入前返回 FORMAT_UNSUPPORTED；旧 doc/xls/ppt 和宏扩展同样不调用解析器。原件仍可下载；不实现 OCR、视觉或媒体分析，不改变 AppContainer、Node 权限、联网和 Job 限制。

PDF 结构的 quality.needsOcr=true 时保留有界结构和页信息，但文件版本标 unsupported，errorCode=FORMAT_UNSUPPORTED、errorReason=OCR_REQUIRED；资料库给出下载和替换为文本版 PDF 的说明。此版本不能作为已读取聊天材料，不能用空正文声称读取成功。有文本 PDF 仍为 ready。

messages.saveNote 的正文来自已持久化消息的确定文本，直接保存为 Markdown 原件并在同一幂等事务内写入正文索引和固定 session/project 引用。读取状态表示这些已知文本可用，parserVersion=null 保留既有文本兼容；没有生成预览就保持 previewStatus=pending。异步 blob 写入后重查会话/项目归属，不把二进制上传放到这一入口处理。

追加 0009/schema9，只有 live 的 generated/note 原件及其旧 input 引用会补固定 version=1；不会指向之后替换的 currentVersion。只修复空指针和该生产者缺失的原始版本元数据；已有指针、删除项、无版本、其他 profile 或失效 owner 保持拒绝。迁移重复执行不会重复引用，不改原件、解析租约或 blob。Core ready 协议和备份恢复版本上限同步到 9。

本地 unit/integration、实际 Electron 与合成 OCR 结构分别记入 docs/evidence/P03-01/resume-validation-2026-10-09.json。合成/便携解析不替代真实 AppContainer 验收；R15 与三个既有 native CORRUPT_FILE 失败保持待办。
