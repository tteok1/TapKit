# ADR0049 网络失败阶段与请求尝试进展

- 日期：2026-10-13
- 任务：P01-03；关联 P01-02 transport、P02-02 chat。验收状态以 progress 为准。

用户将每日预算设为 1 后成功拦截，恢复后的一次发送包含两次真实请求尝试：第一次 NETWORK_ERROR，第二次手动取消。缺供应商 usage 时各按预留结算，UI 只显示一个逻辑模型回合和增长的估算，无法解释等待与两条记录。预算恢复没有引起重复核销；历史网络错误缺阶段信息，不能回填原因。

ProviderDiagnosticCode 增加固定枚举 dns_failed、dns_timeout、connection_failed、response_headers_timeout。正式 HTTPS 传输在 DNS 阶段与连接/等待响应头阶段分别分类；20 秒计时仍包含 DNS，收到响应头后清除，60 秒流空闲、TLS、公网 DNS 校验、代理规则、重试次数/等待上限和请求参数均保持。DNS 原生失败原先可能落为泛化 STREAM_INTERRUPTED，现在规范化为可重试 NETWORK_ERROR/dns_failed，沿用最多两次重试的既有网络错误策略。显式取消仍为 CANCELLED 且不附网络故障诊断。分类不导出底层错误文本、URL、IP、代理凭据、头、正文或推理。

ChatMessage 增加可选 diagnosticCode，普通模型 error 事件将固定码保存在既有 chat_json，并发出既有 message.delta；旧消息无此字段仍可读取。ChatRunView 增加 attempts/retries，旧 DTO 缺失时默认 0。计数按该 run 的 provider_attempts（包含同 run 的标题/记忆辅助调用）；attempt_no 大于 1 的尝试累计为重试/后备尝试。calls 仍表示逻辑模型回合，不把预算预检算作实际请求。

聊天进展显示请求尝试、非零自动重试数、最近失败阶段及保守估算说明，失败消息也显示可识别的阶段。用量仍为已结算累计；未返回供应商 usage 时按预留保守核销，每次尝试各入账一次，不把预留称为实际 Token 或费用。正在重试的 run 可显示首条已结算估算，此时累计增长不能推断模型正在思考。金额未知、估算子集和预算释放语义保持。

只扩展兼容的 DTO 和既有 JSON 元数据，不改数据库/schema14、IPC v1、供应商 payload、预算或路由策略。单元验证 DNS/连接超时与取消区分、错误脱敏；正式 Core/router/API adapter 合成集成验证预算拦截→恢复→失败重试→取消→下一次成功、两条独立账本及预留释放；标记隔离 Electron profile 验证 UI/760 宽和重启。真实服务故障原因仍需用户下一次请求提供新诊断，合成通过不替代 live。
