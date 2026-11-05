# ADR0077：显式只读委派与同根协调

- 日期：2026-11-05
- 状态：已实施并验收；范围与证据见docs/progress/P08-03.md

P08-03复用WorkRepository、WorkService、RunStatus、ModelRouter、UsageLedger和WorkToolGateway。schema21为runs追加parent_run_id及索引，只放开同会话的显式子run；每会话一个活跃根run的唯一约束保持。旧会话、run、来源与事件不重建。

通过现有workCommand提供task.delegate、subtasks.list（单项分页）、subtasks.control。固定DelegateSpec包含goal/inputs/forbidden/allowedTools/outputContract/acceptance/budget/deadline/parentTaskVersion和依赖；只接受主任务明确refs的子集，内置researcher/reviewer，无角色市场、递归委派、任意代码或文件写入。只读source.read和task.result经过同一网关记入tool_calls/tool_call_attempts；不新增AppContainer能力。

子run共用root_run_id和实际全局/credential模型槽，不额外claim根槽。深度1、最多2并发、12分支，每次子run最多1次实际模型尝试（singleAttempt，禁止后备重试）；重试创建新run且旧调用/用量不清零。每次请求按同根token预算预留核销；子预算先限制输入估算与输出预留，根预算再约束总量。父等待子任务的时间也计入根活跃时间，采取保守限制，不增额度。

模型只收到委派目标/禁止项/反馈和分配资料，无完整父历史、账户凭据或原生推理。模型选择Core生成的证据编号，Core回填原文位置；保存结果前与父汇总前分别重新授权读取固定资料、核对hash与逐字片段。conclusion/actions属于不可信子报告；actions仅建议，不派发、不改父目标/设置/记忆。来源定位核验不代表结论真实性或外部独立性。

暂停/继续/失败重试/补充要求单独操作子任务。父取消向下传播，父版本变化取消旧子run，晚到结果不能发布。修改正在运行父任务中的子任务先暂停父执行，旧汇总失效；父已终结时重试/反馈创建新的父版本，保留历史，同根预算不变，已成功兄弟分支在重新授权核验后复用。依赖失败的分支取消，无依赖的成功分支仍可交付，根状态为partial。崩溃后的子run恢复为paused，须显式继续/重试；只读中断不冒充未知写入成功。

默认单Agent，显式委派可用。10例×3次同预算单/多路径评测记录固定资料、运行耗时、调用/工具计数、逐字支持与失败披露；合成响应及未知真实费用不能证明生产质量或费用倍率，因此不自动开启。真实模型另做当前已配置智谱的应用内检测与正式工作闭环，本任务检测额度10次，历史额度不重置或混用。最终范围和缺口必须写入P08 gate。

2026-11-05验收改造：显式“仅汇总子任务”只支持单份普通Markdown，由Core重新核验来源后生成结论/逐字依据/不确定性/失败缺口清单，不追加主模型请求；完整记录仍按子run查看，不把该清单冒充新增推断。未选此模式时，普通无模板Markdown只声明artifact.write/user.ask来汇总已核验材料，其他文档/研究工作流保持。UsageLedger在每次真实模型尝试（包括自动重试/后备）原子读取并收紧Work定义的根调用/token/活跃上限，不能因子run或重试刷新。task.result通过智谱既有固定别名表映射task_result，返还canonical并继续全schema验证；原失败回执不回写。subtasks.source仅返回已存引文对应的固定资料片段并再次鉴权/hash核验。
