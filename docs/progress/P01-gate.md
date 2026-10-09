# P01 阶段工程交付与验收

2026-10-05当前复核：gate_status：failed，P01正式验收0/3；P01-01/02=in_progress、P01-03=implemented_not_live_verified。当前codex/p02-01 / aebd898与origin一致。完整API live入口及overloaded分类已补，下方入口缺失描述为历史；Codex新登录报告、系统代理/Fake-IP边界、逐渠道完整live与真实账本仍待收口。R02-R05 pending、R01/R13/R14 configured均不等于完整通过；FlashX Responses沿用ADR0021。P02-01已本地实现而未提升P01/P00门禁。复核及证据见docs/evidence/P01-02/P01-review-2026-10-05.md；本次只静态核对/文档同步，既有测试结果不记为本轮重跑。

2026-10-04 20:35交付更新：用户已明确授权将当前分支的最新源码、测试、ADR、证据、P01进度和更新后的交接文档提交并推送至origin（private-archive:TapKit log，远程结果取实际push/引用核验。停止用户本机后续测试和Codex调用需先同意的要求保持；本次不运行测试、调用模型或改本机配置。任务及P01-gate状态不提升，以下未提交/待用户测试描述仅为此前历史。

2026-10-04 20:30交接更新：用户要求后续测试不在其本机继续，改由其他开发者接手；此前Chat完整验收请求撤回，未运行。已直接更新原交接docs/evidence/P01-02/zhipu-fix/handoff-2026-10-04.md，汇总P01三个任务、代码/分支、真实与本地证据、资源、安全边界及接续步骤。P01-01/P01-02=in_progress、P01-03=implemented_not_live_verified、P01-gate=failed保持；API完整live入口和overloaded分类已补，Responses/FlashX真实none128仍被报告全思考截断，供应商内部原因待确认，完整live/系统代理Fake-IP/账本价格未收口。最近unit167/integration76/check等为交接前历史，本次未运行测试或修改产品代码、发模型请求、读取Key/Codex、改用户配置或启动Electron。HEAD/本地origin跟踪引用仍b8b4d53；恢复开发全部新改动及本文更新未提交推送，远程分支单独不足以接手。以下为历史检查点，旧用户测试命令不再是当前操作指令。

2026-10-04 20:20用户单请求Responses/FlashX对照：真实发送边界none/128、端点/模型匹配、HTTP200，仍output128=reasoning128而截断（input20/cache2）；仅1请求，无重试。已排除漏发none/旧bundle，未确认供应商内部原因，停止重复此Responses组合；已准备未发送的官方排查材料，见docs/evidence/P01-02/zhipu-fix/responses-none-confirmed-2026-10-04.md及zhipu-responses-support-2026-10-04.md。下一步用户以稳定Chat测试2补6阶段完整live，Key本机隐藏输入，准备检查退出0；真人Chat结果待补。无本轮源码/预算/用户配置变更或agent真人请求，不读Key/Codex、不启动Electron；任务in_progress/阶段failed，未提交推送。unit167/integration76/check为上一代码检查点，本轮仅准备/docs/diff。

2026-10-04 20:10用户完整Responses/FlashX首轮失败：实际input20/output128，其中reasoning128、cache2，仅1请求；后五阶段未运行。调用已发生但验收未过，不是本次overloaded。源码/运行bundle与上一检查点一致，真实发送摘要缺失，不能仅凭none映射断言已关闭。已补无payload变更的参数白名单审计和--text-only单请求/128模式，并将API预期失败正常传退出码，去掉额外CLI堆栈；本轮unit167/167、相关integration76/76、check/API bundle/离线CLI退出0；结果及配合步骤见docs/evidence/P01-02/zhipu-fix/api-live-truncation-2026-10-04.md及api-live-diagnostic-results.json。真人单次参数对照待反馈，不增加预算/自动重试。任务in_progress、阶段failed，未读Key/vault/Codex或改配置，agent真人请求0，未提交推送。

2026-10-04 API验收补齐：已实现六个API provider的有界完整live入口（三协议、最多6请求、每次输出128、首次失败停止），用户本机隐藏输入Key，原profile只读；智谱HTTP200/overloaded现为可重试，正常routing最多2次/正文后不重试，连接检测与live仍无自动重试。unit164/164、相关integration75/75、check/build:desktop退出0，API bundle/离线CLI/prepare-only退出0。工程结果见docs/evidence/P01-02/zhipu-fix/api-live-results.json及api-live-acceptance-2026-10-04.md；真人完整结果待用户单次运行。未读vault、启动Electron或使用真人模型，未改用户配置/提交推送。系统代理/Fake-IP、真实账本/资源和Codex登录问题仍待处理；P01-02=in_progress、P01-gate=failed。用户新Codex账户模型调用必须先取得明确同意。

2026-10-04用户确认FlashX Responses测试3通过，智谱Chat/Messages/Responses均有基础文本工具通过证据，完整live仍待验收。本次P01复核发现API完整live入口未实现（两个无网络入口检查各退出2），以及overloaded重试分类/系统代理Fake-IP兼容尾项；不能继续仅标缺外部资源。P01-02状态改回in_progress，P01-gate=failed；P01-01仍in_progress、P01-03仍implemented_not_live_verified。原四API R02-R05 pending，R01/R13/R14 configured而完整live待补，真实价格目录为空。既有通过证据保留；只复核/更新文档，无新生产代码/真实请求/配置变更，不启动Electron/P02。详细待办与优先级见docs/evidence/P01-02/zhipu-fix/P01-review-2026-10-04.md和P01-review-results.json。

2026-10-04 FlashX补齐完成：官方智谱Responses的glm-4.7-flashx现于文本/工具两阶段发送reasoning.effort=none，预算仍32/128、无自动重试。修复前正例2失败/47通过；修复后unit155/155、相关integration69/69、check/build:desktop退出0，已核对Core产物含新映射。仅此生产改动，不改账户/网络/系统、不读Key或代发真实请求、不启动Electron；请用户退出旧实例以原profile仅复测Responses测试3一次。真实通过待反馈，任务/gate保持；未commit/push新改动。证据docs/evidence/P01-02/zhipu-fix/flashx-results.json与responses-resume-2026-10-04.md首段。以下为历史记录。

2026-10-04恢复排查本轮收口：用户共3次有界直连；首次overloaded，第二次none/32出现32 reasoning Tokens/无正文/incomplete，最后TapKit同形字符串请求仍overloaded/usage未知。本轮停止真实请求，不再重试；不能将内容数组回执当同形关闭思考已定论。诊断脚本及真实失败回归已完成，unit148/integration68/check退出0，产品适配器、预算和用户配置未改。Chat/Messages基础probe已过，R13/R14 configured；Responses真实成功及完整live仍未验收，任务/gate保持。基线b8b4d53已push；本轮新改动未再次commit/push。最新证据responses-resume-2026-10-04.md/responses-resume-results.json及responses-direct-aligned-overloaded-2026-10-04.json。以下为过程快照。

2026-10-04恢复排查最新：用户首次直连HTTP200/response.failed/overloaded，无usage；第二次none/32返回response.incomplete/max_output_tokens，无正文，outputTokens=reasoningTokens=32，证明该次上游实际思考耗尽预算。第二次缺inputShape，不能当TapKit字符串输入的严格对照；脚本已对齐并离线通过，已仅请求最后一次对照，之后停止本轮真实请求。新overloaded unit与真实本地mock HTTP/Core持久回归通过，unit148/integration68/check退出0；产品适配器和预算未改，未读Key/代发模型请求。R13/R14 configured、完整live与gate保持；新改动未再提交push。证据responses-resume-2026-10-04.md/results及responses-direct-overloaded/truncated-2026-10-04.json。此前待首轮结果为历史。

- 2026-10-04用户尚未交接并明确恢复本分支开发测试，当前HEAD b8b4d53（已push且远程一致）；先前停止要求已撤销。继续P01-02 Responses残余截断诊断：脚本语法/4组离线检查及.NET构造验证退出0，新增回传effort/max_output_tokens安全摘要。产品适配器未改，未加预算，未读Key或代发真实请求；已请用户本机直连Responses一次回传安全JSON，等待上游终结/usage证据。Chat/Messages通过、R13/R14 configured及任务/gate保持；原交接为历史快照。证据docs/evidence/P01-02/zhipu-fix/responses-resume-2026-10-04.md及responses-resume-results.json。新改动未再次提交/push。

- 2026-10-04交接停点：用户要求停止排查/代码修改，改交接并明确授权将本分支及交接文档提交、push。Chat与Messages真实文本/工具probe通过，R13/R14 configured；Responses补off→none后11:39:53仍OUTPUT_LIMIT_REACHED/文本阶段。已核对新Core产物和重启时间，但未采集实际请求/终结事件或usage，根因未确认。unit147/integration68、build:desktop/check退出0为最近工程验证；新直连脚本草稿尚未语法/离线/live验证且未执行，不在通过结论内。未继续请求、读Key或改用户配置，任务/gate保持。最终提交和推送状态以Git为准；交接见docs/evidence/P01-02/zhipu-fix/handoff-2026-10-04.md。以下按时间保留历史检查点。

- 智谱最新：用户Chat及Messages基础文本/echo通过，R13/R14 configured；Responses文本截断，已按官方补off→reasoning.effort=none，修复后真人单次反馈待补。build:desktop/check=0、unit147/147、integration68/68，本轮基础模块由integration覆盖而非重启Electron。完整两轮/取消/usage及其他资源仍未验收，gate不提升，P00安全失败能力与Electron稳定性缺口保留。证据P01-02/zhipu-fix/responses-repair-2026-10-04.md/responses-results.json。
- 2026-10-04 11:20智谱最新：DNS已恢复公网，用户新版检测在文本阶段收到HTTP429/1305（官方模型繁忙），尚未成功生成或进入工具阶段。R13 configured、P01-02 implemented_not_live_verified与gate保持；无本次源码/用户配置修改或自动模型请求。证据P01-02/zhipu-fix/model-busy-1305-2026-10-04.md/json；下方Fake-IP诊断为恢复前历史。
- 2026-10-04 11:08真实智谱检测未通过PERMISSION_DENIED；当前DNS Fake-IP 198.18.0.99及无Key预检HTTP0确认环境前置阻断，不算渠道通过。R13 configured、工程gate不变，先确认用户代理/DNS状态，不改配置或放宽策略。证据P01-02/zhipu-fix/permission-denied-2026-10-04.md。
- 2026-10-04智谱修复后续：codex/fix-zhipu-api-probe基于main2e78531，ADR0016；build:desktop/check=0，unit133/133、相关integration67/67、实际Electron2/2。本次只完成兼容和诊断工程回归；用户独立非流式文本对照已通过，新版TapKit流式/工具及完整live反馈待补。R13 configured、P01-02 implemented_not_live_verified、gate_status engineering_passed_external_pending保持，未开启P00失败能力或启动P02。证据P01-02/zhipu-fix/report.md；下方日期/分支/结果为原阶段快照。
- 日期：2026-10-04T07:35:57.2155880+08:00；执行：当前Codex本地会话，Windows。
- HEAD715d55a + working-tree，codex/p01-03；源码指纹docs/evidence/P01-03/results.json。
- gate_status：failed。本次复核确认API完整live入口及兼容技术尾项尚未完成，不能仅标外部资源待验收；既有基础连接和本地通过证据保留。详见P01-review-2026-10-04.md。
- 2026-10-04 后续诊断：当前 main 2e78531；R13 configured，仅智谱 Chat 已保存。DNS Fake-IP与API公网策略存在请求前阻断，无Key预检HTTP=0；没有真实渠道通过项，不提升gate。详见 docs/evidence/P01-02/zhipu-preflight-2026-10-04.md；下方 R13 pending及未push为原验收快照。

## 本阶段交付物

| 交付要求                        | 实际入口/文件                                 | 任务   | 状态/证据                                                                  |
| ------------------------------- | --------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| Codex订阅OAuth与原始native隔离  | Codex连接诊断、providers/codex、Host DPAPI    | P01-01 | 本地协议/取消/刷新/注销/真实Luna probe修复；完整live pending               |
| 四预设及OpenAI/Anthropic格式API | API Key账户、providers/api、ADR0014           | P01-02 | 本地协议/两轮工具/模型绑定/密钥撤销墓碑通过；R02-R05/R13/R14 pending       |
| 能力/选择/回答偏好              | 模型与用量、routing/catalog、defaults.json    | P01-03 | 搜索收藏、真实会话与本次范围、预检；unit/UI通过                            |
| root+daily预算/usage            | UsageLedger、schema4、usage.list、prices.json | P01-03 | 争抢、失败缺usage、子集、崩溃/分页/时区/金额fixture通过；真实价格unknown   |
| quota→API与工具证据             | ModelRouter、provider.switched、独立attempt   | P01-03 | 编译Core mock quota→DeepSeek实际协议成功；批准fixture文件只写1次，审批保留 |

## 演示与检查步骤

用进程级PowerShell Bypass运行scripts/pnpm.ps1 dev，TAPKIT_DATA_DIR指定独立目录。首页先配置Codex/API账户并检测text/echo，再进入“模型与用量”设置首选、允许付费API后备及Token上限。固定简短检测会显示实际模型、单独attempt及账本。真实账号不故意耗尽；自动后备由P01-03同标签fixture测试验证。

最终build/check=0，unit106/106，相关integration85/85，真实Electron16/16；最终docs:check/diff检查在results.json记录。P01-03自身unit12/integration12/Electron2。两张页面截图已视觉检查。证据docs/evidence/P01-03；前置交付/源码快照见P01-01/P01-02记录，P01-02已commit715d55a，未push。

## 门禁结果

- 五原渠道及两兼容入口源码、统一流事件/私有native、配置诊断、能力目录、费用账本、后备均本地可用；不得用fixture声称真人账户接通。
- T03/T04、401一次刷新、普通429有界等待、403不降级、部分答案分离、5账户上限、仅此模型/费用授权/账户允许集合、预算原子性和取消核销已回归。
- P00-gate仍failed，P00-03 in_progress。这里没有开启OS执行能力，隔离fixture写文件不是P00安全证明。
- R01 configured仅真实Luna text/echo已有证据；完整两轮/重启刷新/注销live待补。R02-R05/R13/R14 pending，真实API/live未执行。供应商余额/恢复时间及价格unknown不捏造。
- P01-01任务状态in_progress保留；P01-02/P01-03 implemented_not_live_verified。完整验收总数仍按INDEX实际状态，未将工程gate计作真人验收。

## 下一阶段边界

ProviderAdapter/ModelEvent/CredentialStore/ModelRouter/UsageLedger及有限模型IPC可被后续本地模型/聊天任务依赖，依据15-stage-deliverables的engineering_passed_external_pending规则。未来执行器仍须Core审批和幂等账本，P00失败能力不可调用。P01-03按用户要求同次本地提交保存，提交号以Git历史为准；未启动P02，未push或合并。CURRENT/INDEX/requirements已同步。
