# IPC、事件、任务状态与接口协议

P03-02补充：Host copyText只写入严格字符串（≤100,000字符），每次核验受信Sender，不提供读取剪贴板接口且不开放浏览器权限。artifacts.sheet另返回columnTypes（empty/text/number/boolean/mixed），从原结构缓存值推断，不执行公式；grid读取后记忆原始坐标。

2026-10-10 P03-02：[ADR0042](../adr/0042-fixed-version-preview-and-pdf-annotations.md)追加artifacts.open/cancel/reading/blocks/sheet/diff/locate/selection与annotations.list/upsert/delete的严格DTO，实际定义见packages/contracts/src/artifacts.ts。Host/Core私有artifacts.read仅供窗口资产协议，不进入公共命令白名单；公共预览不接受路径。blocks/diff返回最多100项及offset/total，sheet最多100行、200列，跨页合并anchor另最多200项。Core ready.schemaVersion升级10，ResourceRef.file增加可选selection（selectedTextHash/textRange），selection必须有Locator，正文hash必须由Core固定版本读取验证。Host openArtifactExternal只接受严格固定版本access并用既有私有files.export生成自身副本；无任意路径参数。下方schema9为历史。

2026-10-09 P03-01 当前 Core ready.schemaVersion=9（ADR0039）。files.cancelImport 的 DTO 为 {importRequestId, selectionToken?}，token 必须属于当前窗口批次；未指定仍取消整批。files.cancelParse 的 DTO 仅 {fileVersionId}，只取消本 profile 对应版本的 file.parse jobs（ADR0040）。文件版本的 errorReason 可为 OCR_REQUIRED，表示本版无法读取需 OCR 的正文；下载原件保持可用。其余严格 DTO/窗口、版本和路径边界不变。

[ADR0031](../adr/0031-private-original-download.md)：saveOriginal只传文件/版本/owner ID，由Host保存框发私有files.export路径授权；Core前后核验资源及独占写入，既有目标不覆盖，失败输出仅按自身身份清理。五项合成integration通过，Electron/UI未验。

[ADR0030](../adr/0030-host-file-selection-and-import-receipts.md)：Host私有files.select生成窗口绑定只读token；fileCommand有限开放文件/目录命令及批次importStatus/cancelImport。导入按项提交收据与解析job；原件成功和内容读取分别呈现。真实native/库UI/E2E仍待收口。

### 2026-10-06 P03-01实施中

[ADR0028](../adr/0028-pdf-text-worker-assets.md)：锁定PDF.js6.3.289 API/worker/CMap/标准字体随bundle打包，Core按清单摘要验证并仅为PDF暂存；在固定AppContainer内读取文本和规范化页坐标，不渲染/执行动作/XFA/系统字体/联网。真实加密合成PDF已用正确公开测试密码交叉读取；501页/坏文件/加密拒绝及原件不变通过便携测试。新PDF原生验收仍待CI，Host/UI/image待实现。

[ADR0027](../adr/0027-read-only-ooxml-structure.md)：固定受限Node新增有界只读OOXML结构；DOCX段落/标题/表格、XLSX公式与缓存、PPTX顺序/备注保留定位。复用锁定FXP/yauzl；外部关系不读取、实体/宏/超限拒绝。已建真实P03 native和独立标准用户验收，但本机未运行，等待新CI；PDF/image及Host/UI仍待实现。

[ADR0026](../adr/0026-isolated-file-parser.md)：Core的file.parse复用既有queue/取消事件和NativeSandboxExecutor；固定Node bundle通过私有inputRoot/workspace执行，不新增公共路径/argv/终端入口。FileService/Host token与文件公共bridge仍待接入，当前不得暴露假成功导入。

[ADR0025](../adr/0025-file-versions-and-ingest-jobs.md)：追加0008/schema8，复用files/file_versions/blob/resource_links/jobs，新增folder/parsed_document及文件库FTS；不可变版本/明确替换目标，file.parse按版本及parserVersion去重。Host选择token为公共入口，不接受路径/其他profile。当前契约和迁移已实现，业务handler/UI/解析与原生依赖验收尚未完成。

> P02-03当前实现（2026-10-05，ADR0024）：握手schemaVersion=7，业务请求protocolVersion仍为1。有限historyCommand集合以contracts/history.ts为准：sessions.list/get/update/archive/move/trash/restore/purge/copy/fork/title/temporary/closeTemporary/read、projects.pin、sidebar.list/create/update/remove/move/reorder、search.query/locate/history/clear及messages.edit/regenerate/switchBranch/deletePreview/delete/mark/transform/saveNote。元数据/分支修改需CAS；批量移动等先全量验证再事务提交；页大小默认50、最大100，cursor绑定过滤条件。消息变换校验version与准确选区；反馈只写本地mark。search.locate按当前profile校验项目/文件ID，支持首100项之外的定位。Host为所有请求覆盖可信windowId；native.purge只在Core→Host私有通道，Renderer不能读取协议密文。openEntity校验实体后开独立窗口，saveConversation仅保存用户确认的有界Markdown预览。具体DTO以共享契约和[ADR0024](../adr/0024-history-branches-search-and-temporary-chat.md)为当前事实，下列未来接口不能当作已开放能力。

> P02-02当前实现（2026-10-05，ADR0023）：Core/Host握手schemaVersion=6。chatCommand有限开放messages.send/list/read、drafts.get/save、inputs.list/update/cancel/attach/references、runs.cancel、chat.snippets.get/set。messages.list只查活动分支，以消息ID分页，返回ChatSnapshot（消息/run/队列/eventSeq/模型/只读工具）；send仅mode=chat，delivery=followup|steer。drafts.save及队列update/cancel必须expectedRevision。inputs.attach接收用户选取文件字节，绝不接受任意路径。当前chat事件仅安全ID通知，正文来自持久化快照；与下文未来全文增量DTO不同，详见[ADR0023](../adr/0023-durable-chat-and-read-loop.md)及contracts/chat.ts。openPublicLink仅用户点击后打开http/https/mailto链接。

P01-02补充（2026-10-04）：providers.saveApiKey接收六个API provider、label/key以及可选apiFormat/baseURL/modelId。Host加密并清除key字段后才向Core注册credentialId，未填写格式/地址时沿用预设。list仅返回配置与hasCredential；check/disconnect沿用expectedRevision与同账户互斥。私有api-key.read/delete仅Core→Host，Renderer无解密接口。Core启动握手schemaVersion=3，其余请求protocolVersion和业务JSON schemaVersion仍为1，见ADR0014。

> P01-01补充：providers.loginStatus以loginId返回当前脱敏登录状态（不进业务日志）；startLogin可带label，check可带modelId；check/disconnect必须携带账户expectedRevision。credential/native读写及browser.open只在Host/Core私有消息通道，Renderer无对应方法。参见[ADR0009](../adr/0009-codex-oauth-and-native-state.md)。


> P02-01 实施（2026-10-05，ADR0022）：Core/Host 当前握手 schemaVersion=5。新增 desktop.workspace → {eventSeq,sessions,projects,files,pendingApprovals}（会话含 revision/pinned/unread，三个列表最多各100）；sessions.create {mode:chat|work,title}、projects.create {name}、sessions.pin {sessionId,pinned} → {entityId}，pin 必须 expectedRevision。workspace.updated 仅 entityId，新的 settings.updated 仅 revision，界面重读快照；历史完整设置事件仍可解析。settings.preferences 增加 desktop/personal/personalization/network，严格 patch、旧值补默认、个人作用域 CAS。Host 有有限 newWindow/chooseAvatar/chooseDirectory；Renderer 无任意路径读取。AccountView 可选 credentialHint 仅尾4位，由 Host 保存新 Key 时生成，不读取旧 Key 补值。详见 [ADR0022](../adr/0022-desktop-settings-and-metadata.md)。

## 1. 请求与响应

所有公开命令名、字段、错误在packages/contracts定义；以下是v1必需接口。Host只为app origin的顶层frame转发，Core重新校验资源与状态。

~~~typescript
type Request<T> = {
  protocolVersion: 1; requestId: string; command: string;
  expectedRevision?: number; payload: T;
};
type Reply<T> =
  | { ok: true; requestId: string; data: T; revision?: number }
  | { ok: false; requestId: string; error: {
      code: ErrorCode; message: string; retryable: boolean;
      fieldErrors?: Record<string,string>; recoveryActions: RecoveryAction[];
      traceId: string; currentRevision?: number; // CAS冲突时的当前版本
  }};
type Page<T> = { items: T[]; nextCursor: string|null };
type EventEnvelope = {
  eventId: string; streamId: string; seq: number; schemaVersion: 1;
  type: string; runId?: string; taskVersion?: number;
  occurredAt: number; payload: unknown;
};
~~~

参数除约定可空字段外拒绝null；缺省仅由schema提供。默认分页50、最大100，cursor为(base sortValue,id,filterHash)的base64url JSON并验证；不能将cursor作为权限凭证。写请求requestId在profile内去重24小时，结果未知时UI用原ID查询而非随机ID重发。

Core事件持久化以后才发送；UI lastSeq续接，重复eventId/seq忽略，缺口重新拉取。每50毫秒或4KiB合并一个token增量，增量先落消息草稿与事件事务再推UI，避免每token一个数据库事务。崩溃允许丢失尚未被UI确认的上游字节，不丢已ack消息。

## 2. 接口清单

DTO中的EntityView是不含凭据、绝对内部路径、native reasoning的可显示字段；EntityRef固定{id,revision}。所有update带expectedRevision；失败CONFLICT返回当前revision和重新加载动作，不能last-write-wins。

| 命令 | payload → data |
|---|---|
| app.bootstrap | {} → {profile,settings,capabilities,recoveringRuns,unreadCount} |
| settings.get/set | {scope:{type,id},keys?} / {scope,patch} → {values,revision} |
| providers.list | {} → {accounts:AccountView[],models:ModelView[]}；AccountView可选hasCredential为脱敏布尔，供区分已登录未检测与已注销；无凭据内容 |
| providers.saveApiKey | {providerId,label,key,baseUrl?,modelId?} → {accountId,status}；secret输入不进入业务event |
| providers.startLogin | {providerId:"codex-subscription",method:"browser"|"device_code"} → {loginId} |
| providers.answerLogin/cancelLogin | {loginId,promptId,value} / {loginId} → {status} |
| providers.check/disconnect | {accountId} → {status,models?} |
| providers.setFallbackOrder | {accountIds,autoOnQuotaExhausted} → {revision} |
| sessions.create/list/get | {projectId?,mode,title?} / {projectId?,archived?,cursor?,limit?} / {sessionId} → SessionView/Page |
| sessions.update | {sessionId,patch:{title?,tags?,note?,projectId?,settings?}} → SessionView |
| sessions.archive/trash/restore | {sessionIds,archived?} → {updatedIds,failed:EntityFailure[]} |
| sessions.fork/copy | {sessionId,fromMessageId?,includeAttachments:true|false} → {sessionId,branchId} |
| messages.list | {sessionId,branchId,cursor?,limit?} → Page<MessageView> |
| messages.send | {sessionId,text,attachments:ResourceRef[],clientMessageId,mode,modelRef?} → {messageId,runId?,queuedInputId?} |
| messages.edit/regenerate | {messageId,text?,modelRef?} → {branchId,runId}；edit必须提供text |
| messages.delete | {messageId,descendants:"branch"|"keep-as-note"} → {branchId,affectedIds} |
| messages.feedback/bookmark | {messageId,rating?:"up"|"down",note?,bookmark?} → {id} |
| drafts.get/save | {sessionId,windowId,text?,attachments?} → DraftView |
| inputs.list/update/cancel | {sessionId} / {inputId,text?,attachments?} / {inputId} → PendingInputView/Page |
| search.query | {query,scope:{type:"all"|"project"|"session"|"file",id?},types,sort,cursor?} → Page<SearchHit> |
| sidebar.list/mutate | {} / {action:"create"|"rename"|"move"|"reorder"|"remove",sectionId?,entityRef?,name?,orderedIds?} → SidebarView |
| projects.create/list/get/update | {name,description?,icon?,color?} / {cursor?} / {projectId} / {projectId,patch} → ProjectView/Page |
| projects.copy/archive/trash | {projectId,includeFiles?,sessionDisposition?:"detach"|"trash"} → ProjectView/DeletionPreview |
| files.pick/import | {allowDirectories?} / {selectionTokens,destination:{type,id},duplicate:"keep"|"replace"|"skip"} → {jobIds,fileIds}；只接受Host文件选择token |
| files.list/get | {owner?,type?,cursor?} / {fileId,versionId?} → Page/FileView |
| files.rename/move/copy/link | {fileId,name?,folderId?,owner?,versionId?} → FileView |
| files.unlink/trash/restore/purge | {fileIds,owner?} → {updatedIds,failed:EntityFailure[]} |
| files.retryParse | {fileVersionId} → {jobId} |
| artifacts.open/export | {fileId,versionId?,locator?} / {fileIds,format,destinationToken,includeSources?} → {viewId}/{jobId} |
| knowledge.query | {projectId?,query,selectedVersionIds?,limit?} → {hits:EvidenceRef[],indexStatus} |
| memory.list/update/delete | {scope,query?,cursor?} / {memoryId,value,expectedRevision} / {memoryIds} → Page/MemoryView/DeletionPreview |
| memory.undo | {changeEventId} → {memoryId,status}；检查新修改，冲突不覆盖 |
| runs.create | {sessionId,goal,acceptance,refs,planFirst,budgetOverrides?} → {taskId,runId} |
| runs.list/get | {projectId?,status?,cursor?} / {runId} → Page/RunView |
| runs.steer | {runId,text,refs,clientRequestId} → {eventId,taskVersion} |
| runs.pause/resume/cancel | {runId,reason?} → {status,requestedAt} |
| runs.retry | {runId,failedStepIds?,reuseVerifiedArtifacts:true} → {newRunId} |
| runs.setPlan | {runId,steps:PlanStepInput[],executeStepIds?} → {taskVersion,planRevision} |
| runs.accept | {taskId,decision:"accepted"|"changes_requested",feedback?} → {acceptanceStatus} |
| approvals.list/decide | {runId?} / {approvalId,decision,argsHash,contentVersionHash} → Page/ApprovalView |
| approvals.editDraft | {approvalId,newBusinessArgs} → {newApprovalId,preview}；旧审批失效 |
| grants.list/revoke | {} / {grantIds} → Page/{affectedRuns} |
| notifications.list/read | {cursor?} / {ids?,all?} → Page/{unreadCount} |
| browser.open/observe/action/close | {runId,url} / {tabId} / BrowserAction / {tabId} → TabView/BrowserSnapshot/ActionResult |
| code.attach/status/diff | {projectId,selectionToken} / {projectId} / {runId,path?} → CodeProjectView/RepoStatus/DiffView |
| code.accept/revert/comment | {runId,paths,expectedHashes} / 同前 / {runId,path,line,side,body} → {results} |
| terminal.start/input/resize/stop | {runId,runtime,cwdRef} / {processId,text} / {processId,cols,rows} / {processId} → ProcessView/Ack |
| github.connect/createPR/checkPR | {token,repoAllowlist} / {runId,repo,base,head,title,body,draft:true} / {repo,prNumber} → AccountView/PRView |
| canvas.open/save/aiEdit/apply | {fileId} / {documentId,content,baseVersion} / {documentId,selection,request,baseVersion} / {proposalId,accept} → CanvasView/Proposal |
| data.export/backup/restore/clear | {categories,destinationToken} / {destinationToken?} / {selectionToken} / {categories,includeBackups} → {jobId,impactPreview?} |
| diagnostics.bundle | {includeContent:false|true,destinationToken} → {fileId}；默认false |
| jobs.cancel | {jobId} → {status}；只取消已注册的基础后台作业，不是定时任务 |
| events.subscribe/replay | {streamId,afterSeq} → subscriptionId/Page<EventEnvelope> |

所有文件选择token只在Host临时表中保存canonical路径、用途、过期时间5分钟、发起windowId；不能序列化成模型可重新使用的目录权限。导入token消费一次；目录持续授权另写grant。

## 3. 运行状态

状态枚举：queued、running、waiting_tool、waiting_user、pausing、paused、recovering、completed、partial、failed、budget_stopped、cancelled。UI可归类显示，但数据库不得把partial和completed合并。

| 当前 | 允许转移 | 守卫 |
|---|---|---|
| queued | running/cancelled/paused | 获得租约和根预算才running |
| running | waiting_tool/waiting_user/pausing/recovering/completed/partial/failed/budget_stopped/cancelled | completed需要验收且无pending/unknown调用 |
| waiting_tool | running/pausing/recovering/waiting_user/cancelled | 结果按callId关联，unknown进入waiting_user核对 |
| waiting_user | running/paused/cancelled/budget_stopped | 回答匹配taskVersion；过时批准拒绝 |
| pausing | paused/waiting_user/recovering/cancelled | 持久化在途调用状态，不能伪造未执行 |
| paused | queued/cancelled | resume后重新鉴权/核预算 |
| recovering | queued/waiting_user/failed/cancelled | 核对副作用、进程、文件、lease epoch |
| terminal states | 不原地继续 | 追加修改/重试创建新run，保留历史 |

租约每5秒续，15秒过期；抢占时lease_epoch+1；所有结果提交CAS校验epoch。DB锁竞争失败不当作任务失败，有限重试后进入recovering。Windows重启后不自动重放unknown工具。

## 4. 事件类型与载荷

session.created/updated → {sessionId,revision}；message.accepted → {messageId,runId?}；message.delta → {messageId,attemptId,blockId,offset,text}；message.final → {messageId,version,attemptId,status}。

run.status → {runId,from,to,reason}；task.steered → {taskId,oldVersion,newVersion,inputId}；plan.updated → {runId,revision,steps}；tool.proposed/dispatched/finished → {callId,toolName,status,sideEffect,resultRef?}。

approval.required/resolved → {approvalId,callId,decision,previewRef}；artifact.ready → {fileId,versionId,runId}；source.ready → {sourceId,version,locator}；memory.changed → {memoryId,changeEventId,action,scope}；provider.switched → {logicalCallId,from,to,reason,attemptId}；budget.stopped → {runId,limitKind,used,limit}；notification.created → {notificationId}。

UI展示过程使用结构化动作摘要，不读取opaque_states。plan.description和工具结果都是数据，不能形成高优先级指令。

## 5. 错误码和恢复动作

P01-02检测证据补充（2026-10-05，[ADR0020](../adr/0020-probe-request-and-usage-evidence.md)）：ProbeView.diagnostic新增可选request（outputLimit、stream、none/disabled/unspecified）与规范化usage（可空的输入/输出/缓存/思考计数及source）；固定reason增加reasoning_output_truncated，只有关闭参数明确且服务报告输出全部为思考时使用。未知计数为null，不填零；准备摘要不等于供应商实收，HTTP仅来自实际响应，正文/头/Key不透传；IPC版本和数据库结构保持。

P01-02 JSON核验更新（2026-10-05，[ADR0019](../adr/0019-zhipu-responses-json-and-message-compatibility.md)）：diagnostic固定reason新增non_streaming_response及unrecognized_json；JSON正文最多64KiB仅内存解析，IPC沿用受限upstreamCode、HTTP状态与responseType，不增加原始正文或对象字段。非流式Response不能检测通过，错误业务码不得被HTTP200掩盖。

P01-02安全响应诊断补充（2026-10-05，[ADR0018](../adr/0018-safe-api-response-diagnostics.md)）：ProbeView.diagnostic可选httpStatus仍为100—599整数，新增responseType固定枚举event-stream/json/html/other/missing。响应后失败使用实际HTTP状态与声明类型分类，响应前失败不伪造；禁止将原始MIME、头参数或正文写入字段。新增字段可选，IPC版本保持；诊断仅在本次返回，不新增账户持久化列，旧失败记录无法回填。

P01-02智谱诊断补充（2026-10-04，ADR0016）：新增OUTPUT_LIMIT_REACHED，表示单次响应输出被截断，区别于BUDGET_EXCEEDED和供应商QUOTA_EXHAUSTED；ProbeView诊断新增output_truncated/empty_text，沿用受限字符集upstreamCode展示服务错误码，禁止透传原始错误message或body。

固定错误码：VALIDATION_ERROR、NOT_FOUND、CONFLICT、FEATURE_NOT_AVAILABLE、PERMISSION_DENIED、APPROVAL_REQUIRED、APPROVAL_STALE、AUTH_REQUIRED、AUTH_EXPIRED、QUOTA_EXHAUSTED、RATE_LIMITED、MODEL_UNSUPPORTED、PROVIDER_UNAVAILABLE、NETWORK_ERROR、STREAM_INTERRUPTED、TOOL_TIMEOUT、SIDE_EFFECT_UNKNOWN、BUDGET_EXCEEDED、FILE_TOO_LARGE、FORMAT_UNSUPPORTED、PARSE_FAILED、INDEX_NOT_READY、SANDBOX_UNAVAILABLE、DISK_FULL、DATABASE_RECOVERY_REQUIRED、CANCELLED、INTERNAL_ERROR。

RecoveryAction为{kind:"retry"|"reconnect"|"choose_model"|"open_settings"|"download_original"|"review_result"|"resume"|"export_data",targetId?,label}；只提供真实已实现动作。错误消息脱敏，traceId用于本地定位；不向Renderer透传堆栈、令牌、完整请求。

P00-02 协议细化见 [ADR 0005](../adr/0005-foundation-protocol-and-recovery.md)：Host↔Core ready 握手包含 protocolVersion=1 和 schemaVersion=1；基础阶段仅注册已实现命令，其他接口随所属任务启用。


> 2026-10-04 P01-03：P01-03有限IPC：models.catalog、models.preferences.get/set、models.preview、models.diagnostic/cancel、usage.list；均UUIDv7与strict schema。诊断仅固定文本，不接收renderer工具/prompt/nativeState。provider.switched/model.preferences.updated进入outbox。Core ready schemaVersion=4；注销取消使用该账户的检测。
