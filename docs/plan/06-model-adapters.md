# 五渠道模型接入、订阅适配与降级路由

> P01-01实现补充（2026-10-02）：发行包0.85.1公开gitHead为d981de1229ef899957bbe968bc8dcda02a21f477，原53816d7仅为历史静态参考。公开接口、严格SSE补充、手工回调state校验和DPAPI原生状态约束见[ADR0009](../adr/0009-codex-oauth-and-native-state.md)。真实权限以progress/R01证据为准。

## 1. 关键结论及边界

2026-10-05用户最新决定：[ADR0021](../adr/0021-zhipu-flashx-responses-support-policy.md)将智谱标准API /api/v1 + glm-4.7-flashx 的Responses非思考组合暂按不支持使用处理，不续真人重复验证、不作为推荐/已通过能力；优先标准Chat /api/paas/v4与已有thinking.disabled映射，Chat完整真人待验。保留通用Responses代码及历史数据，本次只更新支持口径，不增UI或运行时阻断，不扩到其他厂商/Coding Plan。

自建Agent内核是唯一编排器。Codex订阅路径只生成文本/工具调用提议，所有工具执行由应用自己实现。依赖 @earendil-works/pi-ai 0.85.1，**不依赖 pi-agent-core、pi-coding-agent、Codex CLI、App Server或桌面应用**。

pi的当前仓库是earendil-works/pi，旧badlogic/pi-mono地址发生重定向。本次检查了commit 53816d7dcc5ebe3a0eedec3cd07196c3a66d83fd；其provider、OAuth和请求转换代码分离。它证明存在该实现路径，不证明是OpenAI对任意第三方应用承诺稳定的通用API。[pi源码入口](https://github.com/earendil-works/pi/tree/53816d7dcc5ebe3a0eedec3cd07196c3a66d83fd/packages/ai)

对应源码位置：src/providers/openai-codex.ts、src/auth/oauth/openai-codex.ts、src/api/openai-codex-responses.ts。实现时以0.85.1发行包的公开exports为准，锁定tarball integrity；记录与上述commit差异，不导入未导出的私有源码路径。

官方认证资料区分订阅访问与API计费；本产品的订阅直连兼容适配不可冒充普通Platform API。[官方认证说明](https://learn.chatgpt.com/docs/auth)

## 2. 公共适配器接口

2026-10-05连接检测证据：[ADR0020](../adr/0020-probe-request-and-usage-evidence.md)补请求准备摘要、实际usage及finish后HTTP信息，文本/工具阶段各自隔离；只有服务报告输出全部为思考且请求准备关闭字段明确时细分诊断，不猜测none执行，不提高预算或放行截断。用户本机本地fixture测试已恢复，真实调用仍独立授权/验证。

2026-10-05后续Responses兼容修复：[ADR0019](../adr/0019-zhipu-responses-json-and-message-compatibility.md)基于官方必填项为精确官方端点的输入消息补type=message（含native回放），补顶层SSE错误码与Responses字符串映射。成功HTTP/JSON最多64KiB有界核验，返回业务错误或non_streaming_response/unrecognized_json等固定分类，不透传正文，不将非流式结果算通过；替代下方ADR0018对应JSON不读正文描述，其他类型、请求预算及网络策略保持。

2026-10-05 API安全诊断：ProviderError与ProbeView.diagnostic新增可选responseType固定枚举（event-stream/json/html/other/missing）。响应后失败保留实际HTTP状态，响应前失败不补造状态；不传递原始MIME/头参数/正文。明确非SSE即拒绝，缺失头保持严格流解析。界面不依据类型猜测网关或代理来源；详见[ADR0018](../adr/0018-safe-api-response-diagnostics.md)，静态构建不等同真人验证。

~~~typescript
interface ProviderAdapter {
  id: ProviderId;
  listModels(account: AccountRef, signal: AbortSignal): Promise<ModelDescriptor[]>;
  checkConnection(input: {account:AccountRef,model:ModelRef}, signal:AbortSignal): Promise<ProbeResult>;
  stream(input: ModelRequest, signal:AbortSignal): AsyncIterable<ModelEvent>;
  classifyError(error: unknown): ProviderError;
}
type ModelRequest = {
  logicalCallId:string; attemptId:string; accountId:string; model:ModelRef;
  systemModules:PromptModule[]; messages:CanonicalMessage[];
  tools:ToolSchema[]; outputLimit:number; reasoning:"off"|"low"|"medium"|"high";
  nativeStateRef?:string; taskVersion:number; branchId:string;
};
type ModelEvent =
  | {type:"start";attemptId:string;upstreamId?:string}
  | {type:"text_delta";blockId:string;text:string}
  | {type:"tool_delta";callId:string;name?:string;argumentsDelta:string}
  | {type:"tool_end";callId:string;name:string;arguments:unknown}
  | {type:"usage";usage:NormalizedUsage}
  | {type:"finish";reason:"stop"|"tool_calls"|"length";nativeState?:OpaqueState}
  | {type:"error";error:ProviderError;partial:boolean};
~~~

工具参数不在delta阶段执行。只在完整assistant响应终结、所有tool_end配对且校验通过后派发；流断后完整但未确认终结的调用也不执行。普通公开正文可逐步展示。供应商原生推理协议字段仅加密保存，UI只显示简要进度。

同一attempt内没有同时finish和error。使用fatal UTF-8检测、分块TextDecoder、完整SSE事件解析，覆盖CRLF、多个data行、拆开的中文、多事件同chunk、[DONE]、空心跳、EOF未终结。未知事件保留脱敏诊断但不当文本拼接。

## 3. 渠道参数

2026-10-05 Chat FlashX补充：按用户要求，官方智谱标准Chat端点在reasoning=off时为glm-4.7-flashx同样发送thinking.type=disabled。精确provider/format/origin/path绑定、大小写识别但保留模型ID、文本32/工具128预算和无自动重试保持；Responses现有none映射、Messages和其他模型范围保持。详见[ADR0016最新补充](../adr/0016-zhipu-thinking-and-probe-diagnostics.md)，此前Chat不扩展的描述为历史范围。

2026-10-04 FlashX补充：按用户复测与补齐要求，官方智谱Responses端点在reasoning=off时为glm-4.7-flashx同样发送reasoning.effort=none；大小写识别但保留发送ID，文本32/工具128预算不变。仅扩Responses已核对模型白名单，Chat/Messages及其他模型不因此添加字段；真实FlashX Responses复测另验。详见[ADR0016补充](../adr/0016-zhipu-thinking-and-probe-diagnostics.md)。

2026-10-04智谱兼容补充：[ADR0016](../adr/0016-zhipu-thinking-and-probe-diagnostics.md)规定官方标准Chat + GLM-4.7-Flash在非思考模式显式发送thinking.type=disabled；官方Responses /api/v1 + 同模型使用reasoning.effort=none，两协议不得混用字段。仅精确origin/path/format绑定的标准端点使用业务错误映射，保留通用兼容账户白名单，Messages已真人probe通过而无新增扩展。最小检测遇到length返回OUTPUT_LIMIT_REACHED/output_truncated，已正常终结但无正文返回PROVIDER_UNAVAILABLE/empty_text；不能归为模型不支持或继续工具检测。保留脱敏业务code并区分智谱的额度、限流、繁忙与权限错误，不自动重试或增加输出预算。

2026-10-04用户扩展：新增openai-compatible（默认https://api.openai.com/v1，Chat/Responses）与anthropic-compatible（默认https://api.anthropic.com/v1，Messages）。modelId由用户填写，HTTPS地址可配置且显示域名变更提示。P01-02用六个独立账户profile、三种协议转换及共享严格SSE；不声称兼容服务支持全部扩展字段。AccountView增加apiFormat/baseURL/modelId/hasCredential；API模型contextWindow/maxOutput未知为null、toolCalls未知，文本+echo通过后才标probe。详情见[ADR0014](../adr/0014-api-key-protocols-and-bound-accounts.md)及任务进度。

| providerId | 基线路径/认证 | 初始模型与策略 |
|---|---|---|
| codex-subscription | pi OpenAI Codex provider，OAuth；请求走其订阅专用endpoint | 使用锁定pi目录中存在的GPT模型；初选目录内明确default，否则优先gpt-5.6-terra、gpt-5.5，再取有text+tools的首项；不存在则不构造虚假ID |
| deepseek | https://api.deepseek.com/chat/completions；Bearer API Key | deepseek-flash；深度模式可选deepseek-v4-pro；以连接检测结果标记可用 |
| hunyuan | https://api.hunyuan.cloud.tencent.com/v1/chat/completions；Bearer HUNYUAN_API_KEY | hunyuan-turbos-latest；这是腾讯混元OpenAI兼容服务，非SecretId/SecretKey原生签名接口，也非TokenHub |
| xai | https://api.x.ai/v1/responses；Bearer XAI_API_KEY | grok-4.6；明确store=false，完整上下文由本地维护 |
| doubao | https://ark.cn-beijing.volces.com/api/v3/chat/completions；Bearer ARK_API_KEY | 设置页填写账户实际可用model ID或ep-接入点ID；可提供官方示例doubao-seed-2-0-lite-260215作建议，不把示例当所有账户均已开通 |

以上是2026-09-15文档/源码核对基线，真实权限仍待账号测试。不能把豆包Coding Plan、混元TokenHub、Grok网页订阅与上述计费渠道混用；当前只接用户指定的API形态。手工覆盖baseURL仅在高级设置允许HTTPS、显示数据去向；不能让模型修改地址，不允许订阅token发送到自定义baseURL。

模型目录字段固定：providerId/modelId/displayName/contextWindow/maxInput/maxOutput/modalities/toolCalls/parallelTools/jsonSchema/reasoningLevels/nativeCompaction/cacheUsage/nativeStateSchema/priceRef/sourceURL/checkedAt/verification。不能确定的能力设unknown；工作任务只选toolCalls已documented且已probe的模型。用户新增modelId首先最小探测，不把“兼容OpenAI”当成所有参数都兼容。

DeepSeek当前首页与搜索缓存存在别名差异，以实际打开的首页deepseek-flash为基线；旧名字只作兼容显示。默认使用非Beta Chat Completions，不发送strict:true到普通endpoint；全部工具参数本地校验。思考模式的reasoning_content等连续性字段按该模式规范保存，在同一轮工具链中回传，不显示给用户。[DeepSeek入门](https://api-docs.deepseek.com/)、[工具调用](https://api-docs.deepseek.com/guides/tool_calls/)

混元只实现本文指定兼容API及必要参数，额外TC3签名不混进适配器。[混元官方示例](https://cloud.tencent.com/document/product/1729/111007)

Grok采用当前推荐的Responses路径，store显式关闭，不依赖供应商存储会话。[xAI接口](https://docs.x.ai/developers/rest-api-reference/inference/responses)

豆包按账户接入点配置，request body白名单为model/messages/tools/tool_choice/stream及已验证的输出/思考参数，逐模型做转换；不假设能列出全部ep-id。[方舟官方快速开始](https://www.volcengine.com/docs/82379/1795150)

## 4. Codex OAuth和请求

> 2026-10-04修复补充：[ADR0010](../adr/0010-codex-auth-failure-and-lifecycle.md)规定注销取消关联登录/检测、检测首次await之前占槽、受控OAuth刷新保留结构化错误。登录仍走公开models.login；请求先公开Models.getAuth完成认证与CAS轮换，再公开provider.stream生成，避免lazy stream将认证错误压成文本。live验收使用两个独立进程和生成中取消，真实结果仍以R01证据为准。

> 2026-10-04实测诊断补充：[ADR0011](../adr/0011-codex-probe-diagnostics.md)规定ProviderError可选diagnosticCode及ProbeView可选diagnostic（text/tools阶段、枚举reason、HTTP状态、脱敏上游code）。非SSE内容、准备失败和读流/解码失败独立报告；不复制原始异常/正文/headers/token。真实utilityProcess回归补充验证Core IPC路径；mock通过不覆盖用户实际连接失败。

> 2026-10-04代理及注销补充：[ADR0012](../adr/0012-codex-proxy-and-logout-feedback.md)规定开发入口TAPKIT_HTTP_PROXY/HTTP(S)_PROXY，在Core和live首个请求前启用Node内置代理；只接受HTTP(S)，保留NO_PROXY。AccountView可选hasCredential只暴露布尔值；按用户最新要求，注销清除凭据并移除活动账户记录，旧无凭据记录提供“清除账户记录”按钮；保留删除墓碑和历史外键。正式系统代理/设置页仍按后续任务实施。

- 在可信Core/认证worker中创建pi Models collection，仅注册openaiCodexProvider；注入自己的CredentialStore。每个accountId独立collection/store命名空间，避免pi的单provider凭据槽覆盖多账号。
- 调用公开 models.login('openai-codex','oauth',interaction)，把notify(auth_url/device_code/progress)转为脱敏auth事件；prompt通过专用登录UI完成，不进入聊天消息。
- OAuth在系统默认浏览器完成，不使用匿名工作浏览器保存登录态。回调按上游指定localhost端口处理；port占用时提供device_code或手工回调输入并校验state，不结束其他软件进程。
- Host safeStorage加密凭据，Core仅在请求期取必要token。read/list/modify/delete满足pi CredentialStore契约，modify串行化；刷新CAS，轮换token落盘成功后才放行下一请求。
- 不自动读取用户现有Codex或pi auth.json，不要求复制其他应用的token，不把OAuth凭据转换为Platform API Key。
- stream参数固定transport='sse'、maxRetries=0；调用应用的受控fetch适配器，记录HTTP状态/错误code，统一重试在路由层；首次避免WebSocket连接级历史与恢复相互耦合。
- 输入由自有CanonicalMessage转换成pi Context。使用本应用systemPrompt与tool schema，不引入pi默认Coding Agent提示词。
- 只有完成的消息进入下一次context。pi事件partial为可变对象，必须即时归一化或使用其frame编码，不把对象引用留在事件日志中。
- 原生nativeState绑定account/model/adapterVersion/branch；换模型或编辑分支后从应用检查点重建，不迁移加密推理内容。

订阅协议异常只禁用该channel并报明确错误；不改用Codex CLI隐藏执行整个任务，不擅自请求本版未配置的OpenAI付费API。

## 5. 自动切换的精确算法

1. 选用户本轮指定模型，否则会话默认，否则全局首选；固定logicalCallId，创建attempt。
2. 首次connect检查只消耗最小请求：回复“OK”、最多32输出token，无工具和私密资料；第二个工具probe调用本地echo，绝无外部副作用。
3. 网络/5xx/普通限流：未开始正文且无调用提交时，指数退避最多2次，1s/3s加随机抖动，尊重Retry-After但单次等待≤30s；等待仍超出run期限则停止。
4. 明确QUOTA_EXHAUSTED：订阅channel立即停用至reset或下次手动检测，记录provider.switched，选择后备。不得只凭HTTP429分类；必须结合供应商错误code/额度状态。未知429为RATE_LIMITED。
5. API后备只从ready账户、能力兼容、scope允许、未在本轮尝试且有剩余预算者选择；顺序来自用户设置。默认列序见决策文档。一轮最多遍历5个账户。
6. 切换前锁定已提交tool ledger，把必要结果转为低信任证据；不伪造新供应商从未提出的tool调用。闭合历史调用对，或转换成带来源的检查点摘要。
7. 已输出部分正文时，旧attempt显示“中断，已切换到X重试”，新attempt重新生成完整答案；不把两个模型文本拼接成一条无来源答案。旧版本可查看。
8. 保留原始费用记录；失败attempt也可能计费。全部不可用进入waiting_user或failed并给设置入口，不无限重试或静默使用不兼容模型。

用户手工锁定“仅此模型”时关闭当前run fallback；默认没有此限制。API Key尚未配置时自动切换失败是等待配置，不是重新询问产品需求。

## 6. 用量与预算

NormalizedUsage记录inputTotal、inputCachedSubset、outputTotal、reasoningSubset、providerRawRef、source(actual/estimated)。子集不能重复相加；供应商字段缺失用null，不用0。每次请求的预算预留含最大输入/输出；usage到达后事务核销，未知用量保守扣预留。

API价格是单独有checkedAt和sourceURL的配置；开发阶段不硬编码未经核实价格。金额预算启用要求对应模型/币种完整价格，未知则拒绝启用金额上限，token上限始终有效。订阅显示实际可读到的额度/恢复时间；没有稳定来源时显示“供应商未提供”，不自行伪造百分比。

## 7. 联调完成条件

2026-10-04：API单账户完整live入口和智谱overloaded的有界重试分类见[ADR0017](../adr/0017-bounded-api-live-acceptance.md)。正常routing可重试，不改变连接检测单次请求；完整脚本最多6次并首次失败停止。内存native与独立usage报告不能替代磁盘加密或原应用账本核对。Codex用户账户真实调用仍需该用户明确同意。

2026-10-04真实链路兼容补充见[ADR0013](../adr/0013-codex-sse-header-and-reader-lifecycle.md)：缺失Content-Type时只允许有界、严格校验的Codex SSE，明确其他响应类型仍拒绝；终结后reader取消不产生假断流。独立TapKit测试账户只读诊断通过文本和echo提议；完整live的两轮/重启刷新/注销按任务记录单独验收。

每provider保存不含secret的connection-report.json：账户标签、modelId、SDK/adapter版本、network mode、text/stream/tools/cancel/history/error/usage结果、时间和脱敏trace路径。Codex另测OAuth首次、刷新、注销、回调冲突和模拟耗尽切换。

未知的真实账号配置列在[资源待办](11-external-todos.md)。模拟可解锁开发；只有五渠道真实证据齐全，才可以把“首发五渠道可用”标为验收通过。


> 2026-10-04 P01-03：P01-03交付：providers/routing/catalog.ts与router.ts、core/model-service.ts、storage/usage-ledger.ts。原子root+daily预留/核销、五账户后备、401一次刷新、普通429不冒充耗尽、跨模型闭合工具证据及独立attempt。价格/供应商额度未知；首次启用付费后备为费用授权，不重复逐次确认。详见ADR0015。
