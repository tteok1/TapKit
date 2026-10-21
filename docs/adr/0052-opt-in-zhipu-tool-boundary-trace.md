# ADR0052：按profile与case启用的智谱工具边界脱敏诊断

- 日期：2026-10-17
- 状态：accepted
- 任务：P02-02真实只读工具补验

C/C2真实回答完成但均tools0；现有公开账本不能区分未带工具、上游没有标准提议或归一化前丢失。原始消息、参数、响应体、推理和加密native不用于排查日志，不能靠猜测补工具行或绕过网关，也不强制供应商不支持的tool_choice。

ApiKeyAdapter增加可选的内部trace sink，仅isZhipuChat启用；未配置时不创建记录器。记录交给fetch的序列化请求中的工具数量/固定白名单工具名/选择方式，以及HTTP状态、已解析SSE形状计数、固定finish枚举、交付的tool_end数量和终结状态。记录有效UUIDv7 attemptId以关联公开provider_attempts。未知工具名只计数，未知finish只记other；不记录URL、账户标签、Header/Key、参数、消息、推理、错误文案、响应ID/callId或native。

Core只在TAPKIT_TOOL_TRACE=P02-02、TAPKIT_TOOL_TRACE_PROFILE精确匹配当前profile且TAPKIT_TOOL_TRACE_CASE为UUIDv7时启用。固定写当前dataDir/logs/tool-trace-{caseId}.jsonl，拒绝已存在case和链接，1MiB后停止；启动仅写opened回执，不发送请求。每条严格schema白名单二次校验，诊断写入/回调异常不改变请求行为。日志只保存在本机，非默认遥测；普通启动无环境标记时关闭。

request.fetchInvoked表示指定序列化请求已交给传输函数，不单独证明远端接收。HTTP200、原始SSE形状计数和归一化tool_end需要结合公开run/tool账本解释。计数不证明工具成功，最终仍按网关执行、side_effect、callId配对和结算验收。已发生的C/C2不补写诊断或账本。

不改变业务IPC/数据库版本、工具签名、调用策略、重试/预算/代理/用户设置或native绑定版本；其他渠道/协议继续暂缓，A/B既有验收不重跑。内部可选构造参数不构成Renderer读原始协议的接口。用合成敏感字段过滤、默认关闭/错profile/非法case/重复case拒绝、回调失败及完整Core→adapter→网关的模拟检查验证，再由用户发一条带诊断的真实请求。
