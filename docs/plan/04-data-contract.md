# 数据模型与事务契约

当前增量 schema9：[ADR0039](../adr/0039-file-original-only-and-generated-notes.md)只修复旧 generated/note 的空 input 固定引用到原始 version1及缺失版本元数据，其他非法/删除引用不回退。新生成笔记正文索引和固定引用在 receipt 事务内提交，预览 pending。needsOcr 的 PDF 版本 unsupported/OCR_REQUIRED；结构保留，空正文不标已读。[ADR0040](../adr/0040-individual-file-cancellation.md)复用逐项 receipt 与已有 jobs.cancel，按 token/版本取消，不增加同义状态或表。

[ADR0038](../adr/0038-scoped-library-pinned-versions.md)：files.get/list在project/session范围默认取固定版本，格式/状态/大小/正文查询一致；库范围仍取current。显式历史版本再鉴权，错误/无版本引用不回退新版；详情复制传versionId，元数据变更后重新读取范围视图。目录folderId按owner投影：外部/删除目录显示在接收范围根目录，会话统一根目录；共享物理父目录不因引用改变，显式外部目录仍拒绝。schema8及DTO不变。

[ADR0037](../adr/0037-chat-physical-import-host-tokens.md)：selectChatFiles仅由preload验证真实File并区分物理选择token与无路径索引；物理聊天复用files.import/current session固定引用，Host拒绝不回退字节。部分失败/取消保留成功引用，晚到结果CAS追加原会话；粘贴兼容保留，不改变schema8或native门禁。

[ADR0036](../adr/0036-chat-material-from-pinned-parsed-version.md)：聊天/files.read消费固定版本的已解析结构块，项目引用在I/O前后检查；默认引用列表使用授权的固定版本，不随库中当前版本漂移。仅旧文本保留UTF-8兼容，不把缺失二进制结构当原件文本成功；物理聊天导入统一与原生验收仍待收口。

[ADR0035](../adr/0035-file-task-usage-projection.md)：files.usage从已接受run的用户消息固定附件和task_versions投影任务使用记录；逐表profile/删除/版本归属过滤，最近100条及截断提示，使用实际执行状态。当前引用与排队输入不算任务记录；FileOwner写入范围保持library/session/project，不增加P06任务状态。

[ADR0034](../adr/0034-parser-staging-lease-cleanup.md)：Core生成租约标记，后台有界清理本profile的过时解析暂存；活动租约、未知标记和链接目录保留。删除前重验身份/路径/标记/租约；原件blob不受影响，维护退出后不访问关闭的Store。此合成进程验收不代替P03真实AppContainer验收。

[ADR0033](../adr/0033-interrupted-import-recovery.md)：复用request_receipts的批次开始检查点及逐项收据重建interrupted视图。旧请求不重新消费源授权；未完成项须新选择/新请求。最多100个检查点，稳定隐藏标记不删除原件或幂等记录。真实导入进程终止+SQLite重开及Electron提示/隐藏跨重启已验；parser暂存与native仍待验。

[ADR0032](../adr/0032-file-library-commands-and-batch-impact.md)：files.list时间范围绑定分页；files.importInfo返回锁定limits和可用空间，releaseSelection仅释放本窗口选择；files.impact全量验证所选ID/owner并返回删除影响元数据。回收站版本/使用元数据显式trash，下载仍禁止删除状态；界面按项呈现批量完成/失败/取消，不伪造整批成功。真实Electron文件库四项已通过，原生解析/R15仍待收口。

[ADR0031](../adr/0031-private-original-download.md)：saveOriginal只传文件/版本/owner ID，由Host保存框发私有files.export路径授权；Core前后核验资源及独占写入，既有目标不覆盖，失败输出仅按自身身份清理。五项合成integration通过，Electron/UI未验。

[ADR0030](../adr/0030-host-file-selection-and-import-receipts.md)：Host私有files.select生成窗口绑定只读token；fileCommand有限开放文件/目录命令及批次importStatus/cancelImport。导入按项提交收据与解析job；原件成功和内容读取分别呈现。真实native/库UI/E2E仍待收口。

### 2026-10-06 P03-01实施中

[ADR0029](../adr/0029-file-cache-and-storage-footprint.md)：仓库按profile去重计原件/衍生/备份独占blob；清预览批次先全量验证，保留原件/结构/FTS。结构读取在I/O前后检查owner/固定版本，当前版替换拒绝陈旧结果；FileService/UI尚未接入。

[ADR0028](../adr/0028-pdf-text-worker-assets.md)：锁定PDF.js6.3.289 API/worker/CMap/标准字体随bundle打包，Core按清单摘要验证并仅为PDF暂存；在固定AppContainer内读取文本和规范化页坐标，不渲染/执行动作/XFA/系统字体/联网。真实加密合成PDF已用正确公开测试密码交叉读取；501页/坏文件/加密拒绝及原件不变通过便携测试。新PDF原生验收仍待CI，Host/UI/image待实现。

[ADR0027](../adr/0027-read-only-ooxml-structure.md)：固定受限Node新增有界只读OOXML结构；DOCX段落/标题/表格、XLSX公式与缓存、PPTX顺序/备注保留定位。复用锁定FXP/yauzl；外部关系不读取、实体/宏/超限拒绝。已建真实P03 native和独立标准用户验收，但本机未运行，等待新CI；PDF/image及Host/UI仍待实现。

[ADR0026](../adr/0026-isolated-file-parser.md)：解析输入固定original字节及Core生成的IngestInputSchema版本/hash/名称，输出仅为有界ParsedDocumentSchema JSON；ParserVersion共享为p03-1，原因限定FileParseReasonSchema。受限解析成功后仍按ADR0025有效租约事务提交结构blob及版本索引；便携/模拟测试不计原生验收。

[ADR0025](../adr/0025-file-versions-and-ingest-jobs.md)：追加0008/schema8，复用files/file_versions/blob/resource_links/jobs，新增folder/parsed_document及文件库FTS；不可变版本/明确替换目标，file.parse按版本及parserVersion去重。Host选择token为公共入口，不接受路径/其他profile。当前契约和迁移已实现，业务handler/UI/解析与原生依赖验收尚未完成。

> P02-03当前实现（2026-10-05，ADR0024）：追加0007/schemaVersion=7，复用sessions/messages/branches/run。会话tags_json/note/title_manual、项目instructions/pinned_at、branch.candidate_for_message_id、message.source_message_id及receipt.owner_session_id为增量字段；sidebar_sections/items、message_marks、search_history、title_jobs见实际迁移。历史统一用history_search_documents普通投影与external-content history_fts，不另建message_fts或tags/feedback/trash同义表。回收站复用deleted_at，session/message墓碑及独立删除日志阻止旧备份恢复已删正文；保留后续的消息变为system_note。临时内容仅内存，持久库仅累计每日用量数字。决定与边界见[ADR0024](../adr/0024-history-branches-search-and-temporary-chat.md)。

> P02-02当前实现（2026-10-05）：迁移0006/schemaVersion=6，messages新增client_message_id与版本化chat_json，新增通用tasks/task_versions/runs/pending_inputs/tool_calls和prompt_snippets；复用既有消息/草稿表及用量账本。只落本阶段chat字段，后续领域字段由对应迁移补齐；事务、恢复及原件边界见[ADR0023](../adr/0023-durable-chat-and-read-loop.md)。

> P01-01迁移0002新增opaque_states/model_catalog，SQLite版本升级为2，v1备份仍可恢复后升级。文档schemaVersion/IPC协议仍为1。参见[ADR0009](../adr/0009-codex-oauth-and-native-state.md)。

本文件是所有任务共同的数据约定。实现用SQL迁移与显式repository；不要由UI存储另一份业务真相。下列每行都要求实现对应字段；JSON字段必须有contracts中的Zod版本，不接受无界对象。

## 1. 通用类型

- ID：应用生成UUIDv7字符串；供应商/工具自己的ID单独保存。UTC时间使用INTEGER毫秒。
- 除显式说明外，业务对象有 id、profile_id、created_at、updated_at、revision INTEGER默认1、deleted_at可空。profile_id由Core注入，模型和Renderer不得选择其他profile。
- BOOL用INTEGER CHECK IN(0,1)；JSON文本写入前校验，schema_version必有；金额Decimal用字符串，计费原始量INTEGER，不用浮点累计货币。
- root_id、project_id可空的查询必须明确全局语义，NULL不能自动匹配所有项目。所有文件读取/搜索/导出再查当前资源授权。
- FK默认RESTRICT，关联表CASCADE；软删除业务对象不自动删物理blob。外部引用删除由清理服务结算。

## 2. 表定义

| 表 | 核心字段/外键/唯一键 |
|---|---|
| profiles | display_name、avatar_file_id?、locale、timezone；本版只创建local profile |
| settings | profile_id、scope_type(profile/project/session)、scope_id、key、value_json；UNIQUE(scope_type,scope_id,key) |
| provider_accounts | provider_id、label、auth_type、credential_id、status(unconfigured/ready/expired/unavailable)、last_check_at、last_error_code、priority；无明文密钥 |
| model_catalog | provider_id、model_id、catalog_version、capabilities_json、price_json?、verification(documented/probed/failed)、verified_at；UNIQUE(provider_id,model_id,catalog_version) |
| projects | name、icon、color、description、instructions、allow_global_memory、allow_global_history、allow_global_instructions、default_model_ref?、archived_at? |
| folders | owner_kind(file/project)、owner_id、parent_id?、name、sort_key；拒绝环 |
| sessions | project_id?、title、mode(chat/work)、active_branch_id、temporary(持久库恒0)、settings_json、archived_at?、last_activity_at、unread_event_seq |
| branches | session_id、parent_branch_id?、fork_message_id?、head_message_id?、label |
| messages | session_id、branch_id、parent_message_id?、role(user/assistant/tool/system_note)、content_json、status(queued/streaming/final/interrupted/failed/cancelled)、provider_attempt_id?、run_id? |
| message_versions | message_id、version INTEGER、content_json、reason(edit/regenerate/restore)、source_version_id?；UNIQUE(message_id,version) |
| drafts | session_id、window_id、text、attachment_refs_json、revision；不同窗口冲突保留副本，不无声覆盖 |
| pending_inputs | session_id、client_request_id、kind(steer/followup)、text、refs_json、status、target_task_version?；UNIQUE(profile_id,client_request_id) |
| tags / entity_tags | tag(name,color)；关联entity_type、entity_id、tag_id唯一 |
| sidebar_sections | name、collapsed、sort_key |
| sidebar_items | section_id、entity_type(session/project)、entity_id、sort_key、pinned；实体在自定义组中至多一处，项目归属与分组互不混同 |
| tasks | session_id、parent_task_id?、root_task_id、goal、acceptance_json、mode、current_version、acceptance_status(unreviewed/accepted/changes_requested)、archived_at? |
| task_versions | task_id、version、goal、constraints_json、source_event_id、plan_json；UNIQUE(task_id,version) |
| runs | task_id、task_version、root_run_id、status、status_reason?、lease_owner?、lease_epoch、lease_expires_at?、cancel_requested_at?、pause_requested_at?、checkpoint_id?、budget_id、started_at?、ended_at? |
| plan_steps | run_id、step_key、title、dependencies_json、status、input_refs_json、output_refs_json、acceptance_json、optional BOOL、assigned_subtask_id?；UNIQUE(run_id,step_key) |
| events | profile_id、stream_id、seq、event_type、schema_version、task_version?、run_id?、causation_id?、payload_json?、payload_blob_id?、created_at；UNIQUE(stream_id,seq)，无updated_at |
| outbox | event_id UNIQUE、topic、payload_ref、state(pending/delivering/done)、attempts、next_attempt_at、lease_until?；与对应状态变更同事务写入 |
| jobs | kind、entity_id、dedupe_key UNIQUE、payload_json、status、attempts、next_attempt_at、lease_owner?、lease_epoch、lease_expires_at?；用于解析/索引/提取，不是用户定时任务 |
| provider_attempts | run_id、logical_call_id、attempt_no、provider_account_id、model_ref、request_fingerprint、native_state_ref?、status、error_code?、upstream_request_id?、usage_json、reserved_tokens、is_active_answer BOOL；UNIQUE(logical_call_id,attempt_no) |
| context_snapshots | run_id、logical_call_id、model_ref、prompt_version、tool_catalog_version、checkpoint_id?、ordered_refs_json、token_estimate_json、native_state_ref?；引用不作为内容权限绕过 |
| checkpoints | task_id、task_version、run_id、event_seq_from、event_seq_to、schema_version、state_json、validation_json；有来源范围，失败不能覆盖旧有效项 |
| opaque_states | account_id、model_ref、adapter_version、branch_id、cipher_blob_ref、expires_at?、content_hash；DPAPI加密，包括协议所需推理数据，不给UI/检索 |
| tool_calls | run_id、task_version、call_id、tool_name、tool_version、args_json、args_hash、resource_hash、idempotency_key、approval_id?、status(proposed/approved/dispatched/pending/succeeded/partial/failed/unknown/cancelled)、side_effect、result_ref?；UNIQUE(profile_id,idempotency_key) |
| tool_call_attempts | tool_call_id、attempt_no、started_at、ended_at?、external_handle?、error_json?；UNIQUE(tool_call_id,attempt_no) |
| grants | scope_kind(once/session/persistent)、scope_id、tool_names_json、resource_rules_json、action_classes_json、expires_at?、revoked_at?、revision |
| approvals | tool_call_id、task_version、args_hash、resource_hash、content_version_hash、decision(pending/approved/rejected/expired/revoked)、expires_at、decided_at?；审批内容变更生成新记录 |
| budgets | owner_kind(root/daily)、owner_id、limits_json、reserved_tokens、used_tokens、active_ms、money_by_currency_json、revision；每个账户日期每日计数归UTC事件再按profile时区建日边界 |
| usage_ledger | provider_attempt_id UNIQUE、root_run_id、account_id、input_tokens?、cached_input_tokens?、output_tokens?、reasoning_tokens?、source(actual/estimated)、price_version?、currency?、amount?；禁止缓存/推理双计 |
| files | display_name、extension、mime、kind(input/artifact/note)、folder_id?、current_version_id、status、source_type(import/generated/url)、source_uri?、original_path_display? |
| file_versions | file_id、version、blob_id、size_bytes、sha256、parser_version?、parse_status、preview_status、created_by_run_id?；UNIQUE(file_id,version) |
| blobs | sha256 UNIQUE、relative_key、size_bytes、reference_count、state(staged/ready/deleting)、media_type |
| resource_links | resource_type(file/memory/web_source)、resource_id、owner_type(session/project/task)、owner_id、role(input/output/source)、pinned_version_id?；UNIQUE完整关联键 |
| parsed_documents | file_version_id UNIQUE、parser_version、structure_blob_id、page_count?、quality_json、index_version、status |
| chunks | document_id、file_version_id、ordinal、parent_chunk_id?、text、locator_json、text_hash、index_version；UNIQUE(document_id,index_version,ordinal) |
| embeddings | chunk_id、model_revision、dims、vector_blob、norm、status；UNIQUE(chunk_id,model_revision)，必须与当前index版本一致 |
| memories | subject、predicate、value_json、scope_type(profile/project)、scope_id、explicit BOOL、confidence、status(active/superseded/deleted)、valid_from、expires_at?、source_ids_json、content_hash |
| memory_versions | memory_id、version、value_json、source_ids_json、reason、actor(user/model)；UNIQUE(memory_id,version) |
| memory_tombstones | scope_type、scope_id、subject、predicate、deleted_before_event_seq、content_hash?；后台候选不得越过墓碑 |
| memory_candidates | job_id、scope、source_ids_json、candidate_json、decision(written/skipped/conflict)、reason；不要求用户批准队列 |
| citations | message_id、file_version_id?、web_source_id?、chunk_id?、locator_json、quote_hash、claim_range_json、verified BOOL |
| web_sources | url、canonical_url、title、fetched_at、http_status、snapshot_blob_id、content_hash、access_type(public)、run_id、source_revision |
| browser_sessions / tabs | browser_session(run_id,partition_id,state)；tab(session_id,url,title,navigation_epoch,last_snapshot_id?)；不持久化网站凭据 |
| browser_snapshots | tab_id、navigation_epoch、snapshot_seq、dom_blob_ref、observed_at；节点句柄只对该epoch/snapshot有效 |
| code_projects | project_id UNIQUE、canonical_root、managed_repo_path?、grant_id、git_state_json、runtime_profile、default_branch_ref? |
| worktrees | run_id、code_project_id、canonical_path、branch、base_commit、state、initial_dirty_snapshot_ref? |
| code_changes | run_id、path、base_hash、new_hash、patch_blob_id、status(proposed/applied/reverted/conflict)、feedback_json |
| process_handles | run_id、tool_call_id、helper_instance_id、pid、job_id、started_at、state、stdout_ref?、exit_code?；PID不单独当身份 |
| exports | source_kind、source_id、snapshot_version、format、options_json、file_id?、state、error_code? |
| notifications | source_event_id、kind、title、body_summary、target_json、read_at?、dedupe_key UNIQUE；通知正文不复制敏感全文 |
| trash | entity_type、entity_id、deleted_at、purge_after、related_cleanup_json、restore_state_json |
| backups | id、manifest_path、state、created_at、schema_version、deleted_resource_ids_json；恢复后必须应用删除墓碑 |
| feedback | entity_type、entity_id、rating?、text、diagnostic_consent BOOL；只保存本地 |
| request_receipts | profile_id、request_id、command、payload_hash、state(pending/completed/unknown)、reply_json?、expires_at；UNIQUE(profile_id,request_id)，相同ID不同payload返回CONFLICT |
| pdf_annotations | file_version_id、locator_json、selected_text_hash、body、color；只保存本地批注，不改原PDF |
| prompt_snippets | title、body、shortcut?、sort_key；仅个人文本片段，不含工具/可执行代码或Skills目录 |
| search_history | query、scope_json、last_used_at；最多最近20条，无正文；支持单条/全部清除 |
| message_marks | message_id、kind(bookmark/note)、note_file_id?；UNIQUE(message_id,kind) |

FTS虚表单独建立 message_fts、chunk_fts、memory_fts，contentless或external-content模式必须同步维护删除。三字符以上查询使用trigram；一/二字符在已经限制profile/project的集合中参数化instr匹配。空查询不扫描全部正文。

## 3. 索引与约束

必须建：sessions(profile_id,project_id,archived_at,last_activity_at DESC,id)；messages(session_id,branch_id,created_at,id)；runs(status,lease_expires_at)；events(stream_id,seq)；jobs(status,next_attempt_at)；chunks(file_version_id,index_version)；resource_links(owner_type,owner_id,resource_type)；memories(scope_type,scope_id,status,subject,predicate)；tool_calls(run_id,status)。

同一任务当前版本通过CAS更新 tasks.current_version，不能以updated_at猜顺序。memories对active状态的(scope_type,scope_id,subject,predicate)建部分唯一索引。根预算扣账使用事务条件UPDATE，affectedRows=0即额度竞争失败。

## 4. 必须保持的事务边界

1. 接受发送：幂等请求记录 + user message + task/run或队列输入 + event + outbox，同一事务；事务完成才向UI ack。
2. 派发工具：grant及approval复核 + tool_call意图 + root预算预留 + dispatch事件同一事务；提交之后才调用外部世界。
3. 工具返回：验证lease_epoch/task_version + 存result + tool状态/side_effect + event/outbox同一事务；旧回调只归档，不推进最新任务。
4. 模型结束：消息版本 + 真实usage结算 + native_state引用 + event；外部请求重复计费如存在也真实入账，不用逻辑call去重抹掉费用。
5. 导入文件：先写.tmp并计算hash→fsync→同盘原子rename为blob→DB登记；DB失败允许GC清无引用blob，不能先写DB“已完成”再补文件。
6. 删除：立即隐藏并撤销访问 + 墓碑 + 清理job；后台清索引/缓存/blob/备份。恢复：权限重新计算，不能复活撤销授权和过期审批。

副作用跨外部系统不保证exactly-once：采用先记意图、稳定幂等键、查询核对。不能查询且结果不明时保留unknown给用户核对。

## 5. 迁移与恢复

P01-02新增0003_api_providers.sql（2026-10-04），schemaVersion=3：provider_accounts扩展openai-compatible/anthropic-compatible及api_format/base_url/model_id，无明文Key。重建前备份，事务内保留既有账户、删除墓碑及opaque FK，完整性检查后恢复外键执行；旧API账户按原四渠道预设补配置。备份及恢复支持v1/v2/v3，未来版本拒绝，见ADR0014。

迁移文件按0001_core.sql等编号，只追加，不修改已发布迁移；启动锁保证单进程迁移。先用SQLite backup API备份，事务内迁移并执行foreign_key_check/integrity_check，失败回滚。应用版本降级时发现schema高于支持版本，进入只读导出/恢复提示，不强行打开写库。

普通备份包含DB一致快照和blob哈希清单，不含credentials/opaque明文，不拷贝WAL组合冒充快照。数据库损坏时保留原件，恢复最近完整备份；无备份只能进入诊断/导出文件模式。禁止清空数据库后称为恢复。

## 6. 消息分支与文件版本语义

已发送问题编辑、重生成、换模型重答：创建分支或message_version，旧分支保留可切换。branch head只在事务中移动；工具副作用账本属于原run，不因切换/删除分支回滚现实动作。

引用默认锁file_version_id，新增版本不改变旧回答证据。用户“更新资料”切新current_version并使新索引就绪后原子换代；旧版本仅供历史引用，检索默认不召回。删除原件与移除关联是两个不同命令。


> 2026-10-04 P01-03：P01-03 schema4：迁移0004_usage.sql复用budgets，新增provider_attempts、usage_ledger、provider_route_state；settings复用modelPreferences键。总token仅inputTotal+outputTotal，缓存/推理子集不额外累加；running恢复unknown并按预留结算。具体字段与事务见迁移及ADR0015。
