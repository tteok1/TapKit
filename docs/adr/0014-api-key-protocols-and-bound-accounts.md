# ADR 0014：API Key协议、目的地绑定和本地账户

- 日期：2026-10-04（Asia/Shanghai）；状态：采用；任务：P01-02。
- 用户要求支持OpenAI和Anthropic两种API Key接口格式。保留原DeepSeek/混元/xAI/豆包预设，新增openai-compatible/anthropic-compatible；格式由用户选择，不检查密钥前缀猜协议。与P01-01订阅OAuth凭据分开。

每个账户独立绑定providerId、apiFormat、HTTPS baseURL、modelId、credentialId；配置页在修改域名时显示Key的数据去向。密钥由Host safeStorage加密，SQLite、回执、事件、Renderer账户列表只保存配置或布尔值。Core通过现有Host私有通道读取/删除与配置匹配的凭据。不能由Renderer调用解密、传任意credentialId、修改已有账户目的地，重新配置需保存新账户。清除按钮删除该账户密钥文件并软删除活动记录及原生状态索引，历史外键保留。

既有API凭据首次由可信Core引用时，在Host密文中持久绑定accountId；后续跨账户读取拒绝。Host将API保存与私有读/删除串行化，避免文件重写和清除竞争。清除先写无Key的加密revoked-credentialId墓碑再删除Key文件；相同旧保存requestId不能复活凭据。保存幂等比较只检查原始配置/Key，内部accountId绑定不会使合法重试产生冲突。墓碑不是账户活动记录，也不包含密钥。

不新增SDK依赖。使用按账户实例化的ApiKeyAdapter，共享传输和规范化事件，内部按三种协议分别转换消息、工具、usage和终结事件。渠道字段白名单保留差异：DeepSeek有thinking/reasoning_effort，混元/豆包只发基础Chat参数，官方OpenAI Chat使用max_completion_tokens及include_usage，xAI Responses显式store=false并请求encrypted_content。不假设所有兼容服务支持这些扩展；自定义服务使用最小参数，未实现的推理级别拒绝调用。该实现替代任务旧示意目录中四套重复解析器，六个独立账户profile均有单独fixture验收。

OpenAI格式分别支持Chat Completions的Bearer、messages/tool_calls和Responses的input/function_call_output；Anthropic格式使用x-api-key、anthropic-version、system、messages/tool_use/tool_result。只有完整终结和全部工具参数校验后才发tool_end。当前参数校验支持基本对象/数组/标量、required、enum及组合约束，未知schema特性拒绝；完整工具注册及执行仍属于P05。length保留部分公开文本，未完整工具不派发。

私有原生历史按account/model/format+baseURL摘要/adapterVersion/branch绑定并验证规范化历史前缀；DeepSeek reasoning_content、Anthropic thinking/signature和Responses原生output只进入Host加密文件。跨账户、模型、分支、改写历史拒绝复用。缺usage记录null；Anthropic input包含cache_read及cache_creation子量，缓存子集不重复计费。不实现P01-03费用账本/后备路由。

HTTPS传输每次解析全部DNS结果，拒绝私网/loopback/link-local/保留地址，连接绑定已验证地址且保持原Host/SNI；显式rejectUnauthorized=true，不跟随重定向。沿用显式TAPKIT_HTTP_PROXY及HTTP(S)_PROXY/NO_PROXY，代理是用户指定的本地传输端点，不能将其作为模型Base URL。DNS和连接共20秒，流空闲60秒，检测全过程120秒，单事件4MiB、响应总量50MiB，错误JSON64KiB。未知HTTP200网页、无终结、坏UTF-8/JSON、断流和不完整调用不产生成功；401/403/429/明确quota及Retry-After保留结构化分类，默认不自动重试。

SQLite新增0003，schemaVersion=3；备份后在单个事务内重建账户表扩展provider CHECK和配置字段。仅重建事务期间关闭外键执行，提交前foreign_key_check/integrity_check，finally恢复FK；失败回滚，v2账户/opaque历史保留。旧API账户按原预设补配置；空豆包modelId禁止检测。备份/恢复兼容v1/v2/v3，未来版本拒绝。旧迁移不修改。

保存不代表开通或ready。最小检测先固定文本再echo工具提议，两者通过才更新账户及该账户模型的probe能力；不执行工具。不读取环境中的未知Key，也不借用其他应用凭据。R02-R05/R13/R14未提供，真实两轮、echo、取消验收保留implemented_not_live_verified，本地mock/Electron证据不能替代真实开通权限。

协议核对来源（2026-10-04，仅接口事实；预设模型名沿用2026-09-15规格，真实权限待测）：

- [OpenAI Chat API](https://developers.openai.com/api/reference/resources/chat)、[Responses迁移](https://developers.openai.com/api/docs/guides/migrate-to-responses)。
- [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create)、[事件流](https://platform.claude.com/docs/en/build-with-claude/streaming)。
- [DeepSeek思考模式](https://api-docs.deepseek.com/guides/thinking_mode/)、[xAI无服务端历史及加密推理](https://docs.x.ai/developers/model-capabilities/text/generate-text)。
- 混元/豆包固定地址和基础字段沿用06-model-adapters.md已引用的官方基线；未获取真实权限或新模型列表，不称已核实全量最新参数。
