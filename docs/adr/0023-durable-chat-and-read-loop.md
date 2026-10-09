# ADR0023：持久化聊天、只读循环与隔离界面验收

- 日期：2026-10-05
- 状态：accepted
- 任务：P02-02

## 持久化与接口

SQLite迁移0006把schemaVersion升为6，请求protocolVersion和业务JSON schemaVersion仍为1。复用messages、message_versions、drafts、branches及P01的ModelRouter/UsageLedger；新增tasks/task_versions/runs/pending_inputs/tool_calls/prompt_snippets，不新建同义消息表或第二套run状态。当前任务只建立chat模式；工作工具在P06接入。

messages.send的用户消息、run或pending_input、事件和receipt在同一事务提交后ack。clientMessageId在profile内永久唯一并保存载荷摘要；即使24小时receipt过期，相同载荷也返回原实体，不重复派发，不同载荷返回CONFLICT。UI直到ack才清理对应草稿；未知结果重试保留clientMessageId。每会话/窗口槽位草稿单独CAS，初始revision=1，超发送上限仍允许保存至2,000,000字符。

messages.list当前只读会话活动分支，默认50/最多100条；cursor是已授权该分支的消息UUIDv7，以SQLite插入顺序分页，不接受branchId或其他过滤。返回ChatSnapshot含messages、run、pending、eventSeq、selection及只读工具范围。跨分支组织和统一搜索分页在P02-03实现。

## 确认正文与安全边界

流式正文按50ms/4KiB批次在消息与事件的同一事务持久化。当前message.accepted/delta/final、run.status、task.steered、tool.finished、draft.updated事件只含kind=chat、sessionId及可选messageId/runId/taskVersion；正文与材料不复制进事件/audit。Renderer由eventSeq续接通知后读取快照，活跃run有500ms兜底刷新。已显示正文来自数据库；断线重读不会丢已确认内容。未来共享事件详表中的全文增量是规划DTO，当前实现以本ADR及contracts/chat.ts为准。

立即补充先持久化taskVersion、取消请求和队列，再中止旧请求。派发前与异步I/O后提交都复核会话墓碑、租约owner/epoch/expiry、版本与取消请求。5秒续租/15秒期限；启动将遗留活跃run记partial、正文interrupted，工具未知不重放。停止保留确认正文；失败后后续用户轮能继续。模型切换保留独立interrupted回答，活动上下文不拼接旧提供方片段。

聊天循环受根共享8模型调用/12只读工具/5分钟活跃时间及128,000合计token约束；切换taskVersion不会重置根预算。tokens、账户并发、预留/核销、提供方后备沿用P01，界面只显示账本真实actual/estimated/pending。输入估算采用UTF-8字节数作为保守上界，超过64,000时拒绝而不截断资料。

ReadGateway仅files.read和history.search。文件必须在本轮显式refs中，locator限定读取文本选区；历史仅当前会话活动分支，拒绝模型注入其他session/profile/path。工具参数完整且模型回合闭合以后才执行；半JSON/未闭合提议不派发。全部side_effect=none；无shell、原生推理、任意路径、网页请求或工作写入。

当前托管UTF-8文本附件最多100MiB/20项，可解析内容最多100,000字符；Office/PDF/媒体保留原件且unsupported，须明确移除上下文或仅保存原件继续。文件/消息选区可预览并冻结版本；跨项目资料默认拒绝，项目整体、网页、智能体、插件来源仍不可执行，等待对应阶段。

## 渲染与测试构建

ReactMarkdown禁用HTML；Shiki以React文本节点展示token，使用JavaScript正则引擎，不放宽CSP执行WASM或eval；KaTeX trust=false；流式未完成先显示文本。Mermaid strict、禁用HTML标签与链接指令、SVG白名单消毒后放入sandbox=""静态iframe，CSP禁止脚本、网络和嵌入资源。外链仅用户点击后经Host的http/https/mailto白名单打开；不自动加载外部媒体。

Electron聊天验收需真实Core/SQLite/ModelRouter/UsageLedger，使用只在TAPKIT_TEST_BUILD=1构建中存在的模拟ProviderAdapter。启动还必须TAPKIT_CHAT_FIXTURE=P02-02、隔离资料目录的P02-02.fixture标记、目录内账户全部为synthetic fixture；不读取原用户Key/vault/profile、不请求真人模型。test:e2e选择P02或全套时显式建立测试构建，finally恢复生产构建。生产构建删除fixture入口与chunk；验证生产产物无P02-02 fixture标记。不要与会重建生产产物的测试并发执行。

此隔离验收不替代R01/R13/R14等真实服务门禁，不改变P00/P01 failed状态，不开放P00原生执行。
