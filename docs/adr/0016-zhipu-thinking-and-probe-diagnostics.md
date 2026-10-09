# ADR 0016：智谱非思考协议映射与有界连接诊断

- 日期：2026-10-04（Asia/Shanghai）；状态：采用；任务：P01-02。
- 修复分支基于 main 2e78531。用户授权本地实现与测试，保留既有诊断文档；不修改用户代理、DNS、账户配置，不推送或发布。

2026-10-05 Chat FlashX补充（当前范围）：用户在官方标准Chat端点使用glm-4.7-flashx文本检测截断后明确要求覆盖该模型。本轮重新核对官方[4.7/FlashX模型说明](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7)及[思考模式](https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode)：4.7系列默认开启思考，可用thinking.type=disabled关闭。将官方Chat的off映射白名单扩至glm-4.7-flash和glm-4.7-flashx，仍按精确provider/format/origin/path绑定、大小写识别及原ID发送；文本和工具两阶段均发送disabled，预算仍32/128，无自动重试。Responses现有none映射保持，Messages/其他模型/网关/Coding Plan不扩展。沿用未发布tapkit-api/2，无schema/依赖/账户配置变化。增加模型、尾斜杠、两阶段预算、端点负例及文本/工具截断回归；用户此前暂停本机后续测试要求仍保持，回归用例仅编写，实际执行与真人验收不冒充通过。此前“Chat范围保持”为2026-10-04历史范围，由本段替代。

2026-10-04 FlashX补充：用户glm-4.7-flashx的Messages测试3通过、Responses测试3文本截断，随后明确要求补齐再复测。官方[4.7/FlashX模型说明](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7)支持轮级关闭思考，[Responses指南](https://docs.bigmodel.cn/cn/guide/develop/responses/introduction)定义默认max、none放弃思考；现有适配只允许glm-4.7-flash，遗漏FlashX。仅将官方Responses端点的off映射白名单扩为glm-4.7-flash与glm-4.7-flashx，大小写识别、原ID发送规则不变；Chat和Messages范围保持，其他新模型不自动开启扩展。仍为同一未发布修复分支的tapkit-api/2，无native schema/依赖/数据库变更。先以mock验证两个阶段均发送none且预算仍32/128、截断仍停止，再构建供用户原profile仅复测Responses测试3一次；不以文档或mock冒充供应商真实通过。下方原始范围以本段FlashX补充为准。

用户用同一套最小直连请求对照：glm-4.7-flash 默认思考、max_tokens=64 时 HTTP200 / 无公开正文 / length；仅添加 thinking.type=disabled 后 HTTP200 / 有公开正文 / stop。这证明该请求的基础文本接口可用，不能替代 TapKit 流式、工具或两轮验收，也不能解释此前未保存业务错误码的 HTTP429。

官方端点白名单：openai-compatible + openai-chat + https://open.bigmodel.cn/api/paas/v4，以及openai-compatible + openai-responses + https://open.bigmodel.cn/api/v1（均允许尾部斜杠）。端口、路径和origin必须匹配；不根据Key或仅凭modelId猜供应商。仅已核对的glm-4.7-flash（识别时大小写不敏感、发送时保留用户原ID）在reasoning=off时按协议分别发送thinking.type=disabled（Chat）或reasoning.effort=none（Responses）。两个标准端点启用已核对的业务错误映射；其他模型、代理网关、Coding Plan、Messages和其他厂商维持原字段白名单。非off档仍拒绝，不引入未经验证的思考工具链。本修复仍是同一未提交的tapkit-api/2版本；当前参数是同一即将交付版本的一部分，不另改数据库或凭据绑定。

后续用户真人检测：Chat文本/echo通过，Anthropic Messages文本/echo通过；Responses在文本阶段输出截断。官方Response API明确默认reasoning.effort=max，none/minimal放弃思考，max_output_tokens包含思维链。此前TapKit声明off却省略Responses对应字段，是已确认的兼容遗漏；根据文档补为none，与截断现象一致。不会只因截断自动加预算，也不把文档/mock结果冒充修复后真人通过。Responses原生终结completed/incomplete解析不变，store=false，不要求[DONE]。Messages真人通过事实保留，不据此增加未验证扩展。

检测仍最多文本32、echo128输出 Token，总120秒，文本完成后才发工具请求；没有自动重试或自动扩大预算。finish=length 时不标 ready，不派发未完成工具，返回新公共错误码 OUTPUT_LIMIT_REACHED 与 output_truncated 诊断，区分本次输出上限、供应商额度和模型不支持。正常终结但无正文返回 PROVIDER_UNAVAILABLE / empty_text。两阶段分别保留检测阶段，不将部分正文当作完整文本通过。

智谱的业务 code 只在上述官方Chat和Responses端点转换：1113/1308/1310/1316—1321为额度耗尽，1302为限流，1305为服务繁忙，1309/1311/1314/1315为权限问题；1313为需人工处理的限流，不自动重试。1211/1212为模型/方法不支持；参数与认证错误按官方表转换。未知429维持 RATE_LIMITED，不假定耗尽。业务数字 code 可规范化为字符串；回执仅传80字符以内的字母/数字/点/下划线/连字符 code，保留 HTTP状态及已有 Retry-After，不转发供应商 message、原始 body、Key 或原生推理。

ProbeView沿用已有 upstreamCode 字段，API检测页展示文本/工具阶段、HTTP状态和服务错误码。共享 ErrorCode 新增 OUTPUT_LIMIT_REACHED，ProviderDiagnosticCode新增 output_truncated/empty_text；无数据库迁移，无依赖变化。DNS固定公网地址、TLS验证、不重定向及凭据目的地绑定维持原约束，Fake-IP兼容不通过放宽私网策略实现。

验证包括默认思考空输出的回归、参数白名单负例、文本/工具截断、数字业务码、未知码、恶意诊断字符串、真实 mock HTTP + Core持久状态和实际Electron界面。真实资源状态以 progress/R13为准；单次对照截图不能提升整个P01阶段。

官方依据（核对日期2026-10-04）：[思考模式](https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode)、[业务错误码](https://docs.bigmodel.cn/cn/api/api-code)、[GLM-4.7-Flash发布](https://www.zhipuai.cn/zh/news/148)。官方文档明确后续部分新模型强制思考，因此不向所有 GLM 模型发送关闭参数。

Responses补充依据：[官方Response API兼容](https://docs.bigmodel.cn/cn/guide/develop/responses/introduction)及[创建Response](https://docs.bigmodel.cn/api-reference/response/创建-response)。默认max、none放弃思考及输出含思维链已分别核对指南与官方OpenAPI定义；公开文档仅作为协议资料，不读取用户Key或发模型请求。
