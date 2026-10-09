# 智谱 Responses 恢复排查记录

## FlashX 用户通过及 P01 复核

2026-10-04用户确认原请求的FlashX Responses测试3通过，基础文本/工具检测本项收口；完整live未据此通过。本次复核发现API完整live入口和已知错误/网络兼容技术尾项，P01-02改回in_progress、P01-gate=failed；不是此次检测失效。详情[P01复核](P01-review-2026-10-04.md)与P01-review-results.json，flashx-results.json已补用户反馈。下方等待复测为历史检查点。


## FlashX Responses 补齐完成，等待单次真人复测

2026-10-04用户明确要求补齐后再通知复测。本次只将官方智谱Responses端点的关闭思考模型白名单加入glm-4.7-flashx，文本和工具阶段均发送reasoning.effort=none；原ID保留，大小写识别、endpoint约束、32/128预算与无自动重试保持。Chat、Messages、其他模型及错误分类未改；没有触碰用户账户、网络或系统配置。

实际修复前回归：P01-02.zhipu单元退出1，FlashX正例2项失败、其他47项通过，证明遗漏可复现。修复后pnpm test:unit退出0、155/155（15文件）；相关pnpm test:integration P01-02 P01-01 P01-03退出0、69/69（7文件）；pnpm check与build:desktop退出0。新增测试覆盖FlashX大小写/尾斜杠、两个阶段预算及参数、其他厂商/Chat/Messages无扩展、非off拒绝、截断停止，以及真实本地mock HTTP→Core→SQLite的成功/失败状态。日志flashx-before-unit.log、flashx-unit.log、flashx-integration.log、flashx-check.log、flashx-build-desktop.log。

已核对packages/core/dist/index.cjs:11752包含Flash/FlashX白名单和none；Core产物时间2026-10-04 19:26:52、桌面main 19:26:53（本机时间）。hash与命令结果见flashx-results.json。build只有既有第三方注解/use-client提示，退出0；未主动启动Electron，纯模块以同标签integration覆盖，不复现既有0x80000003问题。不读取Key、不代发真实模型请求；没有提交或push新改动。

接续：请用户退出旧TapKit（托盘退出）后以D:/TapKit/.test-data/P01-02-live-zhipu原profile重启，仅检测“智谱 Responses 测试 3”/glm-4.7-flashx一次并回传界面结果，不再重复Chat/Messages。真实通过尚待反馈，不能据mock提升P01-02或阶段状态；已有4.7-Flash的none截断/繁忙历史保留。

## 4.7-FlashX 最新真实反馈

2026-10-04用户已自行新增glm-4.7-flashx的Messages测试3与Responses测试3。截图Messages为已连接，Responses文本阶段OUTPUT_LIMIT_REACHED。前者证明该次基础文本/工具检测通过；不能把单次通过当稳定性/完整live验收或思考关闭证据。Responses此次是输出截断，与前一轮overloaded、1305的过载失败不同。

再次核对当前源码adapter.ts:302和629：Responses输出上限32，只有modelId=glm-4.7-flash才发reasoning.effort=none，glm-4.7-flashx不满足条件。官方Responses通用说明默认effort=max。因此FlashX关闭参数遗漏已经确认，思考/小预算组合是当前主要解释；该次usage未取得，不能断言全部32 Token用于思考。Messages通过不能证明其思考已关闭，也不能推断Responses的默认参数处理相同。

下一步建议只针对已确认官方模型/endpoint为FlashX补齐Responses关闭映射，保持32 Token进行一次有界验证；若仍截断，再依据真实usage及服务回执判断关闭参数是否生效。不靠重试同一未适配请求或盲目扩大预算。上限是请求输出上限，不是账户余额或并发限制。本次仍只定位与说明，未更改生产代码/预算/账户配置，未读Key、代发请求或重跑模型测试。

## 可关闭思考的替代模型官方调研

2026-10-04用户要求查找其他可关闭思考、适合连接测试的智谱模型，并怀疑4.7-Flash拥堵。只读取智谱公开官方文档与当前适配器；没有实际调用候选模型、读取Key、改变配置或生产代码。供应商公开能力不等于当前TapKit已经完成对应协议适配或真实验收。

| 候选ID | 关闭思考依据 | 成本和测试用途 |
| --- | --- | --- |
| glm-4.7-flashx | 官方4.7模型页包括FlashX；该系列支持轮级关闭思考，通用思考文档支持thinking.type=disabled | 付费，公开价输入0.5/输出3元每百万Token；优先作为4.7-Flash之外的低成本对照，不能保证其资源池独立或一定更稳定 |
| glm-4.5-air | 官方4.5模型页明确4.5/4.5-Air支持enabled/disabled | 付费；短输入/短输出档输入0.8/输出2元每百万Token，适合作第二个模型系列的对照 |
| glm-4.5-flash | 官方模型页明确支持enabled/disabled、工具调用，默认动态思考 | 免费候选；仍没有其当前负载/三协议关闭效果的真实证据 |
| glm-5.2 | 官方深度思考文档支持disabled，并明确reasoning_effort的none/minimal为放弃思考；Claude兼容指南也有glm-5.2调用示例 | 付费，输入8/输出28元每百万Token；可作为思考参数定义更明确的补充，不需要为简单检测优先用高价模型 |

来源：[模型概览](https://docs.bigmodel.cn/cn/guide/start/model-overview)、[4.7/FlashX](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7)、[4.5/Air](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.5)、[4.5-Flash](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.5-flash)、[思考能力与5.2参数](https://docs.bigmodel.cn/cn/guide/capabilities/thinking)、[当前价格](https://docs.bigmodel.cn/cn/guide/start/pricing)、[Claude兼容](https://docs.bigmodel.cn/cn/guide/develop/claude/introduction)、[Responses兼容](https://docs.bigmodel.cn/cn/guide/develop/responses/introduction)。价格是本次公开表快照；账户权限、额度、接口实际支持与计费仍按控制台/实测确认。没有把Chat的thinking字段直接当作其他协议字段；Responses通用reasoning.effort=none有官方定义，候选具体模型仍需真实确认，Messages关闭方式尚待该协议验证。

当前TapKit只有glm-4.7-flash的官方Chat/Responses显式发送关闭字段；其他候选与Messages没有对应关闭映射。因此只更改模型ID不能完成控制变量测试；建议后续先补候选的明确模型/协议适配，再保持相同提示和预算作有界对照，保留原账户，不重复给失败账户发请求。推荐首选glm-4.7-flashx，零费用优先时选glm-4.5-flash；本次仅建议，未形成生产接口变更。

1305官方含义为模型当前访问量过大；overloaded也支持上游繁忙判断，因而用户负载猜测有依据。不能进一步证明是免费模型用户太多、FlashX有独立空闲资源池，或全部失败由负载导致：Chat同4.7-Flash稳定，Responses兼容路径与关闭思考仍有待区分；OUTPUT_LIMIT_REACHED是另一个预算/思考截断问题。

## GLM-5.3-Flash 新反馈与预算适配判断

2026-10-04用户新增glm-5.3-flash的Responses和Messages账户。用户反馈Responses曾数次通过，随后也出现OUTPUT_LIMIT_REACHED；Messages持续同码。截图Responses测试2为已连接，Messages测试2为连接不可用，底部明确Messages文本阶段output_truncated。用户表示截断时智谱控制台可见调用记录；未提供该次usage或终结事件原始摘要，不能断言所有Token都用于思考或具体计费数额。

已通过公开文档GET核实[GLM-5.3-Flash模型说明](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash)与[思考模式说明](https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode)：5.3-Flash默认思考且thinking.type仅支持enabled，不能关闭思考。Responses[通用说明](https://docs.bigmodel.cn/cn/guide/develop/responses/introduction)仍写effort默认max、none/minimal放弃思考；不能把通用描述直接当5.3模型可以关闭的证明，应按模型限制和该协议真实回执确认。

源码确认文本probe固定outputLimit=32、工具128；Messages发送max_tokens，Responses发送max_output_tokens。reasoning=off在本地请求中存在，但智谱关闭思考字段当前只对glm-4.7-flash的Chat/Responses发送；5.3与Messages不发送关闭字段。Messages上游stop_reason=max_tokens与Responses的response.incomplete/max_output_tokens均映射length，连接检测映射OUTPUT_LIMIT_REACHED并停止，工具阶段不开始。因而本次实际截断已确认；强制思考模型与极小预算不匹配是当前明确的TapKit适配缺口，高概率解释反复截断，确切思考/正文占比尚无新usage证据。

调用记录表示平台记录了调用，不能单凭记录判定完整回答成功。此类截断可能已有真实生成和Token消耗；是否计费和具体用量以该条平台记录为准。TapKit的检测成功要求正文正常完成、再通过工具检测；本次文本截断不满足要求，UI“连接不可用”过于笼统，应明确提示已到达服务但输出截断。Responses数次通过只证明5.3基础检测曾成功，不构成稳定性或完整live验收。

后续建议把模型思考能力/检测预算做显式适配：支持关闭的模型按协议关闭；5.3这种不能关闭的模型采用明确有上限、可说明的思考与输出预算，并补截断/usage/检测提示回归。不盲目重试同一32 Token请求，不伪造协议通过，不无限扩预算。本次只是定位和建议，未改生产代码、预算或用户配置，未读Key、代发真实请求或重跑模型测试；新反馈不能沿用前一节“Responses持续overloaded”的判断。

## 最新稳定性反馈与重试核查

2026-10-04用户补充：Chat稳定通过；Responses持续失败，最新截图为文本阶段HTTP200/upstreamCode=overloaded；Messages偶发文本阶段HTTP529/1305。这是用户反馈，未新增真实请求或重新读取账户。先前Chat/Messages通过只证明基础能力已通，不表示后续一直可用。

- 智谱[官方错误码](https://docs.bigmodel.cn/cn/api/api-code)的1305表示模型当前访问量过大。本次通过公开Markdown读取再次核实；表中标准HTTP为429，Messages兼容接口实测529，业务码含义仍指向模型繁忙。[Messages协议错误说明](https://platform.claude.com/docs/en/api/errors)中529表示过载；用户调用的是智谱兼容接口，不能把它当作Anthropic服务故障。
- Responses的HTTP200表示SSE通道建立；此前同形直连回执已显示response.failed/overloaded，无正文、usage未知。当前报错可定位为上游拒绝生成，不能由此确定其内部容量、路由或模型兼容性的具体根因。它与此前none/32全部消耗在思考上的截断是两种已观测失败，不能混为同一错误或据此宣称协议不支持。
- 设置页检测由Core直接调用ApiKeyAdapter.checkConnection，文本32、工具128、总120秒；文本失败即停止，无自动重试，也无跨账户/协议兜底。换用Chat成功不能证明Responses或Messages账户检测通过。
- ModelRouter的普通生成路径已有每账户最多2次重试（初次加重试最多3次），默认等待1秒/3秒及0–249毫秒随机量，优先Retry-After；单次等待上限30秒，仍受整次调用时限/预算约束。仅可重试临时错误且尚无正文或工具增量时触发。同账户重试后，可按用户偏好、已验证能力、允许账户/付费切换等条件选择备用账户，最多5个账户；onlyThisModel阻止切换。检测失败账户status不是ready时会被候选过滤，因此此机制不能替代检测页重试。
- Messages HTTP529通过通用5xx映射为PROVIDER_UNAVAILABLE/retryable=true，在ModelRouter生成路径具备重试资格。Responses字符串overloaded尚未显式加入映射：HTTP200最终retryable=false；overloaded_error已支持。这个缺口使当前Responses生成不会进入同账户自动重试分支，仍可能按条件走备用账户。
- 建议先补齐智谱Responses overloaded的可重试分类及回归，再为检测页仅在无输出的明确繁忙错误加入有界重试/具体繁忙提示；不要给认证、权限、截断错误重试，也不通过切到Chat伪造某协议通过。服务可生成后再做同形关闭思考验证；若继续稳定overloaded，应向智谱提交脱敏请求形态、时间及安全请求ID核查该模型的Responses兼容接口，不连续加请求或预算。暂以已稳定通过的Chat作为可用选择。

源码核对：packages/core/src/provider-service.ts:457；packages/providers/src/api/adapter.ts:629；packages/providers/src/api/errors.ts:44；packages/providers/src/codex/errors.ts:36；packages/providers/src/routing/router.ts:346；packages/providers/src/routing/catalog.ts:78；resources/catalogs/defaults.json:45。上述建议尚未实现。本轮只核查公开文档/源码并更新记录，没有生产代码修改、模型调用、系统配置变更或测试重跑；最近148/68/check通过是上一检查点。

2026-10-04，Asia/Shanghai。用户说明尚未交接给别人，明确要求继续开发测试；先前停止排查的要求已由本次恢复指令替代。继续同一 P01-02 任务，分支 codex/fix-zhipu-api-probe，当前基线 b8b4d53。该交接提交已推送到 origin，同名远程提交核对一致；不改用户账户、DNS、TUN、代理或系统配置。

## 当前问题

Chat 和 Messages 的真实文本及工具检测已有通过证据。Responses 在 off 映射为 reasoning.effort=none 后，用户 11:39:53 检测仍 OUTPUT_LIMIT_REACHED，文本阶段未完成；常见旧进程未重启问题已基本排除，真实请求、上游终结事件及 usage 尚未采集。不能仅凭截断判定 Key、模型权限或全部预算用于思考。

## 本轮实际动作

1. 读取 CURRENT、INDEX、P01-02、交接文档与对应任务/ADR，核对工作区初始干净、分支跟踪 origin/codex/fix-zhipu-api-probe。
2. 审阅 responses-direct-probe.ps1，实际运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\docs\evidence\P01-02\zhipu-fix\responses-direct-probe.ps1 -OfflineCheck`，退出0，4组fixture通过；没有 Key 提示或网络请求。
3. 脚本增加上游回传的 reasoning.effort 与 max_output_tokens 安全摘要，再执行同一离线命令，退出0。覆盖截断 SSE、完成 JSON、数字业务错误及坏 JSON；验证正文/推理标记不会出现在最终摘要，缺失 usage 保留 null。
4. 独立离线构造 HttpClient/handler/content，验证隐藏 Key 输入后的 .NET 构造调用、Bearer header、无代理/无重定向、120秒、4MiB buffer 和 application/json 均可建立，退出0；使用假 Key，无任何请求。
5. 已通过异步请求请用户本机执行一次官方 Responses 对照：同模型、同提示、stream=true、32 Token、effort=none，Key 由用户在本机隐藏输入，不发聊天；最多一请求、无自动重试，只回传安全 JSON。
6. 受影响进度文件 Prettier 退出0；pnpm docs:check退出0（37任务状态及证据链接）；git diff --check退出0。均为静态收口检查，不启动模型或Electron。

用户已回传首次真实对照：HTTP200 / SSE / response.failed / response.status=failed / upstreamCode=overloaded，parseErrors=0；无正文或推理事件，usage全部null，回传effort/max_output_tokens也为null。只证明上游失败，不能证明思考关闭生效或此前截断原因，见responses-direct-overloaded-2026-10-04.json。已请至少间隔3分钟后只补一次；若仍overloaded则本轮停止真实请求。

继续核对源码时发现脚本首次input使用input_text内容数组，而TapKit convert发送message.content字符串。两个均为官方定义允许形式，但严格对照应一致；脚本已改为同一字符串，并输出inputShape标记。首次繁忙结论不变，不能将它说成完全相同请求体的对照。再次离线检查退出0，4组回执fixture加请求形态检查通过；没有真实请求。

本轮未改产品适配器或增加预算；新增真实overloaded代码与官方failed事件包络的unit回归，扩展真实本地mock HTTP→Core→SQLite的失败持久状态集成验证。实际pnpm test:unit退出0，15文件148/148；相关integration退出0，7文件68/68；pnpm check退出0，日志resume-unit.log、resume-integration.log、resume-check.log。验证HTTP200失败不当成功/截断，公共状态PROVIDER_UNAVAILABLE、文本阶段upstream_error、保留安全overloaded/200，工具不开始、不重试且私有message/Key不泄漏。生产传输、UI、编译产物无需改变，本轮未重跑build/Electron；build为b8b4d53既有快照。

代理未读取用户 Key或代发真实模型请求。真人成功仍未取得，不能把上述fixture当渠道通过。

## 等待的证据和判断顺序

第二次用户直连结果为HTTP200 / response.incomplete / status=incomplete / reason=max_output_tokens，hasText=false、hasReasoning=true，inputTokens=13、outputTokens=32、reasoningTokens=32，parseErrors=0；requestedEffort=none，但returnedEffort/max_output_tokens缺失。见responses-direct-truncated-2026-10-04.json。已证明该次上游实际生成思考并耗尽全部预算后截断，不是TapKit根据空正文推测；不能根据回传字段缺失断言服务内部实现。

第二次JSON没有inputShape标记，按输出看仍为脚本对齐前版本，尚不能将它当作TapKit字符串输入的严格对照。已向用户说明准备脚本时的形式差异，并仅请求最后一次已对齐脚本，仍none/32，不增加预算。

最后一次用户回执包含inputShape=message.content.string，HTTP200/SSE/response.failed/status=failed/upstreamCode=overloaded，parseErrors=0，无正文/推理事件，usage全部null。见responses-direct-aligned-overloaded-2026-10-04.json。该同形请求确实到达官方接口，但在上游失败，不能证明同形请求的关闭思考效果、Token需求或成功生成；本轮真实请求已停止，不再要求重试。

本轮可确认：Responses出现真实服务繁忙；另一次对齐前内容数组请求虽指定none，实际32个思考Token耗尽32预算并截断。尚不能完整排除输入形式相关的上游行为差异，也不能宣称TapKit字符串请求的全部根因已经确定。现有代码在本地回归正确识别failed/overloaded与incomplete/max_output_tokens；没有证据支持继续改生产字段、增预算或将模型判为不支持。

继续使用已通过基础probe的Chat/Messages。Responses保留未完成真实验收状态，待上游恢复后再依据本轮证据安排有界同形验证；不得擅自发送平台支持消息、自动监控/定时重试或扩展下一任务。新脚本、回归测试及进度记录尚未再次commit/push，交接提交b8b4d53仍是远程停点。

原Electron只诊断限制和稳定性缺口保持；不为本问题主动复现或修改Electron启动。P01-02 implemented_not_live_verified、P01-gate engineering_passed_external_pending、P00 failed保持，未扩到下一任务。既有交接文档保留为此前停点快照，本轮最新状态以本文件及CURRENT为准。
