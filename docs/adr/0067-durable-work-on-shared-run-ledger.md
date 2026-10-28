# ADR0067：工作任务复用持久run与工具账本

日期：2026-10-27；更新：2026-10-28；状态：已实施。

P06在已发布schema16之后追加0017_work.sql，扩展原tasks.mode，保留全部task/run/message/预算ID；不使用任务详规中历史占位编号0006。plan_steps、tool_call_attempts、notifications按共享契约新增。ChatService恢复与排队只处理chat，WorkService复用同ModelService.router/UsageLedger/claimRoot。

工作定义固定目标、受众/格式/数量/语言、资料、验收、期限/预算；简单任务确定性单步，用户可调整有向无环计划。终结run不可原地恢复；steer先写taskVersion事件并中止旧派发，新版本新run；迟到工具结果只归档。所有结果提交绑定epoch/version，暂停/等待不计活跃时间。重试和steer继承root累计活跃时间、供应商尝试、工具次数和token预算；ModelRouter内部重试也必须先过同一上限。用户问题不计为成果修复轮，修复最多两轮。

P06先开放应用内MD/TXT/JSON/CSV安全产物及对已授权托管工作副本的具体patch；原件不覆盖。Python/Office复用原AppContainer门禁，只提供固定CSV统计和Office转PDF；未验证能力拒绝执行，任意exec留P09。审批预览绑定完整规范参数、资源/内容hash、taskVersion、实际模型选择、工具版本、TTL与grant；过期须生成新预览并再次决定。意图先落库，成果与receipt同事务；未知副作用只核对不重放。

FileOwner.task保留profile/task/session/run来源校验，仅用于同任务生成的历史固定版本，不能接收原件或其他任务产物。schema17重建tasks后恢复原历史搜索触发器，旧数据和搜索行为均需回归。永久清理擦除Work定义/计划/审批/回执并移除task资源链接，通知改为已删除说明。

2026-10-28限定智谱P06联调发现：原Chat协议适配器仅映射旧只读工具，P06五个带点的规范名在发HTTP前被拒绝。为artifact.write/workspace.patch/python.analyze/office.convert/user.ask追加稳定下划线wire别名；Core、审批hash、工具账本和回传仍使用规范名，保留碰撞/未知工具/完整参数校验。只扩大已注册P06工具映射，不修改其他供应商协议。

通知消费者持久化profile事件游标，dedupe_key合并短时重复状态，桌面提醒先持久认领，重启不补弹。窗口关闭隐藏到托盘，先清理窗口临时/导出授权并重新加载页面；显式退出安全停机，睡眠停止派发、唤醒核对恢复。无云端执行、开机自启或服务安装。固定工具和本机fixture验证不替代R01—R05/R13/R14真实模型工作链路。最终验收记录在各P06任务及gate。
