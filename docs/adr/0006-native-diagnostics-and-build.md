# ADR 0006：Windows 隔离诊断与可复现 helper 构建

> **2026-09-30 当前方案补丁（对旧执行路线的优化，现以本补丁为准）**：恢复 AppContainer 作为 Node、Python、ConPTY 与受控 Office 转换的 OS 隔离边界；每次执行使用独立 profile/SID、最小路径 ACL、Job Object 和无网络 capability。Git 使用可信 GitBroker 的固定 Win32 操作。以下 ADR 0006 中的构建锁定、协议校验、路径限制、失败关闭等要求继续有效；原 AppContainer 执行路线被替代的记载仅用于保留 2026-09-24 的历史决策。

> 2026-09-24：执行路线和首次初始化权限被[ADR 0007](0007-windows-execution-boundaries.md)取代。下文保留当时决策与证据；构建锁定、协议及失败关闭要求仍有效。

- 状态：实现中；2026-09-17；P00-03。原生/标准用户门禁尚未通过。
- 保持既定 Rust/windows crate + AppContainer + Job Object；不增加服务、管理员依赖或无隔离后备。
- 本机没有 VS/Windows SDK。使用已锁定 Rust 1.98.1 内置 LLD，开发期仅解包微软官方 Windows SDK NuGet 10.0.28000.2705 和 VS 17 官方清单中的 CRT 14.44.35226。包 URL/SHA256/许可进入 runtime-lock；Cargo.toml 精确依赖与 Cargo.lock 固定 crates。helper 使用静态 CRT；SDK/编译工具不作为产品运行依赖。CI 使用同一脚本，不要求全局安装 VS。
- 诊断协议为逐行 JSON；protocolVersion/requestId/runId/leaseEpoch 必须匹配。只开放内部 diagnostic.execute 与同一请求 cancel/terminal.input；没有 renderer shell IPC。未知字段、越界限制、路径别名/reparse/ADS/UNC 拒绝。
- 每次诊断独立 profile/SID；路径句柄保持到执行结束；仅 runtime/input 只读和 workspace 可写；挂起建进程 → 加入 Job → 核对 AppContainer SID → 恢复。无网络 capability，无 breakaway。取消、父管道关闭和超时都终止 Job，并检查活跃进程为零。
- Windows 创建 AppContainer 需要 USERPROFILE/LOCALAPPDATA/APPDATA；只向负载传入指向任务目录的值。可信 helper 自身可获取创建 profile 必需的宿主环境，但不会向负载转发用户路径/凭据。
- nativeExecution/officeRender/terminal 独立 DTO 进入 Core bootstrap。缺报告、二进制/锁变化、原生测试失败或独立标准用户证据缺失均为 failed/SANDBOX_UNAVAILABLE。检查失败不影响 storage/聊天准备；不自动启用未来执行功能。
- 已观测 Node 24.21.0/libuv 1.52.1 默认子进程 pipe 兼容问题；采用继承输出句柄可验证最小子进程，但不能据此声称 npm/任意终端兼容。保留失败证据。
- 本机曾以 CodeIntegrity 3077 阻止一个 helper 构建；后续普通源码修复后的构建已能运行，未修改应用控制策略。当前 Office/Git 是真实兼容失败，不能继续归因为旧策略事件或标 implemented_not_live_verified。
- 上游依据：[AppContainer 启动](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer)、[微软 Console 示例](https://github.com/MicrosoftDocs/Console-Docs/blob/main/docs/creating-a-pseudoconsole-session.md)、[libuv AppContainer 兼容问题](https://github.com/libuv/libuv/issues/5178)。以本仓库实际失败/通过证据为准。

- pnpm 12 在 workspace 依赖更新后生成 allowBuilds 未决项并拒绝执行命令；显式将已识别安装脚本全部设为 false，移除被其取代的 onlyBuiltDependencies。bootstrap 仍只显式运行原有 Electron 校验安装器，SQLite 使用锁定 Node-API prebuild；不运行任意第三方 lifecycle。
- 能力报告绑定 helper/锁及所有 Node/Python/MinGit/LibreOffice 文件名与字节的整体指纹，包含 DLL/模块。失败报告直接返回以保护聊天启动；可用报告必须通过当前字节指纹与独立标准用户标志检查。

- ConPTY 的标准句柄明确设为 INVALID_HANDLE_VALUE，避免继承宿主控制台；不添加 CREATE_NEW_CONSOLE/CREATE_NO_WINDOW。真实交互通过。祖先目录只增加不继承的属性/遍历/同步 ACE，通过 SetKernelObjectSecurity 避免祖先树 ACL 重传播；运行时和任务根仍按明确读写权限继承。
- 标准账户测试副本必须在源目录外。Windows path.relative 跨盘返回绝对路径，需显式接受；新增回归覆盖该真实错误。提供直接 Node 入口，避免要求用户修改 PowerShell 全局执行策略。
- Office 树 ACL 准备/回收涉及约 1.9 万文件，诊断器为准备/清理额外保留有界 300 秒 watchdog，负载自身 timeout 硬上限仍为 120 秒。硬杀后的 ACL/profile 恢复尚未完成，不能据此放行 P00。
