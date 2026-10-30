# P07-03 验收证据

2026-10-30，D:/Tapkit-public，codex/p07-office，HEAD aa6debf25399a328ca993e2c8a03c0d0722a6032及未提交工作树。P07-01/02既有改动保留；未提交、推送或发布。状态implemented_not_live_verified：本地交付及检查通过，唯一一次真实PPTX请求响应头超时，工具0/成果0。阶段gate=failed，不能称仅缺账号或通过。

已实现SlideDeckSpec、五布局、浅/深主题、16:9/4:3、默认10页/上限50页、讲者备注、可编辑PPTX与固定PDF；授权PNG和成功分析收据对应的原生图表；逐页读取、预览定位、局部修改及插入/删除/复制/移动。修订检查固定基础版本及revision，单次事务提交PPTX/PDF/规范/任务链接/工具收据。历史版本保留；未知副作用不盲目重放。决定见ADR0071，格式边界见[format-limits.md](format-limits.md)。

delivery-manifest.json保存最终16项关键源码/测试/生产Core hash及无fixture检查；docs-delivery.log的docs:check退出0，37项任务状态和证据路径一致；diff-check.log的git diff --check退出0，仅有既有CRLF转换提示。所有本轮验收进程已结束，未提交/推送/发布。

## 实际命令及回执

使用锁定Node24.21.0/pnpm12.4.1，TEMP/TMP指向.test-data/p07-data-temp。Native/Electron在当前Windows用户正常权限下执行，未移除AppContainer/ACL。下表分轮有重叠，不累计为独立总数。

| 命令 | 结果 | 证据 |
|---|---|---|
| pnpm check | 退出0；665文件格式检查及E2E收集123项（不是执行） | check-delivery.log；早期check-corrected.log |
| pnpm test:unit P07-01 P07-02 P07-03 P03-01.office P03-01.archive P06-02 | 退出0，16文件65/65 | unit-final.log |
| pnpm test:integration P07-03.slides-commit P07-02.data-access P07-02.data-receipt P07-02.data-driver P07-01.document-driver P07-01.document-gateway P07-01.document-approval | 退出0，7文件20/20 | integration-final.log |
| pnpm test:integration P07-03.native-slides | 最终退出0，三份10页3/3，198.22秒 | native-visual-final.log；native目录 |
| 图表缓存及既有Office/ZIP安全单元代表 | 退出0，4文件26/26 | cache-security-first.log |
| pnpm test:integration P07-03.native-cache | 退出0，2/2，47.95秒 | native-cache-first.log |
| pnpm test:integration P07-03.slides-commit P07-01.document-approval | 退出0，2文件6/6 | approval-retest.log |
| bundled Python render-qa.py + Poppler pdftoppm | 退出0，三份10页共30个PNG | render-qa-final.log；visual/render-report.json |
| pnpm test:integration P07-03.slides-driver | 退出0，2/2；工具schema可接收完整deck，固定诊断不落原始错误正文 | driver-retest.log |
| pnpm test:integration P07-03.slides-commit P07-03.slides-driver P07-02.data-access | 退出0，3文件9/9；图表复用正向通过，原始来源撤权后拒绝 | chart-access-retest.log |
| pnpm test:e2e -- --grep P07 | 退出0，5/5，8.5分钟；文档3、数据1、演示1，结束恢复生产构建 | e2e-office-suite.log；前四轮失败日志保留 |
| pnpm build:desktop | 退出0；最终组件宽度响应修复后的生产构建 | build-responsive.log |
| node docs/evidence/P07-03/visual-desktop.mjs | 退出0，生产构建浅色1440/深色960/实际200%检查通过；请求数前后均3，无新增模型调用 | visual-desktop-responsive-final.log；desktop-final/report.json |

单元确认严格Spec/目录兼容/拒绝执行内容、稳定ID结构操作、旧规范不变和关键数字边界拆分。事务代表验证回滚不留下已发布文件/规范、局部修改其他页语义hash不变、旧版可读、过期基版CONFLICT、未授权PNG及伪造分析不进入Native。审批测试确认修改前Native调用0、具体差异预览、批准后绑定slides.revise及资源的grant，兼容既有文档审批。

图表复用另补dataSources检查：不因分析JSON仍受管而绕过原始CSV/XLSX的选择范围和有效owner链接。9/9代表中的缓存分析收据为合成，用于复用授权正反分支，不能算真实原生分析；实际CSV→分析→图表由桌面组合及P07-02原生集覆盖。

缓存安全代表确认普通上传默认仍拒绝嵌入，仅受管SlideRecord标记可接受纯值XLSX；公式、外链、定义名称、嵌套OLE与外部package关系拒绝。实际Native Parser确认受管PPTX可解析10页，恶意缓存被拒绝且原件字节不变。

## 原生与视觉质量

三份样本：light_business-16x9、dark_presentation-16x9、light_business-4x3，每份10页，含中文/English长标题、双栏、表格、0.70/1.05原生图表、静态PNG和讲者备注。实际OfficeWorker/AppContainer将PPTX转PDF；原生Parser核对页数、每页标题/关键数字、页面矩形和PNG绘制。PPTX另由Office Parser验证原生文字、表格、备注和顺序，未将整页文本做成图片。未操作Microsoft PowerPoint GUI，不能冒称其人工验收。

Poppler最终渲染30页，逐份contact及深色第5页原图第二轮查看，文字可读、无明显遮挡、图表值和颜色可辨。视觉首轮发现深色数据标签为黑色，已设定随主题文字色并重跑原生3/3；最终截图在visual/下，旧轮保存在visual-labels-snapshot和native-labels-snapshot。

桌面五项套件包含CSV→真实隔离分析→受管原生图表PPTX/PDF→第2/5页预览→修改标题/备注→具体差异审批→同fileId新versionId，其他9页语义hash保持。该轮模型是隔离fixture，不计入live。套件构建早于最终dataSources复验及格式说明、组件响应样式补充；上述来源正反分支9/9和最终生产界面复验单独覆盖，未声称同一旧bundle包含后补代码。

初次桌面窄屏截图未关闭工作台抽屉且未等待主题/缩放生效，不计为200%验收。生产构建复用已完成隔离样本，只调整显示设置、关闭抽屉/侧栏；前两次脚本被保存的折叠导航或抽屉遮挡而停止，未新增任务。实际200%首次发现页目录挤压表单，改为组件容器宽度≤640px时单栏；重建后复验三种视图退出0，CSS zoom明确为1/1/2，标题输入无遮挡、无水平越界，前后provider attempts均3、active均0。人工查看浅/深和最终200%字段/操作截图，字号/对比度和换行可读。最新证据在desktop-final，早期截图不作为最终缩放证明。

## 失败与修复

- native-first.log为0/3：默认图表标签把0.70/1.05显示为整数1；修正格式后native-label-retest.log为3/3，再修复深色标签对比度，最终3/3。native-first-snapshot保留首轮文件。
- 桌面首轮实际发布PPTX/PDF后因Parser按旧规则拒绝内部XLSX缓存而失败；只在受管PPTX开启严格缓存检查，补安全和真实Native代表，不放开普通上传嵌入。
- 桌面第二轮创建/分析/预览完成，单页修改在旧审批白名单处被拒绝；统一结构化修改类型并复验具体grant6/6。
- 桌面第三轮停在测试新加的图表预览断言：实际已打开第5页（页码5，文本含0.70/1.05/地区/元），测试错误地等待第2页的canvas标记1。改为页码5及标记4并核对两个数值，第四轮通过图表预览，实际进入修改审批；界面回调未导航新run而仍显示已完成旧版，故断言失败。已补成功后导航/失败保留输入，五项办公套件复验中。
- check-final.log暴露新增可选轴标签的exactOptionalPropertyTypes类型错误；改为条件属性，保留失败日志。check-axis-retest.log随后因ADR格式未规范失败；格式修复后check-corrected.log退出0。
- check-source-access.log发现新增测试ref可空断言；改为可空分支后check-source-access-retest及最终check-delivery退出0。driver-final.log首轮错用了测试字段maxOutputTokens，改为实际outputLimit后driver-retest为2/2。失败没有被写成业务通过。

## 真实模型边界

P07-02在第7次连接检测通过后两轮真实任务NETWORK_ERROR/STREAM_INTERRUPTED，工具0/成果0，actual未知、estimated合计41663，隔离凭据副本均删除、入口closed，不追加数据任务。其根因尚未定位。P07-03第8次连接检查text/tools通过，2次HTTP、副本删除（connection-2026-10-30-08/probe-report.json），检测actual usage未知。

执行node scripts/p07-slides-live.mjs --check-only退出0（请求0），随后TAPKIT_P07_LIVE=1 node scripts/p07-slides-live.mjs --run-once退出1。仅一次provider attempt、最多一个工具、70,000 tokens/output8192、无重试/回退。实际NETWORK_ERROR，固定诊断“模型响应头超时”，工具0/成果0；actual未知、estimated18588，隔离密文副本删除、marker closed。见live-preflight.log、live-run.log及live-slides-2026-10-30-QHcqO9/launch.json、report.json。launch保存生产Core SHA256 370ce50616f1cd02bf36e5c2680817cc22f2fc1a1a7d5023add950973811edd3；后续仅界面CSS修复未改变该Core。

本次恢复中的P07-02/03三次任务保守记账60251，均非actual；不包括历史P07-01或连接检测，不用估算冒充实际消费。连接累计8/20。本任务一次尝试上限已用，停止追加live。账号与基础工具连接可用，复杂任务失败不能冒称缺Key或仅外部资源未配置。真实办公组合链未通过，后续先诊断R13复杂请求，不进入P08。
# 2026-10-30 应用内连接与真实PPT补验

最终结论：P07-03 implemented_and_verified，P07 gate=passed。累计第13次设置检测通过后，最后一轮两页文字PPT与局部修改均completed；生成actual2961、修改actual3152。root恰好2模型/2工具，修改前具体差异DOM已包含目标标题，实际点击“批准操作”；持久审批approved、工具succeeded/committed。新旧同fileId、不同versionId，标题/给定数字123.45/备注及另一页hash全部符合要求，见`live-ui-final.json`和P07-02/ui-live-2026-10-30-6003f245-ed10-4470-885c-6a47d630da64/report.json。原全窗口审批截图仅显示卡片上方的通知，不作差异视觉证明；未来启动器已改为滚动后截卡片，不为补截图重复模型请求。原报告plain任务的chart=true是“不适用”，真实图表证据来自第12轮及其PDF。

实际文件只读导出0网络/0凭据读取，逐项验证Blob路径及SHA256后保留于exports-99272f82-8ec6-4b14-85da-93d701d7bef1（图表）与exports-6003f245-ed10-4470-885c-6a47d630da64（原稿/修改版/XLSX）。原件与新版本均parse ready；PPTX XML检查可编辑文字、讲者备注、图表对象，三份PDF各2页。首次QA找不到未安装的pdftotext，退出1保留；改用已安装pypdf提取并断言中文/数字，Poppler实际渲染6页，退出0。6页逐页查看，中文/数字清晰，0.70/1.05正确，无明显重叠或裁切，见live-ui-file-qa.json和-retest.log。

审批预算兼容最终19/19、既有恢复回归12/12退出0。恢复首轮在沙盒TEMP遇ENOENT且after_native超时，失败不删；改仓库TEMP执行真实本地恢复后2文件12项通过（recovery-budget-retest.log）。没有改native隔离策略。新授权最终保守记账99125/120000＝actual38665＋estimated60460；失败actual未知，连接usage未知，早先estimated60251另列。每个原report保留，同profile usage只计一次；密文副本删除closed、active0。最终Core c1cbdb8f3aaa16eb0075682b1da637ed91a3b9c5345517e6e90c5f580c8315a7，无fixture；源码快照delivery-ui-manifest.json。未进入P08或提交推送。下方为实施/失败历史，以本段为准。

本节为最新授权轮，保留下方历史失败及本地检查，不重开旧终态。每个新轮均先在生产TapKit设置页实际点击“检测连接”，显示“文本与工具检测通过”才创建任务；保守累计P07全部历史20次限额。

1. 累计第9次连接通过；完整PPT模型响应actual2896，但name缺`.pptx`被严格Core拒绝（工具0）。Host只读审计不输出参数正文/推理/Key，确认字段路径。工具schema补充文件名后缀说明与固定错误提示，dispatch的严格schema保持。`P07-03.slides-driver`兼容组6/6退出0；check669文件和生产build退出0。证据P07-02/ui-live-2026-10-30-c01df21c-e869-4222-865d-ad5e81a6001a/。
2. 累计第10次连接通过；纯文本PPT真实生成actual2934，PPTX/PDF解析ready，但首页漏给定123.45，为语义失败。原启动器steer缺expectedRevision，被IPC拒绝、未创建修改run；已修正启动器，不覆盖原报告。数据实际成功另有独立核验。
3. 累计第11次连接通过；真实revision actual3132、具体差异审批通过，随后旧恢复路径把模型次数耗尽误当作工具预算耗尽，budget_stopped，未派发/未改原件。同轮新图表PPT actual9145成功，正确引用真实analysis版本/图表ID，2页及0.70/1.05备注通过。证据P07-02/ui-live-2026-10-30-d947da8e-aeb1-48c4-907a-259d201e74e7/report.json。
4. ADR0072修复：恢复已审批工具按执行额度检查，不重复模型调用；终结任务仅取消proposed/approved且side_effect=none的遗留动作，unknown不动。首次预算负向测试错用runs.tools而非权威attempt账本，失败保留；修正fixture为closed工具尝试后12/12通过，再加入终结恢复/unknown断言，最终4文件19/19退出0。build-budget-fix与check-budget-fix均退出0（672文件；123项E2E只是收集）。新生产启动已把旧approved/none安全收敛cancelled/not_committed，未重放或改旧任务终态。
5. 累计第12次连接通过；修复后新图表PPT run `01a18bed-269f-7c5c-bb64-07cfdb564d80` actual9164成功，图表/页数/备注核对通过。局部修改模型响应STREAM_INTERRUPTED，工具0，estimated37514、actual未知，旧稿保持。原始报告P07-02/ui-live-2026-10-30-99272f82-8ec6-4b14-85da-93d701d7bef1/report.json。此轮退出1且副本删除closed、active0，不称live局部修改通过。

第12轮后，本次新授权阶段保守记账93012/120000（actual32552 + estimated60460，其中失败actual未知；同profile历次usage快照只计一次）。历史更早数据/PPT的estimated60251另列，连接usage未知，不混称本轮actual。按剩余预算最多26000准备最后一个两页纯文本PPT和局部修改，仍先做应用检测且不重复data.analyze。最终结果、文件视觉核对和阶段结论待下方追加，不以相关fixture19项替代真实闭环。
