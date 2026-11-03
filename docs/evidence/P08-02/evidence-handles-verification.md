# P08-02 证据编号与 Core 收尾补验

最终结论：改造与验收完成，P08-02=implemented_and_verified。v7第44次隔离直连检测成功后，真实run 01a1a165-295d-7be9-a4ca-98a301baf691整轮passed：4次实际模型尝试/7工具，搜索1/读取2/双源2条逐字事实/Core主动报告，0参数错误，MD/JSON全部核验，actual10600/预留0。生产binary与实际run匹配且fixture-free，证据final-core-closeout.json及discovery-export-verification.json。报告quality=partial仅表示逐条单源陈述尚未交叉核验，已列核验缺口，不把不同域名冒称独立或事实真值。

最终检测44/50，本次14/20、余6保留；27副本清理，根actual295232+estimated664062，检测用量未知不含其中。原账户/原网络不改；成功范围是该模型及隔离直连。旧代理异常、所有失败、原第36轮not_verified及另行冻结后验都保留。check/496unit/33研究集成通过，新接口桌面1项及真实DOCX/PDF已验；后补Core变化由定向与最终live覆盖。未提交/推送，不开始P08-03或阶段收口。以下是过程及历史检查点。

2026-11-03，codex/p08-02-research，未提交/推送。用户授权先改造再追加20次检测：累计上限50，既有30次保留。

改造依据是已归档真实失败：最终轮的FACT_MUST_BE_A_VERBATIM_EXCERPT/QUOTE_NOT_IN_SOURCE，以及上一轮已有双源有效事实但最后模型未调用报告。目录由Core从实际已读快照生成，模型只选择编号；完整原文、来源、位置和哈希由Core填写并严格复验。Work达到收尾条件后直接派发原research.report，不再调用模型；不足或参数修正耗尽保存partial及原原因。不同来源组不作为真实性或独立核验结论。

离线回归覆盖完整否定、快照变化、错问题/未知编号、显示窗口边界、已排除来源、调用预算刚好用尽、解析失败部分报告，以及旧内部引文/批量契约。历史冲突、不可用、时间、排除、无答案五类fixture仍运行。首轮一项旧提示断言失败，按新接口修正；原日志evidence-handles-regression.log保留。

当前check与490项unit已通过，研究集成、真实桌面及生产构建恢复正在执行；新真实请求尚未发起。正式结果在完成后追加，不能把此检查点当作live通过。

离线完成检查点：完整check退出0；新增归档失败片段回放后491 unit退出0（evidence-handles-final-unit.log）。实际失败的41字符改写引文继续拒绝，选择归档原文段落的编号后位置/hash通过；fixture只保留有界公开片段，不含原生推理或凭据。首次回放测试把两段原文当作一个目录项，断言失败，已按实际完整段落选择修正；evidence-handles-final-check-unit.log保留该失败及已通过check。

P06与P08-02共63集成、8文件退出0，包含29项研究/迁移；见evidence-handles-final-acceptance.log。测试写入一份原本干净的P06历史合成证据，生成内容保存在work-regression-generated.json，原文件已按HEAD字节恢复并diff退出0。首轮桌面兼容验收1项与生产恢复退出0（evidence-handles-desktop-verification.log）；新编号接口fixture的桌面验收仍在执行。

最终离线/桌面检查点：新编号fixture的真实Electron验收1项通过，包含DOCX/PDF、原文定位及排除/提前结束；完整脚本退出0，正式生产构建恢复完成。37任务状态/证据链接检查退出0。随后才启动真实TapKit进行累计第31次连接检测，尚未发正式任务。

第31次检测通过，v2 run 01a1a113-53a6-75dc-8691-7a60a80139ec最终8模型/8工具、搜索1/实际读取3、0有效事实；两条编号均能精确定位，但原文不同，被同一fact的严格校验拒绝，之后重复读取，最终BUDGET_EXCEEDED/partial，not_verified保留。部分MD/JSON已产，但无research.report成功账本，不能算闭环通过。actual50670/预留0，副本清理，累计31/50。诊断见evidence-selection-diagnosis.json，原报告live-9ec13261-2431-41c0-b96b-0ba45399a903/report.json。工具分类追踪不是工具名错误的证据，已按账本更正原因。

v3补充按完整原文精确分组：不同陈述各成独立逐字事实，相同原文才合并来源支持，不削弱互证或质量算法。新增回归复现双原文一次选择并验证Core直接收尾、不再发额外模型请求。完整check/492 unit/30研究集成退出0，见evidence-selection-grouping-final.log；前次格式检查因进度文档未格式化失败保留在evidence-selection-grouping-verification.log。桌面1项与63项Work/研究集成是分组前已验范围，后续仅fact模型投影分组变化由新增回归和下一轮live验证。生产Core重建后再启动第32次检测，尚不宣称live通过。

第32次应用内检测通过；v3 run 01a1a11b-e3b9-7760-a1ad-b1b1f681da75搜索1/实际读取3（两份IANA、一份LARUS），发出无引文的inference，严格拒绝EVIDENCE_REQUIRED；后有参数拒绝，最终BUDGET_EXCEEDED/partial、0有效事实，not_verified保留。5模型/5工具，actual20668+estimated52455，预留0/副本清理；累计32/50、余18。原报告live-bd88d242-1267-4f15-b433-c715976be901/report.json。

v4简化模型record为必填questionKey/evidenceIds、默认fact；可选kind/text/opposingEvidenceIds保留其他语义。模型目录只发编号/完整原文与240字预览，完整快照哈希/位置/问题绑定留Core复验，减少重复内容；根预算估算标准不改。check/493 unit/30研究集成退出0（evidence-required-selection-verification.log）；新增断言验证真实模型请求不带重复绑定字段、请求体更小，存储的精确引文/位置/hash仍一致。新版桌面验收及生产恢复进行中，之后才继续真实检测。

最终离线检查：新版接口桌面1项通过（1.4m）且完整脚本退出0、生产构建恢复，见evidence-required-selection-desktop.log。随后补充单源fact逐条列核验缺口（MD/DOCX），并明确临时gap可继续搜索，只有覆盖双源的fact/conflict自动收尾；预算/参数耗尽或显式report仍产partial。check/493 unit/31研究集成退出0（evidence-gap-closeout-verification.log）。桌面冲突/导出主路径保持，后补纯报告说明与gap继续查证由新增回归和最新实际Core live验证。重建生产Core后继续第33次连接检测；未通过检测前不发正式任务。

第33次检测通过，v4 run 01a1a12a-012c-7535-bd49-7e60434ad462：5模型/3工具，搜索1/读取2，记录参数连续三次拒绝，PARSE_FAILED/partial，0有效事实，not_verified保留；actual3962+estimated63012/预留0/副本清理。累计33/50、余17。原报告live-e850a19a-e5ea-4762-81bc-b1da06976c06/report.json。

诊断修复：API参数失败的反馈漏传当前证据目录，导致默认fact的编号投影被错误按旧引文结构诊断；已补同轮目录。新增仅固定字段名/类型、编号数量/匹配数、合法kind枚举、批量字段形状，不保存参数值/编号/原文/原生推理；privacy unit验证私有字段和值不进入诊断。check/494 unit/31研究集成退出0（evidence-selection-shape-verification.log）。第34次检测成功后才继续正式任务，尚未宣称闭环通过。

第34次连接检测通过，但正式run 01a1a12f-d8da-7346-bedc-a66dec7313c5仍连续参数拒绝/partial，0有效事实，not_verified保留；原报告live-546339b0-5bab-42c7-8be5-d49850ff407a/report.json。累计34/50、余16，21副本清理/预留0；累计actual249591+estimated458640，检测用量未知且不含其中。

v5补齐编号在API投影中的18字符长度（原regex会被兼容层移除），Core仍校验完整格式与同轮目录。fact中的模型text一律不用，只按有效编号生成原文事实，旧内部quote/text契约仍严格；未知或错问题编号仍拒绝。诊断覆盖canonical/wire名称及Core投影失败，仍仅字段形状/匹配数。check/494 unit/31研究集成退出0（evidence-derived-fact-verification.log）；测试证明带有反向改写的模型文字也不会进入事实，存储仍为原文否定句。重建生产Core后继续第35次应用内检测，通过后才发正式任务。

第35次检测通过，但v5正式run 01a1a135-8ec9-776d-a9a5-cabef6e276ab仍参数拒绝/partial、0有效事实，not_verified保留。原报告可由live-attempts.json定位。累计35/50、余15，22副本清理/预留0；actual253597+estimated525918。进一步发现选择诊断写入漏Store事务而未落盘，已修复并仅在匹配profile/case的P08 opt-in下启用；真实SQLite集成回放同时覆盖wire别名和Core失败，确认诊断可读且无参数值。check/494 unit/32研究集成退出0（evidence-selection-transaction-final.log），前次仅格式失败日志保留。重建生产Core后第36次检测通过才发正式任务。

第36次检测通过，run 01a1a143-6663-7198-9942-2ee7ad8eb355已完成成功搜索/两源读取/10条逐字事实/Core report账本与MD/JSON产物。任务partial、reason=null；各条事实单源，报告逐条列尚未交叉核验。首轮ID选择12条全部匹配真实目录但超模型投影6条，修正一次后通过业务闭环。原报告live-71ed833f-3670-453e-97a8-2549e120b8db/report.json因验收脚本漏HTML转义仍是not_verified，不改写。

独立后验markdown-artifact-diagnosis.json：MD SHA正确、10个完整引用块均精确存在，其中1条含&，原检查器未按&amp;比较。验收修复严格匹配完整blockquote，包括HTML实体及多行前缀，不放宽原文/位置/hash检查；新增unit包含实体、多行与丢否定的反例。v6 fact选择上限对齐原Core每批12条，其他模式每侧6条，根预算不变。check/496 unit/32研究集成退出0（evidence-batch-ceiling-verification.log）；重建生产Core后开始第37次检测，通过后重新正式补验。旧记录完整保留。

冻结后验脚本reverify-live36.mjs严格校验第36轮实际快照版本/内容SHA、10段位置与引文SHA、逐字fact/两来源组、report成功账本、MD完整引用块、来源JSON与DB一致、预算预留0和凭据删除；最终退出0，archived-live36-reverification.json=passed，原not_verified回执及其SHA保持。初次SQL列名按实际schema修正为run_id/source_revision；不读取native state/密钥，不发请求。导出的archived-live36-report.md与sources.json是实际Blob原字节。

最终v6重跑第37/38连接失败、第39通过后才发run 01a1a14e-ab68-7c54-9c22-4820e773727b，读取2源后NETWORK_ERROR/无报告，failed保持；当前39/50、余11，24副本清理/预留0，actual265933+estimated624963。现继续第40次检测，成功后才发任务；独立冻结后验不冒称最新v6原样整轮通过。


v7目录对齐补充：每轮跨材料最多12条可见候选，隐藏项不参与当轮ID解析，nextOffset指向首条未展示原文，保持完整分页而不重读网络。新增真实SQLite/Blob回归验证12条记录及下一页原文位置、读取计数仍1，最终check/496unit/33集成退出0。第44次应用内检测与正式任务均通过，完整回执保留于live-9de5c45a-59f5-400d-a81c-586e58eb18e6；最终实际模型4次全部completed，无参数修正。Source report按原Blob字节导出，不重写/拼造验收产物。
