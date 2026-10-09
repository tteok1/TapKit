# P00-03 历史检查点归档

2026-10-02将重复散布在进度表、任务交接和验收快照中的历史段落合并至此。保留原记录、当时的假设、失败和纠正；它们不代表当前状态。当前结果见repair-summary.md和docs/progress/P00-03.md。此前本地.cache路径为临时诊断副本，已清理；正式实验源码和原始证据仍保留于docs/evidence/P00-03。

## 原任务交接历史

2026-10-02 已推送PDF归档修复`b901ef7ec788bcfcec772adcfc564974ab64f32b`，[run46](private-archive:TapKit)验收中。run45各项真实通过，当前待新CI确认七份管理员及七份标准用户PDF归档，并完成同次运行中文渲染审阅；P00-03仍in_progress、gate=failed、2/37，不启动P01。

## 2026-10-02 run45全通过，修复PDF归档链路待收口

a4ddd9c的run45全success：bootstrap/check/build退出0，unit17/17、管理员integration46/46、完整P00 Electron8/8、独立medium/non-admin标准用户22/22，无失败/跳过/missingCases，nativeExecution/officeRender/terminal全部available。两个身份的宏/外链behavior记录均真实成功，原件不变；PyUNO引用释放前移与原5秒join已经验证。

本轮artifact实际不含PDF：Playwright outputDir为整个test-results，启动时清空先前Office产物；标准用户私有kit的PDF也未收集。为保证同轮中文视觉及可审阅产物，现只把E2E输出移到test-results/e2e，并在CI finally限定收集七份合成PDF（单文件5MiB上限），不变生产执行/Job/ACL/测试断言。待新完整CI确认PDF归档和视觉，再同步P00 gate。当前status：in_progress，gate=failed；真实通过证据`docs/evidence/P00-03/ci-run45.json`。本机仍不执行受应用控制拦截的helper。

## 2026-10-01 修复a4ddd9c已推送，run45验收中

a4ddd9cfe104ff30de403db8abb57a847068ea8f已推送并触发[run45](private-archive:TapKit)。本地TS、嵌入Python仅编译、docs/格式/diff检查退出0；等待真实引用生命周期效果、外链PDF最终断言及独立标准用户22项。status：in_progress，gate=failed，不切阶段。

## 2026-10-01 run44：宏对照完整通过，修复外链对照引用释放顺序

3fb60e3的run44 check/unit17/17通过，管理员integration45/46。映射精确清理修复通过；真实宏默认PDF保留TK_MACRO_BLOCKED、无文件标记，启用对照PDF变为TK_MACRO_EXECUTED且文件标记存在，原件不变。外链对照实际完成TK_LINK_UPDATED/20929 bytes PDF/close/destroy，但30秒join仍存活；30秒实验排除仅仅导出较慢，不能作为修复。

锁定版PyUNO_del会在Python析构时释放native引用。对照函数的component/Desktop/Context仍活过LOK销毁，现先清空三者再销毁kit，并新增references_released阶段，恢复原5秒join。该因果修复仍待真实CI；不改变生产worker、Job/ACL和宏/外链成功断言。本地TS及嵌入Python仅编译通过，没有执行本机helper。status：in_progress，gate=failed，标准用户未执行；详见`docs/evidence/P00-03/ci-run44.json`、`office-security-plan.md`。

## 2026-10-01 修复3fb60e3已推送，run44验收中

3fb60e3ad7dd9f344ab23679255fde05440d9bfa已推送并触发[run44](private-archive:TapKit)。本地unit17/17、TS、PowerShell AST、嵌入Python仅编译、docs和diff检查退出0；ESLint不匹配该TS测试文件配置，只记ignored，TS及干净CI负责检查。等待真实对照与完整标准用户，status：in_progress，gate=failed。

## 2026-10-01 run43：两个对照清理错误，外链线程退出待验证

check、unit17/17通过；管理员integration44/46，Electron/标准用户跳过。三格式转换与损坏输入失败后恢复通过，三份PDF实际解析/渲染并查看，中文字形正常。两个Office对照的finally都因PowerShell函数返回单元素字符串后`targets[0]`取首字符而误报映射身份改变；已用数组表达式接收，保留精确身份校验和撤销。局部标量/数组对照已实际复现该差异，没有在本机执行helper。

外链对照原生输出已读到TK_LINK_UPDATED，但worker.join(5)后仍存活并退出1；宏对照原生exit0，但清理遮蔽返回，尚不能证明最终PDF/标记断言通过。查锁定版LOK runLoop/lo_destroy和官方线程说明后，为测试副本增加control_saved/closed/destroyed记录及30秒完成预算；这是假设验证，未声称根因已确定，不改生产worker和120秒Job上限。等待新CI严格断言。status：in_progress，gate=failed。证据`docs/evidence/P00-03/ci-run43.json`及`office-security-plan.md`。

## 2026-10-01 修复2f46c90已推送，run43验收中

Git推送短暂网络超时后恢复，2f46c90f5a6ddc1b5663ccb63eea1830ef295f30已触发[run43](private-archive:TapKit)。等待真实Office宏/外链对照、完整标准用户和PDF中文视觉核验。status：in_progress，gate=failed；不以旧基线替代本轮。

## 2026-10-01 run42：新增PDF unit冷启动超时，修复待再次CI

405aef6的run42 bootstrap/check通过，unit16/17；PDF用例首次加载依赖超过Vitest默认5000ms，integration/Build/Electron/标准用户均未执行。仅为该用例设置30秒预算，本地定向1/1通过；保留真实PDF文本与清理断言，不修改原生执行限额。没有新原生结果，status：in_progress，gate=failed。日志/产物指纹与空的新原生记录见`docs/evidence/P00-03/ci-run42.json`。

## 2026-10-01 修复405aef6已推送，run42验收中

已推送并核对405aef688dd5a8bc4463246c4baaee0066849bf5；[run42](private-archive:TapKit)正在运行。本地锁定Node24.21.0下unit17/17、TypeScript与定向格式检查退出0，docs:check和diff通过。原生/Office/标准用户及PDF中文视觉仍待该轮实际结果，不以旧f0bf4bd全绿替代。

## 2026-10-01 run41失败定位：新增PDF清理API误用，已修复待重跑

9e8e603的run41 bootstrap/check通过、unit16/16、integration42/46；四项Office用例在pdfjs解析finally调用不存在的document.destroy时失败，宏/外链启用对照尚未执行，Build/Electron/标准用户跳过。已按锁定包及官方API改为loading.destroy，并加真实最小PDF单元测试，本地1/1通过。样本OnLoad绑定根据锁定版事件表改为dom:load，标记用任务USERPROFILE避开TEMP重定向；映射测试使用CI已采用的pwsh，不更改本地脚本策略。

本地PowerShell5.1映射元数据测试被脚本策略拒绝，未创建映射、未运行helper；不以它作验收。CI损坏文档实际timeout后activeProcesses0，下一合法DOCXexit0，仍待最终PDF断言。后续正常/宏/外链合成PDF随test-results归档，完成中文视觉核验。失败证据仅取artifact中本次新追加jsonl行，见`docs/evidence/P00-03/ci-run41.json`。status：in_progress，gate=failed；详细来源和修复见`office-security-plan.md`。

## 2026-10-01 Office安全行为补测待CI

本轮核实锁定LibreOffice官方schema发现原外链策略0表示始终更新，现修正为Calc=1/Writer=2。现有LOK加载默认NO_UPDATE是额外保护，不替代修正profile错误。新增可执行OnLoad宏（以允许扩展名进入内容探测）、真实OOXML外部工作簿公式、相同AppContainer内的启用/FULL_UPDATE对照；测试必须证明样本有效而正式路由阻断。另补损坏文档失败后正常转换、PDF中文解析，验收测试与fixture加入能力报告fingerprint。未扩展产品参数和隔离权限。

本地TypeScript/ESLint=0、unit16/16及GitBroker/capability5/5=0；PowerShell AST通过、三份合成fixture实际生成。完整check仍被既有受保护acl-probe的Prettier递归EPERM阻断=1，不修改其权限；以干净CI完成全量检查。原生/Office/标准用户结果待新CI，status：in_progress，P00-gate=failed。方案与权威来源见`docs/evidence/P00-03/office-security-plan.md`。

## 2026-10-01 CI run40全通过：管理员44/44、独立标准用户20/20

传播修复`f0bf4bd395479f7b24192abc68070314f6a4d554`已推送现有分支。[run40](private-archive:TapKit)最终success：check、unit16/16、管理员integration44/44、Build/Electron2/2、独立medium/non-admin标准用户20/20全部通过。nativeExecution/officeRender/terminal均available，missingCases为空。artifact SHA256、job日志指纹、各用例状态及关键事件摘要见`docs/evidence/P00-03/ci-run40.json`。

**因果验证：**run39标准用户根已有profile读执行ACE但exe为空；为临时宿主账户补齐runtime既有子文件WRITE_DAC后，run40 Node/Python/Office exe均出现继承的本profile allow ACE（mask1179817/flags16），三类此前失败路径同时恢复。AppContainer授予掩码、Job限额、零网络capability保持原值。真实Python负载两次尝试NULL DACL替换均拒绝5，child创建并退出0、输出42；memory ready后实际分配251658240 bytes（240MiB）并捕获MemoryError、退出23；fork两名child ready后触发process_limit，总/峰值5、最终activeProcesses0。三格式Office均exit0且清理完成。硬杀恢复、取消、并发隔离及ConPTY等既有断言也通过。

已解决本轮管理员回归、标准用户ACL传播及采集/内存假通过问题。P00-03整体仍`in_progress`、P00-gate仍`failed`，不切阶段：恶意宏、真实外链文档行为验证尚缺，当前宏/外链策略送达用例不替代它。本机未运行受Windows应用控制拦截的unsigned helper。下一步在当前路线补充这些真实安全fixture及行为证据，再按阶段交付要求收口。

收尾仅同步本轮结果和需求证据；文档提交使用`[skip ci]`避免为记录已完成CI而重复触发。代码验收对应的确切SHA为上述`f0bf4bd`，不把文档提交冒充新一次代码测试。文档/定向格式/diff检查结果随本次收尾记录。

## 2026-10-01 CI run39：清理前证据确认子文件未继承，修复私有副本DACL操作权限

[run39](private-archive:TapKit)（`0dcbbb2`）check、unit16/16、管理员integration44/44、Build/Electron2/2通过。标准用户12/20；新增失败是严格memory用例正确拒绝0xC0000022且无ready的Python启动失败，原来的7项失败仍在。runtime-acl自复制已修复，launcher与helper日志已归档。指纹和逐运行库before-resume证据见`docs/evidence/P00-03/ci-run39.json`。

**已证实的差异：**管理员Node/Python/Office的根目录profile ACE为allow/1179817/flags3，exe继承ACE为allow/1179817/flags16；标准用户根目录同样已授予，exe的本profile ACE为空。采集在ResumeThread前完成，排除了负载快速退出后的清理竞态。原harness只给runner创建的副本根WRITE_DAC，子文件只有Modify；管理员可传播，标准用户没有相同的子文件DACL操作权。该差异足以制定限定范围的传播修复实验，最终因果效果仍以下一轮CI验证。

修复为现有三个私有runtime副本的标准**宿主测试账户**WRITE_DAC grant增加`/T`，同时检查解析后的根路径位于独占destination/.runtime下。该权限只控制DACL授予/回收；不增加AppContainer ACE权限、网络capability或Job限额。Microsoft文档说明用户与AppContainer权限按交集决定，见JSON中的原始链接。Python真实负载新增对runtime exe和只读input执行NULL DACL替换的攻击尝试，均必须返回ERROR_ACCESS_DENIED=5；继续验证child输出42。

本地TS、定向Prettier、PowerShell AST、UTF-8 Python负载仅语法编译和diff检查退出0；首次stdin编译因PowerShell编码失败，改为显式UTF-8缓存文件后编译通过。本机不运行隔离负载，所有新的真实权限/Office/标准用户结果待下一轮Windows CI。P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 CI run38：管理员基线恢复，标准用户13/20；修复采集与假通过

提交`089e230`的[run38](private-archive:TapKit)已结束：check、unit16/16、管理员integration44/44、Build/Electron2/2成功；独立标准用户13/20，仍为Node child EPERM、Python负载0xC0000022无输出、fork无ready child及Office无输出退出等7项失败。artifact和job日志指纹、失败名与有界事件摘要见`docs/evidence/P00-03/ci-run38.json`。

确定的采集错误：finally把已位于evidence目录的`runtime-acl.json`复制到自身，抛出Copy-Item错误，遮蔽原测试错误并中断launcher/helper日志归档。现移除这一冗余copy。同步`icacls`采集发生在ResumeThread之后，快速失败的负载可能已完成清理；本轮快照缺少profile ACE不能证明活动授权未传播。现删除测试回调中的批量外部查询，改由helper在恢复线程前只读记录runtime根与exe的profile DACL权限；query错误仅作证据，不改变执行权限或退出判断。Microsoft GetNamedSecurityInfo/GetAce/SetSecurityInfo与libuv官方AppContainer管道修复资料见同一JSON；后者说明默认管道路径存在独立兼容问题，暂保留已通过的inherit stdio基线。

内存测试不再接受任意非零退出：要求Python负载ready、至少128MiB实际分配、MemoryError标记及专用退出23。本轮原有memory用例也以0xC0000022无输出结束却算pass，所以13/20不是可靠的内存验收。未为使测试通过而扩大ACL或降低限额。

本地锁定helper:build、TS、unit16/16、GitBroker/capability integration5/5、PowerShell AST、定向格式/边界/manifest检查退出0；本机不执行受应用控制拦截的unsigned helper。下一轮CI验证修复并对比before-resume根/子文件权限，之后才依据证据选择权限传播或启动环境修复。P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 回滚已推送，CI run38 管理员检查步骤恢复通过

按用户明确授权，提交 `089e23022e4942db8dd8e00961d88575c60595fc` 已推送 `origin/fix/corrected-appcontainer-isolation`，`git ls-remote`返回同SHA、退出0。新CI：[run38](private-archive:TapKit)，job110389595023。当前API步骤状态：bootstrap、check、unit/current-route integration成功；Build/Electron执行中，独立标准用户尚待执行。最终报告及标准用户原始ACL待artifact，暂不宣称标准用户通过。

补充纠正run37日志判断：同一artifact中两个不创建child的lease用例`first run`/`second run`均为`totalProcesses=2`、`peakActiveProcesses=2`。Node失败用例也是2，因此不能仅据此证明child已创建；此前相应推断撤回。后续区分创建/初始化/退出必须使用明确事件和ready证据。P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 恢复管理员 Node 测试基线，完整 CI 待验证

用户要求先将管理员测试回滚到此前通过状态，再继续排查标准用户。现仅撤回 run37 的 Node 同步管道诊断：将该边界用例恢复为 run36（`654f961`）的 `execFileSync(process.execPath, ..., {stdio: 'inherit'})` 及 child 输出断言。已逐字比较整个 Node 用例与 run36 一致；只读输入、runtime 写入拒绝、三类私密文件不可读、私有环境、输出文件和成功退出断言保留。AppContainer、Job、ACL 和其他诊断未改。

实际本地检查：锁定 Node/pnpm 的 `pnpm check` 退出1，仍因既有 ignored `.test-data/acl-probe` 的 EPERM；此前 TypeScript/ESLint 已通过。`pnpm test:unit`16/16、`pnpm test:integration P00-03.git-broker P00-03.capability`5/5、定向 Prettier、边界和 manifest 检查退出0。命令、输出及源码指纹见 `docs/evidence/P00-03/admin-node-rollback.json` 和同目录 `20261001-admin-node-rollback-*.log`。

本机应用控制策略仍拦截 unsigned helper，未运行 sandbox/Office 原生集成，不以本地非原生检查宣称管理员44/44已恢复。补丁尚未提交/推送；下一步须由 Windows CI 验证管理员全量，再读取标准用户 ACL 和原始进程启动结果。标准用户最近结果仍为run36的13/20；内存用例目前只断言非零退出，存在把启动失败算作内存限制通过的缺口；`onStarted` 中同步批量`icacls`也可能拖延事件/取消，后续诊断应避免。P00-03=`in_progress`、P00-gate=`failed`，不切阶段。

## 2026-10-01 CI run 37：诊断探针让管理员 runner 的 Node sandbox 用例超时

CI run [36859768069](private-archive:TapKit), commit `c661043`：check 和 unit 16/16 通过；管理员 runner integration 43/44。失败发生在 `Node reads only input and writes workspace; runtime and input are read only; environment is private`，helper events 为 `status=timeout`、`exitCode=1`、`peakActiveProcesses=2`、`totalProcesses=2`，stdout 停在 child probe 输出之前，stderr 为空。进程数表明 AppContainer payload 已创建一个子进程；探针直到外层10秒超时也未返回 child 退出码/输出。fork 上限测试本轮仍达到 `process_limit`、总进程数5。

标准用户验收步骤因前置集成失败而跳过；因此本次没有标准用户副本 DACL 或活动 AppContainer ACL 新证据，run 36 的 13/20 通过、7/20 失败仍是最近一次标准用户结果。当前停止代码修改。可能的回归点是诊断把此前继承 stdio 的同步启动改为默认管道的 `spawnSync`；这是基于实现差异与日志的推断，尚未证实 child 为何一直未退出。Node 官方文档说明默认 stdio 是 pipe，`spawnSync` 会阻塞直到子进程退出；Windows `CreateProcessW` 文档说明 API 成功返回不代表 DLL 初始化完成，需结合进程退出码区分初始化失败。后续应先恢复与原测试一致的 stdio 行为，再用不改变句柄/stdio路径的 spawn 与 exit 事件记录启动结果，保留所有原断言和 ACL，不扩大授权。

本轮 run 37 artifact SHA256：`377e61fcf3c954e91697efd34438a165cc26996da02a0ab0f766cf509fbf466a`。本地 TypeScript、改动文件 Prettier、PowerShell AST、`git diff --check` 和 unit 16/16 通过；CI 中新增探针本身导致集成失败，不能把它视为诊断完成或隔离问题已定位。P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 CI run 36：已有日志仍不足以区分子进程创建失败与启动后退出

CI run [36838767685](private-archive:TapKit), commit `654f961`：check、unit 16/16、管理员 runner integration 44/44、Build/Electron 2/2 通过；独立标准用户 probe 20 项 13 通过、7 失败。Node 子进程记录为 `EPERM`，Python 子进程返回 `0xC0000022`，Office helper 以 exit code 1 结束且原始输出为空。fork 用例启动时 Job 上限为4、基线活跃进程为2、两个槽位都可用，但 child 启动数为0；因此该轮没有测到进程数上限是否生效。

本轮诊断补丁只增加测试采集，不改隔离方式、Job 上限或 ACL 授权。标准用户 CI 在 helper 启动前以 `Get-Acl` 记录临时 runtime 副本父目录、可执行文件及 Node/Python/LibreOffice 相关 DLL 的 DACL（SID、允许/拒绝、权限及继承标记）；helper `started` 后再对实际运行副本读取活动 ACL，并关联标准用户 SID 与本次 AppContainer SID。Node/Python/fork 探针分别记录创建是否成功、Win32/运行时错误字段、子进程退出码与输出；Job 配置和进程计数继续从 helper event 读取。日志只记录参数数量和安全的选项标志，不写完整测试脚本、任务参数或环境变量。

本地 TypeScript 检查、改动 TS 文件 Prettier、PowerShell AST、`git diff --check` 退出0；unit 16/16。未在本机运行受 Windows 应用控制拦截的 unsigned helper；本轮诊断改动待推送后由 Windows CI 验证。P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 CI run 35：标准用户探针启动，子进程/Office用例失败

CI run [36836475332](private-archive:TapKit), commit `cb22a29`：`check`、unit 16/16、管理员 runner 当前路由 integration 44/44（含 sandbox 11/11）、Build/Electron 2/2 均通过。标准用户夹具成功复制 kit、安装冻结依赖并确认 `standardUser=true`，完整 runtime-probe 实际运行；20 项中 13 通过、7 失败。

失败集中在 Node/Python 子进程启动及其依赖场景：Node 读写边界用例的末尾 child 导致 payload exitCode 1；硬杀用例未启动出后代；Python 子进程用例退出码 `3221225506`（`0xC0000022`）；取消用例因 payload 先退出而返回 `exited`；fork 限制用例在首个 spawn 上报 `EPERM`（准备容量为 2、实际启动 0 个）。Office 三格式转换返回 `OFFICE_EXECUTION_FAILED`，宏/外链 live 路由测试未收到预期的 finished 事件。通过的项目包括网络拒绝、路径/重解析点拒绝、并发运行、ConPTY、内存限制、GitBroker、capability 和旧协议拒绝。

当前证据把问题收敛到“标准用户启动的 AppContainer payload 在子进程/Office执行场景失败”，但还没有足够日志确认底层 Win32 拒绝码及 Office 的具体 helper 输出；不能据此放宽测试或宣布标准用户已通过。sandbox 与 Office 集成用例现都把 helper events 记录到 `native-cases.jsonl`；CI harness 再从限定的临时 `.test-data` 子树有界收集该文件及 helper stdout/stderr（每文件512 KiB、合计10 MiB），下一轮再依据原始事件区分产品路径与夹具访问问题。本机锁定 unit 16/16、TypeScript、PowerShell AST parse、`git diff --check` 均退出0；rustfmt 本地依赖 DLL 启动错误，本轮未完成 Rust 格式检查，也未关闭 Windows 安全策略或本机运行 unsigned helper。诊断收集变更尚未提交/推送。P00-03=`in_progress`、P00-gate=`failed`；真实恶意宏/外链行为验收仍缺。

## 2026-10-01 CI run 34：runtime-lock 读取发生在 kit 创建前

CI run [36833802663](private-archive:TapKit), commit `07d5b9a`：bootstrap、`check`、unit 16/16、当前路由 integration（P00-03 sandbox 11/11）及 Build/Electron P00-01 2/2 均通过。独立标准用户步骤因 `ci-standard-user-test.ps1:115` 读取尚未创建的临时 kit `runtime-lock.json` 而失败；脚本在此处退出，probe 没有启动，因此不能据此判断 runtime `WRITE_DAC` 修正的验收结果。

夹具现在调整为在 `standard-user-kit.mjs` 完成副本创建后，才从副本的锁文件解析精确 Node/Python/LibreOffice runtime 根并授予非继承 `(WDAC)`。本地锁定 Node/pnpm unit 16/16、`docs:check` 37 项、PowerShell AST 和 `git diff --check` 通过；系统默认 Node/pnpm 因版本低于仓库要求而拒绝运行，改用仓库锁定版本完成验证。此时序修复尚未推送、待下一轮 Windows CI；P00-03=`in_progress`、P00-gate=`failed`。恶意宏/真实外链内容行为验证仍缺。

## 2026-10-01 CI run 33：标准用户缺少修改临时 runtime 根 DACL 的权限

CI run [36831486054](private-archive:TapKit), commit `40e46fb`：unit 16/16、管理员 runner 当前路由 integration 44/44、Build/Electron 检查通过；P00-03 sandbox 11/11、Office 3/3。临时用户身份核验 `standardUser=true`，依赖副本安装成功；标准用户 probe 20 项中 6 通过、14 失败。artifact `windows-p00-evidence` 中的结构化结果显示 sandbox/Office helper 均在 `started` 前报 `path.open:0x80070005`；路径拒绝用例也因 `path.open` 而没有命中其要求的 `path.syntax`。祖先目录 `(X,RA,S)` 修正没有解决该错误。

复核 helper 后定位到更具体的访问要求：`PinnedPath::open(..., true)` 在 runtime 根目录叶节点请求 `READ_CONTROL | WRITE_DAC`，以便为本次 AppContainer 增加并撤销只读 ACL。CI 由 runner 复制的 runtime 根不属于临时标准用户；继承的 `Modify` 不含 `WRITE_DAC`，所以 helper 打开根目录即被拒，尚未进入 AppContainer。标准用户自己创建的 input/workspace 不需要额外处理。当前 CI 夹具已改为仅在锁定的 Node/Python/LibreOffice runtime 根目录上显式授予非继承 `(WDAC)`，不增加 runtime 文件写权或子项继承；helper 的路径打开错误另附用途和组件序号，日志不包含实际路径。

run 33 artifact 本机已读。本地 unit 16/16、TypeScript、锁定 helper 构建、`docs:check`、改动 Markdown Prettier、PowerShell AST、runtime 根路径检查和 `git diff --check` 均退出 0。完整 `pnpm check` 退出 1，仅因 Prettier 遍历既有受保护 ignored `.test-data/acl-probe` 遇到 `EPERM`；该目录未改。Rustfmt 检查本机未能完成（本机 Windows 应用控制已拦截 rustfmt；锁定 helper 构建本身成功）；未在本机运行 unsigned helper。新的精确 runtime DACL 夹具与 helper 路径诊断尚待下一轮 Windows CI 验证。P00-03=`in_progress`、P00-gate=`failed`。标准用户全量用例尚未通过；恶意宏/真实外链行为验收也仍缺。

## 2026-10-01 CI run 32：标准用户路径祖先权限被拒绝

CI run [36829488131](private-archive:TapKit), commit `de8721c`：unit 16/16、管理员 runner 当前路由 integration 44/44、Build/Electron 检查通过。临时非管理员身份核验 `standardUser=true`，冻结依赖复制安装成功；完整 probe 仍为 20 项 7 通过、13 失败。新增 artifact 已包含 `integration-test-results.json` 和 `runtime-probe.log`，逐项错误显示 13 个正向沙箱/Office用例均在 helper 启动前返回 `path.open:0x80070005`（Win32 access denied）。通过项为 capability、GitBroker、旧协议拒绝，以及路径拒绝用例。

helper 的 `PinnedPath::open_access` 会从盘符下逐个打开根路径祖先，并请求 `FILE_READ_ATTRIBUTES`；CI harness 只给标准用户临时 kit 子树写权限，没有给它的父目录祖先该读取属性/遍历权限。失败集中于临时 kit 路径的 `path.open`，因此当前判断是标准用户 CI 夹具缺少祖先目录的最小权限，而不是 AppContainer payload 已经启动后失败；下一轮 CI 用修正验证。harness 现只对 kitParent 上方的准确父目录对象授予非继承 `(X,RA,S)`（traverse、read attributes、synchronize），不授予目录枚举、写权限或子项继承；kitParent 原有临时 M 权限保持不变。

run 32 的路径拒绝测试由于只断言 `path.*`，因此 helper 统一 `path.open` 错误也能让该负向用例误通过。现将预期阶段收紧为 UNC/ADS/`..`/别名输入必须是 `path.syntax`，junction 必须是 `path.reparse`，保持并强化原安全测试点。本机不运行 unsigned native helper；修正后的完整标准用户验收等待 Windows CI。P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 CI run 31：完整日志收集仍缺测试结果文件

CI run [36827748673](private-archive:TapKit), commit `da951b0`：unit 16/16、主 runner 当前路由 integration 44/44、Build/Electron 检查通过；其中当前 AppContainer sandbox 11/11。独立标准用户步骤成功安装一次性 kit 依赖并确认 `standardUser=true`，随后完整 P00-03 runtime-probe 仍为 20 项中 7 通过、13 失败、0 pending，三项能力报告 `NATIVE_ACCEPTANCE_FAILED`。因此 run 30 的差异不是 pnpm 缓存问题，标准用户全量验收仍失败。

本轮失败分支会先打印 runtime-probe.log 尾部，但 artifact 只包含 launcher stdout/stderr 和 runtime-probe.json：验证失败时抛错先于原始日志复制；Vitest 结构化结果 `test-results/P00-03-native.json` 也没有进入 artifact。已调整 CI harness 的 `finally`，不论探针成功或失败，都将 runtime-probe.json、runtime-probe.log 和集成测试 JSON 复制到 `ci-evidence/P00-03-standard-user`，路径已在 workflow 上传列表中。当前尚不能把 13 项失败归因于产品代码或临时副本 ACL；下一轮 Windows CI 取回逐测试 assertion 与 helper 日志后再定位。未放宽测试，也未改变 AppContainer 方案。P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 CI run 30：标准用户真实验收暴露 13 个失败

CI run [36826206021](private-archive:TapKit), commit `2b87e96`：pnpm 共享缓存问题已解决，日志显示冻结依赖以 `package-import-method=copy` 安装到临时 kit；unit 16/16、当前路由集成 44/44、构建/Electron 检查通过。独立非管理员账号实际运行 runtime-probe，报告 `standardUser=true`、20 项中 7 通过/13 失败、0 pending、`NATIVE_ACCEPTANCE_FAILED`。缺失必需通过结果的是大部分 sandbox 用例及全部 Office 用例，因此不能通过 P00-03 门禁，也不能归为旧的缓存准备错误。当前 artifact 未包含 `.gitignore` 下的 `test-results` 日志，具体失败阶段尚未从现有报告确认。

下一步把报告和 runtime-probe 原始日志复制到明确上传的非忽略目录 `ci-evidence/P00-03-standard-user`，并在标准用户验收失败时将日志末尾同步输出到 Actions。先取到实际失败原因，再区分临时夹具权限/账户差异与产品隔离实现；保持全部安全断言，不据 7 项通过提前放行。P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 CI run 29：标准用户夹具缓存权限失败与修正

CI run [36824034370](private-archive:TapKit), commit `da11e45`：unit 16/16 通过，当前路由集成步骤中的沙箱 11/11、Office 3/3 及其他列出的集成用例均通过，构建与 Electron 检查通过。新增标准用户步骤成功创建非管理员账号并复制锁定 runtime，但该用户执行 pnpm install 时不能读取 runner 共享缓存 `D:\.pnpm-store`，在写入临时 kit 的 `node_modules` 前以 `Access is denied` 退出；runtime-probe 因此没有运行。本次不是 AppContainer 隔离用例失败，也不能计作标准用户验收通过。

现改为 runner 身份先在一次性 kit 内准备冻结依赖，并使用 `package-import-method=copy`，避免 kit 依赖仍引用 runner 共享缓存；标准用户进程以 `--prepared-kit` 运行 prepare-native 与完整 runtime-probe。该准备步骤不改变产品运行身份或 AppContainer 验收要求。锁定 pnpm 的 `config get` 已确认参数解析为 `copy`；实际 install/materialize 仍待下一次 CI 验证。本机 unit 16/16、ESLint、Prettier、Node 语法、PowerShell parser、docs:check 和 `git diff --check` 退出 0。P00-03=`in_progress`、P00-gate=`failed`；下一步推送后检查标准用户报告和完整必需案例。

## 2026-10-01 CI run 28：Office 宏/外链策略 live-route 回归通过

CI run [36811145482](private-archive:TapKit), commit `49ed129`：workflow 成功，unit 15/15、integration 44/44，总耗时 5m41s。P00-03 沙箱 11/11；Office 集成 3/3：DOCX/XLSX/PPTX 当前路由转换、`.xlsm` dispatch 前拒绝和真实 XLSX→PDF 时宏/链接拒绝配置送达、Office helper 强杀后的精确盘符映射恢复均通过。

新的策略用例检查 profile 的宏安全等级 3、禁止宏、Calc/Writer 链接更新值 0、LOK `EnableMacrosExecution=false`，并核对 AppContainer、无网络 capability、进程清理和源文件未变。边界保持明确：未运行带恶意宏的文件，也未以含真实外链的文档观察 LibreOffice 行为；外链保护仍由设置、无网络 capability 和最小 ACL 共同实现。CI 另有 GitHub Actions Node.js 20 弃用 warning（现由 runner 强制 action 在 Node.js 24 下运行），不影响本次成功。独立标准用户全量验收仍缺，P00-03=`in_progress`、P00-gate=`failed`。

## 独立标准用户验收探针与 CI harness（下一轮 CI 待验证）

run 28 后发现 `runtime-probe` 必需案例表中的并发、helper 强杀和 Office 强杀名称已过期，导致探针会漏报/误报当前验收。现更新为全部 20 个 P00-03 集成用例，并新增 unit 回归，保证探针清单始终与测试源一致；同时显式创建探针 JSON 输出目录。CI 新增一次性标准账号实测：只在托管 `windows-2025` runner 上创建非管理员账户，限定只读源码/runtime ACL 和临时 kit 写权限，执行现有标准用户准备及 runtime-probe，报告与日志上传为 CI artifact；checkout 关闭凭据持久化。该 runner 脚本只通过 PowerShell AST 解析，本机不创建用户、不运行被 Windows 应用控制拦截的 helper。改后本地 unit 16/16、TypeScript、docs:check、ESLint、改动文件 Prettier、PowerShell parser 和 `git diff --check` 均通过；完整 `pnpm check` 因已有 ignored `.test-data/acl-probe-node` 触发 `EPERM`，保护目录未改。标准用户原生执行等待下一轮 CI。P00-03/P00-gate 状态保持不变。

## 2026-10-01 CI run 27：并发与两类强杀恢复全部通过

CI run [36809596619](private-archive:TapKit), commit `08b72e1`：workflow 成功，unit 15/15、integration 43/43。P00-03 沙箱用例 11/11 通过；新增并发 AppContainer 身份/工作区互斥用例、helper 强杀后 Job 子进程终止及 ACL/profile 租约回收用例均通过。Office T07 DOCX/XLSX/PPTX 当前路由转换通过；Office helper 强杀后下一次 helper 仅回收记录盘符映射的用例也通过。

通用 helper 强杀用例将 heartbeat child 改为 `stdio: "inherit"` 后，子进程确实启动并持续写出心跳；强杀 helper 后心跳停止，下一次 helper 启动回收 ACL/profile 租约。此前失败来自测试负载在 `stdio: "ignore"` 下未能在 AppContainer 中启动，不是隔离限制被放宽。安全断言和生产隔离策略未修改。P00-03 仍 `in_progress`、P00-gate 仍 `failed`：Office 宏/外链拒绝与独立标准用户全量验收仍待完成。

## Office 宏与外链策略回归（CI run 28 已确认）

按 LibreOfficeKit 当前调用路线增加的真实 AppContainer Office 转换检查已由 CI run 28 通过：`.xlsm` 宏启用格式在 dispatch 前拒绝；允许的 XLSX 转换逐项核对私有 profile 的宏安全等级 3、禁止宏、Calc/Writer 链接更新值 0，以及 LOK `document.load` 收到 `EnableMacrosExecution=false`；随后真实执行 XLSX→PDF，并确认 helper 报告 AppContainer、无网络 capability 和进程清理成功。单元测试也检查具体配置值。此测试验证前置拒绝和策略送达，不声称是恶意宏 payload 行为测试；没有使用真实外链样本观察 LibreOffice 行为，外链保护还依赖无网络和最小 ACL。独立标准用户全量验收仍待完成，P00-03/P00-gate 状态不变。

## 2026-10-01 CI run 26：并发隔离与 Office 强杀恢复通过

CI run [36808915479](private-archive:TapKit), commit `a55f086`：unit 15/15、integration 42/43。新并发测试通过：两次真实 AppContainer 同时运行，SID 不同，跨任务工作区读写被拒；Office helper 被强杀后，下一次 helper 成功回收 Office 盘符映射及执行租约。Office T07 三格式转换仍通过。唯一未通过的新用例是通用 helper 强杀：心跳子进程没有写出文件（读数为0），所以尚未触达 Job 子进程终止与 ACL/profile 恢复断言。

检查到该测试的子负载使用 `stdio: "ignore"`；先前 fork 用例已经证明它在 AppContainer 内可能以 `EPERM` 拒绝 spawn，成功的子进程路径用 `inherit`。现改为 `stdio: "inherit"`，并为 raw helper 增加 `finally` 清理。没有调整生产隔离逻辑、资源策略或安全断言。改后本地 TypeScript、unit 15/15、Prettier、`git diff --check` 退出 0；等待下一轮 Windows CI。P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 CI run 25：计时器假时钟导致两项新用例失败

CI run [36808222549](private-archive:TapKit), commit `edb85c7`：unit 15/15；集成 41/43。Office helper 强杀后盘符映射及执行 lease 恢复用例通过。并发隔离用例到最后的重叠时间断言失败，因 integration `setup.ts` 以 Vitest fake timers 固定 `Date.now()`；helper 强杀恢复用例同样用 `Date.now()` 做 deadline，循环永不超时并碰到 15 秒测试默认超时。该轮不能验证这两个 sandbox 用例的最终断言，不能把它记为产品隔离失败或通过。

修复：并发起止时间比较和 heartbeat 等待期限改用不受测试 fake Date 影响的 `performance.now()`；helper 恢复用例单独延长至 60 秒，以容纳 ACL/profile 回收检查。新增用例的文件隔离断言和原隔离策略保持不变。修复后本地 TypeScript、unit 15/15、Prettier、`git diff --check` 通过；等待下一次 Windows CI。P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 CI run 24：上次已验证源码与文档提交通过

CI run [36807129226](private-archive:TapKit), commit `c5494ce`：workflow 成功，unit 15/15、integration 40/40。该提交仅记录 run 23 的结果；本次新增的并发隔离、helper 强杀后 ACL/profile 恢复、Office 强杀后盘符映射恢复测试不在该次提交中，尚待 Windows CI 验证。

本地检查：TypeScript 退出 0、unit 15/15、`docs:check`、改动 TS Prettier 和 `git diff --check` 退出 0。Windows 原生 helper integration 未在本机启动；rustfmt 仍受 Windows 应用控制拦截，未重试。P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 新增硬杀恢复与并发隔离验收场景（待 CI）

新增并发真实 helper 用例：两次独立 AppContainer 重叠运行、核对 SID 不同，并让每个负载尝试读写对方工作区；原有隔离策略和断言保持不变。新增 helper 强杀用例：子进程持续更新 workspace 心跳，测试进程直接终止 native helper，确认 Job 关闭后心跳停止、执行租约日志留到下次 helper 启动、恢复后日志消失。新增 Office 强杀用例：在 started 事件确认三条盘符映射已建立后立即终止 helper，再通过下一次诊断请求触发 Office recovery，并核验记录盘符不再可访问、租约日志已删除。测试尚未由 Windows CI 实际执行，不能记为通过。

## 2026-10-01 CI run 23：Office 三格式转换通过

CI run [36806574221](private-archive:TapKit), commit `4d7daaa`：workflow 成功，unit 15/15、integration 40/40。当前沙箱 9/9（含 fork 上限）通过；Office T07 DOCX、XLSX、PPTX 三格式在 AppContainer 中均完成 PDF 转换，用例耗时约 25 秒，并通过 PDF 有效性、原件哈希不变和正常清理检查。

run 22 的 LOK `pollCount=0` 已关闭：不在 worker 中等待首次 poll，而是先进入 `runLoop`，再于成功实验所用的 2 秒启动窗口后发起首次 load。没有放宽 AppContainer/无网络/Job、Office 输出或源文件保护断言。P00-03 仍 `in_progress`、P00-gate 仍 `failed`：硬杀后 ACL/profile 与 Office 映射恢复、并发隔离、宏/外链拒绝和当前路线独立标准用户全量验收仍未完成。

## 2026-10-01 CI run 22：修正 LOK 首次加载顺序

CI run [36805430818](private-archive:TapKit), commit `3185ef3`：unit 15/15、集成 39/40；P00-03 当前 AppContainer 沙箱 9/9 通过，fork 上限用例也通过。`program` 初始化路径已消除 run 21 的 `theDefaultProvider` / access violation，但 Office payload 仍以 `OFFICE_LOK_LOOP_NOT_READY` 退出：`loop_started` 后 `pollCount=0`，没有进入文档加载。

成功的 LOK loop 实验在 `runLoop` 启动后由 worker 等待 2 秒并直接加载；正式 worker 先等待 poll 回调才加载，run 22 表明此顺序下回调不会先发生。现按已验证时序移除该等待，保留每种格式实际转换、有效 PDF、原件哈希和 helper 清理断言。隔离 ACL、AppContainer、Job 和网络策略未调整。run 23 待 CI 验证。

本地检查：锁定 `pnpm helper:build` 退出 0；Python AST、unit 15/15、TypeScript、`docs:check` 和 `git diff --check` 退出 0。未运行本机原生 Office integration（unsigned helper 受应用控制拦截）；没有再次运行 rustfmt。P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 CI run 21 定位 Office 初始化失败

CI run [36803602932](private-archive:TapKit), commit `bee03e0`：unit 15/15、集成 39/40；fork 上限测试通过。新诊断输出显示 Office helper 的 `status=exited`、helper `exitCode=0`、payload `exitCode=1`、`activeProcesses=0`、`peakActiveProcesses=3`、`totalProcesses=3`；Python stderr 为 LibreOffice 启动时缺少 `com.sun.star.configuration.theDefaultProvider`，随后 `lok_worker.py:47` 的 `libreofficekit_hook_2` 调用发生 access violation（地址 `0x10`）。因此失败在 LOK 初始化，不是文档载入、PDF 保存或 Job 清理。

对照存档的成功只读转换 `docs/evidence/P00-03/lok-readonly-alias-verified.json`：实验传给同一锁定 LibreOffice 26.2.6.3 hook 的 install path 为 alias 下 `program` 目录（`Y:\program`）；正式 worker 此前传了 runtime 父目录（`Z:\`）。已将 `lok_worker.py` 改为传入 `program`，使正式调用参数与三格式成功实验一致。调用仍只使用 runtime 的只读授权路径，AppContainer/Job/无网络策略及 OfficeWorker 成功条件不变。该差异是目前最直接的原因线索；修正是否解决 bootstrap 错误仍待下一次 CI 验证。

修正本地验证：`pnpm helper:build` 退出 0（锁定 Rust helper 编译成功），LibreOffice 自带 Python AST 解析退出 0，unit 15/15、TypeScript、`docs:check`、改动文件格式与 `git diff --check` 均退出 0。Office 原生转换没有在本机运行，因为 Windows 应用控制仍会阻止 unsigned helper。P00-03 仍 `in_progress`、P00-gate 仍 `failed`。

## 2026-10-01 CI run 20 结果与下一步

CI run [36753060272](private-archive:TapKit), commit `8b214a3`：unit 15/15 通过，集成 39/40。fork 测试已根据子进程 ready 文件确认实际运行的负载数量，再验证额外创建请求、Job 上限和清理，当前 CI 用例通过。Office 已越过 `office.executablePath` 检查；`OfficeWorker` 的执行结果检查仍拒绝 helper 返回值，说明问题已进入转换/子进程阶段，但现有失败摘要没有返回 status、payload exit code 或 stdout/stderr，不能据此判断是 LOK 初始化、文件加载、保存还是 timeout。

为定位原因，仅在集成测试中给真实 `NativeSandboxExecutor` 包一层失败日志，记录失败条件、finished 状态/退出码、Job 进程计数及最多 3000 字符的 stdout/stderr。OfficeWorker 对隔离属性、退出状态、原件哈希与 PDF 输出的原断言不变；没有把 timeout/process_limit 当作成功，也不在产品日志中加入文档内容。下一轮 Windows CI 日志用于决定核心代码修复点。

诊断改动本地验证：unit 15/15、TypeScript 检查、`docs:check`、改动 TS/Markdown Prettier 与 `git diff --check` 均退出 0。Office 原生集成未在本机运行，因为 Windows 应用控制会阻止 unsigned helper；不需要也没有关闭系统策略。P00-03 仍 `in_progress`，P00-gate 仍 `failed`。

截图中的 Windows 安全通知是 `rustfmt.exe` 由 PowerShell 启动时被应用控制阻止；不影响成功的 Cargo/helper 编译结果，也不是 TapKit 产品运行弹窗。后续不再启动 rustfmt，Windows 安全策略不需要调整。

## 2026-10-01 CI run 19 失败定位与修正

CI run [36751759291](private-archive:TapKit), commit `74283d4`：unit 15/15 通过，集成 38/40。fork 新探针使用子进程 stdout pipe 等待 ready，但 AppContainer 内 `spawn` 在第一个子进程就同步 `EPERM`，因此没有负载 ready 标记；回退到已验证可启动的继承 stdio，通过子进程在工作区创建专属 ready 文件通知父进程，不以 `spawn` 事件计数。Office 阶段码指出 `office.executablePath`：helper 用 `PathBuf::join("program/python.exe")` 生成的预期路径保留 `/`，而安全校验中的真实 Windows 路径为 `\`，精确字符串比较失败。现改为分段 `join("program").join("python.exe")`，不放宽 executable 必须是 runtime 中 Python 的规则。

run 19 两项修正后的 unit 15/15、TypeScript、完整 build（含 Rust helper）、docs:check、改动文件 Prettier 和 diff check 均退出 0。完整 `pnpm check` 仍只因既有 `.test-data/acl-probe` 的 `EPERM` 无法完成；rustfmt.exe 也被 Windows 应用控制拦截，未再次启动。改动待推送后由 Windows CI 复核 fork 和 Office；P00-03 继续 `in_progress`、P00-gate 继续 `failed`。

## 2026-10-01 CI run 18 复核与当前修正

CI run [36748972490](private-archive:TapKit), commit `daabe81`：`check` 和 unit 15/15 通过，集成仍为 38/40。cleanup 后再次调用 helper 的回归通过。fork 用例的 helper 记录 `processLimit=4`、`peakActiveProcesses=5`、`totalProcesses=5`、`status=process_limit`，stdout 中 Node 子进程产生了三条 `spawn` 通知；这些通知发生在子进程负载代码确认运行之前，不能据此判断有几个子进程真正执行了负载。Office 失败已能显示 `office.pathScope`，但旧代码把多项安全边界合并成一个错误，仍无法定位具体条件。

当时的修正把 fork 测试的同类无子进程运行作为基线，按 `processLimit - baselinePeak` 计算可用槽位；run 19 又表明 AppContainer 不允许该测试子进程使用 stdout pipe。最新设计沿用实测基线和容量断言，但改用受允许的继承 stdio，并通过 workspace ready 文件确认子进程负载实际执行；以上方 run 19 修正为准。

Office 保留原来的所有可执行文件、根目录互斥、输入文件类型和大小检查，只把合并的 `office.pathScope` 拆成固定诊断阶段码，不记录原始路径。下一次 Windows CI 会据此指出失败的是哪条检查；当前尚未确认真实 Office 转换通过。

本地修正验证：unit 15/15、TypeScript 检查、锁定 Rust helper 构建均退出 0。当前主机的 Windows 应用控制仍阻止未签名 helper，因而真实 AppContainer 集成需由下一次 Windows CI 验证。P00-03 继续 `in_progress`、P00-gate 继续 `failed`。

## 2026-10-01 CI run 17 follow-up

CI run [36747420125](private-archive:TapKit) for commit `bd48e6b` completed helper build setup, `check`, and all 15 unit tests, but integration finished with 38/40 passing. The new execution-lease cleanup regression passed, as did the ordinary AppContainer, Python child, network, cancellation, path, memory, ConPTY, GitBroker, capability, and legacy-route cases.

Two failures remain. The process-limit probe used Node child processes with `stdio: "ignore"`; its first spawn returned synchronous `EPERM` before any child was counted (`peakActiveProcesses=2`, `processLimit=4`), so it did not reach the Job limit. The test keeps its exact limit assertions but now uses inherited stdio, matching the already-passing Node child-process route. OfficeWorker received a helper `failed` event, but NativeSandboxExecutor replaced its underlying helper stage with a generic identity/cleanup error; it now reports that stage while retaining `SANDBOX_UNAVAILABLE` as the stable error code. The next Windows CI run must confirm both changes; P00-03 remains `in_progress` and P00-gate remains `failed`.

Follow-up local validation of these adjustments: unit 15/15, TypeScript check, `build`, GitBroker/capability integration 5/5, Prettier on changed Markdown/TypeScript, `docs:check`, and `git diff --check` all pass. Full `pnpm check` still cannot complete because Prettier is denied enumeration of the existing ignored `.test-data/acl-probe` directory (`EPERM`); its ACL and contents were not changed. The host also blocks the unsigned helper, so native AppContainer integration remains CI-only.

## 2026-10-01 CI run 16 failure diagnosis and repair

CI run `36744511479` on `cc86c8b` failed all eight sandbox cases and the Office route because execution-lease cleanup/recovery opened recorded roots without DACL access. `PinnedPath::open(..., false)` requests only file attributes, then `edit_acl` calls `GetSecurityInfo`; CI reported `acl.read:0x80070005`. Cleanup left the journal behind, and every later helper invocation runs stale recovery before the requested operation, so it failed before reaching its path or execution case. The `expected 1 to be +0` assertions were the helper exit-code check (`1` vs `0`), not active-process accounting.

The recovery path now opens the journaled root with `READ_CONTROL`/`WRITE_DAC` access, verifies its recorded file identity, then revokes only that run's AppContainer ACE. Added a two-invocation cleanup regression, richer cleanup marker and failed-event diagnostics, corrected the legacy protocol test to inspect the structured `stdout` event, and added the P00-03 event log to the CI artifact.

Local validation: unit 15/15, `pnpm build` exit 0, TypeScript check exit 0, GitBroker/capability integration 5/5, and Prettier on changed TS/YAML files exit 0. Full `pnpm check` still stops in Prettier because the existing ignored `.test-data/acl-probe` denies directory enumeration (`EPERM`); no ACL was changed. The AppContainer integration requiring execution of the helper is left to Windows CI because this host's application control blocks the unsigned helper. Remote CI for this repair is pending; P00-03 remains `in_progress` and P00-gate remains `failed`.

## 2026-10-01 状态刷新（CI run 16 之前的检查点）

当前分支 `fix/corrected-appcontainer-isolation`，HEAD `1c46a5e`，迁移改动未提交。进程上限可以在 Windows CI 验证：历史 CI 确实启动了 AppContainer helper，但当时 Node 子进程在 Job 仅达到 peak 2/limit 4 时收到同步 `EPERM` 并提前退出，不能算上限通过；当前严格断言尚需对当前代码运行 CI。

本机刷新检查：`pnpm build` 退出 0（包含锁定 helper 编译），unit 15/15，GitBroker/capability 集成 5/5，`pnpm docs:check` 退出 0；`pnpm check` 因 Prettier 遍历被拒绝访问的 ignored `.test-data/acl-probe` 而失败，代码文件分批 Prettier 检查通过。该路径创建于 2026-09-17，本轮未读取/改动 ACL，也没有启动 native helper。完整记录见 `docs/evidence/P00-03/current-verification.md`。

下一步先让严格 fork 断言在 Windows CI 运行，以区分实际 Job 上限行为与早期子进程创建 `EPERM`；随后补齐硬杀后 ACL/profile 恢复、并行隔离、Office 宏/外链拒绝和映射硬杀恢复四项测试，再做现路径 Office 三格式与标准用户验收。当前 `runtime-probe` 所需上述用例尚未全部实现/通过，故 P00-03 继续 `in_progress`、P00-gate 继续 `failed`，不得进入下一阶段。

## 2026-09-30 当前方案补丁：优化旧路线后以 OS 沙箱为标准

此方案基于旧专用账户路线的问题、既有 AppContainer 证据和兼容实验优化；自此作为 P00-03 当前标准。执行隔离由 Windows AppContainer 承担，不以 TapKit 本地 Windows 账户身份作为前提。Node/Python/终端与受控 Office 转换使用独立 AppContainer + 最小 ACL + Job + 无网络 capability；Git 使用可信 GitBroker。Office 优先接入 LibreOfficeKit unipoll/runLoop。无需专用账户、管理员账户初始化或账户级 WFP 规则。

KnownDlls/Kernel32 预检只在专用账户 `account.execute` 路径触发；AppContainer `diagnostic.execute` 不调用它，也不需要 `C:\ProgramData\TapKit-Sandbox-v1`。旧账户路径的5项2通过3失败保留为历史，不能标成 AppContainer 失败。已批准的账户 token 试验在 live 访问检查前停止并 superseded；未创建身份、调整 WFP/ACL、建临时夹具或启动负载。详见 docs/evidence/P00-03/sandbox-route-reassessment.md 和 controlled-token-probe.json。

## 2026-09-30 当前实现与验收补丁

执行器已迁到当前方案：contracts 只接受 `diagnostic.execute` / `office.render`；NativeSandboxExecutor 核验 AppContainer SID、无网络 capability、Job 约束和进程树清空；OfficeWorker 通过固定 LibreOfficeKit Python 适配执行，helper 为每次转换创建精确 DOS 映射租约。旧 account broker/token/WFP 源码已从 helper 移除；旧 `account.execute` 仅由拒绝回归测试覆盖。Git 保持可信 GitBroker。

helper 的 AppContainer ACL/profile 与 Office DOS 映射均有按 run ID 的恢复日志和互斥租约代码；但硬杀后的真实恢复、并发/盘符冲突、宏/外链、独立标准用户当前路径验收仍未完成。Office 协议单测发现并修复了 `protocolVersion` 漏传；重建后的实际 Office 启动未验证。

本轮实际验证：`helper:build`、`check`、`build` 均退出 0；unit 15/15；GitBroker 与 capability 集成 5/5。真实 helper integration 无法在当前主机启动：Windows 应用控制策略阻止未签名的 `tapkit-windows-helper.exe`，Node 报 `spawn UNKNOWN`；这些用例没有进入沙箱逻辑，不能计作功能失败或通过。详见 `docs/evidence/P00-03/current-verification.md`。

run 17 后的 fork 断言曾假设基础进程占一个槽位，并要求三个长驻子进程填满 limit=4；run 18 证明 `spawn` 通知及固定槽位假设不足以确认真实负载进程数。此旧断言已由上方按 helper 实测基线与子进程就绪信号的测试替代。`process_limit` 是 helper 现有的超限终止保护，不能单独当作“负载启动成功”的证据；详见 `docs/evidence/P00-03/ci-fork-spawn.md`。

runtime-probe 已改为逐项要求 P00-03 集成案例全部通过且标准用户指纹未变化；目前仍缺硬杀恢复、并发租约、Office 宏/外链和 Office 映射恢复用例，因此能力保持 failed、P00-gate 保持 failed。

### 迁移前状态快照（历史）

当时生产代码仍使用 `account.execute`；LOKit 成功记录是兼容实验，下一步目标为迁移执行器、接入 LOK 并完成验收。此快照已被上方当前实施补丁取代。

## 2026-09-30 CI 失败复核

CI 工作流原先将 `--exclude` 放在 `pnpm ... test:integration --` 后。pnpm 把这个 `--` 原样转给 Vitest，导致两个排除参数未作为选项处理，旧 `P00-03.account.test.ts` 仍被收集。现已改为直接传入两个 `--exclude` 参数。后续运行发现 fork 用例还会因同步 `spawn EPERM` 提前退出，诊断与修复见下节和 `docs/evidence/P00-03/ci-fork-spawn.md`。两项修正均不改变 P00-03 或 gate 状态。

## 2026-09-30 fork 子进程 CI 失败与第一版修复（后续已收紧）

> 本节保留第一版修复的诊断结果；原“拒绝标记或 helper 报 `process_limit` 即通过”条件现已过宽。后续检查发现 `peak=5 / limit=4` 不能证明上限守住，当前断言见顶部实施补丁和 `docs/evidence/P00-03/ci-fork-spawn.md`。

CI 原始事件显示 AppContainer 已启动且 Job 配置 `processLimit=4`；fork 用例结束时 `status=exited`、子进程退出码 1、`totalProcesses=2`、`peakActiveProcesses=2`。标准错误为 Node 在 `child_process.spawn()` 内同步抛出 `EPERM`。原测试把 `.on('error')` 链接在 `spawn()` 返回值上；同步抛错会先退出表达式，事件监听器来不及注册，后续保持主进程存活的 `setInterval` 也没有执行。因此 helper 观察到根进程提前退出；峰值 2/4 也说明这次失败没有到达该 Job 的进程数上限，不能把 EPERM 直接归因于 Job 限制。

测试现对每次 `spawn()` 同时处理同步抛错和异步 `error` 事件，记录受拒绝标记后继续运行；用例要求观察到拒绝标记或 helper 明确报告 `process_limit`，并保留总进程数及峰值检查。异常状态仍会把完整事件 JSON 放入失败消息。本地 `pnpm check` 退出 0；排除旧 Office/账户套件后的定向 sandbox integration 为 1/1 通过、36 项跳过。本地该 fork 案例状态 `process_limit`、总进程 5、峰值 5；helper 按超限路径终止 Job。完整原始本地案例见 `docs/evidence/P00-03/native-cases.jsonl`；本次 CI 修正尚待远程运行确认。P00-03 仍 `in_progress`，P00-gate 仍 `failed`。

## 2026-09-25 团队接续检查点（历史）

用户要求保留本任务进度并提交远程供团队接续，尚未决定进一步如何调整隔离方案。本次只整理交接和提交，不继续实现、不切换阶段、不运行账户初始化或修改系统设置。任务仍为 in_progress，P00-gate=failed，不能按“仅缺live凭据”处理。

当前卡点是最终受限令牌读不到 Windows 的 KnownDlls/Kernel32，Node/Python/Office 新路径均在系统读取预检失败。GitBroker已通过4项；最新单测15/15、基础集成29/29；原生账户5项为2通过3失败。下一步先决定最小系统只读访问及生命周期方案，再完成运行组件、越界/网络/恢复和独立标准用户全量验收。进一步扩大安全边界需要先确认方案并留ADR，不能直接放宽权限来消除测试失败。

接手入口、验证命令、证据范围及本机已有账户/WFP配置边界见 docs/evidence/P00-03/team-handoff.md。下文是实现与实验的历史，不代表所有方案仍在采用。

## 2026-09-24 UAC 已完成，转入系统读取适配

用户回复“现在可以”后修复成功：提权初始化与普通 --account-status 均退出 0，不再等待 UAC。已修复 MSIX 恢复目录定位、应用容器 SID 误用及命名窗口站问题；最终限制 SID 只含新建执行账户 SID，已删除应用包读取基线。私有登录会话窗口站/桌面真实创建成功，Node 曾启动但以 STATUS_ACCESS_DENIED 退出；最终只读探针确认 KnownDlls/Kernel32 共享对象和文件不可读，现提前明确拒绝。下一步补最小系统只读访问及生命周期，不能降级读取边界。

本轮 check/build=0，unit15/15，基础integration29/29；新账户全文件5项中2通过3失败、0跳过，失败为Node/Python/Office系统读取预检。抽查78路径ACE残留0、恢复JSON日志0；不替代递归与硬杀验收。全部证据、错误定位、模拟时钟/旧binary报告说明见 docs/evidence/P00-03/account-after-uac.md。P00-03及gate状态不变；下文UAC等待/原生未实现是历史检查点。

## 2026-09-24 专用账户原生实现与初始化

本轮收尾：check/build/docs 退出 0、unit15/15、基础integration29/29、真实账户 CLI/路径拒绝选择运行2/2；最后一次修复 UAC 返回用户取消，普通 --account-status 仍为 wfp.get:0x00000005。已准备好精确权限修复，等待用户确认方便 UAC；未重复触发。尚需修复/验收系统读取基线、嵌套链接和完整网络/恢复，再做 Node/Python/Office 及独立标准用户全量。最终 helper 字节和报告范围见下述原生检查点。

后端 account_setup/network/token/journal/broker、NativeAccountExecutor 已落地并编译，OfficeWorker 已接真实账户执行接口。已真实创建两个独立 TapKit 账户和八条 WFP 网络阻断规则；旧 test 账户未修改。首个 Node 负载尚未启动即因 WFP 读取权限失败，已修正常量和修复调用方式，正在实测。完整安全、异常恢复、Office 与标准用户新路径仍未通过，能力和 P00-gate 保持 failed。实现细节、OS 变更范围、真实报告与尚待审查风险见 docs/evidence/P00-03/account-backend-checkpoint.md。下节“后端未实现/未修改 OS”是先前检查点历史，不代表现在。

## 2026-09-24 ADR 0007 已采纳，第一批代码落地

用户已明确同意新方案并要求审计记录，取代下节“仅候选/未采纳”的状态。已实现 P00 GitBroker 固定 status/diff 私有字节快照、OfficeWorker 固定转换接口与输入/退出校验、严格共享契约和旧方案报告拒绝。真实 GitBroker 4 项通过；锁定 Node 下 check/build 退出 0，unit 15/15、基础及相关 integration 29/29。详情与测试范围见 docs/evidence/P00-03/adr0007-implementation.md。

**专用账户原生后端尚未实现**，OfficeWorker 尚未接入真实账户执行器；管理员初始化、凭据保护、令牌/ACL/网络隔离、持久恢复与标准用户新路径全量仍待完成。本轮未修改 Windows 账户/ACL/网络规则，未重跑旧 Office 弹窗路径，不以接口单测替代原生验收。P00-03=in_progress、P00-gate=failed。旧标准用户入口现在会在复制/下载前提示后端未就绪；显式 legacy 诊断不能开启能力。下一步必须完成原生账户通道，不能直接切换下一任务。

## 2026-09-24 调研与候选方案

已复核 Hermes/Claude Office 技能、Aider Git 实现、Codex 官方 Windows/worktree 文档及本机证据。Office 生成无需先转 PDF；Git 错误是 AppContainer 路径查询兼容，正式 Git broker 虽在计划中但尚未实现。建议 GitBroker 正常 Win32 + OfficeWorker/代码执行独立隔离；优先评估专用低权限账户路线，明确首次管理员初始化代价，免管理员 AppContainer/LOK 为备选。详见 docs/evidence/P00-03/office-git-design-reassessment.md。本次仅研究建议，未改计划、产品、账户或防火墙。后续采纳须同步 ADR/契约并验收实际路径，不能直接删除失败测试放行。原生正式 9/11、标准用户 Core/沙箱 9/9 与 failed gate 保持原记录。

## 当前状态（2026-09-30 迁移后）

- 当前分支：`fix/corrected-appcontainer-isolation`；本轮接续 HEAD：`1c46a5e`；工作区含未提交的迁移与验收改动。
- 当前实现：执行器/helper/OfficeWorker 使用 AppContainer + Job + 最小 ACL + 无网络 capability；Office 走 LOK 固定适配；Git 走 GitBroker；旧账户/WFP helper 源码已移除。
- 可重复本地检查：helper build、check、build 退出 0；unit 15/15；GitBroker/capability integration 5/5。真实 helper 用例被 Windows 应用控制拦截，未进入业务代码；详见 `docs/evidence/P00-03/current-verification.md`。
- 未交付：严格 fork 上限需 Windows CI 确认；真实 LOK 三格式/宏外链验收、硬杀恢复、并发租约/映射冲突、当前路径独立标准用户全量仍缺。P00-03=`in_progress`，P00-gate=`failed`。

> 以下旧路线检查点和结果保留为历史证据；不能代替顶部补丁所列的当前方案验收。

## 历史状态快照（2026-09-25，保留原记录）

- task_id / title：P00-03 / Windows隔离与文件运行组件验证。
- status：in_progress。
- 当前 checkout：D:/tapkit/TapKit / main / 98f6dc6cf8c7441bf917f7a57fd53fcd653a44af；本轮开始时干净。
- 用户最新决定：批准受控候选令牌试验；feature 构建通过，正常构建未包含诊断命令。当前身份下账户状态目录缺失，live 访问探针未运行。
- 生产执行路径和 ADR 0007 仍不变。此前 2026-09-24 专用账户5项2通过3失败、KnownDlls/Kernel32 拒绝的结果保留为历史实测；不与本次缺少状态的环境混为一谈。
- P00-gate：failed。新路径 Node/Python/Office、完整安全恢复及标准用户验收仍未通过，不能改标 `implemented_not_live_verified`。

## 既有实现清单（历史，需按当前方案重新验收）

- Rust/windows 0.62.2 helper，精确 Cargo.lock；官方锁定 Rust 1.98.1 + Windows SDK/CRT + Rust LLD 项目内构建。ADR 0006 及架构构建段已同步。
- 有界逐行 JSON；protocolVersion/requestId/runId/leaseEpoch；挂起建进程→加入 Job→核对 AppContainer SID→恢复；无网络 capability/breakaway；超时/取消/EOF 清理 Job。
- 路径逐组件句柄固定、reparse/UNC/ADS/别名拒绝；runtime/input 只读，workspace 可写；输出预览和日志有上限；清理失败不得返回可用。
- 明确环境白名单；负载 USERPROFILE/LOCALAPPDATA/APPDATA 指向任务目录。祖先元数据权限仅遍历/属性/同步且不继承；避免 SetSecurityInfo 在祖先递归传播。
- ConPTY 通过显式无效标准句柄避免继承宿主控制台；Node 真实交互用例通过。
- contracts/execution 与 Core bootstrap 能力 DTO；失败时 storage 仍可用；没有 renderer 任意 shell IPC。runtime report 用整个运行组件文件指纹防止陈旧报告启用能力。
- 真实 sandbox/Office/Git/capability 测试、Office 三格式 fixture、标准用户独立副本测试脚本。

## 历史验证与证据（不可迁移为当前路线通过）

- pnpm check：本次代码检查退出 0；最终文档检查另行追加 final-results。
- pnpm build：退出 0；pnpm test:unit：11/11；基础集成 P00-01/P00-02/P00-03.capability：25/25。
- 本次早期 Electron P00-01/P00-02 回归 8/8；最新原生轮次见 docs/evidence/P00-03/native-final.json：9/11，退出 1。
- 最新 P00-03 9/11：Node/Python、拒绝越界与网络、路径、取消、资源上限、ConPTY、Core 通过；Office/Git 两项失败。
- 中间 runtime-probe 为 8/11：新增权限断言误把 Windows EPERM 排除在外，已修正为只接受 EACCES/EPERM 并完整重跑为 9/11；原报告保留，不改写成通过。
- DOCX/XLSX/PPTX 转换曾超时，最新单次转换退出 1，无有效 PDF。MinGit status 返回 128 / cwd Permission denied。不能宣称 PDF/中文字体/外链恶意样本已验收。
- DOS/GUID GetFinalPathNameByHandleW 返回 Win32 5；NT/无卷名模式成功。未为兼容而开放卷根目录或整个用户目录。
- docs/evidence/P00-03/final-results.json、early-results.json、native-cases.jsonl、office-git-cases.jsonl、policy-block.json；汇总 docs/evidence/runtime-compatibility.md。
- early-results 撤回旧 runner 错写的 not_run_after_policy_block 注释；保留真实命令结果。历史策略拦截确曾发生，但后续 helper 已能启动。
- test 独立标准账户已回传 Core/沙箱 9/9；范围为 Core 失败能力、Node 读写/私密目录/环境、Python 子进程、网络拒绝、取消、资源上限、路径拒绝、ConPTY。此子集不包含 Office/Git，也不替代尚缺的网络正向对照、错误身份控制消息与硬杀恢复测试。
- 正常执行的原生用例检查 Job 活跃进程归零。硬杀 helper 后 ACL/profile 自动恢复尚缺完整实现与验收。

## 标准用户与脚本修复

- R09：用户确认本机标准账户 test；查询为 enabled 且非 Administrators 成员。
- 首次用户反馈：PowerShell 禁脚本；自行进程级 Bypass 后遇到 Destination must be outside the source workspace。第二个错误是本任务脚本误判跨盘 relative()，已修复，不能归因给用户环境。
- 新增跨盘/同盘邻目录/同路径及大小写/子目录/.. 规范化回归测试，通过；D:→C: Temp 的整套副本实际复制成功。这只证明准备流程，不是标准用户安全验收。
- 直接入口：在 test 普通 PowerShell 运行 `& 'D:\TapKit\.runtime\node\node-v24.21.0-win-x64\node.exe' 'D:\TapKit\scripts\standard-user-test.mjs'`。无需执行 ps1 或修改全局执行策略。
- 副本位于该用户 LOCALAPPDATA，包含锁定 runtime/helper；安装冻结依赖并运行 probe。用户应返回最后的 Evidence directory；已返回 standardUser=true、10 项中 7 通过/3 失败；指纹与本机 helper/runtime 一致。当前账户无法读取 test 私有目录，已收到用户回传的只读摘要：Core 用例因测试包遗漏 migrations 无法加载；Node 权限断言未接受 EPERM；其余 Office/Git 与本机同样失败。证据 docs/evidence/P00-03/standard-user-reported.json 标明为用户回传。
- 已修复新副本遗漏 migrations，并提供 scripts/repair-standard-user-kit.mjs，只修补原副本迁移文件/断言，复用依赖跑 9 项 Core/沙箱，不运行 Office/Git。独立 C 盘副本实际 9/9，证据 docs/evidence/P00-03/kit-repair-verification.json；test 已回传 2026-09-17T14:40:55.952Z—14:41:10.341Z 的修补结果：standardUser=true、9/9、exitCode=0、failures=[]。两个修补文件 SHA256 均与当前源码一致；证据 docs/evidence/P00-03/standard-user-repair-reported.json，明确标注为用户回传，未声称直接读取其私有目录。
- 复制/验收可能需数分钟；Office/Git 已知失败可能使最终退出码为 1，应保留证据，不反复改安全策略。

## 中断探测清理

- 一次祖先 ACL 传播卡顿已清理，证据 docs/evidence/P00-03/ancestor-probe-cleanup.json。
- 另两次中断曾留下 profile（现已清理）：tapkit.diagnostic.7de57425-0f39-79c8-b986-81c37f286dec；tapkit.diagnostic.adb554c0-5966-7a6d-8765-42583841a819。
- 清理最初被自动审批拒绝；用户随后明确授权相同范围。已仅撤销两个 SID 的 ACE 并删除对应 profile，证据 docs/evidence/P00-03/aborted-probes-cleanup.json；核验所列目录/选取运行时文件的残留 ACE 为 0、两个 profile 不存在，见 docs/evidence/P00-03/aborted-probes-cleanup-verification.json。未删除项目文件或更改其他账户权限。
- 检查到的路径：D:/TapKit、.runtime、.runtime/libreoffice、.test-data、.test-data/P00-03 Office Git 中文 ZgmJbv。没有活跃 helper 时方可执行清理；恢复指令必须限制到已核验 SID。

## 当前接续顺序（以 2026-09-30 方案补丁为准）

1. 将 Node/Python/ConPTY 生产执行从 `account.execute` 迁移至既有 AppContainer `diagnostic.execute`，保留最小 ACL、Job、路径句柄校验和失败关闭。
2. Git 继续使用可信 GitBroker；MinGit 盘符别名仅为历史兼容实验，不作为 Git 产品通道的接入前置。
3. 将 LibreOfficeKit unipoll/runLoop 适配及所需受限路径映射集成进 OfficeWorker；验证映射并发、冲突、精确清理和强杀恢复。
4. 完成 T07/T08/T19、完整安全/恢复和独立标准用户验收后更新 P00-gate；验收前不启用能力、不进入下一阶段。不得因该路线调整去初始化账户或修改旧账户/WFP/系统 ACL。

## 接续顺序（2026-09-17历史，按上方补丁更新）

1. 读本记录与 CURRENT/INDEX，核对目录/HEAD/dirty/当前 source manifest，不能只凭记录验收。
2. test 的 9 项 Core/沙箱修补回归已通过，不必重复收集；两次残留已获授权并清理。不要再次要求密码、改 test 目录权限或重问清理授权。
3. 修复 MinGit DOS 路径规范化与 LibreOffice AppContainer 转换，保持明确 ACL 与无网络边界；成功后补 PDF 打开/中文字形、宏/外链样本。
4. 补硬杀 helper/父进程异常退出后的 ACL/profile 回收与身份错误控制消息测试，强化网络正向对照；重跑真实安全和标准用户验收。
5. 更新四类进度记录及 P00-gate，只有全部通过才收口；本次不自动进入下一阶段。

最小规格仍为 16-reading-map 的 P00-03 行、tasks/P00-03、03 §5—6、07 §4—6、08 T07/T08/T19、15 通用/P00；已读 02-decisions。保留 P00-01/P00-02 已验证本地接口，不放行依赖 OS 隔离的下游。

## Office 启动弹窗

用户截图的“无法启动应用程序。发生内部错误。”与 LibreOffice 的 STR_BOOTSTRAP_ERR_CANNOT_START / STR_BOOTSTRAP_ERR_INTERNAL 完全对应，已归入 Office bootstrap 失败。受限 --version 退出 0，转换退出 1/超时；ConPTY 转换也超时，不能据此认为缺 DLL 或绕过隔离。具体 bootstrap 失败点尚未查明。见 docs/evidence/P00-03/office-startup-popup.json、office-version-probe.log、office-pty-probe.log；未把用户含其他界面内容的截图复制入 Git。

2026-09-17T14:39Z 定点实测：调用锁定 LibreOffice 26.2.6.3 的 sal3.dll 导出 osl_createPipe，普通宿主对照成功；相同调用在已核验 SID 的 AppContainer 返回空指针、Win32 5、oslError 1。同容器中 Win32 默认管道创建也为 5，而 LOCAL 命名管道成功。进程正常退出、Job 活跃进程归零、无 helper 清理错误；没有再启动 Office UI。

证据 docs/evidence/P00-03/office-ipc-probe.json（含库 SHA 与真实事件）、office-ipc-probe.py。已证明该运行库存在内部管道兼容故障；对应版本 bootstrap 会将管道失败映射为启动错误，但尚未对原 soffice 进程做调用栈跟踪，不能断言它是转换失败的唯一原因。文件 ACL 调整不改变命名管道命名空间；未修补官方二进制或扩大隔离权限。Office/Git 与完整安全门禁仍失败。当前源码指纹见 docs/evidence/P00-03/source-manifest.json。

## AelionBot 参考核查

按用户指定检查固定提交 101935cda6071a4854d403c0b8bd3d602d44d729，308 个文件逐一校验 Git blob。发现进程归属校验、有界退出、事务恢复及对应测试可借鉴；Office 转换在 Linux VM 中执行，未发现 AppContainer 管道/MinGit 路径或 ACL/profile 回收的直接实现。下一步可据此设计私有恢复日志与故障注入测试；不能照搬普通宿主 spawn 或将第三方 mock 当作 TapKit 验收。详细对照与方案见 docs/evidence/P00-03/aelionbot-reference-review.md；来源索引 docs/evidence/P00-03/aelionbot-reference-source.json。本次仅研究，未执行第三方代码或改变隔离方案，测试通过数量和门禁保持原值。

## 官方 Agent Windows 源码研究

2026-09-17T15:29:12.224Z 按用户要求检查 Codex、Claude Code/sandbox-runtime、Hermes、xAI Grok Build；固定提交并核验 214 个源文件。详细对照、原始源码链接和接续建议见 docs/evidence/P00-03/agent-windows-reference-review.md；来源索引 docs/evidence/P00-03/agent-windows-reference-source.json。

Codex 用 restricted token 并处理管道默认 DACL；不能据此修复 AppContainer 命名空间。sandbox-runtime 当前 main 有 Windows alpha，独立账户/WFP 需 UAC，而 Claude Code 产品文档仍不支持原生 Windows sandbox。其私有 ACL 状态、PID/创建时间、文件身份和真实强杀测试最值得借鉴；恢复失败路径不应照搬，TapKit 必须保留重试记录、核验成功后才移除。Hermes 默认 local 是宿主执行，其 Job breakaway/UI no-sandbox 回退不适用于此任务；Grok 所读 apply 在 Windows 无强制隔离。

后续可先补当前 helper 的 ACL/profile 持久恢复与故障注入，再推进 Office/Git 最小兼容实验；没有现成补丁或三格式验收可直接借用。保留无需管理员、AppContainer、禁止静默降级的既定规格；若需改变必须先形成 ADR 和明确变更范围。本次未实现这些方案、未运行第三方代码、未改产品源码/系统策略，原有验收数与 failed 门禁保持。文档检查见 docs/evidence/P00-03/agent-windows-reference-validation.json。

## 兼容实验检查点

2026-09-18T08:00:22.787Z：临时会话盘符映射仅指向已授权根目录：原版 MinGit status/diff 在 AppContainer 内均退出 0；LOKit + 两个映射完成 DOCX PDF（73214 bytes、原件哈希不变），XLSX 加载超时，宿主对照也超时。均为实验，未接入产品、未满足标准用户与完整安全验收；正式原生记录仍为 9/11，能力继续 failed。 细节与来源见 docs/evidence/P00-03/compat-experiments-review.md；临时别名均已精确撤销。

## 兼容方案实验成功（尚未正式集成）

2026-09-18T08:14:41.722Z：兼容实验已成功：原版 MinGit status/diff 在 AppContainer 退出 0；锁定 LibreOffice 26.2.6.3 通过官方 LOK unipoll/runLoop + 临时会话盘符映射完成 DOCX/XLSX/PPTX。只读输入复验三格式通过；runtime/input 写入及越界读写拒绝；活跃回环服务宿主前后连通而容器不可达。PDF 可解析且中文视觉检查正常。所有别名精确撤销，Job 活跃进程归零。仍属本机实验，未改产品执行路径，正式原生 9/11 与 test Core/沙箱 9/9 记录不变。 来源、运行命令、归档脚本及下一步见 docs/evidence/P00-03/compat-experiments-review.md。剩余为正式适配/映射生命周期、宏外链与完整安全、独立标准用户全量；P00-03 in_progress / P00-gate failed 不变。

## 原总表检查点

2026-10-02 P00收口：run46（b901ef7）全success，check/build/unit17/17/管理员46/46/P00 Electron8/8/独立标准用户22/22全部通过；真实宏/外链对照与中文PDF渲染齐全。P00-03=implemented_and_verified、P00-gate=passed、3/37；未启动P01。证据docs/evidence/P00-03/ci-run46.json。下方旧检查点按原时间保留。

2026-10-02 已推送PDF归档修复`b901ef7ec788bcfcec772adcfc564974ab64f32b`，[run46](private-archive:TapKit)验收中。run45各项真实通过，当前待新CI确认七份管理员及七份标准用户PDF归档，并完成同次运行中文渲染审阅；P00-03仍in_progress、gate=failed、2/37，不启动P01。

2026-10-02 run45全success：check/build/unit17/17、管理员46/46、P00 Electron8/8、独立标准用户22/22；宏与外链真实对照都通过。发现E2E清空共用test-results，成功轮PDF未归档；已隔离E2E子目录并补标准用户PDF收集待CI，收口仍in_progress/failed。证据ci-run45.json。

2026-10-01 引用释放顺序修复a4ddd9c已推送，run45验收中；本地TS、Python仅编译、docs/格式/diff通过。等待外链完整对照与标准用户22项，仍in_progress/failed。

2026-10-01 run44：check/unit17/17通过，管理员45/46；宏真实PDF/文件标记对照通过，外链唯一剩余失败发生在已完成导出/关闭/销毁后的线程退出。30秒预算未解决，现先释放PyUNO本地引用再销毁LOK、恢复5秒检查待CI。仍in_progress/failed；证据ci-run44.json。

2026-10-01 对照清理修复/退出阶段诊断3fb60e3已推送，run44验收中。本地unit17/17、TS、PowerShell AST、Python仅编译、docs/diff通过；仍in_progress/failed。

2026-10-01 run43：check/unit17/17通过，integration44/46；两个Office对照被测试映射清理的单元素索引错误遮蔽，外链对照有实际更新标记但线程退出超过5秒。已修清理索引并增加退出阶段记录/30秒预算待CI；三格式PDF中文渲染已直接核验。仍in_progress/failed，证据ci-run43.json。

2026-10-01 冷启动预算修复2f46c90已推送，run43验收中；待完整CI和实际PDF视觉核验。仍P00-03=in_progress、gate=failed、2/37。

2026-10-01 run42：bootstrap/check通过，unit16/17；PDF新用例冷启动超过默认5000ms，integration/后续验收未执行。现仅给该真实PDF用例30秒预算，本地定向1/1通过；证据`docs/evidence/P00-03/ci-run42.json`。仍in_progress/failed，待再推送。

2026-10-01 修复405aef6已推送，run42进行中；锁定Node下本地unit17/17、TypeScript/定向格式/docs检查通过。等待完整CI和实际PDF渲染核验，仍P00-03=in_progress、gate=failed。

2026-10-01 CI run41：check/unit16/16通过，integration42/46；4项Office共同失败于新增pdfjs清理API误用，标准用户/Electron未执行。已改为销毁loading task、新增真实PDF单元回归；宏事件绑定修正为dom:load，标记用任务USERPROFILE，测试映射使用CI的pwsh。待重新提交CI，仍in_progress/failed。证据`docs/evidence/P00-03/ci-run41.json`、`office-security-plan.md`。

2026-10-01 P00-03补齐Office真实安全行为测试：根据锁定版官方schema修正Calc/Writer外链枚举，增加可执行宏、真实OOXML外链及隔离内有效性对照，补损坏输入恢复/PDF中文解析/验收源码fingerprint。代码已写，本地非原生检查通过，真实结果待新Windows CI。P00-03=in_progress、gate=failed，见`docs/evidence/P00-03/office-security-plan.md`。

2026-10-01 最新有效验收：`f0bf4bd`的run40全success——check、unit16/16、管理员integration44/44、Build/Electron2/2、独立标准用户20/20。私有runtime子文件ACL传播修复已验证，真实DACL修改拒绝、memory耗尽、fork及Office均通过。仍需恶意宏/真实外链文档行为证据，P00-03=in_progress、P00-gate=failed。详见`docs/evidence/P00-03/ci-run40.json`。收尾仅文档同步，不重复触发CI。

2026-10-01 run39：管理员check/unit16/16/integration44/44/Build/Electron2/2通过，标准用户12/20；strict memory正确拒绝旧启动假通过。清理前证明runtime根已授权而标准用户exe未继承，现限定补齐私有runtime子文件的宿主账户WRITE_DAC并增加实际DACL攻击拒绝断言，待CI。证据`docs/evidence/P00-03/ci-run39.json`；P00-03=in_progress、P00-gate=failed。

2026-10-01 run38结束：回滚`089e230`恢复管理员check/unit16/16/integration44/44/Build/Electron2/2；标准用户仍13/20。已修复runtime-acl自复制导致的归档中断，将ACL诊断移至helper恢复线程前，内存用例排除启动失败假通过；本地锁定编译/TS/unit16/16/非原生integration5/5通过，新原生结果待CI。P00-03=in_progress、P00-gate=failed。证据`docs/evidence/P00-03/ci-run38.json`。

2026-10-01 CI run38进行中：Node基线回滚`089e230`已按用户授权提交推送并核对远程SHA；bootstrap/check/管理员unit+integration步骤成功，Build/Electron执行中，标准用户结果和ACL待artifact。run37无child基线也有总进程2，撤回仅凭计数判断child已创建的推断。P00-03与P00-gate仍未完成。

2026-10-01 管理员 Node 用例回滚检查点：按用户要求恢复 run36 的完整 Node 边界测试（`execFileSync + stdio: inherit`），原断言保持一致。unit16/16、GitBroker/capability integration5/5、定向格式/边界/manifest检查通过；完整check因既有`.test-data/acl-probe`的EPERM退出1。尚未提交/推送，管理员全量待Windows CI；最近标准用户仍为run36的13/20，P00-03=`in_progress`、P00-gate=`failed`。证据：`docs/evidence/P00-03/admin-node-rollback.json`。

2026-10-01 最新检查点：CI run 37（`c661043`）check、unit 16/16 通过；管理员 runner integration 43/44，Node sandbox 子进程探针触发 helper timeout。原始 events 显示 Job 总进程数2，child 已创建但同步探针没有返回；标准用户 probe 未执行，所以本轮没有新的标准用户 ACL 证据。按用户要求暂停代码修改并先调研诊断。P00-03=`in_progress`、P00-gate=`failed`。详见 `docs/evidence/P00-03/current-verification.md`。

实际开发记录：2026-09-15 初始化；2026-09-17 本次接续 P00-03，验收未完成。

2026-10-01 刷新：P00-03 仍为 `in_progress`、P00-gate=`failed`。CI run 16 的 ACL 恢复句柄权限错误已修复；run 17 的 `check` 和 unit 15/15 通过、cleanup 二次调用回归通过，但集成 38/40：fork 用例首个子进程因 `stdio: "ignore"` 同步 EPERM，尚未触及 Job 上限；Office helper failed event 的具体 stage 被通用错误遮蔽。现保留严格 fork 限制断言、切换到已验证 Node spawn 使用的 inherit stdio，并让执行器输出 helper 失败 stage。改后本地 unit、TS、build、GitBroker/capability 5/5、文档和格式检查通过；完整 `pnpm check` 仍受 ignored `.test-data/acl-probe` 的 `EPERM` 阻断。下一轮 CI 待确认。硬杀恢复、并发隔离、宏/外链、Office 映射恢复用例仍缺。详见 `docs/evidence/P00-03/current-verification.md`。

2026-09-30 当前路线与实施：Node/Python/ConPTY/Office 已迁到独立 AppContainer + 最小 ACL + Job + 无网络 capability；Office 使用 LOK 适配，Git 使用可信 GitBroker；旧账户/WFP 源码已移除。helper:build/check/build 退出0、unit15/15、GitBroker/capability integration 5/5。真实 helper integration 被本机 Windows 应用控制策略拦截，fork 新断言尚待 Windows CI；硬杀恢复、并发租约、宏/外链与独立标准用户验收仍缺。P00-03=in_progress、P00-gate=failed。见 docs/evidence/P00-03/current-verification.md 与 ci-fork-spawn.md。

## 原验收快照历史

## 2026-10-01 当前有效验收：run40全部通过，P00整体尚未收口

[run40](private-archive:TapKit)验证源码`f0bf4bd395479f7b24192abc68070314f6a4d554`：check、unit16/16、管理员integration44/44、Build/Electron2/2、独立标准用户20/20均success，能力nativeExecution/officeRender/terminal均available。证据`ci-run40.json`含artifact/job指纹和关键事件。标准用户exe已继承profile只读ACE；两次真实ACL替换拒绝5；Python child成功；内存实际240MiB后MemoryError/退出23；fork两child ready后process_limit/清理0；Office三格式exit0。仅修复CI私有副本的宿主DACL传播操作权，AppContainer授权和Job/网络限制保持原值。

下一步补恶意宏与真实外链文档行为验证，现有策略送达不能替代。P00-03仍in_progress、P00-gate仍failed。本机未执行受应用控制拦截的unsigned helper；下方run39及以前内容作为历史定位证据保留。收尾仅文档，使用skip-ci提交记录已完成run40。

## 2026-10-01 run39清理前授权差异与限定修复

`0dcbbb2`的[run39](private-archive:TapKit)管理员check/unit16/16/integration44/44/Build/Electron2/2通过；标准用户12/20（旧memory假通过已排除）。before-resume记录显示Node/Python/Office根目录已有profile只读ACE，管理员exe有继承ACE，标准用户exe为空。见`ci-run39.json`。日志采集已完整。现仅给标准宿主账户在三个私有runtime副本的既有子文件增加WRITE_DAC，用于传播和回收；AppContainer授权仍读执行。Python新增实际DACL替换攻击必须两次拒绝5。TS/格式/PowerShell/Python语法/diff检查通过；下一轮CI验证真实效果，任务和gate未完成。

## 2026-10-01 run38失败定位与下一轮诊断

管理员基线已恢复：`089e230`的[run38](private-archive:TapKit)check、unit16/16、integration44/44、Build/Electron2/2通过，标准用户13/20。详细失败与指纹见`ci-run38.json`。标准用户日志采集的runtime-acl自复制错误已修复；启动后同步ACL查询存在清理竞态，改为helper before-resume只读采集runtime根和exe的profile权限。内存测试增加ready、至少128MiB分配及MemoryError/退出23证明，排除0xC0000022启动失败假通过。所有隔离权限保持原值。锁定编译/TS/unit16/16/非原生integration5/5及定向检查通过；原生与标准用户新结果待下一轮CI。P00-03仍进行中，P00-gate仍failed。

## 2026-10-01 CI run38进行中与run37计数判断纠正

回滚已按用户授权以`089e23022e4942db8dd8e00961d88575c60595fc`推送现有分支，`git ls-remote`核对一致（退出0）。[CI run38](private-archive:TapKit)的bootstrap/check/管理员unit+integration步骤成功；Build/Electron执行中，标准用户步骤及artifact待完成。当前尚无新标准用户结论。

**纠正下方run37记录中的推断：** 已从SHA256为`377e61fcf3c954e91697efd34438a165cc26996da02a0ab0f766cf509fbf466a`的artifact按当前`launch`字段过滤历史累积记录，lease测试的`first run`与`second run`不创建child，也均报告总进程2/峰值2。因此Node超时用例的相同计数不能证明child创建成功；创建阶段仍未证实。后续以spawn/exit或负载ready标记定位，不把Job总计数当作child启动证据。

## 2026-10-01 管理员 Node 用例已回滚到 run36，尚待完整 CI

按用户要求先恢复管理员测试，再继续标准用户排查。Node 边界用例已完整恢复为 `654f961` 的 `execFileSync + stdio: inherit`，逐字比较与run36一致；全部安全断言保留，不改隔离配置/ACL。锁定本地 unit16/16、GitBroker/capability integration5/5、定向Prettier、依赖边界和manifest检查退出0；完整`pnpm check`退出1，原因仍为既有`.test-data/acl-probe`的EPERM。证据与命令见 `admin-node-rollback.json`、`20261001-admin-node-rollback-*.log`。

本轮未在本机运行受Windows应用控制拦截的unsigned helper，也未提交/推送回滚；管理员44/44是否恢复仍需Windows CI确认。最新实际CI仍为run37的43/44、标准用户未运行；最近标准用户实际结果仍为run36的13/20。同步ACL采集可能阻塞回调、内存用例可能误将启动失败当作限制通过，后续排查和最终验收需处理；当前未修改这两个位置。P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 CI run 37：管理员 runner 的 Node 诊断探针超时，标准用户步骤未运行

CI run [36859768069](private-archive:TapKit), commit `c661043`：check、unit 16/16 通过；管理员 runner integration 43/44。唯一失败是 Node sandbox 边界用例在 `expect(result.exitCode).toBe(0)` 收到1。artifact `windows-p00-evidence` SHA256 `377e61fcf3c954e91697efd34438a165cc26996da02a0ab0f766cf509fbf466a` 的 `native-cases.jsonl` 显示 helper 最终 `status=timeout`、`exitCode=1`、`totalProcesses=2`、`peakActiveProcesses=2`、`activeProcesses=0`；payload stdout 停在 `env false false`，没有 `child_launch_probe`，stderr 为空。AppContainer `started` event 和 Job 配置有效，且计数从1增至2，说明至少一个 child 已被创建；没有 child 退出结果，不能判断其是否卡在初始化或父进程同步等待。Python child 在管理员 runner 上成功（`created=true`、returncode 0、stdout `42`）。fork 上限用例达到 `process_limit`、总进程数5。

标准用户步骤因前置集成测试失败而未执行，所以本轮没有新的 `runtime-acl.json` 或 AppContainer 活动 ACL；run 36 是最近一次独立标准用户结果（20 项13通过/7失败）。

**推断：**本轮新增 Node probe 将先前 `execFileSync(..., {stdio: 'inherit'})` 改为 `spawnSync`，未设置 stdio，所以使用默认管道；同步方法会一直等待 child 关闭。Node 官方文档确认这两个行为；Windows `CreateProcessW` 官方文档说明调用成功会先于进程初始化完成返回，必要 DLL 加载/初始化失败会体现在进程终止状态。当前证据足以确认这是一次测试探针回归并且它改变了受测路径，但不能确认是管道句柄、子进程初始化还是另一处等待导致10秒超时。隔离方案和 ACL 权限未改变。按用户要求，当前暂停代码修改；下一步建议先让测试恢复原有 `stdio: inherit` 启动路径，并在该路径内用非阻塞 spawn/exit 事件记录状态，再重新跑管理员 integration，之后才进入独立标准用户 ACL 诊断。

参考：[Node.js child_process 文档](https://nodejs.org/api/child_process.html)、[Microsoft CreateProcessW 文档](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw)、[Microsoft AppContainer 子进程说明](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-for-legacy-applications-)。本地 TS、Prettier、PowerShell AST、diff check 和 unit 16/16 退出0；run 37 的标准用户/Build/Electron步骤均跳过。

## 2026-10-01 CI run 36：诊断仍需区分子进程创建失败与初始化失败

CI run [36838767685](private-archive:TapKit), commit `654f961`：check、unit 16/16、管理员 runner 当前路由 integration 44/44、Build/Electron 2/2 通过；独立标准用户 probe 20 项 13 passed/7 failed。Node child 报 `EPERM`，Python child 用例返回 `0xC0000022`，Office helper 以 exit code 1 结束且无输出。fork 用例 processLimit=4、基线进程数=2、可用槽位=2、启动子进程=0；不能视为进程数上限测试通过。

run 36 artifact `windows-p00-evidence`（SHA256 `c1d911fe31e55e193379bcc0bd16ec60315f1dec839ff73e598851ff13c1da3a`）没有提供足够字段判断 child 的 CreateProcess 是否成功、成功后是否初始化失败，也没有 runtime 副本 ACL。当前工作树的诊断补丁不改 AppContainer/Job/ACL 授权：标准用户 harness 以 `Get-Acl` 只读记录 runtime 祖先、可执行文件及相关 DLL 的 DACL/SID；测试在 helper `started` 后读取 Node、Python、Office 实际副本的活动 ACL，并关联用户 SID 与本次 AppContainer SID。Node `spawnSync` 与 Python `subprocess.run` 记录创建结果、Win32/运行时错误、退出码和输出；fork 用例记录 child spawn/exit 事件，现有 helper events 保留 Job 上限和进程计数。启动日志只记可执行文件、参数数量和选项标志，不记录完整脚本、用户任务或完整环境。所有断言和 processLimit 保持不变。

本地 TypeScript 检查、改动 TS 文件 Prettier、PowerShell AST、`git diff --check` 退出0；unit 16/16。诊断改动尚未推送、待 Windows CI 验证。P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 CI run 35：标准用户探针真实运行但 7 项失败

CI run [36836475332](private-archive:TapKit), commit `cb22a29`：bootstrap、`check`、unit 16/16、管理员 runner 当前路由 integration 44/44（sandbox 11/11）、Build/Electron 2/2 通过。修正 run 34 中“目标 kit 创建前读取 runtime-lock”的顺序后，标准用户脚本已完成 kit 准备/冻结依赖安装，身份报告 `standardUser=true`，runtime-probe 20 项 13 passed/7 failed。

失败详情：Node 隔离边界用例 exitCode 1（payload 内 child 启动失败）；helper 强杀用例未观测到所需子进程；Python 子进程 payload exit code `3221225506` (`0xC0000022`)；cancel 用例得到 `exited` 而非 `cancelled`；fork 测试初始容量 2、首个 child spawn 同步 `EPERM`、启动数0；DOCX/XLSX/PPTX 转换为 `OFFICE_EXECUTION_FAILED`；宏/外链 live route 未得到预期 `finished` 事件。其他 13 项通过，包含并发隔离、网络拒绝、路径拒绝、ConPTY、内存和 GitBroker 检查。三项能力因此继续 `SANDBOX_UNAVAILABLE/NATIVE_ACCEPTANCE_FAILED`。

现有标准用户 artifact 有 Vitest 结构化结果，但 harness 未复制临时 kit 下的 `native-cases.jsonl` 和 helper payload stdout/stderr。当前最强判断是多个失败共享子进程/Office执行受拒绝的表现，底层 Win32 原因仍未证实。sandbox 与 Office 集成用例现都把 helper events 记录到 `native-cases.jsonl`；工作树已给 harness 加有界、限定 `.test-data` 子树的 helper 日志和 native event 收集（512 KiB/文件、10 MiB 总量），以便下一轮 CI 判别，不改变任何验收条件。锁定 Node/pnpm unit 16/16、TypeScript、PowerShell AST parse、`git diff --check` 通过；本机 rustfmt 缺少匹配 DLL，格式检查未完成。该诊断变更尚未推送。P00-03=`in_progress`、P00-gate=`failed`；恶意宏/真实外链文件行为仍缺验收。

## 2026-10-01 CI run 34：标准用户夹具在复制 kit 前读取 runtime-lock

CI run [36833802663](private-archive:TapKit), commit `07d5b9a`：bootstrap 18m34s 后完成；`check` 成功；unit 16/16；当前路由 P00-03 sandbox 11/11（含 fork 限制、并发身份/ACL、强杀后恢复）；Build/Electron P00-01 2/2。独立标准用户步骤在 1m18s 失败，PowerShell `Get-Content` 第115行无法找到临时 kit 下的 `runtime-lock.json`。该锁文件在源 checkout 中存在，但 harness 先读取目标路径，之后才运行 `standard-user-kit.mjs` 创建并复制目标，因此标准用户 probe 尚未启动，run 34 未验证 `WRITE_DAC` 修复。

夹具已调整为先以 runner 身份复制标准用户 kit，再从已复制的锁文件解析 Node/Python/LibreOffice 的精确 runtime 根，并仅对这些目录授予非继承 `(WDAC)`。本地使用锁定 Node/pnpm 的 unit 16/16、`docs:check` 37 项、PowerShell AST 与 `git diff --check` 通过；系统默认 Node 24.19/pnpm 11.19 不符合仓库版本门禁，未用其执行检查。该时序修复尚未推送、等待下一次 Windows CI；P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 CI run 33：runtime 根缺少 WRITE_DAC

CI run [36831486054](private-archive:TapKit), commit `40e46fb`：unit 16/16，管理员 runner 当前路由 integration 44/44，Build/Electron 检查成功；sandbox 11/11、Office 3/3。独立用户核验 `standardUser=true`，锁定 kit 依赖安装成功，probe 为 20 项 6 通过、14 失败、0 pending。GitBroker 4 项、legacy route 和 capability 用例通过；全部 sandbox/Office helper 调用在 `started` 前出现 `path.open:0x80070005`，严格路径拒绝断言也因此失败。祖先 `(X,RA,S)` 权限变更未消除错误。

从 `PinnedPath::open(..., true)` 的 Win32 desired access 确认，helper 对 runtime 根目录最后一级请求 `READ_CONTROL | WRITE_DAC`，用来给 AppContainer 临时授只读 ACL。runtime 树由 runner 复制，测试用户虽继承 Modify ACE 但不是 owner，且 Modify 不包含 `WRITE_DAC`。CI fixture 现在只对锁定 Node/Python/LibreOffice runtime 根授非继承 `(WDAC)`，不加 runtime 内容写权和子项继承；helper `path.open` 失败阶段加用途和组件序号，避免下次仍只有笼统阶段。

本地 unit 16/16、TypeScript、`helper:build`、`docs:check`、改动 Markdown Prettier、PowerShell AST、锁定 runtime 根路径存在性与 `git diff --check` 均通过。`pnpm check` 在 Prettier 遍历现存受保护 ignored `.test-data/acl-probe` 时以 `EPERM` 退出 1，未改该目录；本机 rustfmt 被 Windows 应用控制拦截，未获得格式检查结果。未在本机运行 unsigned helper。新的 CI fixture 变更尚未推送、待 Windows CI 验证；P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 CI run 32：标准用户 helper path.open 拒绝

CI run [36829488131](private-archive:TapKit), commit `de8721c`：unit 16/16、管理员 runner integration 44/44、Build/Electron 成功；一次性非管理员身份 `standardUser=true`，冻结依赖复制安装成功。标准用户 runtime-probe 20 项中 7 通过、13 失败。新 artifact 中的 `integration-test-results.json` 显示 13 个失败正向用例统一在 helper started 事件前以 `path.open:0x80070005` 失败，Win32 5=Access denied。通过项为 capability、4 个 GitBroker、旧协议拒绝及路径拒绝组。

`PinnedPath::open_access` 对从盘符到叶节点的每一级路径组件调用 `CreateFileW(FILE_READ_ATTRIBUTES)`；测试 kit 放在 `RUNNER_TEMP` 下，而 harness 只给 kitParent 子树权限。因此最可能原因是临时标准用户缺少打开 kit 路径祖先所需的只读遍历/属性访问。该判断待 live 重验。已给 kitParent 上方的目录对象增加显式、非继承 `(X,RA,S)`，不含 list/read-data/write 权限，也不改变产品 ACL。另发现路径拒绝测试只检查 `path.*`，会把无关的 `path.open` 拒绝误记为通过；现改为逐类断言 `path.syntax` / `path.reparse`。

下一轮 Windows CI 将确认祖先 ACL 修复后正向 AppContainer 用例能进入 payload、负向路径用例仍命中准确拒绝阶段，以及完整标准用户 P00-03 是否通过。本机不运行受 Windows 应用控制拦截的 unsigned helper。P00-03=`in_progress`、P00-gate=`failed`。

## 2026-10-01 CI run 31：标准用户验收仍有 13 项失败，需收齐结构化结果

CI run [36827748673](private-archive:TapKit), commit `da951b0`：unit 16/16，管理员 runner 当前路由集成 44/44，Build/Electron 检查成功；AppContainer sandbox 11/11。一次性 kit 中冻结依赖安装成功，非管理员身份检查为 `standardUser=true`；该身份实际运行 runtime-probe 20 项，7 通过、13 失败、0 pending，能力状态均为 `NATIVE_ACCEPTANCE_FAILED`。run 30 与 run 31 的结果一致，当前路由在标准用户身份下没有通过。

下载 run 31 artifact 后确认仅有 `runtime-probe.json`、launcher stdout/stderr；runtime-probe.log 和 Vitest `test-results/P00-03-native.json` 缺失。原因是脚本在失败断言时先 `throw`，位于其后的日志复制不可达；probe 结构化测试结果留在被忽略的临时 kit。已把报告、日志和测试 JSON 的复制移入 CI harness 的 `finally`，无论通过或失败均保存到 workflow 已上传的 `ci-evidence/P00-03-standard-user`。下一轮 CI 需要读取每个 assertion 的错误与 helper 输出，才能区分标准用户 ACL/副本环境问题和产品 AppContainer 路径问题。未修改测试断言或产品权限。

## 2026-10-01 CI run 30：标准用户探针实际运行，但 13/20 项失败

CI run [36826206021](private-archive:TapKit), commit `2b87e96`：完整主 job 中 unit 16/16、集成 44/44、build/Electron 通过。runner 预装临时 kit 的冻结依赖成功，pnpm 明确记录包文件从 runner store **复制**到 kit。之后临时非管理员身份检查为 `standardUser=true`，真实 runtime-probe 运行约 66 秒，结果为 total=20、passed=7、failed=13、pending=0，三项能力都标为 `NATIVE_ACCEPTANCE_FAILED`。report 的 missingCases 为大部分 sandbox 用例和全部 3 个 Office 用例；GitBroker/legacy/capability 及一个路径拒绝用例通过。说明标准用户身份启动已验证，但不能把探针通过或 P00-03 完成。

Artifact `windows-p00-evidence` 上传成功，却未包含 `.gitignore` 忽略的 `test-results` 目录，因此当前无法核对 runtime-probe.log 里的具体失败事件。已把输出副本改到工作区未忽略的 `ci-evidence/P00-03-standard-user`，工作流增加该路径上传，并在标准用户用例失败时把 runtime-probe.log 最后 250 行输出到 Actions。下一轮需依据真实日志判定是临时账户/夹具 ACL 问题还是产品隔离代码问题；本次失败测试保持原断言，没有做通过性放宽。

## 2026-10-01 CI run 29：标准用户夹具未进入 runtime-probe

CI run [36824034370](private-archive:TapKit), commit `da11e45`：unit 16/16 通过；当前路由集成日志中的 sandbox 11/11、Office 3/3 和其他列出的集成用例均通过；Build and Electron checks 成功。标准用户步骤成功创建一次性非管理员账户、准备副本并复制 Node/Python/Git/LibreOffice runtime；随后标准用户运行 pnpm install，在从 `D:\.pnpm-store\v11\files\...` 导入包到临时 kit 的 `node_modules/.pnpm/...` 时收到 Win32 `Access is denied`。runtime-probe 尚未启动，因此本次不提供标准用户 AppContainer 验收结论。工作流最后上传了 `windows-p00-evidence` artifact。

修正为 runner 账号在一次性 kit 内安装冻结依赖并强制复制包文件，再通过 `standard-user-test.mjs --prepared-kit` 以标准用户身份运行 `prepare-native.mjs` 和完整 `runtime-probe.mjs`。这样标准用户执行期间不需要访问 runner 全局 pnpm store，仍真实执行当前 P00-03 用例并检查非管理员完整性、必需案例、零失败/跳过及能力报告。修正没有放宽隔离断言或改变产品运行方案。锁定 pnpm 的 `config get` 已确认参数解析为 `copy`，实际 install/materialize 等待下一轮 CI；本机 unit 16/16、ESLint、Prettier、Node 语法、PowerShell parser、docs:check 与 `git diff --check` 均退出 0。P00-03 仍 `in_progress`、P00-gate 仍 `failed`。

## 2026-10-01 CI run 28：Office 宏/外链策略 live-route 回归通过

CI run [36811145482](private-archive:TapKit), commit `49ed129`：Windows workflow 成功，unit 15/15、integration 44/44，总耗时 5m41s。P00-03 沙箱 11/11；Office 集成 3/3，其中 T07 DOCX/XLSX/PPTX 转换、宏启用格式拒绝与当前路线宏/外链策略配置验证、Office helper 强杀后的精确盘符映射恢复均通过。新的策略用例在真实 AppContainer XLSX→PDF 转换中核对私有 profile 的宏安全等级 3、禁止宏、Calc/Writer 链接更新值 0、LOK `EnableMacrosExecution=false`，并验证 helper 的 AppContainer/no-network/进程清理结果。

证据边界：该回归证明宏启用扩展名被 dispatch 前拒绝，并证明策略配置进入当前转换路线；没有执行带恶意宏的样本，也没有用含真实外部链接的文档观测 LibreOffice 行为，因此不把它记成恶意内容行为测试。外链拒绝仍由配置、无网络 capability 与最小 ACL 共同保障。workflow 有一条非失败 warning：`actions/checkout@v4`、`setup-node@v4`、`upload-artifact@v4` 被 GitHub runner 强制使用 Node.js 24，因为其 Node.js 20 运行时已弃用。P00-03=`in_progress`、P00-gate=`failed`；独立标准用户全量验收仍未完成。

## 标准用户探针修正（下一轮 CI 待验）

run 28 后复核发现，`runtime-probe` 必需案例表保留了并发、helper 强杀和 Office 强杀测试的旧标题；因此真实测试即使通过，探针仍会错误报告 `P00_ACCEPTANCE_INCOMPLETE`。现将必需清单独立成模块，按当前所有 20 个 P00-03 集成用例更新，并增加单元测试逐项对照测试源码，防止名称漂移；另为探针的 JSON 输出目录显式创建 `test-results`。Windows workflow 新增仅在临时 `windows-2025` runner 上创建标准用户的步骤，向该账号授予所需源码/锁定 runtime 只读权限、仅给临时 kit 目录写权限，运行现有 `standard-user-test.mjs`，并收集探针报告与日志。checkout 不再把 token 持久化到 `.git/config`。本机 unit 16/16、TypeScript、docs:check、ESLint、改动文件 Prettier、PowerShell parser 均通过；完整 `pnpm check` 仍因已有受保护的 ignored `.test-data/acl-probe-node` 报 `EPERM`。本机未运行此原生探针；该 CI harness 与修正待下一轮 Windows CI 验证。

## 2026-10-01 CI run 27：新增并发和强杀恢复验收通过

CI run [36809596619](private-archive:TapKit), commit `08b72e1`：Windows workflow 成功，unit 15/15、integration 43/43。新增并发 AppContainer 隔离用例（不同 SID、跨工作区读写拒绝）、helper 硬杀后 Job 后代终止及 ACL/profile 租约恢复用例、Office 硬杀后精确盘符映射恢复用例全部通过。当前 OfficeWorker 路径的 DOCX/XLSX/PPTX 转换也通过。

run 26 中通用 helper 硬杀测试没有触发恢复断言，因为 `stdio: "ignore"` 的 heartbeat child 未在 AppContainer 中启动。改成 `stdio: "inherit"` 后，run 27 观察到心跳、强杀后的心跳停止和下次 helper 启动后的租约回收；未降低 Job、ACL、profile 或跨任务隔离断言。CI 总耗时 5m35s，构建有一条依赖注释 warning，但 workflow 成功。P00-03=`in_progress`、P00-gate=`failed`；宏/外链拒绝和独立标准用户全量验收仍未完成。

## Office 宏与外链策略测试补充（CI run 28 已确认）

新增集成回归先确认 `.xlsm` 格式在 OfficeWorker dispatch 前被拒绝，再核对真实允许格式转换时私有 profile 写入宏安全等级 3、`DisableMacrosExecution=true`、Calc/Writer `Link=0`，并核对 LOK 加载参数 `EnableMacrosExecution=false`，随后通过当前 AppContainer 路线执行 XLSX→PDF。CI run 28 已通过该真实用例，单元测试同步检查所有策略具体值。它证明扩展名拒绝及策略送达，不声称已用恶意宏样本验证宏行为；外链有效拒绝还依赖 AppContainer 无网络和最小 ACL。独立标准用户全量验收仍待完成，P00-03/P00-gate 状态不变。

## 2026-10-01 CI run 26：并发通过，helper 心跳子进程启动方式需修正

CI run [36808915479](private-archive:TapKit), commit `a55f086`：unit 15/15，integration 42/43。并发 AppContainer 隔离用例通过（两任务重叠、身份不同、互相读写均拒绝）；OfficeWorker 三格式转换及 Office helper 强杀后的盘符/执行 lease 恢复用例也通过。唯一失败是 helper 强杀用例在 5 秒内没有收到心跳文件（值为 0），未执行强杀和 ACL/profile 恢复断言。

该测试通过子进程 `stdio: "ignore"` 启动心跳负载；此前 fork 实测已证明这种启动方式在 AppContainer 下会返回 `EPERM`，成功路线使用 `stdio: "inherit"`。已切换到继承 stdio，并在 `finally` 中确保测试无论何种断言失败都会终止 raw helper；这次仍是测试负载启动问题，没有修改生产隔离逻辑。修复后的 TypeScript、unit 15/15、Prettier 与 diff check 退出 0；待 Windows CI 重验。

## 2026-10-01 CI run 25：新恢复/并发用例的测试计时缺陷

CI run [36808222549](private-archive:TapKit), commit `edb85c7`：unit 15/15 通过，集成 41/43；原有用例和 Office 强杀后映射/执行租约恢复用例通过。两项新增 sandbox 用例失败于测试计时：Vitest 将 `Date.now()` 固定到测试基准，导致并发用例的起止读数相等；helper 恢复用例的 `Date.now()` deadline 永不触发，最终命中 15 秒测试默认超时。尚无证据表明这是隔离实现回归。

已把这两个计时点改用 `performance.now()` 单调时钟，并把包含 ACL/profile 清理的 helper 硬杀用例超时设为 60 秒。当前本地 TypeScript 退出 0、unit 15/15、Prettier 与 `git diff --check` 退出 0；修复后的 Windows CI 尚待确认。P00-03=`in_progress`，P00-gate=`failed`。

## 2026-10-01 CI run 24：上次已验证源码与文档提交通过

CI run [36807129226](private-archive:TapKit), commit `c5494ce`：workflow 成功，unit 15/15、integration 40/40。该提交只补录 run 23 的证据，未包含本次新增的强杀恢复与并发测试，因此不能作为这些新测试的验收证据。

本地新增 P00-03 集成场景：并发 helper 必须使用不同 AppContainer SID、任务间工作区互读互写均被拒绝；强杀 helper 后验证 Job 子进程停止，并由下一次 helper 调用回收执行 ACL/profile；强杀 Office helper 后验证三条记录盘符仍有精确租约，再由下一次 helper 调用清理映射和日志。新场景尚待 Windows CI 运行。当前本地 TypeScript、unit 15/15、docs:check、Prettier 和 diff check 退出 0；本机不运行被 Windows 应用控制拦截的 unsigned helper 或 rustfmt。P00-03=`in_progress`，P00-gate=`failed`。

## 2026-10-01 CI run 23：三格式 Office 转换通过

CI run [36806574221](private-archive:TapKit), commit `4d7daaa`：workflow 成功；unit 15/15、integration 40/40。P00-03 沙箱 9/9 通过，fork 上限用例通过；`P00-03.office.test.ts` 的 T07 通过，DOCX/XLSX/PPTX 在当前 AppContainer 路径均转换为 PDF，测试用时约 25 秒。该用例同时检查 PDF 签名/大小、源文件哈希保持和 helper/Job 的成功清理条件。

run 22 暴露的 `pollCount=0` 已由 run 23 的真实转换回归关闭：先进入 LOK `runLoop`，再由 worker 按成功兼容实验的 2 秒窗口提交首个 load，使 unipoll 回调得以启动。隔离和转换断言未放宽。P00-03 仍 `in_progress`、P00-gate 仍 `failed`；尚缺硬杀后 ACL/profile 与 Office 映射恢复、并发隔离、宏/外链拒绝，以及当前完整路线的独立标准用户验收。

## 2026-10-01 CI run 22：LOKit runLoop 启动顺序

CI run [36805430818](private-archive:TapKit), commit `3185ef3`：unit 15/15 通过、集成 39/40；当前 AppContainer 沙箱 9/9 通过，包含 fork 进程上限和清理。Office 初始化不再报 `theDefaultProvider`，但 worker 未能进入文档加载：诊断为 helper exit 0、payload status `exited` / exit 1、activeProcesses 0、peak 3、total 3；stdout 仅有 `loop_started`、`conversion_failed: OFFICE_LOK_LOOP_NOT_READY`、`finished`，`pollCount=0`。

对照已归档的 `lok-loop-alias.json` / `lok-loop-three-alias.json`：成功实验先进入 LibreOfficeKit `runLoop`，worker 等待 2 秒后直接发起首次文档加载；正式 worker 之前却等待 `poll` 回调后才加载，而 run 22 证明在该状态没有回调被触发，形成互等。现已移除“先等 poll 再加载”的门槛，让首次加载按已成功实验的 2 秒启动窗口进入；三格式、PDF 有效性、源文件哈希、Job 清理和 AppContainer/无网络断言均未放宽。run 23 尚待真实 Windows CI 验证。

本地验证：`pnpm helper:build` 退出 0；锁定 Python AST 解析退出 0；unit 15/15；TypeScript、`docs:check`、`git diff --check` 退出 0。未在本机启动 Office 原生集成，因为 unsigned helper 仍受 Windows 应用控制阻止；没有运行会触发系统拦截的 rustfmt。P00-03=`in_progress`，P00-gate=`failed`。

## 2026-10-01 CI run 21：Office LOK bootstrap

CI run [36803602932](private-archive:TapKit), commit `bee03e0`：unit 15/15 通过；集成 39/40，fork 上限/ready 案例通过。Office test-only diagnostics：`failedChecks=["payload exit code"]`，helper exitCode 0，payload status `exited` / exitCode 1，activeProcesses 0，peak 3，total 3。stderr 为 `Bootstrapping exception 'component context fails to supply singleton com.sun.star.configuration.theDefaultProvider of type com.sun.star.lang.XMultiServiceFactory'`，随后 Python 在 `lok_worker.py` 第 47 行 init 调用抛 `OSError: access violation reading 0x10`；stdout 为空。失败确认发生于 LOK 初始化，helper 的 Job 清理成功。

成功的归档实验 `lok-readonly-alias-verified.json` 显示 `libreofficekit_hook_2` 收到的首参数为 `Y:\program`，而本轮失败的产品 worker 传入 runtimeRoot alias `Z:\`。`lok_worker.py` 已修改为传 `runtime_root / "program"`，与锁定 LibreOffice 26.2.6.3 成功实验参数对齐。它仍在原 runtime 只读 ACL 内；没有扩大可访问路径。是否能修复初始化须由下一次 CI 三格式 OfficeWorker 用例确认。

本地验证：helper build、LibreOffice Python AST、unit 15/15、TypeScript、docs:check、TS/Markdown Prettier 和 `git diff --check` 全部退出 0。真实 Office helper integration 留待 CI，因为本机应用控制阻止 unsigned helper；不关闭或绕过安全策略。

## 2026-10-01 CI run 20 结果

CI run [36753060272](private-archive:TapKit), commit `8b214a3`：unit 15/15 通过，integration 39/40。fork 上限/ready 测试通过，日志证明成功确认两份子负载 ready 后才进行了下一次创建请求；finished status 为 `process_limit`，Job 收尾 activeProcesses=0。OfficeWorker 失败在其成功结果条件（`OFFICE_EXECUTION_FAILED`，源码 `packages/tools/src/execution/office-worker.ts`），不是 `office.executablePath` 校验；当前 CI 错误未包含子进程结束状态和输出，不能据此推断具体 LOK 故障阶段。

测试现在仅在 Office helper finished 结果不满足 OfficeWorker 原成功条件时打印限长诊断：失败的条件名、status、子进程/helper exit code、active/peak/total process count、outputBytes，以及 stdout/stderr 各最多 3000 字符。隔离断言、PDF 转换要求、源文件哈希保护均保持不变。等下一次 Windows CI 返回事件摘要后，再依照真实阶段决定是否修复 helper 或 Python/LOK 适配。

本次诊断改动本地验证：仓库锁定 Node 24.21/pnpm 12.4.1 下，unit 15/15、TypeScript、`docs:check`、改动 TS/Markdown Prettier 和 `git diff --check` 均退出 0。没有在本机运行原生 Office 集成，因为未签名 helper 受 Windows 应用控制阻止；这次只动测试和进度文件，没有重建 helper。

本地 Windows 安全中心弹窗指向由 PowerShell 启动的 `rustfmt.exe`，此前 `rustfmt --check` 请求被应用控制拦截。它不是 TapKit 的 AppContainer helper；后续不再启动 rustfmt，不需要关闭系统防护。Cargo 编译已能成功生成 helper。下一轮本地检查将避开该 executable，并且不在本机运行会触发 unsigned helper 的原生集成。

## 2026-10-01 CI run 19 失败定位与修正

CI run [36751759291](private-archive:TapKit), commit `74283d4`：unit 15/15 通过，集成 38/40。fork 子用例首个 `spawn` 因 `stdio: ['ignore','pipe','inherit']` 在 AppContainer 内同步返回 `EPERM`，finished event 为 `status=timeout`、`peakActiveProcesses=2`、`totalProcesses=2`、stdout `fork_attempt:0;fork_denied_sync:EPERM:after:0;`，没有子进程进入负载。测试改为用已验证可启动的 `stdio: 'inherit'`，子进程在 sandbox workspace 写入独立 ready 文件，父进程轮询该文件后才把 child 计为就绪并尝试下一次创建。

Office 的新静态阶段码报告 `office.executablePath`。OfficeWorker 和请求 schema 均将 executable 设置为 runtime 下 `program\python.exe`；Rust helper 原来以 `.join("program/python.exe")` 构造 expected path，Windows PathBuf 保留了这段正斜杠，故不等于实际路径。helper 改为 `.join("program").join("python.exe")`，仍保留精确路径要求和其余所有隔离检查。

本次修改后的本地验证：unit 15/15、`pnpm build`（含锁定 Rust helper 构建）、TypeScript、`docs:check`、改动文件 Prettier 和 `git diff --check` 均退出 0。完整 `pnpm check` 被既有 ignored `.test-data/acl-probe` 的 `EPERM` 阻断；单独 `rustfmt --check` 被 Windows 应用控制拦截，helper 编译本身成功。Windows CI 尚未复核本次两项修正。

## 2026-10-01 CI run 18 复核与当前修正

CI run [36748972490](private-archive:TapKit), commit `daabe81`：`pnpm check`、unit 15/15 和 cleanup 后二次 helper 调用回归通过；集成 38/40。fork 结束事件为 `processLimit=4`、`peakActiveProcesses=5`、`totalProcesses=5`、`status=process_limit`、`activeProcesses=0`。stdout 记录了 3 个 Node `spawn` 通知，但该通知早于子进程负载代码运行，故不能用它计数已运行的负载进程。helper 的现有 Job 上限观察与超限终止逻辑执行了整组清理。

当前 fork 测试先将同一 helper/Node 的无子进程运行设为 `processLimit=4` 基线，再按 `4 - baselinePeak` 计算可用槽位。每个子进程必须从自己的负载主动写出 ready 标记；只有 ready 数量达到可用槽位后，父进程才发起下一次 fork。断言核对恰有可用容量数量的负载运行、确有一次超额创建尝试、完成状态为明确创建拒绝后的 timeout 或 helper `process_limit` 兜底终止，以及 Job 最终活动数归零。Job 峰值要求触及 configured limit、但不超过一次被拒绝关联的瞬时采样值（limit+1）。这同时检验正常拒绝路径和 helper 的 containment fallback，不依赖 `spawn` 事件推断负载已启动。

OfficeWorker 现在能报告 helper 的 `office.pathScope`，但原检查把可执行文件路径、输入/工作区/runtime 根目录互斥、源文件类型与大小合并。当前代码保持每一项原判断，仅将它们拆成无路径内容的静态诊断阶段码，供下次 CI 精确定位，安全边界没有放宽。

本地验证：unit 15/15、TypeScript 检查和锁定 Rust helper 构建均退出 0；`docs:check`、改动文件 Prettier 与 `git diff --check` 也退出 0。完整 `pnpm check` 仅在 Prettier 枚举既有 ignored `.test-data/acl-probe` 时因 `EPERM` 退出 1，该目录未更改。当前机器的 Windows 应用控制阻止未签名 helper，无法本机验证实际 AppContainer 测试；下一次 Windows CI 为 fork ready 测试和 Office 阶段码提供 live 证据。P00-03=`in_progress`，P00-gate=`failed`。

## 2026-10-01 CI run 16 diagnosis and repair

Run `36744511479`, job `109987159971`, on commit `cc86c8b` reported 10 failures across sandbox, Office, and legacy-route integration files. The repeated `expected 1 to be +0` was `finished()` asserting helper exit code 0, not an active-process count. The sandbox helper's lease cleanup reopened roots with `PinnedPath::open(..., false)`, which requests only `FILE_READ_ATTRIBUTES`; recovery then tried to read the DACL through `GetSecurityInfo` and failed with `acl.read:0x80070005`. The failed cleanup preserved the journal. Since `main` calls `recover_stale()` before dispatch, later helpers also failed before processing their requests. Office failures were downstream of the same helper failure.

The recovery path now requests ACL-edit rights for the last root handle while retaining the journal's volume/file identity check before edits. A regression test checks successful lease cleanup and an immediate next helper invocation. The old-route test now validates the structured `failed/VALIDATION_ERROR/protocol` event on stdout. The workflow uploads `docs/evidence/P00-03/native-cases.jsonl`; helper cleanup failures include the recognized cleanup marker in the error message.

Local results: `pnpm test:unit` 15/15; `pnpm build` exit 0 (including the Rust helper); `pnpm exec tsc --project tsconfig.json` exit 0; GitBroker/capability integration 5/5; changed TS/YAML Prettier check exit 0. `pnpm check` exit 1 only at root Prettier enumeration of `.test-data/acl-probe` (`EPERM`), before completing the full check; the protected directory was not modified. Native AppContainer integration was not run locally because the host's application-control policy blocks the unsigned helper.

## 2026-10-01 CI run 17

Run [36747420125](private-archive:TapKit), commit `bd48e6b`: bootstrap/build setup completed; `pnpm check` passed; unit 15/15 passed; integration 38/40 passed. The cleanup-then-next-invocation regression passed, confirming the ACL-handle fix in CI. The fork test's Node spawn using `stdio: "ignore"` failed synchronously with `EPERM` before the configured process limit was exercised (peak 2 for limit 4); a known-good inherited-handle spawn is being used without relaxing the exact Job-limit assertions. OfficeWorker failed because the helper returned a `failed` event that NativeSandboxExecutor summarized as a generic identity/cleanup failure; the executor now includes the helper failure stage in its message for the next CI diagnosis while preserving its stable error code. Full CI remains failed pending these follow-up changes.

Follow-up local validation: unit 15/15, TypeScript check, `pnpm build`, GitBroker/capability integration 5/5, changed Markdown/TypeScript Prettier, `pnpm docs:check`, and `git diff --check` all exit 0. Full `pnpm check` exits 1 only because Prettier cannot enumerate the existing ignored `.test-data/acl-probe` directory (`EPERM`); the directory was not modified. Native AppContainer integration remains unavailable locally because application control blocks the unsigned helper.

## 2026-10-01 刷新检查（CI run 16 之前的检查点）

当前分支仍为 `fix/corrected-appcontainer-isolation`，HEAD `1c46a5e`，P00-03 改动仍未提交。

| 命令/检查 | 结果 |
|---|---|
| `pnpm test:unit` | 15/15 通过 |
| `pnpm build` | 退出 0；锁定 Rust helper 和应用构建通过 |
| `pnpm test:integration P00-03.git-broker.test.ts P00-03.capability.test.ts` | 5/5 通过 |
| `pnpm docs:check` | 退出 0；37 项任务状态、交接和需求证据链接通过 |
| `pnpm check` | 退出 1；TypeScript、renderer TypeScript 与 ESLint 步骤完成，Prettier 根目录扫描在 `.test-data/acl-probe` 遇到 `EPERM scandir` |
| Prettier 对当前存在的 tracked/untracked 非忽略文件分批检查 | 退出 0；所有匹配文件格式通过 |

`.test-data/acl-probe` 是已忽略目录，创建时间为 2026-09-17；当前用户不能读取其 ACL 或目录内容。未更改该目录权限、内容或所有者。全量 `pnpm check` 因本地 Prettier 扫描错误仍不能记为通过。未在本轮启动 native helper，也未触发 Windows 安全弹窗。

进程上限验证方面，Windows CI 以前启动过 helper，但旧日志为 `EPERM` 早于 4 个活动进程（peak 2/limit 4）；它没有证明上限正确。当前严格断言仍需把这组未提交改动送入 `windows-2025` CI 后确认。

当前 P00-03 集成测试清单仍缺四项：helper 硬杀后 ACL/profile 恢复、并行运行隔离、Office 宏/外链拒绝、Office 映射硬杀恢复。`runtime-probe` 已要求这些用例，因此能力及 gate 继续保持 failed。

日期：2026-09-30
分支：`fix/corrected-appcontainer-isolation`
接续 HEAD：`1c46a5e`

## 已完成的实现

- TypeScript contracts 只接受当前 `diagnostic.execute` / `office.render` 路线；NativeSandboxExecutor 核验 AppContainer SID、Job、无网络和进程清理。
- Native helper 只创建 AppContainer 进程，按 run ID 记录 ACL/profile 恢复信息；旧账户初始化、受限令牌及 WFP helper 源码已移除。
- OfficeWorker 已接固定 LibreOfficeKit Python 适配，检查输入版本、输出 PDF 和隔离事件；Office 临时盘符有唯一租约、精确撤销和下次启动恢复。
- Git 继续由 GitBroker 从私有快照执行固定操作。
- `runtime-probe` 现在逐条要求 P00-03 集成案例全部通过、无跳过、指纹稳定且运行身份为标准用户；缺少必需的安全/恢复案例时仍报告 failed。

## 本轮真实检查结果

| 命令/检查 | 结果 |
|---|---|
| `pnpm helper:build` | 退出 0；修正 `win.rs` 的 SID API 导入后通过 |
| `pnpm check` | 退出 0 |
| `pnpm exec tsc --project tsconfig.json` | 退出 0 |
| `pnpm test:unit` | 15/15 通过 |
| P00-03 GitBroker + capability 集成 | 5/5 通过 |
| P00-03 capability 集成 runner JSON 冒烟 | 1/1 通过；确认 pnpm 过滤参数及 JSON 报告字段正常 |
| 锁定 Python 对 `lok_worker.py` 执行 AST 解析 | 退出 0 |
| `executionFingerprint` | 完整运行时和源码指纹计算成功 |
| `pnpm build` | 退出 0；依赖包有 Rollup 注释提示，未影响构建 |
| `pnpm docs:check` / `git diff --check` | 退出 0 |
| sandbox + 旧协议集成 | 未能启动 helper，不能计作隔离功能结果 |

真实 helper 被 Windows 应用控制策略阻止：PowerShell 直接启动提示“应用程序控制策略已阻止此文件”；Node `spawnSync` 返回 `UNKNOWN`。Windows 安全中心也提示无法确认 `tapkit-windows-helper.exe` 的发布者。拦截发生在 native helper 进入 `main` 之前，因此本轮没有验证 AppContainer、Office 转换或旧协议处理。没有关闭或绕过系统策略。

## 当前未完成项

1. 在允许该 helper 启动的 Windows CI/标准用户环境重跑完整 P00-03 集成；确认严格 fork 用例在 `processLimit=4` 下拒绝下一次创建且 Job 峰值正好为 4。
2. 实测当前 OfficeWorker 路径的 DOCX/XLSX/PPTX 转换、宏/外链拒绝、PDF 可读性与原件只读；Office 协议单测先前发现漏传 `protocolVersion`，代码已补，但真实启动尚未验证。
3. 增加并通过 hard-kill 后 AppContainer ACL/profile 恢复、Office 映射恢复、并发执行隔离、别名冲突/盘符耗尽测试。
4. 用独立标准用户运行当前完整路线；旧 R09 9/9 子集只保留为历史证据。

因此当前代码实现推进了，但 P00-03 仍 `in_progress`、P00-gate 仍 `failed`，能力不可用。
