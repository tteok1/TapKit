# P00-03：UAC 修复及账户执行后续定位

> **路线更新（2026-09-30；下方结果仅为旧账户方案的历史实测）**：当前标准使用 AppContainer 隔离，不依赖本报告中的专用账户、CreateRestrictedToken 系统读取预检或账户级 WFP。KnownDlls/Kernel32 拒绝仅说明旧 account.execute 路线未通过，不代表 AppContainer 失败。保留所有报告数据，不将其迁移为新路线验收，也不据此继续初始化旧账户。

2026-09-24；main / 071d15c5c45db4e91d232a4d26db7904061bc89b + 未提交改动。用户回复“现在可以”后接续已准备的 WFP 读取权限修复。

## 已执行与实际结果

1. 提权 --account-setup 退出 0，返回 alreadyConfigured=true / accounts=2 / ready=true；普通权限 --account-status 也退出 0。日志 account-setup-readfix-approved.log。只修复已存在规则的读取 DACL；没有增加账户、删除阻断规则或修改 test。此前“等待 UAC”已解除。
2. Node 随后在恢复目录 path.alias 失败。MSIX 宿主将 LOCALAPPDATA 写入映射到应用包 LocalCache；SHGetKnownFolderPath 的重定向标志在本机子进程仍返回逻辑路径。现在仅对宿主私有恢复目录按句柄解析实际目标，要求仍在宿主 LocalAppData 内、同一文件身份、无重解析点、精确私有 DACL；负载根目录的别名拒绝不变。证据 account-node-path.json / account-node-knownfolder.json / account-node-canonical.json。
3. CreateRestrictedToken 拒绝应用容器 SID：只创建即关闭的诊断对照显示 base/disable/NT Restricted SID 成功，原 capability SID 和 ALL_RESTRICTED_APPLICATION_PACKAGES 均为 0x80070057。诊断令牌从未运行负载；临时探针已移除。现在最终 restricting set 只含新建专用账户 SID，仍禁用 logon SID 和危险权限，不含 Users/Everyone/应用包基线，也没有 WRITE_RESTRICTED。原配置中的 restrictingSid 为旧辅助 ACL/过滤条件标识，不能据字段名声称它仍在最终令牌中。证据 account-token-ntsid.json。
4. 命名窗口站要求管理员，普通宿主创建也拒绝。改为由 Windows 按本次独立登录会话自动命名窗口站，CREATE_ONLY 拒绝复用；桌面仍按 run ID 私有创建。令牌及私有桌面均已走过真实创建，Node 进入 started，但输出前超时。未扩大 WinSta0/default 的 ACL。
5. 执行器设置禁止系统错误弹窗后，Node 明确退出 3221225506 / 0xC0000022（STATUS_ACCESS_DENIED），Job activeProcesses=0。没有把 timeout/exited 事件当运行成功。证据 account-node-error-mode.json / account-cases.jsonl。
6. 最终令牌只读探针证明：KnownDlls 目录和 kernel32 共享映像段均返回 c0000022；System32/kernel32.dll 文件返回 80070005。现于启动前返回可诊断失败，避免等待隐藏弹窗；不临时换宽令牌或改系统 ACL。证据 account-system-read-probe-built.json。没有做调用栈追踪，不断言这三处是所有运行时启动失败的唯一原因。

## 验证与清理

- helper 锁定构建、pnpm check、pnpm build 均退出 0。
- account-after-uac-unit.json：15/15；account-after-uac-base.json：29/29，均退出 0。
- 新账户完整测试文件 account-after-uac.json：总计 5，通过 2，失败 3，跳过 0，退出 1。Node/Python/OfficeWorker 均被系统读取预检拒绝；三格式转换尚未执行，不能宣称兼容通过。
- account-after-uac-cleanup.json：检查 78 个选定祖先/任务根目录及 Node 可执行文件，专用账户和辅助 SID ACE 残留 0；私有恢复目录 JSON 日志残留 0。这不是全文件系统递归 ACL 审计，也不替代硬杀恢复验收。
- 测试时钟被 Vitest 固定：account-cases.jsonl 第一条的 at=2026-09-15 是模拟时钟，不是实际执行日期；后来条目已移除该字段，以 runId 和对应测试报告关联。
- account-system-read-probe.json 是一次构建类型错误后误跑旧 binary 的报告，不能当系统资源探针证据；只有带 built 后缀的报告在成功构建后运行。该错误已修复，原报告保留审计。
- 一次构建报告 wall time 17m12s；最终重建约 3 秒。未把未返回的构建当成功。

## 接续与门禁

下一步是系统最小只读访问适配：区分 NT 共享映像对象、只读运行库文件及后续注册表/字体依赖，验证允许范围和重启生命周期。不能通过加入 Everyone/Users、只限制写入、关闭网络或授予整个用户目录来使兼容测试变绿；若需要改变安全边界，必须先更新 ADR 并取得该变更授权。

其后仍须完成 Node/Python/Office 实际运行、系统外越界/链接/网络正向对照、并发租约、取消/限额、硬杀恢复、Git 私有根跨账户和独立 test 全量。R09 已存在，无需再索要账户或密码。本轮不改变系统库文件/系统共享对象 ACL，不新增服务或启动项。P00-03=in_progress、P00-gate=failed，不能归类为仅缺 live。

依据：[CreateRestrictedToken](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken)、[CreateWindowStationW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-createwindowstationw)、[Known folder flags](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/ne-shlobj_core-known_folder_flag)。
