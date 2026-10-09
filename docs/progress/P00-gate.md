# P00 阶段交付与验收记录

## 2026-10-06 当前收口

gate_status：passed；21d3924的PR CI37348464103和push CI37348457242均完整success，check及startup-diagnostics通过。归档11362432951确认unit230/integration165/Electron8、独立标准用户22/22无missing、macro与links各三轮全部通过；启用对照mainThread=true/Hidden=false，实际A1=TK_MACRO_EXECUTED，默认阻断PDF/标记文件缺失及源hash断言同时通过。P00-03=implemented_and_verified、P00-gate=passed仅对应该源码；本机unsigned helper仍拒绝，不转植报告、不绕过策略。新P03 worker须单独原生验收。证据docs/evidence/P03-01/macro-control-repair-2026-10-06.json。

## 2026-10-06 当前候选未过

gate_status：failed；d4fd451的PR CI37344605352与push CI37344599460均失败：宏对照mainThread=true但A1仍TK_MACRO_BLOCKED，管理员154/155、标准用户21/22、macro三轮0/3，links三轮3/3。已下载两轮日志并记录SHA。锁定LO源码确认Hidden文档跳过OnLoad通知；第二候选仅测试侧改Hidden=false及有界事件处理，不直接调用宏，生产禁宏与原限时不变；静态检查退出0，真实效果待新CI。 原生依赖不得验收。

## 2026-10-06 宏候选验证

gate_status：failed；2026-10-06 PR CI37324850125详细归档确认：默认禁宏通过，启用对照正常exit0/activeProcesses0，但PDF仍TK_MACRO_BLOCKED。测试侧候选改UNO主循环及MacroExecutionMode=4，保留生产禁宏/Job/无网络及原限时；三轮诊断覆盖macro和links，原完整管理员/标准用户用例仍执行。两模式生成Python仅语法、PowerShell AST、node --check、TypeScript和pnpm check退出0，真实候选效果待新CI。证据docs/evidence/P03-01/macro-control-repair-2026-10-06.json。

## 2026-10-06 当前门禁

gate_status：failed；2026-10-06 当前复验：P03首提交c39446b已push并建Draft PR#6；同提交push CI37324723679成功，但PR CI37324850125标准用户21/22，唯一宏阻断启用对照失败，其余步骤/Office三轮/startup通过。详细失败待归档报告核查，不能用成功轮覆盖失败。P00-03=in_progress、P00-gate=failed重新接续；本机安全策略未改。证据docs/evidence/P03-01/checkpoint-2026-10-06.json。 P03安全独立部分可继续实施，原生依赖不得验收。

## 2026-10-05 当前门禁收口

gate_status：passed；2026-10-05 P03前置复核：origin/main cc3d60f9691455ab62e5200273e0a813a45797cc的CI37320656771完整通过，管理员unit227/integration155、P00 Electron8、独立标准用户无missing、三轮Office及启动诊断全部成功；核对其生产源码与e3d5d1f一致。旧Office回归已复验收口，P00-03=implemented_and_verified、P00-gate=passed；本机unsigned helper应用控制仍拒绝，不复制远程报告开启本机能力。证据：docs/evidence/P03-01/dependency-preflight-2026-10-05.json。

本轮只核验并收口既有安全依赖，不修改helper/隔离/能力开启规则；后续P03生产解析仍必须通过指纹绑定的目标主机probe与实际CI验收。下方failed为旧回归历史。

## 2026-10-05 门禁核对

gate_status：failed；P00-03=in_progress。候选修复eedec5d已推送并包含于当前分支，最新CI结果本次读取未成功，尚缺已核实的修复后完整安全验收。旧CI54/46成功及CI56中途快照均不代表当前验收。具体卡点和建议在聊天回复。

## 当前CI55回归门禁

2026-10-02最新用户日志2通过1失败，第三轮启用对照PDF为0。测试侧同步刷新/导出前检查候选修复只有本地静态与单元验证，真实CI及旧退出超时未收口；gate继续failed。见docs/evidence/P00-03/office-link-ci-diagnosis.md。

CI56仅诊断、截至本检查点管理员集成及Build/Electron步骤通过，其他验收尚在运行。保留当前failed门禁；接续在原check内进行三轮新进程外链定向复验，任何失败均不得计为通过。

gate_status：failed；P00-03=in_progress，当前完整验收2/37。2026-10-02 CI55回归：压缩提交0294585的bootstrap/check通过；unit31/31、integration45/46、Electron8/8、独立标准用户22/22、三轮启动诊断通过。唯一失败为Office外链启用对照在control_destroyed之后未结束，120秒Job超时；原建库/凭据超时未复现。新增仅测试侧Python线程栈和loop/worker退出阶段诊断，根因待新CI；不改生产worker/隔离/原限时，不合并main。 证据docs/evidence/P00-03/ci-run55.json。下方原收口和CI54按历史保留，不能覆盖当前失败。

## 2026-10-02 main合并后回归复验

诊断分支`codex/diagnose-main-ci` / 代码`7214ae0c5ca54ec87e0b6b14729424f84f9ac9f2`的[CI54](private-archive:TapKit)全success。CI54全success：bootstrap/check/build退出0，unit31/31（原17项加下载14项）、管理员integration46/46、完整P00 Electron8/8、独立medium/non-admin标准用户22/22，failed/pending/missing均0、三项能力available；新runner三轮首次建库/真实凭据用例全部通过。 版本/原hash/核心安全与业务语义保留；本次下载容错及冷缓存/命中路径均实测通过。CI49的25/73秒超时未复现、底层原因仍未确认；保留脱敏阶段诊断，未按猜测修改SQLite/DPAPI/隔离业务逻辑或扩大原15/45秒预算。 阶段仍passed、已验收3/37；不启动P01或自动合并main。最终证据`docs/evidence/P00-02/main-ci54.json`，修复摘要`docs/evidence/P00-02/main-ci-repair.md`。下方原run46门禁按历史保留。

## 当前阶段验收（2026-10-02）

- 阶段/执行：P00 / 本次P00-03接续会话；gate_status：passed；已验收3/3个阶段任务，整体3/37。
- 代码HEAD：`b901ef7ec788bcfcec772adcfc564974ab64f32b`，分支fix/corrected-appcontainer-isolation。代码提交时clean，收口dirty仅进度和合成验收产物，之后独立skip-ci文档提交。
- 环境：GitHub windows-2025干净checkout；精确runtime-lock/native-lock、Node24.21.0/pnpm12.4.1；管理员runner及临时独立medium/non-admin标准用户。

## 本阶段交付物

| 交付要求                                        | 实际入口/文件                                                                      | 任务   | 实现状态                 | 验收证据                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | ------ | ------------------------ | ---------------------------------------------------------- |
| monorepo与精确依赖/运行库锁、启动/构建/检查脚本 | runtime-lock/native-lock/pnpm-lock；scripts/bootstrap/check/build                  | P00-01 | implemented_and_verified | 原任务交接；run46干净bootstrap/check/build                 |
| SQLite/IPC/Vault/jobs/blob基础与Electron壳      | packages/storage/contracts/core；Host/preload；migrations                          | P00-02 | implemented_and_verified | 本轮真实基础integration、unit及P00 Electron8/8；原任务交接 |
| Windows helper和运行组件                        | native/windows-helper；packages/tools/src/execution；GitBroker/OfficeWorker/ConPTY | P00-03 | implemented_and_verified | 管理员46/46、标准用户22/22；ci-run46.json                  |
| 兼容与安全报告                                  | docs/evidence/runtime-compatibility.md；字节指纹probe；合成PDF预览                 | P00-03 | implemented_and_verified | 三能力available/无missing；宏外链真实对照；office-render   |

## 演示与检查步骤

按锁定入口bootstrap→check→unit/integration→build→Electron P00-01/P00-02，随后CI标准用户harness复制私有源码/依赖/运行库并调用22项probe。全部步骤退出0。实际命令、起止时间、源码SHA、artifact/job日志SHA256和每项标准用户结果见`docs/evidence/P00-03/ci-run46.json`。

组合链已闭合：新checkout按锁安装及原生模块加载→真实中文Electron壳/Core/SQLite/DPAPI/IPC/jobs/blob回归→受限Node/Python child、ConPTY与DOCX/XLSX/PPTX中文PDF。正常PDF可解析/渲染且原件不变。

## 门禁结果

- 任务级检查：check/build=0，unit17/17，integration46/46，P00 Electron8/8，标准用户22/22（0失败/0跳过）。纯基础P00-03使用同标签真实integration覆盖，未伪造额外P00-03 UI或live调用。
- 原生权限/网络/数据保全：最小ACL、只读runtime/input、私密DATA/secrets拒绝、DACL攻击拒绝、公网/活跃回环/元数据拒绝、路径别名/reparse拒绝；全部在真实Windows执行。
- 生命周期/异常：Job树取消、超时/内存/fork/输出限制、并发独立SID、硬杀租约恢复、Office记录映射精确恢复、损坏文档失败后正常转换；真实宏和外链有效性对照均在同AppContainer边界运行。
- 覆盖：P00-03四个ENG需求已逐行绑定源码和T07/T08/T19/T21的本任务相关证据；CURRENT/INDEX/requirements/RESOURCES及任务记录同步。P00-01/P00-02既有交接保留，本轮组合回归通过。后续文件业务UI与安装/升级/卸载按对应任务验收，不以本轮基础能力替代。
- 资源：R09本轮真实标准用户确认；P00合成fixture足够，R08后续业务资料与R01等模型渠道仍按后续任务准备。无P00必需live资源欠缺。
- 主机限制：本机应用控制拒绝unsigned helper和protected acl-probe的本地Prettier EPERM保留；没有绕过，CI全量真实通过。当前主机能力仍按本机probe失败关闭。签名/安装交付不提前实现。

## 下一阶段边界

已验证contracts/存储/IPC/Vault/jobs与受限运行组件可供后续按权限契约接入；新目标Windows必须重跑指纹绑定probe，不能复用不同主机报告或降级成普通spawn。本次只完成P00，不启动P01，不添加业务聊天/服务器/媒体/插件。后续任务等待用户指定。

## 历史检查点（以下保留当时状态）

> **2026-09-30 当前 gate 检查点（承接旧方案优化）**：P00-03 的生产执行器/helper/OfficeWorker 已迁到 AppContainer + Job + 最小 ACL + 无网络 capability、LOKit 转换；Git 走可信 GitBroker。旧账户/WFP 源码已移除。`helper:build`、`check`、`build`、unit 15/15、GitBroker/capability integration 5/5 通过。本机 Windows 应用控制策略拦截未签名 helper，真实 sandbox/Office integration 未进入业务代码；严格 fork 上限断言尚待 CI。硬杀恢复、并发租约、宏/外链及独立标准用户当前路线全量验收未完成。`gate_status=failed`、已验收任务 2/3；下方更早 gate 记录保留为历史，不代表当前验收。

2026-09-25 团队交接：保存未完成检查点，gate_status=failed、已验收2/3不变。原生系统读取和完整隔离验收未通过，后续方案待用户决定。本次仅整理文档并提交，check/docs:check均退出0，未重跑会修改账户/ACL/WFP的原生测试。接手见 docs/evidence/P00-03/team-handoff.md；以下各轮记录保留历史，不视作阶段收口。

最新：UAC修复与普通status均已成功。新账户全文件5项2通过3失败（0跳过），失败由系统读取预检定位KnownDlls/Kernel32拒绝；不能以初始化ready替代能力可用。本轮check/build=0、unit15/15、基础integration29/29；抽查78路径权限/恢复日志无残留。系统只读适配及完整安全/Office/独立标准用户仍缺，gate=failed。证据 docs/evidence/P00-03/account-after-uac.md；下文UAC等待为历史。

本轮结束验证：check/build/docs=0、unit15/15、基础integration29/29、账户入口选择运行2/2；新账户负载无通过证据。WFP 读取权限修复的 UAC 被取消，仍需实际修复；系统读取基线、链接、完整网络/恢复/标准用户也未验收。仍为 failed，不放行安全依赖。

最新检查点：原生账户后端已编译，管理员初始化已创建 2 个专用账户 / 8 条 WFP 阻断规则；Node 首测在规则读取权限校验处失败。尚无新路径负载及完整安全通过证据，gate_status=failed、已验收 2/3 不变。见 docs/evidence/P00-03/account-backend-checkpoint.md。下文“尚未实现”属于先前检查点。

2026-09-24 更新：ADR 0007 已获用户采纳。P00 GitBroker 固定操作真实 4 项通过，OfficeWorker 接口及旧报告拒绝通过；check/build 退出 0、unit 15/15、相关 integration 29/29。**专用账户原生后端尚未实现**，初始化/凭据/令牌/ACL/内核网络规则/恢复及新路径标准用户验收仍缺；这不是仅缺 live 凭据。gate_status 仍为 failed，已验收 2/3，不切换阶段。证据 docs/evidence/P00-03/adr0007-implementation.md；以下旧路径结果保留历史。

- 日期：2026-09-17；执行：本次 P00-03 会话。
- 源码：D:/TapKit / main / 071d15c5c45db4e91d232a4d26db7904061bc89b + 未提交 P00-03 改动。
- gate_status：failed。已验收 2/3 个阶段任务；本次未切换下一阶段。

## 阶段交付

| 要求                  | 实际交付                                                           | 状态/证据                                                               |
| --------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| monorepo、锁、脚本    | P00-01 原有底座；增加 helper 构建及官方 SDK/CRT 锁                 | 构建通过；docs/evidence/P00-03/final-results.json                       |
| SQLite/IPC/Vault/jobs | P00-02 原实现；Core 增加失败能力 DTO                               | 原有验收保留；本次基础集成 25/25                                        |
| helper/运行组件       | native/windows-helper、packages/tools/src/execution、runtime probe | 本机部分通过；Office/Git 失败                                           |
| 兼容报告              | docs/evidence/runtime-compatibility.md                             | 明确当前错误和缺口                                                      |
| 标准用户组合链        | scripts/standard-user-test.mjs                                     | test 修补后 standardUser=true、Core/沙箱 9/9、退出 0；Office/Git 仍失败 |

## 门禁结果

check/build/unit 与既有数据/IPC 集成有真实运行证据；Electron P00-01/P00-02 的本次早期回归 8/8 通过，记录在 docs/evidence/P00-03/early-results.json。新的 helper 尚未在独立标准账户通过全套测试。DOCX/XLSX/PPTX→PDF 链在转换步骤失败；MinGit status/diff 在工作目录规范化失败。P00 要求的跨任务组合链未闭合，不能标 passed 或 engineering_passed_external_pending。

两次中断探测遗留的专用 ACL/profile 清理最初被自动审批拒绝；用户随后明确授权，已清理并核验，证据见 P00-03 交接。异常退出后的自动恢复仍是实现缺口。

## 后续边界

修复责任任务仍是 P00-03。test 账户 Core/沙箱修补报告已收到；接续修复 Git/Office、完成异常退出与安全补测，再重跑 gate。P03-01/P06-02/P09-02 不得依赖未通过的原生隔离。P00-02 已验证接口仍有效；本次没有启动 P01。CURRENT、INDEX、P00-03、requirements.csv、RESOURCES 同步记录实际缺口。

Office 弹窗后续定位：已用当前 sal3.dll 复现其内部管道在 AppContainer 返回 Win32 5，宿主对照与容器 LOCAL 管道成功；见 docs/evidence/P00-03/office-ipc-probe.json。此为失败原因的进一步证据，不改变 failed 门禁。test 的 9 项 Core/沙箱修补回归已回传通过，证据 docs/evidence/P00-03/standard-user-repair-reported.json；两个修补文件哈希与当前源码一致。完整门禁仍未通过。

2026-09-18T08:14:41.722Z 补充：Office/Git 已找到并实验验证兼容方案，见 docs/evidence/P00-03/compat-experiments-review.md。生产执行路径、标准用户全量及异常恢复仍未完成；不以实验替代阶段收口，gate 保持 failed。
