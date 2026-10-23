# ui_fix CI55 修复记录

2026-10-23；分支ui_fix；失败基线cb5b099。远程原始运行：https://github.com/tteok1/TapKit/actions/runs/39947832462 。

## 原因和修正

CI55的Check、unit360、integration351、性能、标准用户原生验证、Office退出诊断和startup-diagnostics通过。Electron 47/50通过，3项失败的原始摘录见ci55-failures.log；完整日志和失败trace保留于本地隔离目录，未将整个远程产物再次加入Git。

1. 两项聊天用例在page.reload后仍假定原会话存在于主区，与ADR0058正常启动/刷新默认首页的设计不符。失败快照确为新建任务页。新增reopenSessionFixture按相同sessionId从侧栏重开，先断言首页，再继续原有标题失败持久化/无重放、IME、排队/停止断言，不创建替代会话。
2. 新附件用例直接要求物理文件解析ready，未区分原件导入与实际host token的原生解析能力。与现有P03-01测试保持一致，从真实bootstrap读取能力；available必须ready，否则必须failed且errorReason=SANDBOX_UNAVAILABLE。额外核验未取消文件的SHA256、原件内容和固定版本引用，取消的同批文件仍不得回到草稿；不修改生产能力检查或执行器。
3. 本地冷启动超过旧测试的15秒启动等待，聊天fixture统一为现有125秒Core就绪上限，并为整例提供180秒时限，功能断言时限保持。原生复制保护钩子移入真正操作系统剪贴板的describe；只测附件的用例不读取剪贴板。原剪贴板有无法备份的格式时，实际复制测试继续拒绝执行，保护逻辑没有放宽。

仅改E2E测试和fixture，不修改产品UI、Host、Core、翻译、附件处理、权限或CI工作流。109份产品源码逐项与上一轮已验快照比对保持。

## 验证与边界

最终本地和远程结果分别以本目录的运行回执及CI链接为准；验证进行中时不宣称CI已通过。所有Electron使用合成隔离profile，原窗口/profile不变，无真实模型请求，不合入main，不提升原live/gate。

早期准备失败保留：targeted-electron的grep未包含P02构建标记而未启用fixture；corrected-electron在本地旧15秒启动等待和剪贴板备份前置处失败，仅物理文件回归通过。之后修正初始化并使用带P02标签的命令复测，未通过重试或跳过业务断言掩盖原失败。

本地最终相关Electron 5/5通过（final-local-electron.log/json，退出0，266.67秒）；包含标题失败持久化、IME/队列/停止、附件批内取消、长文本粘贴和物理文件引用。官方脚本已恢复生产构建，历史证据7份按原字节还原。此前准备失败的回执保留，不计入通过。最终静态检查及远程CI待完成。

109份产品源码哈希不变；原启动入口run-app.ps1 -CheckOnly退出0，626生产产物与既有已验快照一致，测试fixture未残留。最终check首轮仅进度文档格式失败（check-final.log），格式修正后复查；未引入产品修改。

最终pnpm check退出0（check-final2.log/json，收集105个E2E用例）；pnpm docs:check退出0（docs-final.log/json）；排除原始证据的git diff --check退出0。当前提交只包含3个E2E文件及本次进度/证据，待推送ui_fix并复验完整远程工作流。

## CI56复验和补修

a6396bc已推送ui_fix。CI56原3项失败全部通过，unit360、性能、标准用户原生、Office和启动诊断通过。integration350过/1失败：P01-02.api第一轮DeepSeek回放明确Test timed out in 15000ms；Electron49过/1失败：解析期间移除附件的首次发送用例没有等Ctrl+N导航完成即填同名输入框，失败快照是空草稿首页。摘要及原错误见ci56-summary.json、ci56-failures.log。

补修仅测试：六渠道两轮HTTP协议完整性用例单独60秒预算，生产deadline不变；首次发送先断言新任务页切换，再验证填入文本，并增加发送后原用户正文完整断言。原工具配对/native状态/跨scope拒绝及移除附件不进入消息断言不变。原HTTP对照8/8（p01-http-baseline），修改后开启CI诊断8/8（ci56-http-final），均退出0。附件专项复验与最终检查/远程结果待补。

附件专项最终2/2通过（ci56-navigation-regression.log/json，测试45.2秒，脚本退出0）；生产恢复构建完成，2份历史附件截图按原字节还原。该运行的脚本墙钟为9706.42秒，日志中间存在长等待；不据此推定主机状态或用例耗时，实际断言45.2秒以Playwright记录为准。仅补充注释措辞，不更改已验行为。

补修最终pnpm check、pnpm docs:check均退出0（ci56-check、ci56-docs回执）；109源码哈希仍不变，原run-app.ps1 -CheckOnly退出0，生产产物与原已验快照一致。准备推送同分支，完整远程CI待复验；不合main。

## 最终远程结果（2026-10-24）

源码00238f7推送origin/ui_fix后，CI57完整success：https://github.com/tteok1/TapKit/actions/runs/39980168043 。check与startup-diagnostics均success；unit360/360、integration351/351、performance2/2、Electron50/50。标准用户原生解析、Office退出与冷启动诊断通过，全部5项曾失败用例通过。原始计数和任务状态见ci57-check-summary.log及ci57-success.json。

本次修复代码仅4份测试/fixture文件（相对cb5b099），产品源码、CI工作流、运行时功能均不变；原UI生产构建和启动校验保持，main仍394418f。最后交接提交仅文档/证据，不改变已验测试代码，使用[skip ci]避免重复执行同一测试树；阶段和真实账户验收状态不提升。
