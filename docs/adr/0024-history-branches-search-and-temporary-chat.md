# ADR0024：会话历史、分支搜索和临时聊天

- 日期：2026-10-05；状态：采用；任务：P02-03。
- 基线：codex/p02-01 / f7e0156；依赖ADR0023的ChatService、统一run状态和账本。

## 决定

追加0007_chat_history.sql，schemaVersion=7，不改已应用迁移。会话标签采用sessions.tags_json，备注采用note；置顶复用sessions.pinned_at，项目增加pinned_at，sidebar_items只保存组织关系和排序。分组删除清组织关系，不删会话或项目。

编辑问题、重生成和换模型均建立可切换分支。分支复制祖先显示节点并保留source_message_id及原run引用，新的回答拥有独立run、attempt和账本；不复制客户端发送幂等键、native协议状态或执行旧工具。candidate_for_message_id把回答版本关联到原回答。message_versions继续保存单节点的持久化版本；UI通过分支选择回答候选。移动项目只影响新轮次指令和新消息来源；旧消息保持原来源，不自动写项目知识。

共享history契约提供分页会话、组织、元数据、归档、回收站、消息操作、搜索和临时生命周期。修改分支和会话元数据使用expectedRevision；有活动/排队run时拒绝改变上下文。批量移动/归档/删除先验证，再同事务写实体、事件和receipt。

中文搜索使用SQLite FTS5 trigram，三字符以上走FTS，短词要求明确作用域。history_search_documents是可重建搜索投影，普通索引覆盖profile/时间/会话/项目；history_fts使用external content并由投影触发器同步。这个调整来自10万消息全命中查询的实际失败（搜索P95约818—946ms）；保留排序和权限过滤，避免逐个虚拟列读取。正文限user/assistant的final/interrupted，任务检索goal，文件仅名称，记忆全文留后续。查询history最多20条。结果带messageId/branchId/命中范围，定位会分页加载目标分支。

删除进30天回收站，恢复重建索引并根据仍有效的file/version重新建立会话输入关联。永久删除先清Host绑定account/branch的native密文，再fsync独立删除日志并事务清正文、版本、草稿、待发输入、任务目标、工具载荷、回复账本副本、索引和引用；保留数值账本及操作身份。旧备份恢复重放session墓碑，不能重新变成可见会话。该保证是应用内访问与恢复语义，不声称对SSD或用户自行复制的备份做物理擦除。

临时聊天每个窗口最多4个，Host写入可信windowId，其他窗口不可访问。SQLite :memory:、附件bytes、草稿、native协议状态、详细账本和receipt只在内存，不建临时目录；离开/关闭窗口/退出清理，重启无恢复内容。不开历史搜索、记忆、导出、分叉或笔记持久化。并发与普通请求共享；持久库只预留/结算每日预算的汇总数字，没有临时session/run/attempt/body明细。崩溃丢失内存run时把剩余汇总预留保守计入当日额度，避免重启绕过上限。

首次回复自动标题为后台job，每会话最多一次自动job、最多一次模型请求，输出最多30字符，使用原root预算，不执行工具。手动改名或版本变化阻止旧job覆盖，重启把running标failed，不重放。用户显式AI重命名可另建一轮一次请求的job。

单节点删除也先清理会话协议缓存，记录message墓碑；保留后续时用system_note取代原文，并清除该节点的版本、工具载荷和任务索引目标。旧备份恢复重放这些墓碑，显式复制的其他会话继续保留。运行中的标题请求即使被人工改名标记为cancelled，其实际请求结束前仍拒绝永久删除，避免清理后再次落协议状态。全局列表重排只改sort_key，保留分组；组内重排要求全部实体仍属于该组。

## 验证和限制

隔离fixture验证分支、权限、标题竞争/429单次、删除/备份、临时预算与正文边界；1万会话/10万消息性能报告和Electron入口检查见P02-03证据目录。真实渠道、R01/R13/R14及R02—R05状态沿用P01，未授权真人模型请求，不读原用户Key/profile/vault。P00/P01失败门禁保持；不据此开放原生执行或P03解析。
