# ADR 0011：Codex连接检测的脱敏诊断

2026-10-04后续实测及兼容修正见[ADR0013](0013-codex-sse-header-and-reader-lifecycle.md)：缺失Content-Type可通过有界事件校验接受；明确非SSE响应仍拒绝。下文严格响应头要求为初次诊断决定。

- 日期：2026-10-04（Asia/Shanghai）；状态：采用；任务：P01-01。
- 用户实际登录完成，但GPT-5.6 Luna和GPT-5.5检测均报STREAM_INTERRUPTED。截图及用户回复仅证明登录界面和检测结果，不证明中断根因。

现有ProviderError错误code和账户状态保持不变，增加可选diagnosticCode枚举。ProbeView增加可选diagnostic，包含text/tools阶段、固定reason枚举、HTTP状态和经格式限制的上游error code；不会传回原始异常消息、响应正文、URL、headers、token、native或聊天文本。该字段经现有Core IPC ReplySchema验证后显示在开发诊断页，不建立新日志通道或数据库字段。

受控fetch只接受text/event-stream响应；HTTP200的HTML/网关页面明确标记unexpected_content_type。区分网络请求失败、空body、UTF-8/JSON/工具参数失败、超大帧、EOF未终结和读取失败。先捕获的结构化上游错误不被后续读取异常覆盖。上游pi在请求前失败标记provider_setup，请求后未给出已捕获传输原因时标记provider_decoder；不解析errorMessage或复制原始文本猜测原因。

补充真实Electron utilityProcess运行已编译Core的文本/工具probe及失败诊断IPC回归，所有凭据/网络均mock。既有独立Electron主进程live-runner测试不等同Core进程验证。用户真实服务失败仍需新版诊断复测；不以mock通过宣称真实连接已修复，不提升P00门禁，不推进其他任务。
