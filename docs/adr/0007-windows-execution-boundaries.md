# ADR 0007：GitBroker、OfficeWorker 与专用账户执行边界

> **2026-09-30 当前方案补丁（基于旧方案问题与兼容实验的优化，现以本补丁为准）**：当前标准恢复 AppContainer 隔离 Node/Python/终端和受控 Office 转换；Office 使用 LibreOfficeKit 的 unipoll/runLoop 适配方案。Git 由可信 GitBroker 以固定 Win32 操作处理，不在 AppContainer 内运行任意 Git。无需为任务隔离初始化 TapKit 专用 Windows 账户、受保护账户凭据或账户级 WFP 规则。执行仍须使用每次独立 AppContainer profile/SID、最小 ACL、Job Object、无网络 capability、失败关闭和完整安全验收。下方 2026-09-24 的专用账户决策及测试原样保留为历史记录，不再作为开发标准。

- 日期：2026-09-24；任务：P00-03；状态：**已采纳，实施中，未通过安全验收**。
- 授权依据：用户在本任务明确要求“按你现在重新调整的方案来做”，并要求同步记录以便审计。此次是对原方案的变更，不是宣称原方案已经如此。
- 取代范围：ADR 0006 中“所有运行组件均在 AppContainer、无需管理员”的执行路线；其构建锁定、协议校验、失败关闭和历史测试证据继续有效。

## 原因与证据

正式旧路径的 Office/Git 验收失败：LibreOffice 启动管道不兼容；MinGit 在 AppContainer 中查询工作目录失败。独立标准账户 Core/沙箱 9/9 不包括 Office/Git，不能抵消失败。详见 `docs/evidence/P00-03/native-final.json`、`standard-user-repair-reported.json` 与 `office-git-design-reassessment.md`。盘符别名及 LibreOfficeKit 的成功实验仍保留，仅证明局部兼容，不作为生产路径或新方案的验收证据。

## 采纳的方案

1. **GitBroker** 是可信固定操作执行器，使用锁定 MinGit 正常 Win32 进程。模型只能申请业务操作，不能传 executable、环境、Git 参数、git-dir 或凭据。私有元数据与工作快照由 Core/broker 管理，忽略用户目录的 `.git`。P00 只实现无远程、无凭据的 status/diff 验证；项目授权、持久镜像与 commit/push 仍归 P09，不提前开放。
2. **OfficeWorker** 与任意脚本执行分离：仅接收已授权输入版本及转换目标，固定 LibreOffice 参数，独立 profile，禁用宏及外链更新。生成 Office 文件不强制先启动转换器。Worker 必须经专用账户执行通道；不得在普通宿主直接运行转换器作为失败后备。
3. **专用低权限账户执行通道**：首次由管理员初始化专用账户、受保护的凭据/配置与内核网络规则；日常使用保持标准用户权限。不能复用用户的 `test` 账户作为产品沙箱账户。不同活动根任务隔离；账户租约、权限授予、撤销及崩溃恢复必须可审计。
4. 账户不是完整安全边界。必须核验非管理员身份、禁用危险权限及继承的交互 logon SID，受限令牌与 ACL 限制授权目录；Job Object 禁止 breakaway、关闭即杀树；网络规则阻断 IPv4/IPv6 TCP/UDP、DNS、回环及元数据。系统运行库仅明确只读；不能把 Users/Everyone 对普通目录的读取权限当成已隔离。
5. 挂起启动 → 验证身份/规则/Job → 恢复；任一步失败返回 `SANDBOX_UNAVAILABLE`。配置存在、版本探测成功或旧报告通过，均不足以启用能力。新能力报告必须绑定方案版本和实际被测字节。

## 管理员初始化与恢复边界

初始化只修改带 TapKit 所有权标识的账户、网络规则及专用目录。先生成可审阅计划，再执行 OS 变更。密码不得进入 argv、环境、日志或仓库；持久凭据须受 Windows 保护且不对执行账户可读。不得修改系统应用控制策略，不授予整个用户目录，不用关闭防火墙解决兼容。

权限变更先写持久日志，再实施；日志记录对象身份与本次新增权限，恢复只撤销自己的变更。失败记录保留供重试，不能先删除记录再尝试恢复。账户/规则身份不一致、清理不完整或规则丢失时拒绝新任务。

## 验收变化及不变的目标

| 项目                               | 旧方案                | 新方案                                                 |
| ---------------------------------- | --------------------- | ------------------------------------------------------ |
| Git status/diff                    | 沙箱内 MinGit fixture | 可信 GitBroker 的私有快照；恶意配置/环境不产生外部执行 |
| Office/脚本/终端                   | AppContainer          | 专用账户、受限令牌、ACL、Job 与网络规则                |
| 安装权限                           | 无管理员              | 首次隔离初始化需要管理员；日常标准用户                 |
| 越界读取、凭据、网络、进程树、恢复 | 必须拒绝/回收         | 不降低，针对新路径重新验证                             |
| 旧测试                             | 曾有通过及失败        | 全部保留历史，不迁移为新路径通过                       |

完整 P00 门禁要求新路径上的 Node/Python 子进程、三格式 Office/中文 PDF、ConPTY、拒绝越界/进程内存/网络、取消/超限、并发和中断恢复，以及初始化后的独立标准用户实测。GitBroker 单独通过不能启用代码执行。未完成时任务保持 `in_progress`、P00-gate 保持 `failed`；本次不切换阶段。

参考：已缓存并核查的 Codex Windows sandbox 与 Anthropic sandbox-runtime，具体版本/路径见上述调研报告。只借鉴机制；它们允许的文件读取范围不自动成为 TapKit 的授权范围。

## 2026-09-24 原生实施检查点

已实现管理员初始化、机器 DPAPI 加私有管理员 DACL、双账户租约、WFP 双栈四层阻断、受限令牌、私有桌面、Job 和 ACL 写前日志；OfficeWorker 经 NativeAccountExecutor 接入。已经真实初始化两个执行账户和八条规则，负载测试仍在规则读取权限处失败。详见 [原生检查点](../evidence/P00-03/account-backend-checkpoint.md)，不得把该实现进度当成安全验收。

当前原型为 Windows 运行库访问加入 ALL_RESTRICTED_APPLICATION_PACKAGES restricting SID，这也可能使系统外带该 SID 的 ACL 可读，**尚不满足“仅明确授权路径”的证明要求**。必须补恶意 ACL 样本并收窄/证明系统访问范围；不能借实施细节降低本 ADR 的边界。嵌套链接、恢复和标准用户仍需验收。WFP 规则修复仅更改自身规则的宿主读取 DACL，不删除网络阻断，不改应用控制。

后续实测修正：上述应用包 SID 原型已撤销，当前 restricting set 仅含新建专用执行账户 SID，读写都需通过第二次 ACL 检查；不使用人类账户。原辅助 capability SID 仍保留在既有配置/清理记录及阻断条件中以兼容已创建资源，但不在最终令牌里。私有窗口站改为 Windows 按独立登录会话自动命名，CREATE_ONLY 保证不盲目复用，避免普通账户不能指定窗口站名称的问题。系统读取基线当前尚未补齐，探针发现 KnownDlls/Kernel32 拒绝，因此新能力继续失败；未借兼容放宽到 Users/Everyone 或 WRITE_RESTRICTED。实现、完整5项失败范围与接续见 [UAC 后检查点](../evidence/P00-03/account-after-uac.md)。

## 2026-09-30 架构重新评估：以 OS 沙箱为执行边界

用户明确指出任务隔离应由沙箱承担，不应要求为此准备 TapKit 本地 Windows 账户身份。当前建议恢复既有 AppContainer 执行路径，作为 Node/Python/终端及受控 Office 转换的隔离边界；Git 继续由可信 broker 处理固定字节快照。不得把 Codex `elevated` 或 Anthropic `sandbox-runtime` 的可选专用账户实现当作 TapKit 的必需先决条件。

KnownDlls/Kernel32 预检只在 `account.execute` 分支对 `CreateRestrictedToken` 结果调用。普通 `diagnostic.execute` 分支创建 per-run AppContainer profile、只授予 runtime/input/workspace ACL，并在无网络 capability 的 AppContainer 中启动进程；它不调用该账户令牌预检，也不读取 `C:\ProgramData\TapKit-Sandbox-v1`。因此本卡点是专用账户执行路径的令牌/预检问题，不足以证明 AppContainer 无法运行 Windows 系统库。

已存在的 AppContainer 证据包括：Node/Python/子进程和隔离核心测试；MinGit 通过仅映射授权 workspace 的会话盘符别名完成 status/diff；LibreOfficeKit 通过锁定的 unipoll/runLoop 完成 DOCX/XLSX/PPTX，配套越界读写及网络隔离检查。后两项目前是兼容实验，不是正式集成验收，见 [兼容实验复核](../evidence/P00-03/compat-experiments-review.md)。P00-03 仍 `in_progress`、P00-gate 仍 `failed`，直到这些方案集成并完成全部规定验证。

先前受控令牌试验曾尝试以账户目录作为前置条件；用户澄清后，该实验在 live token/access-control 检查前停止并标记 superseded。没有因此创建账户或更改账户、WFP、系统 ACL。记录见 [受控试验状态](../evidence/P00-03/controlled-token-probe.json)。
