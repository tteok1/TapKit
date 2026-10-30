# P07 阶段交付与验收记录

- 日期/执行：2026-10-30 Asia/Shanghai，当前Codex会话；D:/Tapkit-public，codex/p07-office。
- HEAD aa6debf25399a328ca993e2c8a03c0d0722a6032及未提交工作树；保护既有改动，未提交/推送/发布。
- gate_status：failed（CI缺报告已修，CI67后续中文校验及流水线作用域问题按ADR0073修复验证中；此前本地/真实记录保持）。
- 范围：既有本地/原生办公验收，加指定智谱Chat/GLM-4.7-FlashX、给定合成事实的真实生成与修改；不推广其他模型/供应商或任意事实正确率，不自动进入P08。
- 最新交付指纹：[delivery-ui-manifest.json](../evidence/P07-03/delivery-ui-manifest.json)，Core c1cbdb8f3aaa16eb0075682b1da637ed91a3b9c5345517e6e90c5f580c8315a7，无fixture。此前failed gate与旧370ce快照原样保留于[gate-before-ui-live.md](../evidence/P07-03/gate-before-ui-live.md)，不冒称早期失败通过。

## 本阶段交付物

| 交付要求                                                        | 实际入口/模块                                                             | 状态及证据                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Document规范/固定模板/DOCX、MD、PDF与版本修改                   | 工作中心文档选项；contracts/document、workflows/document-*、work-document | P07-01 implemented_and_verified；[文档验收](../evidence/P07-01/verification.md)                                              |
| Dataset/Analysis/Spreadsheet/Chart、清洗/计算/隔离重算/联动导出 | 工作中心xlsx数据与图表；contracts/data、workflows/data-*、work-data       | P07-02 implemented_and_verified；[数据验收](../evidence/P07-02/verification.md)                                              |
| SlideDeck、五布局双主题、PPTX/PDF、备注与逐页/结构修改          | 工作中心pptx幻灯片与备注；contracts/slides、workflows/slides、work-slides | P07-03 implemented_and_verified；[演示验收](../evidence/P07-03/verification.md)                                              |
| 审批/固定来源/旧版保留/原子发布/质量报告                        | WorkGateway/WorkArtifacts/SlideRepository、原生Office/Parser              | 本地组合及真实限定链通过；[最终汇总](../evidence/P07-03/live-ui-final.json)、[格式限制](../evidence/P07-03/format-limits.md) |

## 实际演示与验证

1. 锁定Node24.21.0执行pnpm dev，工作中心选择文档模板/主题并提供明确事实；查看DOCX/PDF，反馈局部修改，审阅差异并保留旧版。早期缺事实曾编造来源，人工核对责任保留。
2. 选择CSV/XLSX并声明字段类型/口径/单位/时区，执行xlsx分析，查看概况/筛选/图表/导出。真实去重案例4行、重复1行，独立XLSX缓存与汇总华东0.70/华南1.05一致，源SHA256不变。
3. 新建pptx设置页数/比例/主题，引用上一步真实分析版本，获得含原生图表及讲者备注的可编辑PPTX/PDF。真实图表2页通过；另一个两页文字PPT进行具体审批修改，同fileId新versionId，另一页语义hash保持。图表/文字初稿/修改稿三份PDF共6页实际渲染并逐页检查。
4. 本轮真实入口先启动TapKit，在设置页实际点击检测；必须显示“文本与工具检测通过”才发任务。累计13/20，新授权5次全部通过，不继续检测。各原report不可覆盖，closed入口不可重开；汇总与文件可只读复核，无需重复模型请求。
5. 本地组合可用pnpm test:e2e -- --grep P07复现已通过5项，模型fixture但AppContainer/Office/Parser真实；该命令不能代替本轮live结果。当前生产构建保持无fixture。

## 门禁结果

| 检查                  | 实际结果/退出码                                                                | 证据及范围                                                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm check/build      | 0；审批预算修复生产build及check通过；最终同步格式修正后复验                    | P07-02/ui-live-2026-10-30-d947da8e-aeb1-48c4-907a-259d201e74e7/check-budget-fix.log、build-budget-fix.log；P07-03/check-ui-final-retest.log                                                                                                                       |
| unit/相关集成         | 0，既有unit65/65、便携20/20及来源/schema9/9；本轮审批预算/文档审批/幻灯片19/19 | P07-03/unit-final.log、integration-final.log、chart-access-retest.log；P07-02/ui-live-2026-10-30-d947da8e-aeb1-48c4-907a-259d201e74e7/final-budget-regression.log。各组有重叠                                                                                     |
| 崩溃/恢复兼容         | 0，12/12，真实进程强杀及未知副作用不重放                                       | 同目录recovery-budget-retest.log；首轮沙盒TEMP ENOENT/after_native超时日志保留                                                                                                                                                                                    |
| 原生数据/重算/异常    | 0，6/6及类型2/IQR1补验，有重叠                                                 | P07-02/resume-2026-10-30/native-final.log、native-typing.log、native-profile.log                                                                                                                                                                                  |
| 原生PPT代表及缓存安全 | 0，三份10页3/3及30页视觉；缓存安全26/26与实际Parser2/2                         | P07-03/native-visual-final.log、render-qa-final.log、cache-security-first.log、native-cache-first.log                                                                                                                                                             |
| 全办公桌面/响应界面   | 0，5/5；浅1440/深960/实际200%通过                                              | P07-03/e2e-office-suite.log、visual-desktop-responsive-final.log；模型fixture，原生真实                                                                                                                                                                           |
| 本轮真实模型与原文件  | 0，最终文字生成/审批局部修改通过；独立数据与图表PPT通过                        | [live-ui-final.json](../evidence/P07-03/live-ui-final.json)；[原稿及修改稿manifest](../evidence/P07-03/exports-6003f245-ed10-4470-885c-6a47d630da64/manifest.json)、[图表manifest](../evidence/P07-03/exports-99272f82-8ec6-4b14-85da-93d701d7bef1/manifest.json) |
| 本轮实际PDF视觉       | 0，3份6页；中文/数字/图表清晰，文字可编辑/备注正确                             | [live-ui-file-qa.json](../evidence/P07-03/live-ui-file-qa.json)、live-ui-file-qa-retest.log；首轮缺pdftotext的工具错误保留，后用pypdf及Poppler                                                                                                                    |
| 原生隔离/权限         | 0，当前用户22/22                                                               | P07-02/runtime-current-user-fresh/runtime-probe.json；fingerprint 17bf4c7eccc5e119fecf35c14bfc63c3a179340c0d6e5652d40d7c0320b7a09e；不替代独立标准用户验收                                                                                                        |
| 需求/交接             | 同步37项状态与相关需求；最终命令/退出码见日志                                  | P07-03/docs-ui-final.log、diff-ui-final.log；CURRENT/INDEX/RESOURCES/requirements，ADR0069—0072                                                                                                                                                                   |

## 失败保留、用量与交接

旧网络/断流失败、初稿漏123.45、文件名缺.pptx、启动器误查XLSX和缺expectedRevision、审批恢复预算错误均保留在任务verification及原报告。没有通过放宽schema、来源、隔离或无界重试获得成功。ADR0072只区分新模型请求额度与已有批准工具的执行额度；旧终结未派发项取消、unknown保持，旧终态不重开。

最终同步check首轮仅INDEX/gate两个Markdown表格需格式化，退出1保留于check-ui-final.log；格式修正后结果见check-ui-final-retest.log。docs-ui-final.log验证37任务，diff-ui-final.log退出0（仅既有CRLF提示）。

新授权阶段模型任务10次尝试：actual38665＋estimated60460＝保守99125/120000，余20875未用；两次失败实际未知，不能将估算当实际消费，连接检测usage未知。历史更早三次数据/PPTestimated60251另列，不重复累计同profile快照。最后根任务2次模型/2次工具，修改批准后确实执行，证明预算边界修复。

隔离凭据副本删除、marker closed、activeRuns0；原账号/原profile未改。复用规范、Office/Parser/Validator、固定模板、版本仓储及审批供后续任务使用，P08仍not_started。限定PNG/图表种类、无完整Office编辑器/AI图像创作或新增服务器，详见格式限制。当前P07无剩余规定验收项；未做Microsoft PowerPoint GUI验收，不把可编辑XML/LibreOffice验证冒称全特效兼容。
