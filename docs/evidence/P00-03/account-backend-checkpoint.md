# ADR 0007 原生账户后端检查点

> **路线更新（2026-09-30；下方为旧专用账户方案的历史实现与实测）**：当前标准为每次独立 AppContainer 隔离执行组件、可信 GitBroker 处理 Git、LibreOfficeKit 适配 Office。以下账户/WFP状态仅作证据，不能作为当前方案的前置条件；不要仅凭此记录重复初始化或修改系统状态。P00-03 当前路线仍待正式迁移和完整验收。

2026-09-24，P00-03，main / 071d15c5c45db4e91d232a4d26db7904061bc89b + 未提交改动。继续用户已批准的新方案，不切阶段。

## 本轮实现与真实系统变更

- 新增 account_setup/network/token/journal/broker 原生模块，账户 CLI、NativeAccountExecutor 和真实 Node/Python/OfficeWorker 测试。锁定 Rust/SDK/CRT 编译退出 0；实现不等于验收。
- 首次管理员初始化已真实创建两个带 TapKit 标识的 tk_sb_ 专用账户及八条持久 WFP BLOCK 规则（每账户 IPv4/IPv6 CONNECT/RECV_ACCEPT）。既有 test 账户未复用或修改。
- 配置存于 ProgramData/TapKit-Sandbox-v1 下的宿主 SID 目录，由管理员持有，宿主只读；随机密码仅经机器 DPAPI 密文持久化，明文不进 argv/环境/日志/仓库。不得复制含凭据的 setup.json 到证据目录。
- 受限令牌关闭危险权限和交互 logon SID；工作进程使用私有 window station/desktop。ACL 变更先写日志并记录文件身份，Job 关闭杀树；这些安全分支尚需实际验收。

## 实测与问题

- account-before-setup.json：4 项，CLI 1 通过，3 项以 ACCOUNT_SETUP_REQUIRED 失败，符合未初始化时拒绝执行。
- account-setup-20260924.log：管理员初始化退出 0，2 账户 / 8 规则 / ready=true。
- account-node-first.json：Node 执行在 wfp.get:0x00000005 失败，负载未启动。原因是宿主 WFP 读取权限常量用错；后续修正为 FWPM_ACTRL_READ。
- 已有规则 DACL 修复先遇到 FWP_E_TXN_IN_PROGRESS，再遇到 FWP_E_INVALID_FLAGS；日志 account-setup-readfix.log / account-setup-readfix-final.log 保留。已改为事务提交后仅设置 DACL_SECURITY_INFORMATION，规则不删除、不暂停。
- 最后一次修复启动被 Windows 返回“操作已被用户取消”，没有执行修复；account-setup-readfix-flags.log 未产生。随后普通账户 --account-status 仍退出 1 / wfp.get:0x00000005。已经发出 UAC 可用时间询问，未收到答复，不自动重复提权。
- 尚无新账户负载通过证据。旧 AppContainer / test 9/9 不迁移为新路径通过。

## 尚待验收及实现审查

账户令牌当前包含专用 restricting SID 与 ALL_RESTRICTED_APPLICATION_PACKAGES 基线 SID，以访问 Windows 运行库。必须增加系统外带该 SID ACL 的越界文件测试；不能把系统外广泛读取算授权。嵌套 junction/hardlink 仍须强化。初始化部分失败重试已实现，卸载回滚、并发租约、硬杀恢复尚未证明。

## 本轮最终本地验证

- 路径校验已前移到凭据读取、租约/日志及 ACL 变更之前，句柄保持到执行结束；拒绝 workspace 与 runtime/input/helper 目录重叠，校验目录/文件类型。
- 已收紧 worker 消息先后顺序、重复结束事件和退出码校验；stderr 持续有界排空，防止缓冲区填满导致等待。
- 锁定工具链 helper-build=0；pnpm check=0；pnpm build=0；pnpm docs:check=0；git diff --check=0（仅现有 CRLF 提示）。rustfmt 首次因 DLL 搜索路径退出 -1073741515，加入锁定 rustc/bin 后成功格式化并重新构建。
- pnpm test:unit：15/15，退出 0，account-backend-unit.json。
- 基础集成 P00-01/P00-02/P00-03.capability/P00-03.git-broker：29/29，退出 0，account-backend-integration.json。
- 原生账户 CLI 与路径拒绝选择运行：2/2 通过，退出 0，account-validation.json；报告总计 5 项，其中 Node/Python/Office 3 项是本次过滤未运行，绝不算全量通过。路径用例实测五种重叠/别名输入，均在设置账户权限前失败。
- 最终 helper SHA256：320465fa0e973ba0a56e756e8b9d4573b5ced4f32fe6bafd78973ee9d6370e96。早期初始化和 Node 失败报告使用此前构建，保留原报告而不冒称绑定最终字节。最终只复验了 CLI/路径拒绝。

接续先确认用户方便处理 UAC，再对同一个 owner SID 执行已编译的 --account-setup（已有配置路径只校验并修复自己规则的读取 DACL），随后用普通 --account-status 验证。不要重新创建账户、关闭网络规则或反复运行旧 Office 路径。成功后先单独跑 account Node，再做其余真实安全验收。仍有上述代码安全缺口，不能把 P00 未完成单纯归因于 UAC。

完整网络（含回环正向对照）、进程/内存/输出限额、取消、ConPTY、Office 三格式/中文/恶意样本、Git 私有目录跨账户与独立标准用户全量均待完成。能力维持 failed，P00-gate failed，不能标为仅缺 live 资源。

Microsoft 依据：[WFP access control](https://learn.microsoft.com/en-us/windows/win32/fwp/access-control)、[FwpmFilterSetSecurityInfoByKey0](https://learn.microsoft.com/en-us/windows/win32/api/fwpmu/nf-fwpmu-fwpmfiltersetsecurityinfobykey0)。实现参考来源仍按 ADR 0007 关联的固定源码清单审计。
