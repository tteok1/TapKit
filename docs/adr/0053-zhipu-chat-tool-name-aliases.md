# ADR0053：智谱Chat工具名与内部名称双向转换

- 日期：2026-10-17
- 状态：accepted
- 任务：P02-02只读工具真实补验

C3脱敏诊断确认请求包含files.read/history.search，HTTP200响应只有文本与stop，没有标准工具提议。继续核对[智谱官方Chat接口](https://docs.bigmodel.cn/api-reference/模型-api/对话补全)的FunctionObject.name，规则为`^[a-zA-Z0-9_-]+$`，长度1—64；直接发送带点号的内部工具名违反接口契约。这是已证实的本地兼容性错误，但HTTP200且未调用工具不能单独证明这是模型选择不调用的唯一原因，也不能据此声称FlashX不支持工具。

仅对isZhipuChat精确匹配的官方普通Chat端点，在Provider边界将files.read/history.search/knowledge.query转为files_read/history_search/knowledge_query。响应仅接受本请求实际声明的wire名称，解码为canonical名称后再做既有参数校验和完整提议交付；未声明工具、名称冲突及半JSON继续拒绝。Core、权限、网关、callId配对、执行账本及UI继续使用原名称。禁止把普通回答或参数文字当工具执行，不改tool_choice默认auto、推理、模型、重试和预算。

工具声明、canonical历史转wire及保存的assistant工具提议使用相同转换。加载已有private wire前缀后也重新转换，映射幂等且保留其他原生字段，因此旧点号前缀和新下划线前缀均可续接；canonical结构、加密native schema及binding版本保持兼容，不重写历史库或凭据。通过新Adapter实例恢复旧/新合成前缀及配对结果回归验证，不读取真实native正文。

ADR0052诊断白名单增加三个固定wire别名，日志记录真实wire名称，未知名称仍只计数，不扩大日志字段。其他端点/协议不改变。没有依赖、IPC、DB版本、用户设置或授权变化；其他渠道/协议的真人验收继续暂缓。

完整真实验收仍需用户在修正版的一次请求，关联请求别名、标准提议、canonical网关成功、结果回传、终答和单次结算。本地模拟通过不提升live状态，不重测A/B。证据见docs/evidence/P02-02/live-2026-10-15/round-c3-observation-2026-10-17.json和tool-name-fix-2026-10-17.json。
