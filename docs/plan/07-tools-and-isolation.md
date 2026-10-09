# 工具网关、Windows执行隔离与网络策略

## 1. 工具契约

~~~typescript
type ToolSpec = {
  name:string; version:string; description:string;
  mode:"read"|"artifact_write"|"workspace_write"|"external_write"|"execute";
  inputSchema:JsonSchema; outputSchema:JsonSchema;
  retry:"safe"|"reconcile_first"|"never";
  timeoutMs:number; maxOutputBytes:number;
};
type ToolResult = {
  callId:string; status:"success"|"partial"|"failed"|"pending"|"unknown";
  data?:unknown; artifacts:ArtifactRef[];
  error?:{code:string;retryable:boolean;fieldErrors?:Record<string,string>};
  sideEffect:"none"|"committed"|"not_committed"|"unknown";
  continuation?:{handle:string;pollAfterMs?:number};
};
~~~

网关注入profile、taskVersion、runId、rootBudget、credentialRef；模型只能传业务字段。注册表编译时固定，延迟工具发现从内置目录检索元信息，不开放市场安装。十几个工具以内按模式固定小集合，目录扩大才按需加载。

## 2. 本版工具签名

| 名称 | 必须实现的输入与结果 | 权限/超时 |
|---|---|---|
| knowledge.search | {query,projectId?,fileVersionIds?,limit=8} → evidence[] | read/15s |
| files.read | {fileVersionId,locator?,maxChars=16000} → text,locator,hash | read/10s |
| history.search | {query,sessionIds?,limit=5} → messageRefs[] | read/10s；遵循项目隔离 |
| web.search | {query,days?,domains?,excludeDomains?,maxResults=8} → title,url,snippet,fetchedAt | read/30s |
| web.read | {url,selectorHint?,maxChars=20000} → sourceId,title,text,links | read/30s；不以搜索摘要代替全文 |
| browser.observe | {tabId} → snapshotId,navigationEpoch,nodes[] | read/10s |
| browser.act | {tabId,snapshotId,nodeId,action:"click"|"fill"|"select"|"press"|"navigate",value?,url?} → state/evidence | action分类/20s |
| artifacts.create | {kind,filename,contentRef,format,sourceRefs[]} → fileId,versionId | artifact_write/120s |
| office.render | {fileVersionId,format:"pdf"|"png"} → previewRefs[] | execute固定转换器/120s |
| data.analyze | {fileVersionIds[],scriptRef,expectedOutputs[]} → tables,charts,files | execute/120s |
| workspace.read | {workspaceId,path,startLine?,endLine?} → text,hash | read/10s |
| workspace.applyPatch | {workspaceId,patch,baseHashes} → changes,conflicts | workspace_write/20s |
| exec.run | {workspaceId,runtime:"node"|"python"|"powershell",argv[],cwd,timeoutMs?} → processId,exitCode,logRef | execute/120s默认，上限10min |
| exec.poll/cancel | {processId,offset?} → state,delta,exitCode | read/10s或cancel |
| git.inspect | {workspaceId,kind:"status"|"diff"|"log",path?} → structured | read/15s |
| git.commit | {workspaceId,paths[],message,expectedHashes} → commitSha | workspace_write需具体审阅/30s |
| github.createPR | {repo,base,head,title,body,draft:true} → prNumber,url | external_write/30s，先核对 |
| plan.update | {steps[],reason} → planRevision | 内核动作；不可绕过用户锁定步骤 |
| user.ask | {question,choices?,contextRef?} → questionId | waiting_user，不反复轮询模型 |
| task.delegate | {goal,inputRefs,outputSchema,acceptance,toolAllowlist,budget} → subtaskId | work only/depth1 |
| tools.find | {query,maxResults=5} → metadata[] | 内置注册表，不返回secret或第三方脚本 |

资源ID再鉴权，scope来自当前context不是模型填入的projectId。结果外置并返回引用，UI最多64KiB；模型单工具结果默认8k token，超限可分页读取。

## 3. 授权矩阵

| 动作 | 默认处理 |
|---|---|
| 读用户本轮提供的文件/当前项目资料 | 直接执行 |
| 查询公开网页 | 联网设置开启时直接执行；外部网页不能要求读取别的本机数据 |
| 生成新应用内产物 | 直接执行，自动版本化，不覆盖原文件 |
| 修改已授权工作区、运行其中测试 | 工作模式内直接推进；受OS沙箱与网络规则限制 |
| 引用新的外部目录、扩大网络目的地/数据范围 | 形成具体权限申请 |
| git commit、push、创建PR | 展示目标、差异/提交说明、仓库后批准；可按明确范围保存持续授权 |
| 匿名网页提交表单/发送内容 | 展示完整目标、字段与内容摘要，单次批准；无法判断副作用时不自动点击 |
| 删除用户原始文件、覆盖未托管文件 | 本版不提供模型直接操作，先另存或用户手工操作 |
| 付款、购买、发布网站 | 本版没有工具实现，不以浏览器脚本绕过 |

审批绑定account/profile/toolVersion/argsHash/resourceHash/contentVersionHash/taskVersion/expiry；默认10分钟有效、一次性消费。审批前准备可审阅内容，批准后立即复查目标。用户编辑待执行内容生成新审批记录，旧记录expired。拒绝/撤销后取消尚未派发调用；已提交动作只核对真实结果。

## 4. Native helper 的最小实现

> **2026-09-30 当前方案补丁（基于旧账户方案及 AppContainer 兼容实测的优化，现以本补丁为准）**：
>
> - Node、Python、ConPTY 和受控 Office 转换使用每次独立 AppContainer profile/SID；只给锁定 runtime/input 读取和 workspace 写入 ACL，使用 Job Object 杀除整棵进程树，不授予网络 capability。创建进程时先挂起、加入 Job、核验 AppContainer SID，再恢复；任何安全检查失败都 fail closed。
> - OfficeWorker 继续使用固定转换参数、每任务私有 profile、只读原件、禁宏/外链和输出校验；执行适配采用 LibreOfficeKit 官方 API 的 unipoll/runLoop 实验路径，不回退到宿主执行。
> - Git 继续走可信 GitBroker 的固定 Win32 操作、私有快照和固定 git-dir/work-tree；MinGit 在 AppContainer 的 cwd 实验只作兼容证据，不是产品 Git 执行通道。
> - 不初始化 TapKit 专用本地账户、受保护账户凭据或账户级 WFP 规则。2026-09-24 下方专用账户/受限令牌要求保留为历史方案，不再是验收标准；已记录的账户 KnownDlls/Kernel32 预检失败不代表 AppContainer 失败。
> - P00-03 仍须完成适配正式集成、路径/网络/凭据/进程树/并发/恢复测试和独立标准用户实测；兼容实验不直接计作正式通过，未完成前能力和 gate 保持 failed。

> **历史方案正文（2026-09-24，保留原内容供追溯；不得作为当前实现指引）**：

> **2026-09-24 历史原文**： [ADR 0007](../adr/0007-windows-execution-boundaries.md) 已获用户采纳；下列要求已同步为新方案，旧 AppContainer 实现与证据仅保留历史。首次管理员初始化专用账户/受保护凭据/内核网络规则，日常标准用户运行。仅换账户或仅限制写入不满足读取隔离。权限变更先记持久日志，恢复核对对象身份，只撤销自己新增的权限；清理失败保留记录。P00 必须取得新路径及初始化后独立标准用户的实际证据，旧测试通过不迁移为新路径通过。

Rust编译Windows x64可执行文件，使用windows crate调用官方Win32 API。首次管理员隔离初始化；日常标准用户运行，不采用Docker/WSL，也不使用“普通进程+cwd”冒充沙箱。

1. 每个活动root_run独占专用执行账户租约和权限范围；task子进程共享该root的隔离空间，目录文件归属由Core分配。不能读取其他root的目录或进程内存。
2. Core创建workspace、临时目录和只读输入副本；helper只为该SID添加明确目录/运行时的ACL。不给DATA/db、DATA/secrets、用户主目录或已有浏览器配置权限。
3. 使用专用账户的受限令牌，移除危险权限与交互logon SID；进程挂起创建、加入Job Object、核验身份/权限/网络后恢复。失败时清理并返回SANDBOX_UNAVAILABLE，不启动宿主权限负载。
4. Job设KILL_ON_JOB_CLOSE、ACTIVE_PROCESS_LIMIT=32、JOB_MEMORY_LIMIT=2GiB；CPU/时长由宿主计时和Job通知停止；不允许breakaway。
5. 子进程环境仅PATH(托管运行时)、TEMP/TMP(任务目录)、必要系统运行变量、UTF-8设置；不传API key、代理认证、Git token、SSH agent或用户HOME目录。
6. 按执行身份配置内核网络规则；任意IPv4/IPv6 TCP/UDP、DNS/loopback/元数据默认拒绝。依赖下载经宿主网络broker，不直接给不可信代码网络权限；规则丢失拒绝启动。
7. stdout/stderr经继承管道，终端经ConPTY桥接；helper协议消息包含protocolVersion/requestId/runId/leaseEpoch/operation/payload，响应带process identity和状态；模型不能直接调用helper。
8. 路径用句柄解析真实目标，防止..、UNC、设备路径、junction/reparse point、ADS、短路径/大小写变体；读写操作比较最终路径与授权根，创建新文件先验证真实父目录并拒绝重解析组件。
9. 退出/取消杀整个Job进程树；核对所有句柄关闭后再清理。文件与任务状态持久化由Core负责，临时容器内文件不是正式产物。

P00-03必须验证管理员初始化后标准用户下Node、Python、OfficeWorker与ConPTY的实际兼容，Git单独走可信GitBroker验收。若某执行器需要额外只读运行库，加入锁定清单和对应ACL再测试；不能给整个用户目录或网络权限解决兼容。该门禁未通过，聊天可继续开发，依赖该执行器的任务不得验收。

## 5. 依赖下载与代码项目

**GitBroker 执行边界（ADR 0007）：** 正常 Win32 固定操作，不让模型传 executable/argv/环境/git-dir。P00 以 Core 提供的授权字节构造私有 bare 元数据及工作快照，只验收无凭据 status/diff 和恶意配置拒绝；不读取模型指定宿主路径。P09 再实现持久镜像、commit/push 授权。下文沙箱内 Git fixture 是旧兼容测试，不是新架构的放行条件。

应用运行时预先随包分发。用户代码项目新增依赖走DependencyBroker：解析声明→生成下载清单→校验registry/URL/integrity→下载缓存→沙箱离线安装。支持首版Node npm package-lock v3和Python精确版本requirements/受控解析锁；其他构建体系明确显示未支持。

npm解析使用宿主签名的固定解析worker，只接受清洗后的package声明，关闭scripts/audit/fund、固定registry、不继承.npmrc。包内容与生命周期脚本只在沙箱内处理；依赖脚本所需网络不给直通，报缺失资源。Python拒绝任意URL/VCS可执行安装源，wheel优先；需要源码编译且本版无工具链则给出不支持状态。不得在可信Host执行pip/npm任意安装脚本。

Git网络由专门broker执行fetch/push，关闭外部hooks、credential helper、配置include、ext协议和自动submodule；token经单次凭据代理注入，不进入URL、process argv、日志或用户工作区。实际代码任务的Git元数据来自应用私有bare镜像，只有broker可访问；终端中的任意脚本不能因此改refs/配置或读取用户原仓库.git。git.inspect/commit采用固定Git参数和Core保存的git-dir/work-tree映射，忽略工作区内可能被改写的.git指针；禁止external diff、textconv、fsmonitor、hooks、任意filter、global/system配置和未批准远程URL。原生Git兼容测试可使用沙箱内独立无凭据fixture仓库，不混同正式任务授权。

## 6. 网络与浏览器

应用模型请求、搜索、下载统一经过NetworkPolicyService；HTTPS校验证书，不支持“忽略TLS错误”。系统代理默认开启；手工代理保存在凭据代理中。代理变更只影响新请求，连接诊断列出DNS/TLS/认证/超时类别。

目的地分类：模型固定provider域名；搜索Tavily；用户明确URL的公开HTTP(S)；下载锁定registry；本地preview的进程端口租约。阻止私网/loopback/link-local/云元数据IPv4/IPv6、非HTTP scheme、DNS重绑定和重定向转私网；每次连接重新解析并绑定验证的地址，限制最多5次redirect和50MiB响应。

浏览器session强制走本机受控代理，代理只接受该session的一次性授权连接；禁用QUIC和WebRTC绕行，绕过列表不能放行localhost。禁止下载弹出任意exe、协议调用、文件选择和权限请求。浏览器不能访问tapkit-artifact与app IPC。浏览器的内核网络隔离与Node请求限制都要分别测试。

页面读完后生成快照；nodeId是(snapshotId,navigationEpoch,backendNodeId)映射。所有CDP Runtime调用执行应用内固定脚本函数，参数结构校验；不给模型任意evaluate表达式。导航/弹窗/DOM变化后旧句柄失效。提交动作前对URL、目标表单、字段和DOM版本复核，动作后读取真实页面结果。

本地网站预览不把服务端直接暴露给外网：生成静态产物由受信文件server在127.0.0.1随机端口提供，持租约token、只读路径白名单；需要Node开发server时仅在专门受限预览profile中允许该本地端口，禁止任何公网能力和其他loopback端口。若Windows隔离无法证明仅放行指定端口，则用“沙箱构建静态dist→可信只读server”交付，首版不承诺有自建后端的动态预览。

## 7. 自循环和注入

同一工具规范化参数重复3次且结果无变化，停止并重新规划一次；再无进展则partial/failed。参数修正最多2次；只读临时错误有限重试。unknown副作用必须走查询/人工核对。

网页、文件、检索结果、记忆和子任务报告附source/trust标记，作为数据上下文；它们不能写入系统提示词、扩权或改变用户goal。内置工具也必须走网关。注入检测用于日志，不作为唯一防线。
