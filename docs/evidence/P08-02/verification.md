# P08-02 实现与验收

2026-11-03最终补验：P08-02=implemented_and_verified，v7证据编号选择与Core确定性收尾完成；check/496unit/33研究集成、新接口桌面1项已验。第44次隔离直连检测成功后，智谱真实搜索→两源逐字事实→Core报告整轮passed；MD/JSON位置/hash/原字节通过，0参数错误，实际模型10600 tokens/预留0。报告按单源陈述未交叉核验标partial并列缺口。检测44/50，本次14/20余6，27副本清理。原失败与代理异常保留，不扩大成功网络/账号范围。见[最终补验记录](evidence-handles-verification.md)、[Core收尾证明](final-core-closeout.json)与[真实导出核验](discovery-export-verification.json)。下文改造前状态/结果是历史，不取代此最新结论。

2026-11-03证据改造补验（最新）：用户追加20次检测，累计50/已用32。v4已实现必填evidenceIds/default fact、精简模型上下文与Core确定性收尾；check/493unit/30研究集成通过，桌面及新live仍待完成。#31/#32通过连接后的正式任务仍not_verified/partial，旧失败保留；详情[证据编号补验](evidence-handles-verification.md)。下文改造前检查点保持历史范围。

2026-11-03更新：任务整体为implemented_not_live_verified。继续排查修复了代理查询URL、模型参数投影与阶段推进、固定安全诊断及唯一查询缺索引；最终check/unit487与研究集成26通过，最终桌面1项通过并恢复生产构建。检测上限按用户20→30，30/30已用完；#30检测通过后的完整搜索/双源/显式报告任务仍PARSE_FAILED/无报告，不能称全部验收通过。全部17个live副本清理、预留0；详细范围、失败及后续待验见[发现搜索补验](discovery-verification.md)。下文2026-11-01指定URL及本地验收属于历史已验范围，不扩大为当前完整链通过。

2026-11-01；D:/Tapkit-public；codex/p08-02-research；基于main/origin/main 35582482610bc7b6c1cd71721c6ac59faa07eb08建立。实现、规定本地检查及指定URL真实模型验收完成；未提交、未推送，未开始P08-03，不收口P08阶段。

## 交付与需求

| 需求 | 实际交付与证据 |
| --- | --- |
| FR-18-009 | ResearchSpec、主题/用途/范围/日期/域名/格式配置；创建界面与Core严格校验 |
| FR-18-010 | 授权公开URL、搜索候选、固定本地版本；schema20快照、权限复核、删除清理；外部应用连接仍非本版范围 |
| FR-18-011 | 默认提纲、用户修改/确认、任务新版本及根预算继承 |
| FR-18-012 | 根8搜索/40读取计数、每问题3轮、分页来源/发现、原文偏移定位与明暗高亮 |
| FR-18-013 | 来源排除、方向变更、提前结束partial；未知副作用不重放；旧回调不能推进新版本 |
| FR-18-014 | Core逐字引用/否定/数字边界与hash验证；事实、推断、未裁决冲突、证据缺口分别呈现 |
| FR-18-015 | 指定发现及新公开问题的新run续查，固定版本继承但不重置根预算 |
| FR-18-016 | Core生成MD/来源JSON；结构化DOCX及隔离Office PDF；实际预览/下载入口 |

主要源文件为contracts/research.ts、workflows/research.ts、core/research-service.ts与research-driver.ts、renderer/research-ui.tsx与research.css、migrations/0020_research.sql；契约/ADR0076/共享规格与需求表已同步。没有新依赖、服务端或第二套调度器。

## 实际检查

所有pnpm命令均通过仓库锁定Node24.21.0及pnpm12.4.1运行。表中退出码为真实执行结果。

| 检查 | 结果 / 退出码 | 证据 |
| --- | --- | --- |
| pnpm check；pnpm test:unit（最终源） | 类型/静态边界/格式/126个E2E收集通过；482单元通过；0 | completion-check-unit.log |
| pnpm test:integration（稳定基线） | 515通过、1既有skip；0 | full-integration-final.log |
| pnpm test:integration P08-02（最终根预算收束） | 20通过；0 | final-budget-report.log |
| 研究与智谱相关集成 | 26通过；0；此后研究分支另由最终20项覆盖 | final-targeted-integration.log |
| pnpm test:e2e -- --grep P08 | 3通过；0；合成模型/网页、真实Electron/Core/SQLite/Blob/AppContainer/Office | resumed-p08-verified.log |
| 生产构建 | 全量build曾退出0；最后Core生产重建退出0，UI未再改 | build-fixed.log；final-budget-report.log |
| 当前用户隔离probe / 原生preview | 22/22及4/4；0；不是本机独立标准用户验收 | runtime-current-user/runtime-probe.json；native-parser-diagnosis.log |
| 运行时只读指纹复核 | 与既有probe一致；21729ms；0 | resumed-fingerprint-timing.log |
| 五个研究fixture | 冲突、无法访问、时间、排除、无答案；独立字符/hash检查，5组真实MD/JSON | tests/evals/research/gold.json；evals/ |
| 独立界面复核与设计记录 | 两项material fixes均resolved、局部ship；原设计文件未改 | design-verdict.md；design-documentation.md |

全量集成发生在最终参数反馈/扁平读取/预算收束修复之前；不声称最终源重新运行了全套。后续变更由相关集成、完整单元/类型和真实研究覆盖，未重复无关原生套件。桌面尺寸为实际CSS1267×899与947×839，DPR2；不声称760宽。暗色媒体由测试显式设置，不声称Windows主题设置流程已验。report-page.png是实际完整1页PDF画布，可读；pdf.png仅是预览视口。检测器cache_directory_failed保留，未计为通过。

## 真实模型范围与账本

仅原有智谱账户glm-4.7-flashx/Chat。每轮实际启动TapKit，在设置内检测文本与工具成功后才发正式工作任务；原账户、模型及网络设置保留，不隐式切换。P08-01已用3次，本任务新增11次，累计14/20（最终轮第13次失败、第14次成功），剩余6次未使用。本任务10轮中前两轮在正式任务前因UI脚本标签歧义中止；其他失败和未达验收标准的报告全部保留。

最终run **01a195e3-2ec4-7e69-a1a4-8ab4c4db705a**：3模型/3工具，实际读取example.com一次、记录两条逐字证据、显式research.report生成MD与JSON；报告为partial，符合单来源不足独立核验的边界。实际归档文本、字符偏移/quoteHash、报告字节hash、documentation用途陈述逐项核对通过；actual6962 tokens、预留0。此轮没有发现搜索，验收脚本明确是给定URL研究。证据[最终报告](live-30f3e13f-3741-44c6-a7da-6330bdc3ffe9/report.json)、[内容核验](live-30f3e13f-3741-44c6-a7da-6330bdc3ffe9/content-verification.json)、connection-2.png及task.png；两张截图已打开检查。

**成功的真实发现搜索不在通过范围。** 早期正式任务实际尝试Bing搜索返回NETWORK_ERROR；系统如实记录unavailable，不虚构候选或来源。本地发现/预算/排除逻辑已验证；当前环境下搜索结果可用性仍需连通性恢复后的独立live，见RESOURCES的R16。指定URL/本地资料研究可用。首次强制“搜索恰一次”的样例报告仍保留not_verified，未回写成passed；最终样例按产品“已给URL优先读取”的边界验收，另外要求显式报告调用，而非仅预算兜底生成文件。

全部本任务正式根用量：actual41483 + estimated174087，保守合计215570；估算不是实际输入/输出，连接检测用量未知且不在此合计。每轮上限60000；所有隔离凭据副本已清理、marker closed，原凭据保留。详见live-attempts.json。未记录密钥、原生推理或私有材料。

## 修复、失败保全与交接

此前schema19/20握手、Zod精简定位schema、Office中间校验的循环依赖、快速提前结束revision冲突均已修复，并保留各自失败日志；旧工作Core首次启动超时未再复现，不声称根因已证实。后续真实诊断确认读取参数缺少嵌套source，改用模型侧扁平参数再转严格Core联合；参数错误最多修正2次、第三次停止，进度与事件同事务；普通流中断不当成可修正参数错误。诊断仅固定阶段/字段路径，不存参数值。临近最后一次已批准的根模型调用时仅提供报告工具，保留已核验内容与缺口，不增加预算。

47个旧任务回归派生产物已保存到generated-regression.zip并逐字节验证后恢复原HEAD内容，manifest在generated-regression.json；未清空或reset工作区。后续提交前应按本任务源文件清单及verification.json审阅，当前没有提交/推送授权。下一任务仍是P08-03，需用户明确安排；旧阶段gate和其他协议live范围不提升。
