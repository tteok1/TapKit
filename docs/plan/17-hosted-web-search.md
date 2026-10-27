# P05 托管搜索具体设计

2026-10-27 用户要求先改设计再实施；本设计与 ADR0066 替代 Tavily 选择。P05-01 实现此契约，保持 TapKit 自建 Agent Core，不扩展 P06/MCP。

## 通道与请求

| 当前回答通道 | 隔离搜索方式 | 能力边界 |
| --- | --- | --- |
| Codex 订阅 | pi-ai 0.85.1 onPayload 注入 web_search；固定 Codex responses 路由、现有认证和 SSE | 需真实验证，不因官方 Codex 支持而推定本桥接可用 |
| OpenAI Responses | tools=[{type:web_search}]，include=web_search_call.action.sources，max_tool_calls=1 | 兼容协议不代表具体端点/模型支持 |
| Anthropic Messages | web_search_20250305，max_uses=1；识别 server_tool_use、web_search_tool_result、citations | pause_turn 最多继续一次，原 assistant 块和工具不变，总搜索上限不变 |
| Chat Completions | 不发送搜索请求 | 明确不支持，可切换通道或提供公开 URL |

不再要求独立搜索 Key；删除 Tavily 调用和保存界面。旧加密凭据不读取、不迁移、不入日志；仅保留删除旧凭据兼容入口。当前协议“可尝试托管搜索”不等于账号/模型通过 live。未执行实际搜索时不能把模型文本当搜索结果，也不自动改用其他账号、MCP 或 Tavily。

2026-10-27 兼容修正：首次真实端点返回 model_not_found，锁定 pi-ai 目录不含本机当前 gpt-6.1-sol。依据官方模型页给自有适配层增加该模型的显式元数据（text、context=1050000、maxOutput=128000、low/medium/high；不宣称 off 可用），保留旧模型且不改用户默认选择，不读 Codex 缓存里的提示词。搜索请求选择当前模型支持的最低思考级别；不复制整个 Codex 模型目录或引入新的 Agent。

## Core 隔离与预算

web.search 仍是 Core 客户端工具。调用时使用所属 run 的实际回答账号和模型，由 ModelRouter singleAttempt 建立独立请求，绑定同一 run/rootRun/project/branch，沿用并发、余额、Token 预约及 usage_ledger。只发送本轮用户原问题去掉 URL 后前500字符及会话筛选配置；适配器固定生成搜索指令。禁止历史、记忆、资料、附件、其他工具输出、原生会话和 previous_response_id。适配层再次校验请求形状，不能只依赖模型守约。

不自动重试或跨通道回退。每个 run 最多两次 web.search，每次最多八条候选。Responses max_tool_calls=1，Anthropic 每请求 max_uses=1，续传最多一次（仅允许携带本次隔离搜索自己的服务端块）；总观察到第二次搜索即失败。Codex 仅声明 web_search 并从实际 SSE 检查服务端调用上限，不能承诺远端未暴露动作或续传的精确计费上限。取消、删除账号、会话/版本变化、关闭联网、projectOnly 后禁止新增请求及归档。已发生消费不盲目重试。

规范化 hosted_search 事件携带候选及观察到的搜索次数。服务端 search 与客户端 function_call 分开处理。搜索辅助回答不写聊天或原生状态；原始服务端块/推理仅有界驻留内存。成功和失败均结算已返回用量，未返回时 estimated。搜索 Token 计入本轮用量，工具结果/活动显示调用次数和“可能另计费，金额未知”，不冒充免费或混入 Token 单价。

## 来源、筛选与界面

Responses 解析 web_search_call.action.sources 与 url_citation；Anthropic 解析搜索结果与 web_search_result_location。去重、有界、公网 URL 校验后返回不可信候选。正常终止且存在真实 search 事件时才可报告空候选；只有模型文本时 MODEL_UNSUPPORTED。

域名允许/排除在候选与 web.read 阶段强制执行；厂商支持时也映射请求侧约束。最近天数、语言和地区为检索偏好，由固定提示传递真实当前/起始日期；界面说明厂商不能保证硬过滤。不得静默声称强过滤成功。

候选须经 web.read、固定 Blob 快照及 sourceId/contentHash/fetchedAt/locator 才能用于已核验引用。保留 ADR0064 的匿名浏览器、SSRF、登录/验证码/下载拒绝、恶意指令隔离、断网快照和来源支持校验。来源面板、存项目和五格式导出继续复用。

off/on/auto、项目“仅依据资料”优先级不变。设置移除 Key 表单，显示跟随当前模型、当前通道能力、隔离说明、筛选偏好局限和额外费用说明。R06 改为托管搜索通道兼容性，不再索要 Tavily 账号。各账号/模型 live 单独登记。

## 验收与授权

1. 捕获三个适配路径的真实序列化请求，证明无私密 canary、历史、客户端工具或原生状态；Chat 协议零网络拒绝。
2. Responses/Codex sources/引用、Anthropic 服务端块/引用/pause_turn 续传/累计用量；无搜索文本、超额、错误、缺终止、重复/非法来源异常覆盖。
3. Core 同账号单次账本、取消/关闭/版本变化后不归档；域名过滤、读取/归档、恶意页面、断网引用、导出回归。
4. check、相关 unit/integration、P05-01 Electron 和受影响聊天回归、生产构建。2026-10-27 用户明确允许最多两次现有 Codex 订阅隔离搜索，只发公开问题，不附带历史/文件/记忆；用于搜索→读三页→引用验证。其他完整 live 暂缓不扩大。
5. 未能完成的真实链路记录实际错误，不能用 fixture 替代。同步原规格、进度、requirements、资源与 gate。旧开发包保留原快照，新代码不沿用旧包 hash 宣称通过。

## 参考

- [AelionBot hosted-tools，固定参考提交](https://github.com/FoyonaCZY/AelionBot/blob/7a41f23190288f1b9aa8c6ddd2ffc5ee31a4e791/electron/core/tools/hosted-tools.ts)：按协议注入搜索的参考。
- [OpenAI Responses web search](https://developers.openai.com/api/docs/guides/tools-web-search)：工具、来源、引用，不证明订阅桥接兼容。
- [Claude web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)及[server tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools)：服务端块和 pause_turn。

- [gpt-6.1-sol官方模型元数据](https://developers.openai.com/api/docs/models/gpt-6.1-sol)：当前桥接补充模型的上下文、输出及思考范围；API单价仅供pi内部结构，不替代订阅账单或搜索费用。

## 开发包与既有资料交接

改造完成后生成新目录包并在新路径重验隔离；旧包保留。通用启动默认AppData，本机外置Start-TapKit-original-data入口显式绑定已确认的原资料目录并从release/latest.json选新包，不扫描/复制/迁移用户数据，不包含账号或密钥。CheckOnly只验证既有DB和包入口，不启动、不发模型请求；使用前需用户正常退出占用同一资料的旧实例。
