# P00-03 Windows 沙箱路线复核

> **决策状态更新（2026-09-30）**：本复核提出的 AppContainer + GitBroker + LibreOfficeKit 路线现已成为 P00-03 的当前标准，是基于旧专用账户方案失败点和已有兼容实验所作的优化。它尚未正式迁移到生产执行器，P00-03 / P00-gate 仍未通过；全文记录的适用边界和未完验收继续有效。

复核日期：2026-09-30。用户明确要求隔离由操作系统沙箱承担，不把 TapKit 本地 Windows 用户身份作为执行隔离前置。本记录据此区分公开产品的实际平台支持、可选后端和 TapKit 已有证据。

## 市面方案的边界

- **Codex 原生 Windows**公开支持两种后端。`unelevated` 从当前用户派生受限令牌并实施 ACL 边界，网络限制较弱；`elevated` 是推荐模式，需管理员批准设置沙箱用户、防火墙及文件权限。来源：[OpenAI Codex Windows 沙箱文档](https://developers.openai.com/codex/windows)。所以“Codex 总是要求新用户”不准确，但它的强隔离模式确实会使用隔离用户。
- **Claude Code**的产品沙箱在 macOS、Linux、WSL2 工作，官方明确原生 Windows 不支持，并建议 Windows 上使用 WSL2。来源：[Claude Code 沙箱文档](https://code.claude.com/docs/en/sandboxing)。Anthropic 独立的 `sandbox-runtime` 是另一个 Windows alpha 项目，它的一次性管理员安装会创建 `srt-sandbox` 本地用户及 WFP 规则。来源：[Anthropic sandbox-runtime Windows alpha](https://github.com/anthropics/sandbox-runtime#windows-alpha)。不能把这个实验性独立运行时等同于 Claude Code 原生 Windows 产品路径。
- 因此 Codex/Claude 没有唯一一种 Windows 实现。Codex 提供当前用户受限令牌回退和管理员安装的增强模式；Claude Code 主产品选 WSL2，另一个 alpha Windows runtime 选了专用 SID。

## TapKit 的卡点归属

当前 helper 已同时包含两条执行路径：`diagnostic.execute` 调用 `sandbox::execute`，创建每次运行独立的 AppContainer profile，给 runtime/input/workspace 配置 AppContainer SID ACL，再以 AppContainer 安全能力和 Job Object 启动进程；`account.execute` 才创建专用账户受限令牌并调用 `account_token::system_read_probe`。后者检查 KnownDlls 和 Kernel32。AppContainer profile SID 是沙箱主体标识，不是额外的本地 Windows 用户账户；AppContainer 路径既不调用账户令牌预检，也不依赖 `C:\ProgramData\TapKit-Sandbox-v1`。

因此 2026-09-24 专用账户路径报告的 KnownDlls/Kernel32 拒绝，不能推出 AppContainer 无法加载系统 DLL。它只能说明那个 `CreateRestrictedToken` + restricting SID 组合无法通过当前手写的对象访问预检。删除限制或放宽系统 ACL 会改变隔离语义，且不是修复 AppContainer 所必需的步骤。

## 最低成本的后续路线

复用已经存在且无需新增本地 Windows 用户的 AppContainer 执行边界：

1. Node/Python/ConPTY 保持 AppContainer + Job + 最小 ACL + 无网络 capability，并以已有隔离测试作为回归基线。
2. Git 走可信 GitBroker；MinGit AppContainer 兼容实验通过只对已授权 workspace 建立临时会话盘符映射完成 status/diff，broker 自身继续校验原始固定路径。
3. Office 不走宿主进程回退，也不把专用账户作为前提。把已验证的 LibreOfficeKit/unipoll 转换实验适配到 AppContainer runner，再正式跑三格式、只读输入、越界读写、网络、中文 PDF 与宏/外链用例。
4. 重新运行标准用户和全量恢复测试。只有正式集成后完整安全门禁通过，才能更新 P00 gate。

兼容试验记录：[MinGit 和 LibreOfficeKit 实验](compat-experiments-review.md)。历史 AppContainer 原生套件 9/11 的两个失败是 Office CLI 和 MinGit cwd 兼容；独立兼容试验后来已覆盖这两个技术点，但尚未写入正式执行路径，不能把历史 9/11 改写为通过。

本轮曾为调查增加 feature-gated 账户令牌探针，随后按用户指示在任何访问控制试验前移除。最终代码差异不包含该探针，也没有运行 payload 或触碰 Windows 账户、WFP 规则或系统 ACL。旧账户路线和历史 OS 状态保留在历史证据中；它们不是继续 AppContainer 验收的先决条件。
