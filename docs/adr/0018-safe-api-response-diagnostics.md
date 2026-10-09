# ADR 0018：API响应诊断的固定分类

- 日期：2026-10-05
- 状态：accepted，P01-02本地实现；新增回归与真人结果未验证

2026-10-05后续更新：[ADR0019](0019-zhipu-responses-json-and-message-compatibility.md)按用户新要求允许成功HTTP分支的JSON声明类型进行64KiB有界核验，仅返回固定分类与受限业务码；HTML/其他仍不读取。本页下方成功非SSE均不读正文的决定为此前版本，JSON行为以新ADR为准。

用户提供的Responses/FlashX检测错误只能确认明确非事件流，旧文案“可能收到网关或代理页面”没有该次HTTP状态、MIME或正文作为依据。用户要求进一步补充安全诊断。

API adapter在收到HTTP响应时捕获实际状态码，将Content-Type仅转换成固定枚举：event-stream、json、html、other、missing。大小写与参数归一化；application/json及application/*+json归为json，text/html和application/xhtml+xml归为html。原始MIME、头参数、其他响应头、URL、Key及正文不进入新增诊断。字段responseType为ProviderError与ProbeView.diagnostic的可选字段，不改变IPC版本或数据库结构。

adapter抛出的响应后错误携带实际HTTP状态及分类，包括明确非SSE、读取或解码失败、上游错误；响应前失败不编造HTTP信息。检测规则在正常finish后生成的截断/无正文失败不补造HTTP字段。连接检测继续报告文本/工具阶段、固定原因及既有安全业务码。界面显示中文分类，非事件流文案改为“返回内容不是事件流，请查看响应类型”。分类来自服务声明的头部，不能证明正文语义或响应来源；JSON不等于有效业务错误，HTML不等于代理劫持。

HTTP成功分支的明确非SSE响应立即取消而不读取正文；取消失败不覆盖格式错误。非2xx响应保持既有最多64KiB的业务错误码解析，原始正文不透传。缺失Content-Type保持既有SSE解析与终止验证，不能仅凭missing判成功。不增加请求、预算、重试或协议回退，不放宽DNS/TLS/代理策略。不持久化新的诊断字段，旧账户记录无法还原该次HTTP事实。

回归用例覆盖三协议、JSON/vendor JSON/HTML/XHTML/其他、非200的成功状态、工具阶段、缺失头的SSE验证、响应前网络错误、HTTP401、取消异常，以及IPC固定枚举和私有标记不泄露；集成fixture覆盖Chat/Responses的Flash与FlashX经过HTTP和Core的诊断与失败状态。遵照用户暂停本机测试的要求，用例仅编写不运行，不发真人模型请求。静态检查、构建及交接结果记录在[证据](../evidence/P01-02/zhipu-fix/safe-response-diagnostics-2026-10-05.md)，P01-02与P01门禁不提升。
