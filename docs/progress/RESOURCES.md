# 外部资源状态

## 2026-10-09 公开仓库首次 CI 失败诊断

公开 main 752ab6a 已推送，CI37923489728/check113796801014 实际执行。unit262/263：PDF.js实际文本解析默认5秒超时，导致管理员全量integration未运行；build成功，Electron22/25，三项seedUsage被job级启动诊断stdout干扰，另有app生命周期连带报错。标准用户P00 22/22；P03 0/3，artifact确认Node脚本入口realpathSync对D:\根目录lstat遭EPERM，尚未进入解析器；Core将无阶段的启动退出归为CORRUPT_FILE。AppContainer身份匹配/零网络/Job限制与零残留进程观察成立，不能据此宣称解析验收通过。Office宏/外链各三轮及startup成功。R15仅在新公开仓库已验证runner可执行，不推断旧私有仓库账单状态。只诊断与更新文档，未改业务/测试/ACL，未重跑/commit/push；P03-01=in_progress、02/03未开始，无gate。证据：docs/evidence/P03-01/public-ci-diagnosis-2026-10-09.json。

## 2026-10-09 独立公开副本准备检查点

2026-10-09 用户提供新公开仓库 https://github.com/tteok1/TapKit 与 noreply 提交邮箱。已在 D:/Tapkit-public 建立独立 main 快照，当前 P03-01 工作树源码随单次首次提交准备交付；原目录与 Git 历史保留。303 份代码/配置逐字节一致，213 份 JSON 可解析，格式检查与37项文档状态/证据链接检查退出0；81份未完成公开审查的旧截图/PDF留在私有档案，三个已核查合成截图保留。常见令牌/密钥模式、旧账号、旧提交邮箱和当前主机名检查未发现残留；这是模式检查，不保证无法通过项目内容建立关联。尚未公开推送，新 CI 未运行，R15=pending，三个 native CORRUPT_FILE 未修复，P03-01=in_progress、02/03未开始，无gate。证据：docs/evidence/P03-01/public-snapshot-preparation-2026-10-09.json。

## 2026-10-09 接续 R15 核查

47db847 的 PR37865577359/check113611382525/startup113611406455 均 completed/failure 且零步骤；实际 annotation 仍为账户付款失败/消费上限。R15=pending，新 native 诊断未运行，本机受阻 unsigned helper 不运行。已向用户请求 Actions 恢复或受信 Windows 验收环境，未改账单/限额、未新增自托管 runner。24项本地审计已完成，native 三项 CORRUPT_FILE 保持未修复；证据：docs/evidence/P03-01/resume-validation-2026-10-09.json。

## 2026-10-09 聊天Host导入交付与CI卡点

聊天Host导入业务源码99afbad已commit；前三次push网络失败，单次schannel+HTTP/1.1重试exit0并核验完整远程SHA，未改持久配置或证书校验。Draft PR#6说明更新成功（初次API失败后幂等重试）。PR37836620620/push37836615137完成failure，check113515161310/startup113515177173均零步骤；两条注释明确账户付款失败或消费上限，R15仍pending，新native诊断未运行。P03-01=in_progress；导航取消/晚到草稿和需求异常审计仍可独立推进，P03-02/03未开始。证据：docs/evidence/P03-01/chat-host-delivery-2026-10-09.json。

## 2026-10-09 聊天材料交付与CI卡点

业务源码8f69beb已提交；首次push连接重置，重试exit0且核对完整远程SHA，Draft PR#6说明已更新。PR37831922651/push37831915108完成failure，check113499168601/startup113499184273均零步骤；注释仍为付款失败/消费上限，新原生诊断未运行，R15保持pending。P03-01继续in_progress，物理聊天Host token与异常/需求审计尚有独立工作，P03-02/03未开始。证据：docs/evidence/P03-01/material-delivery-2026-10-09.json。

## 2026-10-09 聊天文件材料检查点

聊天/files.read消费固定版本的已解析结构，项目材料读取前后检查固定引用/撤权/删除/作用域变化；引用选择器保持项目旧版。旧文本兼容并增加session固定引用，缺失二进制结构不回退原件UTF-8。合成结构消费integration53/unit7及聊天+P03 Electron12/check314文件/docs:check37项/diff通过，脚本恢复生产构建且fixture标记缺失；初轮11/12及图表777.333px对整数777px失败已记录，1px内边界修正后原断言通过，截图已核查。无真实模型或helper。8e05705已commit/push且远程SHA一致，PR37829217781/check113489886118/startup113489897720均零步骤账单failure；R15仍pending。物理聊天导入仍需统一Host token，故障/需求审计及native待收口，P03-01=in_progress。证据：docs/evidence/P03-01/material-checkpoint-2026-10-09.json。

## 2026-10-09 文件版本界面验收检查点

P03真实Electron新增同名/大写后缀skip、明确目标replace新版本、恢复成新版本、历史下载、独立副本、项目固定引用与移除；两份合成源内容不变。首轮错误UI选择器失败已修正，单项及完整P03 Electron7/TypeScript/check311文件/docs:check37项/diff退出0，生产源码复用4765ee4已验证构建。4765ee4已commit/push且远程SHA一致；PR37828123412/check113486146409/startup113486158748均零步骤账单failure，R15仍pending。P03-01=in_progress；审计发现聊天材料仍直接UTF-8读原件，尚需对接P03解析结构与范围；故障分支/需求审计/native待收口。证据：docs/evidence/P03-01/version-ui-checkpoint-2026-10-09.json。

## 2026-10-09 任务附件使用记录检查点

files.usage复用执行/用户消息/task_versions投影固定附件记录，区分保存引用/排队与已接受执行；逐表profile、删除和版本归属过滤，最近100条及截断，显示历史任务目标和实际状态。相关integration57/unit7/完整P03 Electron6/desktop build/TypeScript/check311文件/docs:check37项/diff退出0（check首次格式失败已修正），截图已核查；没有调用真实模型或本机helper。b707dc5已commit/push且远程SHA一致；PR37825534686/check113477297263/startup113477317697均零步骤失败，账单注释仍为R15。P03-01保持in_progress，剩余版本/故障E2E、需求审计及原生验收待收口。证据：docs/evidence/P03-01/task-usage-checkpoint-2026-10-09.json。

## 2026-10-09 R15 GitHub Actions runner

最新5d3c0ec PR37371772936已完成：check取消且零步骤，startup111975484374失败且零步骤；2026-10-09复读注释仍为付款失败/消费上限，新诊断未运行，R15保持pending。证据：docs/evidence/P03-01/staging-checkpoint-2026-10-09.json。

## 2026-10-06 R15历史检查点

e1d4094 PR37370141971/check111964981057已零步骤failure，注释仍为付款失败/消费上限；startup111966840058尚排队，新原生诊断未运行。导入中断恢复本地验收继续完成，R15保持pending。证据：docs/evidence/P03-01/import-recovery-checkpoint-2026-10-06.json。

最新9b78267 PR37365004247：check取消且零步骤，startup111953207879失败且零步骤，注释仍为付款失败/消费上限。未反馈恢复，原生诊断未执行。证据：docs/evidence/P03-01/library-checkpoint-2026-10-06.json。

R15=pending：19afa7f PR/check111937957349及旧startup111938559554零步骤失败，API注释明确账户付款失败或spending limit需增加。已请用户检查GitHub Billing & plans；未改消费限额、未配置自托管runner、未绕过本机application control。只阻塞CI和新原生验收，本地业务开发继续。证据：docs/evidence/P03-01/host-import-checkpoint-2026-10-06.json。

## 2026-10-06 P00宏回归复验

21d3924的PR CI37348464103和push CI37348457242均完整success，check及startup-diagnostics通过。归档11362432951确认unit230/integration165/Electron8、独立标准用户22/22无missing、macro与links各三轮全部通过；启用对照mainThread=true/Hidden=false，实际A1=TK_MACRO_EXECUTED，默认阻断PDF/标记文件缺失及源hash断言同时通过。P00-03=implemented_and_verified、P00-gate=passed仅对应该源码；本机unsigned helper仍拒绝，不转植报告、不绕过策略。新P03 worker须单独原生验收。证据docs/evidence/P03-01/macro-control-repair-2026-10-06.json。 P01/P02真实模型资源状态不变。

## 2026-10-06 当前原生复验

2026-10-06 当前复验：P03首提交c39446b已push并建Draft PR#6；同提交push CI37324723679成功，但PR CI37324850125标准用户21/22，唯一宏阻断启用对照失败，其余步骤/Office三轮/startup通过。详细失败待归档报告核查，不能用成功轮覆盖失败。P00-03=in_progress、P00-gate=failed重新接续；本机安全策略未改。证据docs/evidence/P03-01/checkpoint-2026-10-06.json。 R09可用账户资源与本次验收失败分别记录，不把该失败当资源缺失。

## 2026-10-05 P03前置资源复核

2026-10-05 P03前置复核：origin/main cc3d60f9691455ab62e5200273e0a813a45797cc的CI37320656771完整通过，管理员unit227/integration155、P00 Electron8、独立标准用户无missing、三轮Office及启动诊断全部成功；核对其生产源码与e3d5d1f一致。旧Office回归已复验收口，P00-03=implemented_and_verified、P00-gate=passed；本机unsigned helper应用控制仍拒绝，不复制远程报告开启本机能力。证据：docs/evidence/P03-01/dependency-preflight-2026-10-05.json。 R09标准用户证据已更新；R08代表业务文件本阶段用可审计合成fixture验证，真实业务资料仍按资源记录。不改变模型账号状态。

2026-10-05 P02-02：聊天本地接口/隔离fixture验收完成，真实资源状态不提升。R01/R13/R14及P01真实缺口保持，R02—R05 pending；FlashX Responses沿用ADR0021。本轮未读取原用户Key/vault/profile、未调用真实模型；只读循环不依赖P00原生执行，P00/P01门禁保持failed。证据docs/evidence/P02-02/implementation-2026-10-05.md及results-2026-10-05.json。

2026-10-05当前复核：已获取origin/codex/p02-01并核对aebd898。R01/R13/R14保持configured，R02-R05保持pending，均无新增真人验收；完整API live入口已补但不验证原账本，网络支持边界仍待收口。FlashX Responses沿用ADR0021，不重复验证该组合。见docs/evidence/P01-02/P01-review-2026-10-05.md；本次不读取账户或凭据。

2026-10-04 20:35交付更新：用户已明确授权将当前分支的最新源码、测试、ADR、证据、P01进度和更新后的交接文档提交并推送至origin（private-archive:TapKit log，远程结果取实际push/引用核验。停止用户本机后续测试和Codex调用需先同意的要求保持；本次不运行测试、调用模型或改本机配置。任务及P01-gate状态不提升，以下未提交/待用户测试描述仅为此前历史。

2026-10-04 20:30交接更新：用户要求后续测试不在其本机继续，改由其他开发者接手；此前Chat完整验收请求撤回，未运行。已直接更新原交接docs/evidence/P01-02/zhipu-fix/handoff-2026-10-04.md，汇总P01三个任务、代码/分支、真实与本地证据、资源、安全边界及接续步骤。P01-01/P01-02=in_progress、P01-03=implemented_not_live_verified、P01-gate=failed保持；API完整live入口和overloaded分类已补，Responses/FlashX真实none128仍被报告全思考截断，供应商内部原因待确认，完整live/系统代理Fake-IP/账本价格未收口。最近unit167/integration76/check等为交接前历史，本次未运行测试或修改产品代码、发模型请求、读取Key/Codex、改用户配置或启动Electron。HEAD/本地origin跟踪引用仍b8b4d53；恢复开发全部新改动及本文更新未提交推送，远程分支单独不足以接手。以下为历史检查点，旧用户测试命令不再是当前操作指令。

2026-10-04 20:20用户单请求Responses/FlashX对照：真实发送边界none/128、端点/模型匹配、HTTP200，仍output128=reasoning128而截断（input20/cache2）；仅1请求，无重试。已排除漏发none/旧bundle，未确认供应商内部原因，停止重复此Responses组合；已准备未发送的官方排查材料，见docs/evidence/P01-02/zhipu-fix/responses-none-confirmed-2026-10-04.md及zhipu-responses-support-2026-10-04.md。下一步用户以稳定Chat测试2补6阶段完整live，Key本机隐藏输入，准备检查退出0；真人Chat结果待补。无本轮源码/预算/用户配置变更或agent真人请求，不读Key/Codex、不启动Electron；任务in_progress/阶段failed，未提交推送。unit167/integration76/check为上一代码检查点，本轮仅准备/docs/diff。

2026-10-04 20:10用户完整Responses/FlashX首轮失败：实际input20/output128，其中reasoning128、cache2，仅1请求；后五阶段未运行。调用已发生但验收未过，不是本次overloaded。源码/运行bundle与上一检查点一致，真实发送摘要缺失，不能仅凭none映射断言已关闭。已补无payload变更的参数白名单审计和--text-only单请求/128模式，并将API预期失败正常传退出码，去掉额外CLI堆栈；本轮unit167/167、相关integration76/76、check/API bundle/离线CLI退出0；结果及配合步骤见docs/evidence/P01-02/zhipu-fix/api-live-truncation-2026-10-04.md及api-live-diagnostic-results.json。真人单次参数对照待反馈，不增加预算/自动重试。任务in_progress、阶段failed，未读Key/vault/Codex或改配置，agent真人请求0，未提交推送。

2026-10-04：R13/R14配置及历史基础probe通过证据保持；完整API验收入口已补，需用户本机单次运行，步骤见docs/evidence/P01-02/zhipu-fix/api-live-acceptance-2026-10-04.md，不提升为live_verified。R02-R05仍pending。R01既有Luna基础证据保持，但用户本次新登录报告为待确认账户：浏览器成功/TapKit失败、刷新后未配置、模型及检测控件不可用。详见docs/evidence/P01-01/login-user-report-2026-10-04.md；不自动读取/调用此Codex账户，真实调用前必须先请求同意。

2026-10-04用户确认FlashX Responses测试3通过，智谱Chat/Messages/Responses均有基础文本工具通过证据，完整live仍待验收。本次P01复核发现API完整live入口未实现（两个无网络入口检查各退出2），以及overloaded重试分类/系统代理Fake-IP兼容尾项；不能继续仅标缺外部资源。P01-02状态改回in_progress，P01-gate=failed；P01-01仍in_progress、P01-03仍implemented_not_live_verified。原四API R02-R05 pending，R01/R13/R14 configured而完整live待补，真实价格目录为空。既有通过证据保留；只复核/更新文档，无新生产代码/真实请求/配置变更，不启动Electron/P02。详细待办与优先级见docs/evidence/P01-02/zhipu-fix/P01-review-2026-10-04.md和P01-review-results.json。

2026-10-04 FlashX补齐完成：官方智谱Responses的glm-4.7-flashx现于文本/工具两阶段发送reasoning.effort=none，预算仍32/128、无自动重试。修复前正例2失败/47通过；修复后unit155/155、相关integration69/69、check/build:desktop退出0，已核对Core产物含新映射。仅此生产改动，不改账户/网络/系统、不读Key或代发真实请求、不启动Electron；请用户退出旧实例以原profile仅复测Responses测试3一次。真实通过待反馈，任务/gate保持；未commit/push新改动。证据docs/evidence/P01-02/zhipu-fix/flashx-results.json与responses-resume-2026-10-04.md首段。以下为历史记录。

2026-10-04用户FlashX新反馈：glm-4.7-flashx Messages测试3已连接，Responses测试3文本阶段OUTPUT_LIMIT_REACHED。源码确认FlashX未发送reasoning.effort=none，文本仍32Token；官方默认max。关闭映射遗漏已确认，具体思考占比未采集；Messages单次通过不证明关闭或稳定性。建议先补FlashX Responses映射并保持预算有界验证，尚未实现；仅定位，无生产/配置修改或新增请求，任务/gate/测试数保持。证据docs/evidence/P01-02/zhipu-fix/responses-resume-2026-10-04.md首段。

2026-10-04替代模型官方调研：glm-4.7-flashx、glm-4.5-air、免费glm-4.5-flash及glm-5.2支持关闭思考；建议FlashX作低成本对照，零费用选4.5-Flash。当前TapKit关闭字段仅适配4.7-Flash Chat/Responses，其他模型/Messages未适配，不能只换ID保证关闭。1305支持模型繁忙猜测但不能证明免费用户量或全部失败原因；尚无候选真实请求/权限/稳定性验证。仅调研，未改生产/预算/配置，任务/gate/测试数不变。证据docs/evidence/P01-02/zhipu-fix/responses-resume-2026-10-04.md首段。

2026-10-04新增5.3-Flash反馈：Responses曾数次通过后OUTPUT_LIMIT_REACHED，Messages文本检测持续同码，用户可见智谱调用记录。官方5.3-Flash强制思考不能关闭；当前probe文本32/工具128且关闭字段仅适配4.7-Flash Chat/Responses，确认模型/检测预算适配缺口；具体思考占比与计费未采集。建议有界模型预算与截断提示适配，尚未实现；无生产/预算/配置修改或新增真实请求，既有测试数及任务/gate不变。证据见docs/evidence/P01-02/zhipu-fix/responses-resume-2026-10-04.md首段。以下为历史检查点。

2026-10-04最新稳定性核查：用户Chat稳定、Responses持续HTTP200/overloaded、Messages偶发529/1305；官方1305=模型繁忙。检测页无自动重试；普通ModelRouter最多2次重试/5账户有条件兜底，Messages529可重试，Responses字符串overloaded缺retryable映射。建议补分类及有界检测重试，尚未实现；未新增真实请求、生产代码或配置变更，既有148/68/check为上一检查点。证据见docs/evidence/P01-02/zhipu-fix/responses-resume-2026-10-04.md最新段；任务/gate及未提交状态保持。

2026-10-04恢复排查本轮收口：用户共3次有界直连；首次overloaded，第二次none/32出现32 reasoning Tokens/无正文/incomplete，最后TapKit同形字符串请求仍overloaded/usage未知。本轮停止真实请求，不再重试；不能将内容数组回执当同形关闭思考已定论。诊断脚本及真实失败回归已完成，unit148/integration68/check退出0，产品适配器、预算和用户配置未改。Chat/Messages基础probe已过，R13/R14 configured；Responses真实成功及完整live仍未验收，任务/gate保持。基线b8b4d53已push；本轮新改动未再次commit/push。最新证据responses-resume-2026-10-04.md/responses-resume-results.json及responses-direct-aligned-overloaded-2026-10-04.json。以下为过程快照。

2026-10-04恢复排查最新：用户首次直连HTTP200/response.failed/overloaded，无usage；第二次none/32返回response.incomplete/max_output_tokens，无正文，outputTokens=reasoningTokens=32，证明该次上游实际思考耗尽预算。第二次缺inputShape，不能当TapKit字符串输入的严格对照；脚本已对齐并离线通过，已仅请求最后一次对照，之后停止本轮真实请求。新overloaded unit与真实本地mock HTTP/Core持久回归通过，unit148/integration68/check退出0；产品适配器和预算未改，未读Key/代发模型请求。R13/R14 configured、完整live与gate保持；新改动未再提交push。证据responses-resume-2026-10-04.md/results及responses-direct-overloaded/truncated-2026-10-04.json。此前待首轮结果为历史。

2026-10-04用户尚未交接并明确恢复本分支开发测试，当前HEAD b8b4d53（已push且远程一致）；先前停止要求已撤销。继续P01-02 Responses残余截断诊断：脚本语法/4组离线检查及.NET构造验证退出0，新增回传effort/max_output_tokens安全摘要。产品适配器未改，未加预算，未读Key或代发真实请求；已请用户本机直连Responses一次回传安全JSON，等待上游终结/usage证据。Chat/Messages通过、R13/R14 configured及任务/gate保持；原交接为历史快照。证据docs/evidence/P01-02/zhipu-fix/responses-resume-2026-10-04.md及responses-resume-results.json。新改动未再次提交/push。

2026-10-04交接停点：用户要求停止排查/代码修改，改交接并明确授权将本分支及交接文档提交、push。Chat与Messages真实文本/工具probe通过，R13/R14 configured；Responses补off→none后11:39:53仍OUTPUT_LIMIT_REACHED/文本阶段。已核对新Core产物和重启时间，但未采集实际请求/终结事件或usage，根因未确认。unit147/integration68、build:desktop/check退出0为最近工程验证；新直连脚本草稿尚未语法/离线/live验证且未执行，不在通过结论内。未继续请求、读Key或改用户配置，任务/gate保持。最终提交和推送状态以Git为准；交接见docs/evidence/P01-02/zhipu-fix/handoff-2026-10-04.md。以下按时间保留历史检查点。

2026-10-04三协议最新：智谱Chat测试2及Messages真实文本/工具probe通过，数据库ready与截图一致，R13/R14均configured；Responses配置为官方/api/v1但文本截断。源码off未映射官方reasoning.effort=none已修复，修复后单次反馈待补。两类资源已提供，不能继续标R14 pending/缺Key；完整两轮/取消/usage仍待验收。证据P01-02/zhipu-fix/responses-repair-2026-10-04.md及protocol-probes-2026-10-04.json；下文旧pending/1305仅历史。

2026-10-04 11:20 R13最新：用户清DNS后公网解析，Node lookup一致，当前域名Fake-IP阻断解除；新版TapKit截图文本阶段HTTP429/业务1305/PROVIDER_UNAVAILABLE，11:18:02数据库公共状态一致。官方1305为模型访问量过大，稍后单次复测；文本未成功/工具未开始，R13 configured不提升。证据P01-02/zhipu-fix/model-busy-1305-2026-10-04.md/json；下方DNS阻断是先前历史，本次不改配置或读Key。

2026-10-04 11:08最新R13：用户修复版TapKit检测PERMISSION_DENIED；只读小写账户记录一致，Node DNS仍198.18.0.99 Fake-IP，无Key现有传输预检HTTP0复现。当前网络兼容阻断，TUN/系统代理/缓存状态待确认；不判定Key失效。R13 configured，真实流式/工具未通过。未改用户配置，见P01-02/zhipu-fix/permission-denied-2026-10-04.md；下文反馈待补为先前快照。

2026-10-04智谱最新：R13 configured，独立测试profile已保存两个Chat账户（GLM-4.7-Flash及glm-4.7-flash）。用户自行关闭TUN后，独立非流式直连加thinking.type=disabled返回HTTP200/有正文/stop；只能证明该基础请求可用。本次兼容修复本地回归通过，新版TapKit真实流式/工具单次检测反馈待补；未读取真实Key，未代发真实请求。R14及R02-R05 pending，后文缺资源/仅一个账户/Fake-IP为旧快照。证据P01-02/zhipu-fix/report.md与ADR0016。

2026-10-04 P01-02：API Key配置页、OpenAI Chat/Responses及Anthropic Messages协议已接入；R02-R05及新增R13/R14仍pending，未提供真实API Key。本地fixture和Windows DPAPI验证只证明实现路径，不证明真实模型权限。Key只在本机配置页输入，不放入进度或日志。

2026-10-04最新：R01仍configured，独立TapKit测试账户真实Luna文本及echo工具提议已通过，checkConnection=ready。固定只读诊断定位缺响应头与终结取消误报，原账户未刷新/注销，无正文/凭据记录；详见missing-mime-2026-10-04.md与ADR0013。完整两轮/真实重启刷新/注销仍待验收；下方待定位描述为旧快照。

2026-10-04最新：R01仍configured，真实文本检测已确认HTTP200非SSE；用户提供本地HTTP代理，匿名链路401/JSON。本次已接入Core/live显式TAPKIT_HTTP_PROXY，按用户要求注销移除活动账户、旧记录提供清除按钮，真人检测待复测；详见logout-proxy-2026-10-04.md。不是缺账号，不记录凭据。

2026-10-04用户实测更新：R01=configured，独立测试profile的OAuth界面显示完成，GPT-5.6 Luna和GPT-5.5检测均STREAM_INTERRUPTED。账号已提供，根因待新版脱敏诊断复测；不是缺账号。未读取/记录凭据，完整live未通过，见diagnostic-2026-10-04.md；下方pending描述为历史。

2026-10-04修复后：P01-01本地缺陷、编译后OAuth加载和live进程/取消路径已修复并验证；R01仍pending，真实服务验收未运行。当前build0/unit37/integration50/Electron8，见repair-2026-10-04.md；下方复核待修复项为历史检查点。

2026-10-04 P01-01复核确认三项本地缺陷，状态恢复in_progress；R01仍pending。须先修复注销/登录竞争、刷新分类及probe并发保护，live另补真实进程重启/生成中取消。见docs/evidence/P01-01/review-2026-10-04.md。

2026-10-03 P01-01：R01仍pending，诊断路由和隔离test profile live入口已建立，真实订阅联调未执行。当前P00-gate仍failed，以CURRENT/INDEX和P00-gate最新记录为准；下方P00历史通过不覆盖当前门禁。

2026-10-02 P00收口：R09由CI run46独立medium/non-admin标准用户22/22真实验证，证据docs/evidence/P00-03/ci-run46.json；P00合成Office/宏/外链样本已完成，R08后续业务代表性资料仍待对应任务。P00-gate=passed；本机应用控制限制保留，未绕过。下方旧缺口描述按当时记录保留。

> **2026-09-30 P00-03 当前补充**：R09 标准用户环境已存在，不是当前缺账号阻塞；旧子集结果不替代新 AppContainer 全量验收。本机 Windows 应用控制策略阻止执行未签名 helper，导致真实集成无法启动。不得通过关闭/绕过策略来伪造验证；见 `docs/evidence/P00-03/current-verification.md`。如需在该主机验收，需使用该系统信任的 helper 构建产物或受控 CI/标准用户环境。

实际资源状态（2026-09-15，P00-01 收口）。只存标签、权限范围、状态和证据路径，不存凭据。具体要求见手册11-external-todos.md。

| 资源 | 用途                      | 状态       | 验证/失败原因/下一步                                                                                                                                                              |
| ---- | ------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01  | Codex订阅                 | configured | 用户报告OAuth已完成；已只读实测Luna文本/echo检测ready，缺响应头与终结取消误报已修复。两轮/真实重启刷新/注销完整live未通过，无凭据日志；见P01-01.md及missing-mime-2026-10-04.md    |
| R02  | DeepSeek API              | pending    | 开发接入时核对，不在此填写密钥                                                                                                                                                    |
| R03  | 混元API                   | pending    | 开发接入时核对，不在此填写密钥                                                                                                                                                    |
| R04  | Grok API                  | pending    | 开发接入时核对，不在此填写密钥                                                                                                                                                    |
| R05  | 豆包API                   | pending    | 开发接入时核对，不在此填写密钥                                                                                                                                                    |
| R06  | Tavily搜索                | pending    | 开发接入时核对，不在此填写密钥                                                                                                                                                    |
| R07  | GitHub测试仓库和PAT       | pending    | 已确认 origin URL；PAT/真实 GitHub 接口未配置或联调                                                                                                                               |
| R08  | 代表性文件/数据fixture    | pending    | P00-01 流式 mock fixture 已建立；代表性 Office/资料集待后续                                                                                                                       |
| R09  | Windows标准用户测试环境   | verified   | CI run46独立medium/non-admin标准用户22/22；无失败/跳过/缺失；宏/外链/Job/恢复全部通过。证据docs/evidence/P00-03/ci-run46.json；不同目标主机仍需重跑probe                          |
| R10  | 开源目标仓库和Logo确认    | pending    | 公开副本目标 https://github.com/tteok1/TapKit；Logo 仍待提供                                                                                                                      |
| R11  | 安装包签名                | pending    | 开发接入时核对，不在此填写密钥                                                                                                                                                    |
| R12  | 官网下载域名/地址         | pending    | 开发接入时核对，不在此填写密钥                                                                                                                                                    |
| R13  | OpenAI/兼容API            | configured | 历史智谱Chat/4.7-Flash基础检测通过；FlashX Responses按ADR0021暂不支持。Chat/FlashX修复后完整live及两轮/工具闭环/取消/usage待验；入口已补，见P01-02/P01-review-2026-10-05.md       |
| R14  | Anthropic/Messages兼容API | configured | 智谱Messages/4.7-Flash及4.7-FlashX基础文本工具通过；完整两轮/工具闭环/取消/usage待验，入口已补但不核对原账本；见P01-02/P01-review-2026-10-05.md                                   |
| R15  | GitHub Actions runner     | verified   | 新公开仓库tteok1/TapKit的CI37923489728已实际执行；仅验证runner资源可用，P03解析验收失败；不推断旧私有仓库账单状态。证据：docs/evidence/P03-01/public-ci-diagnosis-2026-10-09.json |

可用状态：pending/configured/verified/failed/not_needed_yet。configured不代表已联调；提供资源后更新相关任务及phase gate，保留之前未验证记录。

P00-01 不需要外部账号，已完成本地规定验收。MSVC/Windows SDK 未准备，P00-03 编译 helper 时补齐，不以 Node-API 预构建替代 OS 隔离验证。

P00-03 已锁定并解包官方 Rust/Windows SDK/CRT，用 Rust LLD 构建 helper；当前 Office/Git 原生兼容失败仍属于实现/安全门禁缺口。2026-09-17 R09 已确认环境可用并收到标准用户子集实测；Office/Git 与完整安全验收缺口不归为缺账户。

2026-09-24 ADR 0007：已为当前宿主使用者初始化两个独立 TapKit 执行账户和八条 WFP 阻断规则，未复用 R09 的 test。权限修复最后一次 UAC 被取消，代码已准备；R09 的新路径全量尚未运行，旧 9/9 不自动转为新方案通过。完整安全仍有实现/验证缺口，见 docs/evidence/P00-03/account-backend-checkpoint.md。

最新：用户回复“现在可以”后UAC修复成功，普通status通过。剩余KnownDlls/Kernel32系统读取、完整隔离与Office缺口是实现问题；不再标作等待管理员批准或缺R09。详见 docs/evidence/P00-03/account-after-uac.md。
