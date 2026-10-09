# ADR 0015：模型偏好、原子预算与有限后备

2026-10-04，P01-03，accepted。前置交付715d55a，依赖/锁文件不变。

用户授权完成P01-02本地commit后执行P01-03。沿用SQLite、Core、ProviderAdapter、UUIDv7与outbox，不引入服务器、第二套run状态或工具执行器。

## 接口与目录

目录从已接入账户及实际适配器派生，accountId+modelId唯一。账户未检测/凭据缺失不能派发；工具能力只使用已有文档或成功probe。Codex思考强度来自锁定pi模型reasoning字段，API仅已有DeepSeek格式提供强度，其余unknown/off。文本外输入、parallel工具与严格JSON尚未验证，预检解释不支持，保留原输入并提供替代模型/格式入口。选择不额外调用昂贵模型。

默认、会话、本次按逐层优先级解析；会话必须属于当前profile，本次不写默认。favorites与后备顺序是账户绑定偏好。运行上限与默认偏好进入defaults.json，Zod校验；旧SettingsDocument仍只保存values。模型偏好复用settings的modelPreferences键与CAS/receipt/outbox。窄范围不能提高profile预算。

首页“模型与用量”的固定诊断仅发送简短文本，无renderer自定义prompt、工具或opaque输入。IPC白名单为models.catalog/preferences.get/preferences.set/preview/diagnostic/cancel与usage.list；幂等logicalCallId，未知恢复不重发。会话偏好使用真实既有会话，正式聊天留给P02。

## 数据与预算

schema4迁移0004_usage.sql新增provider_attempts、usage_ledger、provider_route_state，复用budgets。未来run/project/branch ID沿用已有预留域。旧schema1—3备份/迁移/恢复保留；未来schema5拒绝打开。

dispatch前在一个SQLite事务预留root+profile时区daily的输入估算+输出及已知金额。输入以UTF-8字节加保守装配开销估算，64K输入/8K输出硬界限；未知上下文不伪装已知。模型全局/credential并发受既有设置限制，后台保留一个前台槽；唯一UI调用入口的根并发受maxConcurrentRoots限制。聊天8次/128K/5分钟，工作40次/600K/30分钟；工具执行计数由未来Core工具账本负责，路由层不执行工具。

完成、失败、取消恰好核销一次。实际inputTotal+outputTotal是总账，cached/reasoning仅subset；缺任一总量至少扣预留，不把未知当零。公开文本增量checkpoint；启动将running记unknown并按预留收费，保存已生成正文，不自动重发。活跃时间只计派发之后；daily限制token和金额，不限制全日活跃分钟。

prices.json首版没有核验计价，展示未知。金额限额仅允许完整、30天内核验、同币种、输入各缓存档一致的flat价格；整数micros向上取整，失败未知用量扣预留/已知下限较大值。差异缓存档或缺缓存创建价格不称为完整，金额设置拒绝；Token硬限额可用。不换汇、不提供充值、钱包或应用收费。价格能力用明确fixture验证，未声称真实价格已核验。

## 后备与工具证据

最多5个不同账户：显式模型、订阅、可调整API顺序。付费后备先在设置启用接受供应商费用；仅此模型、账户允许集合、能力和预算不能被后备扩大。quota/auth禁用直至重新检测；请求时账户revision保护防止旧失败覆盖新成功。

401在正文开始前刷新一次；网络/5xx/普通429仅在正文未开始时重试两次（1s/3s+jitter或Retry-After），超过30s停止，不换账户绕过。403、安全/校验/未知副作用/预算错误不切换。注销取消已使用该账户的检测；取消也核销。

旧中断正文与新回答分attempt，成功唯一activeAnswer；provider.switched与outbox同事务。切换前等待调用方工具账本结算，要求真实闭合call/result，审批/执行账本仍归Core。跨模型将工具对转为标明低信任的已完成历史证据，保留callId/参数/结果，剔除opaque，不伪造新供应商调用。只在完整finish后交付tool_end，不执行/重做副作用；未来执行器仍须原审批和幂等账本。

## 验收边界

P01-03 unit/integration、真实Electron页面/编译Core quota→API fixture及相关P00-02/P01-01/P01-02回归。真实账号不故意耗尽；R02-R05/R13/R14、R01完整live pending。P00-gate failed保持，不启用执行能力，不自动进入P02。命令、退出码、源码指纹与截图见docs/evidence/P01-03/results.json及任务交接。
