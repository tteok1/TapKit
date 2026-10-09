# P00-03 官方 Agent 项目 Windows 实现核查

> **路线更新（2026-09-30；下方内容是历史源码研究，不是当前方案建议）**：本报告当时提出的“若 AppContainer 无法兼容再考虑专用账户”仅保留作研究记录。当前标准为 AppContainer + Job 隔离执行组件、Git 使用可信 GitBroker、Office 接入 LibreOfficeKit 适配；不得从报告中的第三方实现推导 TapKit 需要账户初始化/WFP。全部当前边界及未完验收见 docs/evidence/P00-03/sandbox-route-reassessment.md。

核查日期：2026-09-17。范围：用户指定的 Codex、Claude Code、Hermes、Grok Agent；Grok 选择 xAI 官方的 grok-build。结论来自固定提交源码和官方文档，不按项目名气推定安全性，也不把第三方测试源码当作 TapKit 的实测结果。

本次只做源码研究和交接更新，没有运行第三方安装脚本、编译其项目、创建系统账户、改变 ACL/防火墙或改动 TapKit 产品代码。P00-03 仍为 in_progress，P00-gate 仍 failed；本机原生 9/11、test 的 Core/沙箱子集 9/9 保持原记录。

## 来源与核验方法

| 官方仓库 | 固定提交 | 核查范围 |
| --- | --- | --- |
| [openai/codex](https://github.com/openai/codex/tree/7abf2a3b5cbe08ca875d677dcd027528f9556152) | 7abf2a3b5cbe08ca875d677dcd027528f9556152 | windows-sandbox-rs、相关 Core 调用和测试 |
| [anthropics/claude-code](https://github.com/anthropics/claude-code/tree/68ac8bbf0245b615b41517bf8f2b2f35af1ae31d) | 68ac8bbf0245b615b41517bf8f2b2f35af1ae31d | README、许可证；不能称为完整产品内核开源 |
| [anthropics/sandbox-runtime](https://github.com/anthropics/sandbox-runtime/tree/1831bab341c71adda0fa78dec5496ccf9b43296a) | 1831bab341c71adda0fa78dec5496ccf9b43296a | Windows 包装、vendor/srt-win-src、原生 smoke 测试 |
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent/tree/61e730cc0b7594eeb8e92fd8a56e4259ba87cfe6) | 61e730cc0b7594eeb8e92fd8a56e4259ba87cfe6 | SECURITY、Windows guide、local backend、进程身份与桌面回退 |
| [xai-org/grok-build](https://github.com/xai-org/grok-build/tree/482711333c7195dc16a272777f86086d615e2afb) | 482711333c7195dc16a272777f86086d615e2afb | xai-grok-sandbox、sandbox guide、相关测试 |

共取得 214 个选定文本文件，逐个对照固定 Git tree 的 blob SHA-1，并另记 SHA-256；全部一致。索引见 agent-windows-reference-source.json。缓存位于 .cache/references/agent-windows-20260917；仅作为阅读材料，没有执行下载的源码。部分 GitHub API 请求返回 403 后改用公开 Git 只读获取提交/树，不使用私人凭据。

Codex/Grok/sandbox-runtime 所读 LICENSE 为 Apache-2.0，Hermes 为 MIT；Claude Code 仓库 LICENSE.md 为保留权利及商业条款，不能因仓库公开就把完整产品称为开源。这里只记录观察，尚未复制第三方实现进入 TapKit。

## 1. Codex：原生 Windows 可参考，但不是当前 AppContainer 模型

官方文档区分 elevated 和 unelevated：前者用专用低权限账户、文件权限、网络防火墙等，初始化需要管理员批准；后者用当前用户的 restricted token、ACL 和环境级离线控制，官方明确较弱。[Windows 官方说明](https://learn.chatgpt.com/docs/windows/windows-sandbox)

固定源码 token.rs 的 make/write-restricted token 路径调用 CreateRestrictedToken；set_default_dacl 专门处理 PowerShell 管道/IPC 因 ACCESS_DENIED 失败的问题。它把相应 capability SID、logon SID、Everyone 加入新对象的默认 DACL，并保留 SeChangeNotifyPrivilege。额外身份标记 SID 明确不作为对象访问权限。[token.rs](https://github.com/openai/codex/blob/7abf2a3b5cbe08ca875d677dcd027528f9556152/codex-rs/windows-sandbox-rs/src/token.rs#L54)

对 TapKit 的意义：
- 低权限启动不等于子进程内部 IPC 自然可用，必须分别验证管道命名空间、对象默认权限、继承句柄。
- 不能直接复制其 Everyone 默认授权，也不能把 restricted token 当成 AppContainer 的等价替代。
- TapKit 已复现的 LibreOffice 管道问题包含 AppContainer 命名空间限制。微软明确要求其管道使用 LOCAL 前缀；修改默认 DACL 不会重写运行库硬编码的管道名称。[微软 CreateNamedPipe 文档](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createnamedpipea#remarks)
- Codex 的 unelevated 环境级网络控制不能直接满足 TapKit 禁止公网/回环/元数据网络的 OS 强制边界。

另查到 effective_cwd 在 ACL helper 活跃时使用专用用户目录中的 junction。它与我们的 MinGit cwd 问题相关，但源码并未证明解决 AppContainer 下 GetFinalPathNameByHandleW 的 DOS/GUID 失败，且 TapKit 当前拒绝 reparse/junction，不能照搬。[调用点](https://github.com/openai/codex/blob/7abf2a3b5cbe08ca875d677dcd027528f9556152/codex-rs/windows-sandbox-rs/src/bin/command_runner/win.rs#L215)、[junction 实现](https://github.com/openai/codex/blob/7abf2a3b5cbe08ca875d677dcd027528f9556152/codex-rs/windows-sandbox-rs/src/bin/command_runner/win/cwd_junction.rs)

deny_read_state.rs 会持久化某 SID 的已应用路径并协调增删，这是一种状态管理参考，但并非 TapKit 每次执行的 ACL/AppContainer profile 崩溃恢复方案；不能据此声称问题已有完整现成实现。

## 2. Claude Code / sandbox-runtime：发现 Windows alpha 和可借鉴的恢复机制

截至本次读取，Claude Code 产品 sandboxing 文档仍说原生 Windows 不支持、应使用 WSL2；但其独立开源 sandbox-runtime 当前提交已包含 Windows alpha。两者支持范围不能混为一谈，也不能把库 main 分支实现称为产品已经正式支持。[Claude Code 产品文档](https://code.claude.com/docs/en/sandboxing)、[runtime Windows alpha](https://github.com/anthropics/sandbox-runtime/blob/1831bab341c71adda0fa78dec5496ccf9b43296a/README.md#L524)

runtime 的路线是一次 UAC 初始化专用 srt-sandbox 用户和 WFP 规则，broker→runner→受限 child 两跳启动，隔离账户 profile、restricted token、Job Object，以及仅该 SID 的增量 ACE。它避免依赖 AppContainer 的管道命名空间，可能改善传统 Win32 工具兼容性；这里是架构推断，未见 LibreOffice 三格式和 TapKit MinGit 版本的对应实测，不能承诺两项兼容必然通过。

最适合移植思路的是 state_db.rs：
- 私有、沙箱不可写的会话状态目录；每次获取独占文件锁都执行恢复，进程死亡由内核释放锁。
- 记录 holder PID + creation time，避免 PID 被复用后误判；进程查询失败视为仍可能活着，不直接清理。
- 记录路径的 file ID，清理前核对对象身份；按存活 holder 引用计数计算仍应保留的权限。
- 增加权限时先落状态再修改 ACL；只处理本项目 sandbox SID 的 ACE，不整份回写旧安全描述符，避免覆盖其他权限变化。[state_db.rs](https://github.com/anthropics/sandbox-runtime/blob/1831bab341c71adda0fa78dec5496ccf9b43296a/vendor/srt-win-src/src/state_db.rs#L1)

必须保留批判性核查：该提交 crash_recovery 的孤儿循环先删除 working_aces 行，再执行 identity_gate/recompose_at；读取身份或修改 ACL 失败可能失去重试条目，而且计数不能替代实际撤权核验。TapKit 不应原样复制此失败路径，应在撤权及验证成功后才移除恢复记录，失败保留 pending 状态并让能力保持 failed。[对应实现](https://github.com/anthropics/sandbox-runtime/blob/1831bab341c71adda0fa78dec5496ccf9b43296a/vendor/srt-win-src/src/state_db.rs#L1109)

原生测试也比单纯断言 Win32 API 返回值更有价值：
- smoke-kill.ps1 强杀 broker，检查 broker→runner→cmd→PING 整棵树在时限内消失。
- smoke-aces.ps1 的 A4 验证两个 holder 最后一个退出才撤权；A5 验证死 holder 回收；A29 真正强杀，先证明 Drop 未执行/ACE 留下，再 recover 并验证 ACE 消失及访问结果。
- 这些是已阅读的第三方测试用例，未在本机执行，不计入 TapKit 通过数。[kill 测试](https://github.com/anthropics/sandbox-runtime/blob/1831bab341c71adda0fa78dec5496ccf9b43296a/vendor/srt-win-src/ci/smoke-kill.ps1)、[ACE 测试](https://github.com/anthropics/sandbox-runtime/blob/1831bab341c71adda0fa78dec5496ccf9b43296a/vendor/srt-win-src/ci/smoke-aces.ps1#L275)

## 3. Hermes：可学进程管理，默认 local 执行并非沙箱

官方 Windows guide 已支持原生 Windows，使用 PortableGit/Git Bash 等运行工具；SECURITY 明确默认 local backend 直接在宿主执行。Docker/远程 terminal backend 的隔离也不自动覆盖 agent 自身 Python、插件或其他宿主子进程。[安全边界](https://github.com/NousResearch/hermes-agent/blob/61e730cc0b7594eeb8e92fd8a56e4259ba87cfe6/SECURITY.md#L32)、[Windows guide](https://github.com/NousResearch/hermes-agent/blob/61e730cc0b7594eeb8e92fd8a56e4259ba87cfe6/website/docs/user-guide/windows-native.md)

有价值的是 process_identity.py 的安装身份、启动标签、PID + 创建时间账本，以及真实 Windows 下错误身份拒绝终止的测试。进程创建成功也不直接当作服务启动成功，gateway 会检查存活稳定性。[身份实现](https://github.com/NousResearch/hermes-agent/blob/61e730cc0b7594eeb8e92fd8a56e4259ba87cfe6/hermes_cli/process_identity.py)、[真实测试](https://github.com/NousResearch/hermes-agent/blob/61e730cc0b7594eeb8e92fd8a56e4259ba87cfe6/tests/hermes_cli/test_taskkill_identity_windows_live.py)

不适合照搬的两处：
- process_identity.py 的 Job 为网关重启需求允许 BREAKAWAY/SILENT_BREAKAWAY，且身份账本部分兼容分支允许缺创建时间。TapKit 的不可信负载 Job 必须禁止逃离，清理归属也必须明确。
- windows-sandbox-fallback.ts 是 Chromium/Electron UI 崩溃恢复，最终可能启用 --no-sandbox；它既不是 Office 管道修复，也不适合作为 TapKit 执行沙箱的回退。

## 4. xAI Grok Build：公开源码里没有对应 Windows 强制沙箱

xai-grok-sandbox 的实际 apply 受 cfg(all(feature = "enforce", unix)) 限制；Windows 落入另一分支，只记录 enforcement unavailable 并返回 Ok。所读 guide 说明 Landlock/Seatbelt，默认 sandbox 为 off。因此原生 Windows 工具能启动不能证明具有我们要求的隔离边界。[实现](https://github.com/xai-org/grok-build/blob/482711333c7195dc16a272777f86086d615e2afb/crates/codegen/xai-grok-sandbox/src/lib.rs#L180)、[guide](https://github.com/xai-org/grok-build/blob/482711333c7195dc16a272777f86086d615e2afb/crates/codegen/xai-grok-pager/docs/user-guide/18-sandbox.md)

在这条明确核查的 sandbox 路径中，没有可直接用于 TapKit 的 AppContainer 管道、MinGit cwd 或 ACL/profile 恢复实现。其环境过滤和策略配置可作设计参考，但不能替代 OS 隔离验收；TapKit 应继续 fail-closed。

## 问题对应与接续建议

| TapKit 问题 | 本次找到的参考 | 可以采取的下一步与限制 |
| --- | --- | --- |
| Office 内部管道 Win32 5 / 启动弹窗 | Codex/srt-win 明确处理新对象默认权限；两者传统 Win32 账户/令牌路线不同于 AppContainer | 保留当前边界，针对运行库 LOCAL 管道名称及双方连接做最小兼容实验；可能涉及可重建运行时补丁与版本锁/ADR，尚无可直接采用的修复 |
| MinGit cwd 规范化退出 128 | Codex 有 cwd junction 映射 | 不能开放根目录或直接允许 junction；继续用已定位 Win32 调用做最小复现，确认能否在既定边界内适配；此项仍无直接修复 |
| Node 子进程内部管道 | Codex 默认 DACL 处理可提供诊断维度 | 区分继承 stdio、运行库自己创建 IPC、命名空间与 DACL；既有继承 stdio 通过不代表任意 npm 工具通过 |
| 硬杀后 ACL/profile 留存 | srt-win 的私有状态、身份校验、文件锁、引用计数与恢复测试 | 可在不改 AppContainer 架构的前提下实现 TapKit 自有恢复；仅撤本任务 SID/ACE；profile 回收需自行补充，错误必须可重试 |
| 错杀/PID 复用/退出假成功 | Hermes 的进程身份与真实测试；srt-win kill-chain 测试 | 持有进程句柄、核对创建时间，增加硬杀 helper/父进程死亡/错误 run 与 lease 的实测；断言实际无存活进程且权限已回收 |
| 标准用户/企业策略 | Codex 和 srt-win 分离初始化与运行，并承认管理员/策略限制 | TapKit 仍须满足无需管理员安装；不得靠管理员运行、关闭安全软件或全局 Bypass 宣称兼容通过 |

建议先把可直接借鉴的恢复状态与故障注入测试落到当前 helper，避免再产生人工清理；Office/Git 同时保持最小兼容问题定位，成功后才扩大到三格式、中文字形、宏/外链和完整标准用户验收。

若最终无法在锁定运行时 + AppContainer + 无管理员要求内实现兼容，再提出有证据的架构变更：独立低权限账户/WFP 更接近 Codex/srt-win，但需要一次管理员初始化、重新设计隔离范围和测试；WSL/VM 又改变安装依赖和资源成本。两者均与当前 P00-03 规格冲突，本次没有据此修改计划或技术选型。

## 验证边界

本次只运行 docs:check 和研究索引/文件指纹一致性检查。未重跑无改动的产品测试、未替第三方执行原生测试、未扩大已有 test 账户 9/9 的覆盖范围。对应命令和退出码见 agent-windows-reference-validation.json。
