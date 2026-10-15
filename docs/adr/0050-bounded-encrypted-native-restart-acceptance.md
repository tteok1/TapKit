# ADR0050 有界加密原生状态重启验收

- 日期：2026-10-13；任务：P01-02，关联P01-03账本。
- 用户授权继续完成开发，真实模型测试由用户本机执行。

现有六阶段CLI只保存内存native；普通ChatService使用标准历史而未传旧native引用。文件存在和普通重启答对口令不能证明磁盘状态实际复用。增加开发专用的`test:live --native-restart`入口，不改变普通聊天、Renderer、IPC、数据库版本或供应商参数。

入口复用正式AuthSecrets/Windows DPAPI与ACL、ProviderService的opaque索引/绑定校验、API adapter，以及ModelService/UsageLedger路由、预算预留和核销。第一进程保存加密状态后完全退出；第二进程从正式解密接口恢复标准前缀，并向正式adapter携旧native引用。adapter期间的成功native.load次数作为实际复用证据，与完成事件及独立进程身份一起核验。

真实入口只允许本仓库`.test-data/P01-02-app-*`内的单账户隔离profile，绑定用户指定智谱普通API/FlashX/Chat；准备阶段只读公开元数据。单账户限制避免正式目录检查读取其他渠道的凭据；无未结算attempt、预算预留或进行中的run/title job才可执行。正式单实例锁要求用户完全退出旧应用。凭据仅由用户启动的正式Host代码读取，Agent不解密Key或native正文。无额外账户迁移、Key输入或配置保存。

同一验收最多两个请求，每次最大输出128，无自动重试/后备、标题或记忆辅助调用；首次失败即停止。沿用现有默认预算及金额未知规则，不提高限额。两次分别写正式账本并共享root预算；不将实际/估算混作供应商费用。报告区分同一隔离应用账本验证与整个P01验收状态。

checkpoint只存ID、绑定摘要、实例身份和阶段，不存正文/Key/原生推理；创建为独占，恢复前消耗saved状态，崩溃、已消费或失败状态不能自动重发。公开报告只有固定状态/错误与网络阶段、成功读取布尔值、版本、usage和结算结果；不透传异常文本、响应、请求头、解密值或native引用。

合成模式只允许带固定标记的全新native fixture profile和fixture.invalid配置；测试代码替换该实例fetcher为内存SSE，真实模式不加载该替身。真实Electron验证DPAPI保存/完全进程重启/adapter读取复用；离线异常覆盖删除、账号撤权、四类绑定不匹配、缺失/篡改文件、标准前缀编辑和重复恢复。全部完成后才交付真人单次入口，live结果保持待验。

## 2026-10-15 干净CI的测试入口准备

完整CI揭示native集成测试依赖本机手工生成的忽略目录runner。测试改为beforeAll从源码构建专用入口；进程启动器缺入口立即失败，不启动Electron等待对话框。移走旧runner保留备份后4项全部通过，未放宽超时/断言或改变真实入口、凭据/DPAPI/原始账本边界。见P01-engineering-2026-10-14/ci-native-fix-2026-10-15.json。
