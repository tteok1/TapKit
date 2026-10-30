# P07 阶段交付与验收记录

- 日期/执行：2026-10-30 Asia/Shanghai，当前Codex会话执行。
- 工作目录D:/Tapkit-public；分支codex/p07-office；HEAD aa6debf25399a328ca993e2c8a03c0d0722a6032及未提交工作树，P07-01既有改动保留。
- gate_status：failed。
- 交付快照：docs/evidence/P07-03/delivery-manifest.json记录16个关键源码/测试/生产Core的SHA256；docs-delivery.log验证37项任务状态与证据路径，diff-check.log退出0。
- 原因：本地办公交付与检查通过；P07-02/03复杂真实模型工具任务未通过。账号与基础工具连接可用，不能冒称缺Key或仅缺外部资源，因此不使用engineering_passed_external_pending，不进入P08。

## 本阶段交付物

| 交付要求                                                                                 | 实际入口/文件                                                                                         | 任务及状态                                              | 验收证据                                                      |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| 结构化报告、固定模板、DOCX/MD/PDF及局部新版本                                            | 工作中心文档选项；contracts/document、workflows/document-*、Core work-document                        | P07-01 implemented_and_verified，真实验证限给定合成事实 | [文档验收](../evidence/P07-01/verification.md)                |
| Dataset/Analysis/Spreadsheet/Chart规范、清洗/独立计算/隔离重算、XLSX/CSV/JSON/HTML和图表 | 工作中心xlsx、数据与图表；contracts/data、workflows/data-*、Core work-data                            | P07-02 implemented_not_live_verified                    | [数据验收](../evidence/P07-02/verification.md)                |
| SlideDeck、五布局/双主题、16:9/4:3、可编辑PPTX/PDF与备注、增删复制重排                   | 工作中心pptx、幻灯片与备注；contracts/slides、workflows/slides、Core work-slides、SlidesResults       | P07-03 implemented_not_live_verified                    | [演示验收](../evidence/P07-03/verification.md)                |
| 成果质量/版本/审批/来源及导出闭环                                                        | WorkArtifacts/Gateway、SlideRepository/DocumentRepository；PPTX/PDF/规范/收据事务、固定版本预览与下载 | 本地检查通过；不代表真实模型组合已通过                  | 下方组合回归；[格式限制](../evidence/P07-03/format-limits.md) |

## 演示与检查步骤

1. 使用锁定运行时执行pnpm dev；工作中心新建文档任务，选模板/主题、明确事实和授权材料，生成后打开成果，反馈局部修改并审阅差异；每次保留旧版本。无依据事实仍须人工核对。
2. 新建xlsx任务，附加CSV/XLSX并声明统计口径/单位/时区；查看数据与图表、筛选、导出；修改去重口径后对照新旧结果。固定示例去重汇总为华东0.70、华南1.05，保留重复时华南2.10。
3. 新建pptx任务（默认10页，上限50，浅/深主题，16:9或4:3）；可先分析所选表格再引用实际图表，逐页预览PDF并查看讲者备注。修改一页标题/正文/备注，审阅具体差异后生成同文件新版本；其他页语义hash保持。
4. 无真实账号时可执行pnpm test:e2e -- --grep P07复现已通过的5项桌面隔离fixture，仍实际执行AppContainer/Office/Parser。该命令不能代替live；结束自动恢复生产构建。
5. 真实账号已存在但本轮任务失败；不要直接重跑已关闭的live入口。先读下方失败报告和预算，再诊断复杂请求并安排有依据的受控补验。

## 门禁结果

| 检查                | 实际结果/退出码                                                                                | 范围与证据                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| pnpm check          | 0；665文件格式、类型、边界、清单通过；123项E2E只收集                                           | P07-03/check-delivery.log                                                                           |
| 相关unit            | 0，65/65                                                                                       | P07-01/02/03、P03 Office/ZIP、P06审批；P07-03/unit-final.log                                        |
| 相关便携integration | 0，20/20；后补来源撤权/工具schema/诊断9/9有重叠                                                | P07-03/integration-final.log、chart-access-retest.log                                               |
| 原生数据/重算/异常  | 0，6/6；后补时区/分类2/2、IQR1/1有重叠                                                         | P07-02/resume-2026-10-30/native-final.log、native-typing.log、native-profile.log                    |
| 原生演示代表集      | 0，三份10页3/3；页数/标题/数字/页面边界/PNG，30页视觉复核                                      | P07-03/native-visual-final.log、render-qa-final.log、visual目录                                     |
| 图表内部缓存安全    | 0，26/26及实际Parser2/2有重叠                                                                  | 普通上传仍拒绝嵌入，受管PPTX仅有界纯值缓存；P07-03/cache-security-first.log、native-cache-first.log |
| 全办公桌面组合      | 0，5/5，8.5分钟                                                                                | 文档3、数据1、演示1；P07-03/e2e-office-suite.log。模型fixture，原生真实                             |
| 最终生产构建与界面  | 0；浅1440/深960/实际200%无遮挡，模型请求数不变                                                 | P07-03/build-responsive.log、visual-desktop-responsive-final.log、desktop-final/report.json         |
| 原生隔离/权限       | 0，当前用户22/22；fingerprint 17bf4c7eccc5e119fecf35c14bfc63c3a179340c0d6e5652d40d7c0320b7a09e | P07-02/runtime-current-user-fresh/runtime-probe.json；没有冒称本轮独立标准用户通过                  |
| 需求对应/交接       | 已同步                                                                                         | [需求追踪](requirements.csv)、P07-01/02/03、CURRENT、INDEX、RESOURCES、ADR0069—0071                 |
| 真实模型组合        | 未通过                                                                                         | 下方R13；不能以fixture、本地文件成功或连接检查代替                                                  |

五项套件构建早于最后的图表原始来源复验、格式说明和容器响应样式；来源授权正反9/9与最新生产界面复验已分别覆盖。最终Core SHA256为370ce50616f1cd02bf36e5c2680817cc22f2fc1a1a7d5023add950973811edd3，无测试fixture。真实PPTX请求使用同一Core，后补CSS未改变它。旧失败日志和代表文件快照保留，不把未执行项写成通过。

## R13真实范围与剩余失败

- P07-01仅受控给定事实的真实DOCX生成/解析/查看通过；开放缺失事实曾出现虚构来源或结论，限制已记录，不能推广为普遍正确。
- 连接累计8/20；第7、8次text/tools通过，第8次2次HTTP响应头834/698ms，隔离副本删除；连接actual usage未知。
- P07-02两次真实数据任务分别NETWORK_ERROR/STREAM_INTERRUPTED，工具0/成果0；actual未知、estimated合计41663。报告见P07-02/live-data-2026-10-30-OUhxXF/report.json及live-data-2026-10-30-zeAhZj/report.json。数据失败根因尚未定位，不推断是Key或确定的网络根因。
- P07-03唯一一次真实两页PPTX任务NETWORK_ERROR，固定诊断响应头超时，工具0/成果0；actual未知、estimated18588。见P07-03/live-slides-2026-10-30-QHcqO9/report.json及launch.json。
- 本次恢复中P07-02/03共三次provider attempt，保守记账60251，非actual，不含历史P07-01和连接检测。各自受控尝试上限已用，无重试/回退；三个隔离密文副本均已删除、入口closed，原账号/原profile未改。

## 后续与责任边界

可复用Document/Analysis/SlideDeck规范、固定模板、原生Office/Parser与验证器、版本仓储、具体审批/授权和本地交互成果。限制见格式页：不提供完整Office编辑器、拖拽排版、AI图像创作、任意执行或新增服务器；PNG/图表范围、备注PDF差异及特效兼容均明确。

下一步责任仍在P07-02/03与R13复杂工作请求：先只读核对上述失败报告/launch、请求规模和固定超时诊断，查明为何基础连接成功而任务失败；保留完整schema、权限、隔离及预算，不靠放宽校验或无界重试换成功。受控补验真正生成并核验办公成果后再升级任务与gate。当前不进入P08，未提交、推送或发布，无后台验收/模型任务。
