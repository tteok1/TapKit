# 开发进度总表

## 2026-10-09 独立公开副本准备检查点

2026-10-09 用户提供新公开仓库 https://github.com/tteok1/TapKit 与 noreply 提交邮箱。已在 D:/Tapkit-public 建立独立 main 快照，当前 P03-01 工作树源码随单次首次提交准备交付；原目录与 Git 历史保留。303 份代码/配置逐字节一致，213 份 JSON 可解析，格式检查与37项文档状态/证据链接检查退出0；81份未完成公开审查的旧截图/PDF留在私有档案，三个已核查合成截图保留。常见令牌/密钥模式、旧账号、旧提交邮箱和当前主机名检查未发现残留；这是模式检查，不保证无法通过项目内容建立关联。尚未公开推送，新 CI 未运行，R15=pending，三个 native CORRUPT_FILE 未修复，P03-01=in_progress、02/03未开始，无gate。证据：docs/evidence/P03-01/public-snapshot-preparation-2026-10-09.json。

## 2026-10-09 接续需求审计与本地验收

2026-10-09 在 D:/TapKit 拉取并切换 codex/p03-files（47db847）。本轮工作树补齐媒体原件/OCR 状态、生成笔记固定引用和搜索（schema9）、按项导入/按版本解析取消及生成并发检查；24 项需求/异常本地审计完成。unit44/44、相关integration148/148、完整P03 Electron17/17、build:desktop/check/docs/diff退出0；详细失败轮与证据见 docs/evidence/P03-01/resume-validation-2026-10-09.json。R15仍pending，当前PR37865577359两job零步骤账单failure，新native诊断未运行，三个CORRUPT_FILE未修复。P03-01保持in_progress，02/03未开始，无gate；本轮尚未commit/push。

## 2026-10-09 交接与跨范围目录检查点

按用户要求整理并推送P03交接：docs/progress/P03-handoff-2026-10-09.md。4b0ae7d已push；其PR37843769278/check113539392235/startup113539403798均零步骤账单failure，R15 pending。随后跨范围目录隐藏引用问题已修复，相关integration82/完整P03 Electron13及最终新项1/1/build/check318退出0；真实原生及24项需求/异常最终审计未完成，P03-01=in_progress、P03-02/03未开始。目录证据：docs/evidence/P03-01/scoped-folder-checkpoint-2026-10-09.json。

## 2026-10-09 导航生命周期与固定范围版本检查点

导航晚到/取消三项真实Electron通过，晚到已提交原件只追加原草稿，创建会话晚到不导入，选择晚到释放实际token；资料库默认项目/会话固定版本、旧正文/格式/大小与复制/元数据操作已修复。unit15/integration81/完整P03 Electron12/build/check318退出0；真实原生/R15未收口，跨范围目录与需求异常审计待验，P03-01保持in_progress。证据：docs/evidence/P03-01/scoped-library-checkpoint-2026-10-09.json。

## 2026-10-09 聊天Host导入交付与CI卡点

聊天Host导入业务源码99afbad已commit；前三次push网络失败，单次schannel+HTTP/1.1重试exit0并核验完整远程SHA，未改持久配置或证书校验。Draft PR#6说明更新成功（初次API失败后幂等重试）。PR37836620620/push37836615137完成failure，check113515161310/startup113515177173均零步骤；两条注释明确账户付款失败或消费上限，R15仍pending，新native诊断未运行。P03-01=in_progress；导航取消/晚到草稿和需求异常审计仍可独立推进，P03-02/03未开始。证据：docs/evidence/P03-01/chat-host-delivery-2026-10-09.json。

## 2026-10-09 聊天Host文件导入检查点

物理聊天File经preload真实File验证进入Host token/files.import；无路径粘贴兼容，Host拒绝不回退字节。逐项进度/取消/部分失败保留成功固定引用，原件下载和版本重试可用；项目引用下载与撤权拒绝通过实际Electron链路。相关unit13、integration50+选择6退出0；首轮完整Electron15通过，追加项目撤权用例后14/15（错误提示容器定位失败），仅修正为role=alert后该项1/1通过，其他14项源码未变，脚本恢复生产构建。旧截图仅恢复本轮重生成文件；新截图已核查。最终check317文件/docs:check/diff退出0，生产fixture标记为false。d4204b6已push，其最新CI仍R15零步骤账单失败，原生诊断未运行。P03-01=in_progress，导航取消/故障与需求审计/native待收口；P03-02/03未开始。证据：docs/evidence/P03-01/chat-host-checkpoint-2026-10-09.json。

## 2026-10-09 聊天材料交付与CI卡点

业务源码8f69beb已提交；首次push连接重置，重试exit0且核对完整远程SHA，Draft PR#6说明已更新。PR37831922651/push37831915108完成failure，check113499168601/startup113499184273均零步骤；注释仍为付款失败/消费上限，新原生诊断未运行，R15保持pending。P03-01继续in_progress，物理聊天Host token与异常/需求审计尚有独立工作，P03-02/03未开始。证据：docs/evidence/P03-01/material-delivery-2026-10-09.json。

## 2026-10-09 聊天文件材料检查点

聊天/files.read消费固定版本的已解析结构，项目材料读取前后检查固定引用/撤权/删除/作用域变化；引用选择器保持项目旧版。旧文本兼容并增加session固定引用，缺失二进制结构不回退原件UTF-8。合成结构消费integration53/unit7及聊天+P03 Electron12/check314文件/docs:check37项/diff通过，脚本恢复生产构建且fixture标记缺失；初轮11/12及图表777.333px对整数777px失败已记录，1px内边界修正后原断言通过，截图已核查。无真实模型或helper。8e05705已commit/push且远程SHA一致，PR37829217781/check113489886118/startup113489897720均零步骤账单failure；R15仍pending。物理聊天导入仍需统一Host token，故障/需求审计及native待收口，P03-01=in_progress。证据：docs/evidence/P03-01/material-checkpoint-2026-10-09.json。

## 2026-10-09 文件版本界面验收检查点

P03真实Electron新增同名/大写后缀skip、明确目标replace新版本、恢复成新版本、历史下载、独立副本、项目固定引用与移除；两份合成源内容不变。首轮错误UI选择器失败已修正，单项及完整P03 Electron7/TypeScript/check311文件/docs:check37项/diff退出0，生产源码复用4765ee4已验证构建。4765ee4已commit/push且远程SHA一致；PR37828123412/check113486146409/startup113486158748均零步骤账单failure，R15仍pending。P03-01=in_progress；审计发现聊天材料仍直接UTF-8读原件，尚需对接P03解析结构与范围；故障分支/需求审计/native待收口。证据：docs/evidence/P03-01/version-ui-checkpoint-2026-10-09.json。

## 2026-10-09 任务附件使用记录检查点

files.usage复用执行/用户消息/task_versions投影固定附件记录，区分保存引用/排队与已接受执行；逐表profile、删除和版本归属过滤，最近100条及截断，显示历史任务目标和实际状态。相关integration57/unit7/完整P03 Electron6/desktop build/TypeScript/check311文件/docs:check37项/diff退出0（check首次格式失败已修正），截图已核查；没有调用真实模型或本机helper。b707dc5已commit/push且远程SHA一致；PR37825534686/check113477297263/startup113477317697均零步骤失败，账单注释仍为R15。P03-01保持in_progress，剩余版本/故障E2E、需求审计及原生验收待收口。证据：docs/evidence/P03-01/task-usage-checkpoint-2026-10-09.json。

## 2026-10-09 解析暂存恢复检查点

Core私有解析目录新增profile/版本/job/租约标记及有界后台维护；连接就绪后扫描，当前租约（即使到期）和未知/链接目录保留，正常回收后才删除旧暂存。退出停止扫描并等待后再关DB。实际解析进程终止（executor前暂停，不启动helper）、目录/junction/停止等五项及相关integration41、Electron13、build/check307文件/docs:check37项/diff退出0；失败轮与修正见证据，不冒充native通过。5d3c0ec已push且远程SHA一致；PR37371772936/check取消0步骤/startup111975484374 failure0步骤，注释仍为R15账单限制。P03-01保持in_progress，任务使用记录/剩余版本与故障E2E/真实原生验收待收口。证据：docs/evidence/P03-01/staging-checkpoint-2026-10-09.json。

## 2026-10-06 导入中断恢复检查点

批次开始检查点复用request_receipts；实际终止独立导入进程后，SQLite与Electron重开保留已提交项，丢失授权项明确导入未完成；旧请求不读源/不重复版本，新token仅重试未完成项。历史提示可持久隐藏且原件不删除。相关integration36/P03 unit28/Electron5/build/check303文件退出0，截图已核查；不冒充native验收。e1d4094文件库已push并核对完整远程SHA；其PR37370141971/check111964981057仍零步骤账单failure，startup排队，R15未恢复。P03-01保持in_progress，parser暂存恢复/任务使用记录/原生验收待收口。证据：docs/evidence/P03-01/import-recovery-checkpoint-2026-10-06.json。

## 2026-10-06 文件库界面与实际Electron检查点

资料库界面与Host/preload/Core真实链路已接入；筛选/目录/版本/回收站/占用及批量影响/逐项取消结果已实现。unit255、相关integration80、P03 Electron4及P00 Electron8通过，build:desktop/check300文件/docs:check/diff退出0；首次P00白名单7/8失败补四个文件入口后8/8，隔离断言保留。9b78267原件导出已commit/push；PR37365004247最新startup零步骤失败，注释仍为R15账单限制，新native诊断未运行。P03-01保持in_progress：原生解析、崩溃恢复、任务使用记录及图像原件体验仍待收口。证据：docs/evidence/P03-01/library-checkpoint-2026-10-06.json。

## 2026-10-06 受控原件导出工作树

Host导入1f58f17已commit/push并核对远程SHA；PR说明已更新。PR CI37364001607/check111944834763排队，R15账单问题未反馈恢复。当前新增saveOriginal/私有files.export及前后权限验证、wx保护既有文件、撤权/取消清理；五项导出/相关32 integration及TypeScript/check296文件/docs:check/build:desktop退出0；实际Electron/UI仍待验。P03-01保持in_progress，导出尚未commit。证据：docs/evidence/P03-01/original-export-checkpoint-2026-10-06.json。

## 2026-10-06 Host导入与CI资源卡点

Host选择token/只读固定句柄/窗口绑定/过期及FileService已接入实际公共命令；多选/目录层级/明确替换/按项结果/取消/幂等收据/解析排队已实现。unit255/相关integration72及新增Host+service16/check293文件/build/docs:check/diff退出0；UI与Electron导入验收未做。19afa7f的PR CI37361800521/check111937957349没有执行步骤；GitHub注释明确付款失败或消费上限需调整（R15），新native诊断未运行，不能宣称原生解析已修复。P03-01保持in_progress。 证据：docs/evidence/P03-01/host-import-checkpoint-2026-10-06.json。

## 2026-10-06 原生失败核查与缓存检查点

3e569f7 PR/check111919325286已完成：unit251/251、integration171/174（唯一失败文件是新增P03.native-parser的3项）、P00独立标准用户22/22及macro/links各三轮通过；P03标准用户0/3。管理员与标准用户helper真实AppContainer/无网络/身份匹配、helper exit0/载荷exit1/activeProcesses0，返回CORRUPT_FILE。旧日志缺IO阶段，新增静态阶段+白名单IO代码及仅合成测试有界stdout/stderr诊断，未改变隔离/断言/上限。本机helper未运行。证据native-parser-failure-2026-10-06.json。文件占用/原件与缓存去重/备份保留、原子清预览和再次权限校验已实现；unit255/相关integration56/check=0，FileService/Host/UI未接入，P03-01仍in_progress。

## 2026-10-06 PDF解析检查点

PDF固定资源与文本/页矩形worker已实现；unit255、相关integration19、check及desktop build=0。真实加密PDF正向解密和导入拒绝、实际501页拒绝、原件不变、受信资源替换拒绝均已本地验证；native待新CI，本机helper未运行。3e569f7已commit/push；其PR CI37356263115/check111919325286已通过Check/perf/build+Electron，但integration失败、标准用户进行中，待完整日志定位。P03-01=in_progress；证据docs/evidence/P03-01/pdf-parser-checkpoint-2026-10-06.json。

## 2026-10-06 Office解析检查点

OOXML worker和真实native/标准用户验收已实现；unit251/相关integration16/check/desktop build退出0。仅便携解析与结构测试已实跑；native等待CI，本机helper未运行。证据docs/evidence/P03-01/office-parser-checkpoint-2026-10-06.json；P03-01=in_progress，PDF/image/Host/UI未完成。

## 2026-10-06 CI格式修复

bcedfd7已push并核对远程SHA；PR CI37353816483/check111911028217在Check因INDEX.md格式失败，后续业务检查未执行。进度文件更新发生于上次check之后。修正INDEX并改为Git文件清单格式检查，避免进入已忽略的ACL私有测试目录；未改权限。新增未格式化文件负向检查确实exit1，清理探针后完整check=0（280文件）；不把旧检查当最终提交通过。Office结构解析正在工作树开发，尚未commit。

## 2026-10-06 当前接续

21d3924的PR CI37348464103和push CI37348457242均完整success，check及startup-diagnostics通过。归档11362432951确认unit230/integration165/Electron8、独立标准用户22/22无missing、macro与links各三轮全部通过；启用对照mainThread=true/Hidden=false，实际A1=TK_MACRO_EXECUTED，默认阻断PDF/标记文件缺失及源hash断言同时通过。P00-03=implemented_and_verified、P00-gate=passed仅对应该源码；本机unsigned helper仍拒绝，不转植报告、不绕过策略。新P03 worker须单独原生验收。证据docs/evidence/P03-01/macro-control-repair-2026-10-06.json。

P03-01注册固定受限Node解析handler及文本/ZIP bundle，242 unit/50相关integration/check/desktop build退出0；仅便携合成进程和编排边界已验，新P03原生用例、Office/PDF、Host/UI仍待实现。docs/evidence/P03-01/parser-checkpoint-2026-10-06.json；P03-01=in_progress，P03-02/03未开始。

## 2026-10-06 文件仓库检查点

d4fd451的PR CI37344605352与push CI37344599460均失败：宏对照mainThread=true但A1仍TK_MACRO_BLOCKED，管理员154/155、标准用户21/22、macro三轮0/3，links三轮3/3。已下载两轮日志并记录SHA。锁定LO源码确认Hidden文档跳过OnLoad通知；第二候选仅测试侧改Hidden=false及有界事件处理，不直接调用宏，生产禁宏与原限时不变；静态检查退出0，真实效果待新CI。

P03-01的schema8/文件仓库/版本/引用/回收站/GC/解析租约已实现；unit230、相关integration45和check退出0。Host/实际解析/handler/UI仍待接入，P03-01=in_progress，P03-02/03未开始。证据：docs/evidence/P03-01/repository-2026-10-06.json。

## 2026-10-06 候选验证

2026-10-06 PR CI37324850125详细归档确认：默认禁宏通过，启用对照正常exit0/activeProcesses0，但PDF仍TK_MACRO_BLOCKED。测试侧候选改UNO主循环及MacroExecutionMode=4，保留生产禁宏/Job/无网络及原限时；三轮诊断覆盖macro和links，原完整管理员/标准用户用例仍执行。两模式生成Python仅语法、PowerShell AST、node --check、TypeScript和pnpm check退出0，真实候选效果待新CI。证据docs/evidence/P03-01/macro-control-repair-2026-10-06.json。 状态保持P00-03/P03-01=in_progress、P00-gate=failed。

## 2026-10-06 当前接续

2026-10-06 当前复验：P03首提交c39446b已push并建Draft PR#6；同提交push CI37324723679成功，但PR CI37324850125标准用户21/22，唯一宏阻断启用对照失败，其余步骤/Office三轮/startup通过。详细失败待归档报告核查，不能用成功轮覆盖失败。P00-03=in_progress、P00-gate=failed重新接续；本机安全策略未改。证据docs/evidence/P03-01/checkpoint-2026-10-06.json。 P03-01契约与schema8迁移实施中，unit230、相关integration36通过；P03-02/03未开始。

2026-10-05 P03前置复核：origin/main cc3d60f9691455ab62e5200273e0a813a45797cc的CI37320656771完整通过，管理员unit227/integration155、P00 Electron8、独立标准用户无missing、三轮Office及启动诊断全部成功；核对其生产源码与e3d5d1f一致。旧Office回归已复验收口，P00-03=implemented_and_verified、P00-gate=passed；本机unsigned helper应用控制仍拒绝，不复制远程报告开启本机能力。证据：docs/evidence/P03-01/dependency-preflight-2026-10-05.json。 当前任务P03-01；P03-02/03未开始，P01/P02真实模型状态保持。

2026-10-05 head491d316的PR CI37309310850/check：仅搜索P95 1031.16ms失败（push轮531.23ms）；Office管理员/标准用户/三轮、unit/integration及P00 Electron通过。相关性改为一次评分、包含同分的候选关联；权限/作用域过滤后不足一页时有界扩增，在同一SQLite快照完成。保留500ms/数据量/原排序与分页；本地unit227/227、相关integration16/16、perf1/1（搜索114.74ms）、P02-03 Electron4/4及生产构建恢复通过。e3d5d1f已提交/推送且远程SHA一致；[PR CI37313071166](private-archive:TapKit)与push CI37313064059完整通过，搜索P95分别269.99/210.48ms，均满足原500ms门槛；标准用户、Office三轮及startup均通过。[证据](../evidence/P02-03/ci-search-optimization-2026-10-05.json)；新源码CI已通过，任务/门禁状态保持。

2026-10-05 CI修复：当前源码新构建下复现P00两处过期断言，修复后CI同过滤Electron8/8及相关unit22/22、integration24/24通过；build/check/docs/diff退出0。见[证据](../evidence/P02-03/ci-repair-2026-10-05/summary.md)。此前本地提交31501b2已在远程CI运行，P00 Electron8/8通过；后续失败见最新记录；任务和阶段状态保持。

2026-10-05：D:/TapKit，codex/p02-01，P02-03代码提交69df004已推送并核对远程；P02-03本地交付与规定验证完成，状态implemented_not_live_verified，Git交付见[记录](../evidence/P02-03/git-delivery-2026-10-05.json)。P02-gate=engineering_passed_external_pending；P00/P01 failed门禁保持。结果与接续见[P02-03](P02-03.md)、[阶段收口](P02-gate.md)和[下一步计划](../evidence/P02-03/next-plan-2026-10-05.md)。

状态：not_started未开始；in_progress实施中；resource_blocked资源阻塞；implemented_not_live_verified实现/本地检查完成但缺live；implemented_and_verified规定验证全部通过。

历史日志完整保存于[本轮整理前记录](../evidence/P02-02/prior-index-2026-10-05.md)。以本表及CURRENT为当前状态，不按代码量估百分比。

| 任务   | 标题                               | 前置           | 状态                          | 任务记录（项目相对路径，开始后创建） |
| ------ | ---------------------------------- | -------------- | ----------------------------- | ------------------------------------ |
| P00-01 | 工程初始化与依赖锁定               | —              | implemented_and_verified      | docs/progress/P00-01.md              |
| P00-02 | 本地数据、IPC、凭据与后台作业底座  | P00-01         | implemented_and_verified      | docs/progress/P00-02.md              |
| P00-03 | Windows隔离与文件运行组件验证      | P00-01, P00-02 | implemented_and_verified      | docs/progress/P00-03.md              |
| P01-01 | Codex订阅OAuth与模型直连接入       | P00-02         | in_progress                   | docs/progress/P01-01.md              |
| P01-02 | DeepSeek、混元、Grok和豆包API适配  | P00-02         | in_progress                   | docs/progress/P01-02.md              |
| P01-03 | 模型目录、费用账本和自动后备       | P01-01, P01-02 | implemented_not_live_verified | docs/progress/P01-03.md              |
| P02-01 | 桌面布局、设置和模型连接体验       | P01-03         | implemented_not_live_verified | docs/progress/P02-01.md              |
| P02-02 | 聊天发送、流式消息和只读执行循环   | P02-01         | implemented_not_live_verified | docs/progress/P02-02.md              |
| P02-03 | 会话组织、消息分支与全局搜索       | P02-02         | implemented_not_live_verified | docs/progress/P02-03.md              |
| P03-01 | 文件导入、版本、资料库与解析流水线 | P02-03, P00-03 | in_progress                   | docs/progress/P03-01.md              |
| P03-02 | 文件预览、定位与右侧工作面板       | P03-01         | not_started                   | docs/progress/P03-02.md              |
| P03-03 | 项目管理、资料范围与索引版本       | P03-02         | not_started                   | docs/progress/P03-03.md              |
| P04-01 | 中文混合检索、重排与引用证据       | P03-03         | not_started                   | docs/progress/P04-01.md              |
| P04-02 | 上下文预算、压缩检查点与缓存       | P04-01, P01-03 | not_started                   | docs/progress/P04-02.md              |
| P04-03 | 自动长期记忆、历史参考与管理       | P04-02         | not_started                   | docs/progress/P04-03.md              |
| P05-01 | 联网搜索、匿名网页读取与来源归档   | P04-03         | not_started                   | docs/progress/P05-01.md              |
| P05-02 | 引用交互、会话导出和本地分享快照   | P05-01, P03-02 | not_started                   | docs/progress/P05-02.md              |
| P05-03 | 聊天版本端到端验收                 | P05-02         | not_started                   | docs/progress/P05-03.md              |
| P06-01 | 持久化工作任务、计划和执行编排     | P05-03         | not_started                   | docs/progress/P06-01.md              |
| P06-02 | 写入工具、审批与产物验收网关       | P06-01, P00-03 | not_started                   | docs/progress/P06-02.md              |
| P06-03 | 故障恢复、暂停取消与本地任务通知   | P06-02         | not_started                   | docs/progress/P06-03.md              |
| P07-01 | 报告与文档成果生成、版本修改       | P06-03         | not_started                   | docs/progress/P07-01.md              |
| P07-02 | 表格分析、图表与可交互数据成果     | P07-01         | not_started                   | docs/progress/P07-02.md              |
| P07-03 | 演示文稿生成与办公质量回归         | P07-02         | not_started                   | docs/progress/P07-03.md              |
| P08-01 | 匿名浏览器交互与用户接管           | P07-03, P05-01 | not_started                   | docs/progress/P08-01.md              |
| P08-02 | 深度研究工作流与来源核验           | P08-01         | not_started                   | docs/progress/P08-02.md              |
| P08-03 | 有界子Agent与独立任务协调          | P08-02         | not_started                   | docs/progress/P08-03.md              |
| P09-01 | 代码项目、Git隔离与差异审阅        | P08-03         | not_started                   | docs/progress/P09-01.md              |
| P09-02 | 终端、依赖准备与代码测试执行       | P09-01, P00-03 | not_started                   | docs/progress/P09-02.md              |
| P09-03 | GitHub连接、提交与Draft PR闭环     | P09-02         | not_started                   | docs/progress/P09-03.md              |
| P09-04 | 网站生成和本地交互预览             | P09-02         | not_started                   | docs/progress/P09-04.md              |
| P10-01 | 轻量文档画布和局部AI修改           | P07-03, P09-04 | not_started                   | docs/progress/P10-01.md              |
| P10-02 | 占位页面、通用体验与无障碍完善     | P10-01         | not_started                   | docs/progress/P10-02.md              |
| P10-03 | 数据导出、清理、备份和恢复闭环     | P10-02         | not_started                   | docs/progress/P10-03.md              |
| P11-01 | 系统评测、故障回归与源码开发版交付 | P10-03         | not_started                   | docs/progress/P11-01.md              |
| P11-02 | Windows安装包、升级与标准用户验证  | P11-01         | not_started                   | docs/progress/P11-02.md              |
| P11-03 | GitHub开源交接与官网下载准备       | P11-02         | not_started                   | docs/progress/P11-03.md              |

## 阶段状态

| 阶段 | gate_status                         | 收口报告（收口时创建）    |
| ---- | ----------------------------------- | ------------------------- |
| P00  | passed                              | docs/progress/P00-gate.md |
| P01  | failed                              | docs/progress/P01-gate.md |
| P02  | engineering_passed_external_pending | docs/progress/P02-gate.md |
| P03  | not_started                         | docs/progress/P03-gate.md |
| P04  | not_started                         | docs/progress/P04-gate.md |
| P05  | not_started                         | docs/progress/P05-gate.md |
| P06  | not_started                         | docs/progress/P06-gate.md |
| P07  | not_started                         | docs/progress/P07-gate.md |
| P08  | not_started                         | docs/progress/P08-gate.md |
| P09  | not_started                         | docs/progress/P09-gate.md |
| P10  | not_started                         | docs/progress/P10-gate.md |
| P11  | not_started                         | docs/progress/P11-gate.md |
