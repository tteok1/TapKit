# P00-03 团队交接检查点

> **路线更新（2026-09-30；本交接中的“当前结论/接手顺序”已被优化方案取代）**：本记录反映 2026-09-25 的专用账户路线和账户测试状态。现在按 AppContainer 承担 Node/Python/终端/Office 隔离、Git 使用可信 GitBroker、Office 集成 LibreOfficeKit 的路线继续；无需按下文初始化账户/WFP。下文原样保留作历史证据，实际接续以 docs/progress/CURRENT.md 和 docs/progress/P00-03.md 顶部补丁为准。

2026-09-24开始整理，2026-09-25（北京时间）完成交接核验。用户要求将本任务变更提交远程，交由团队接续；尚未决定进一步如何调整 P00-03。本次只整理文档、核验和提交，不继续原生实现或启动后续任务。

## 当前结论

- P00-03=in_progress；P00-gate=failed；项目真实验收2/37。它是未完成代码检查点，不是可用隔离能力的发布。
- 已采纳的设计及变更原因见 docs/adr/0007-windows-execution-boundaries.md。Git走可信GitBroker，Office/脚本走专用低权限账户、受限令牌、ACL、Job和WFP。旧AppContainer实验保留审计，不作为当前路线通过证据。
- GitBroker固定status/diff真实4项通过；OfficeWorker和NativeAccountExecutor接口已落地。最新单测15/15、基础集成29/29、check/build退出0。
- 当前原生账户完整测试文件5项：2通过、3失败、0跳过、退出1。最终令牌不能读取KnownDlls/Kernel32系统对象和文件；Node/Python/Office均在系统读取预检拒绝，Office新路径三格式转换尚未运行。不是缺账号或等待UAC。
- 上述实际证据见 account-after-uac.md、account-after-uac-validation.json及其引用报告。旧test账户Core/AppContainer子集9/9不能移作新路线证明。

## 接手顺序

1. 先读根AGENTS.md、docs/progress/CURRENT.md、INDEX.md和P00-03.md，核对本地分支/HEAD/未提交改动；按docs/plan/16-reading-map.md的P00-03行读取最小规格。开发基线为071d15c5c45db4e91d232a4d26db7904061bc89b，本次检查点版本由git log确定。
2. 与用户确认进一步方案后，设计最小系统只读访问及重启生命周期；区分共享映像对象、系统库文件和可能的注册表/字体依赖。现有探针不能证明这三处是全部失败原因。不得自行扩大到Everyone/Users或仅限制写入来使测试变绿；安全边界变化需先确认并记录ADR。
3. 完成Node/Python/Office实际运行后，继续越界/链接/网络正向对照、并发租约、取消/限额/ConPTY、硬杀恢复、Git私有根跨账户、Office中文和恶意样本、独立标准用户全量。安全未通过前能力保持failed，不放行依赖P00-03安全能力的任务。
4. 本次没有开始后续任务。若用户另行安排后续工作，按01-timeline.md实际依赖选择；不得把P00-03当已完成，也不得自动跨阶段。

## 环境与系统变更边界

- Git只交接源码、锁文件、规格、测试和证据；不包含.runtime、.cache、node_modules、测试工作目录、执行账户凭据或系统配置。按仓库bootstrap恢复锁定开发环境；不要将原开发机绝对路径视作新机器路径。
- 原开发机此前已创建2个专用执行账户和8条WFP阻断规则，它们是持续存在的本机配置，不因推送而撤销，也不会随clone迁移。普通account-status的ready仅代表初始化状态，不代表负载运行成功。
- ProgramData中的账户配置含受保护凭据，禁止拷入Git、证据或团队聊天。原开发机test为人工验收账户，不得改成产品执行账户，也不需索取其密码。
- 先前选定78路径的临时ACE残留和恢复JSON日志检查为0；不是全系统递归审计或硬杀恢复通过。本次交接没有运行账户初始化、改ACL/WFP、改PowerShell执行策略或改UAC设置。接手时不得自动重复初始化或放宽系统权限。
- runtime-probe和standard-user-test默认仍拒绝未就绪的新后端；显式legacy诊断不能开启能力。执行会修改系统状态的原生验收前需明确测试环境和相应授权。

## 本次交接核验

仓库目录D:/TapKit，分支main；整理前已fetch确认origin/main与开发基线一致。本次仅补交接文档和四条P00-03需求记录的交接说明，未改实现。3个既有报告和最新记录中的8个Rust源文件均与account-after-uac-validation.json的SHA256匹配。pnpm check、pnpm docs:check均退出0；本次命令和结果记录在team-handoff-checks.json。未重跑原生账户测试，不将其历史失败改为通过。

既有证据的SHA256对应测试时工作区原始字节，Git的LF规范化可能改变换行；team-handoff-checks.json另存同批文件LF规范化后的SHA256，供克隆后核对。四张待提交PNG均为测试样本或TapKit测试界面，不含用户桌面照片；文本凭据特征扫描未发现真实密钥，唯一authorization候选为用户授权清理的文字记录。运行时二进制和ProgramData凭据配置不在提交范围。

恢复锁定依赖后，在仓库根目录可运行pnpm check和pnpm docs:check。完整原生验收与基础检查是不同范围；不能将check通过视作隔离安全通过。
