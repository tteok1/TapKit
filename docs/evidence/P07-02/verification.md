# P07-02 验收记录

2026-10-30；D:/Tapkit-public；codex/p07-office；HEAD aa6debf25399a328ca993e2c8a03c0d0722a6032 + 工作树。P07-01原有改动保持。

本地实现与规定代表检查完成，任务状态implemented_not_live_verified。真实数据工具闭环仍未通过，R13这一场景的失败根因尚未定位；不是缺Key，也不能据此宣称P07仅缺外部账号或阶段已通过。后续可使用已验证接口开展P07-03，真实OS隔离/权限证明保持。

## 交付及需求对应

| 需求 | 实现与核验 |
| --- | --- |
| FR-17-009 多数据和统计口径 | DatasetSpec固定来源版本、列类型/单位/时区/缺失规则；多份XLSX/CSV经过同一授权与输入hash验证；native-transform |
| FR-17-010 概况和异常 | 行数/缺失/重复/IQR异常提示；非法值拒绝并给恢复提示，不静默丢弃；native-data、native-transform |
| FR-17-011 转换 | 固定DSL的选择/筛选/稳定排序/填空/去重/连接/拆分/分类/汇总；重复键默认拒绝，显式允许也预先受单元格限制；native-transform、native-limits |
| FR-17-012 公式与计算 | 模型输出完整结构化data.analyze；Decimal四则/ROUND生成可编辑公式，真实LO重算后用独立结果核对缓存与数据类型；native-data、provider、data-driver |
| FR-17-013 依据和纠正 | 输入版本/hash、AnalysisSpec、程序hash、输出hash、可读口径；runs.steer生成新版本，旧版本保留；桌面实际重算1.05→2.10且旧版仍1.05 |
| FR-17-014 图表调整 | 原生SVG/PNG和图表规范；可信React绘图，可调类型/标题/图例；分组数值不隐式汇总，空值保留间断；chart-series、native-transform、桌面 |
| FR-17-015 筛选排序明细 | Core按全量结果筛选/排序后分页，查看时不改源数据；表格与图表联动；data-contract、桌面 |
| FR-17-016 交互看板 | 固定React表格/图表/筛选组件，禁任意模型HTML脚本；SVG白名单清理；svg、export-privacy、桌面 |
| FR-17-017 导出 | 同事务提交XLSX/CSV/SVG/PNG/图表JSON/Markdown报告/固定HTML快照；安全CSV默认转义注入字符串，原值与HTML明细只能由用户显式选择；data-receipt、native-transform、桌面 |

## 实际执行结果

锁定Node24.21.0/pnpm12.4.1；TEMP/TMP为工作区.test-data/p07-data-temp。原生/Electron按正常Windows权限运行；未降低AppContainer/Job/授权门槛。

- `pnpm check`：退出0；resume-2026-10-30/check-first.log、check-final.log。后者检查648个文件，E2E仅收集122项，不把收集当执行。
- `pnpm exec vitest run --config vitest.config.ts --project unit P07-02 P07-01 P06-02`：39/39、退出0；resume-2026-10-30/unit.log。
- `pnpm exec vitest run --config vitest.config.ts --project integration P07-02.data-access P07-02.data-receipt P07-01.document-driver P07-01.document-gateway`：13/13、退出0；resume-2026-10-30/integration.log。合成回执恢复不冒充原生质量。
- `pnpm exec vitest run --config vitest.config.ts --project integration P07-02.native-data P07-02.native-transform P07-02.native-limits`：6/6、退出0、309.35秒；resume-2026-10-30/native-final.log。包含真实隔离重算、重复键/除零/单元格上限/外部链接拒绝和源hash不变。
- 复查补齐IANA时区与Decimal分类后，定向原生native-data/native-transform：2/2、退出0、191.16秒；resume-2026-10-30/native-typing.log。Z时间转换为Asia/Shanghai的08:00+08:00，小数0.1分类正确。后续native-transform加入第三来源[1/1/1/1/99]的独立IQR预期，1/1、退出0、90.99秒；resume-2026-10-30/native-profile.log；不与前轮重复累计。
- XLSX请求只发送完整分析工具和user.ask，文档及旧目录兼容回归：data-driver/document-driver 3/3、退出0；resume-2026-10-30/driver-focus.log。
- `pnpm test:e2e -- --grep P07-02`：1/1、退出0，生产构建恢复；resume-2026-10-30/e2e-visual.log。实际CSV导入、隔离工具、筛选/图表/导出入口、明细、口径新旧版本。模型为合成回复，不能计入live。
- 人工查看resume-2026-10-30/desktop下浅色1440、深色960、深色960/200%截图和native-transform/图表1.png：中文、单位、分组图例、柱高/折线和主要控件未见遮挡；几何检查保证图表不超出成果区。长表横向滚动；不是所有可能数据的视觉保证。
- helper当前用户安全范围22/22、退出0沿用runtime-current-user-fresh；helper/运行时门禁输入未因本轮业务修改变化。独立标准用户范围不冒称本轮通过。

## 真实模型范围与用量

仅使用既有授权R13智谱Chat/GLM-4.7-FlashX，原profile/账户保持；API密钥仅Host读取，Agent不读取明文。连接第7次、2次HTTP通过，text/tools均true；connection-2026-10-30-07/probe-report.json。P07连接累计7/20（历史6次+本轮1次），检测实际usage仍未知。

首轮P07-02任务1次provider attempt在约90秒后NETWORK_ERROR，工具0次、成果0；live-data-2026-10-30-OUhxXF/report.json。实际usage未知，账本estimated 24545 tokens，不能写成实际消费。隔离凭据副本已删除、入口closed。

随后将XLSX请求中的无关文档工具schema移除，完整分析schema和Zod校验保持；这不构成网络根因证明。第二次任务使用独立profile，最多两次任务合计120000 tokens硬限，扣除首轮24545后上限95455；每轮maxCalls=1/maxTools=1/output=2048、不自动重试/回退。第二次STREAM_INTERRUPTED、工具0/成果0，实际usage未知、estimated17118；live-data-2026-10-30-zeAhZj/report.json。两轮合计保守记账41663，不是实际消费。两个隔离密文副本均已删除、入口closed，停止追加本任务请求。现有证据无法区分网络中断与上游工具响应不合规，不推断根因，不把技术问题冒称缺账号。

## 边界与交接

- 数据源仅CSV/XLSX；最多8源、40操作、8输出/图表，单表200000行/200列、总2000000单元格，结构化数据64MiB；图表最多1000点，不静默截断数据。
- 日期按声明IANA时区解释，DST歧义/不存在的当地时间拒绝。非法数据中止并保留原件；未知副作用保留staging且禁止盲重放。
- 固定四则计算列生成公式；输入公式仅接受受控白名单及已有有效缓存，不承诺通用Excel函数编辑/计算。
- 应用内看板可交互；导出HTML为生成时的固定静态快照，查看时筛选不改变导出。默认不带完整明细，显式选择后才含明细。
- 尚未提交、推送或发布。P07-02本地接口可供后续复用，但模型自然语言闭环保留未验证；P07整体未收口，不进入P08。

旧失败日志、暂停记录和早期原生结果均保留；本页以实际各轮适用范围记录，不用新通过覆盖旧失败。
# 2026-10-30 应用内连接之后的真实数据补验

用户新授权要求先启动TapKit，在应用内检测成功后才执行真实任务，连接最多20次。保守沿用P07历史累计计数，不重置此前8次。新生产入口`TAPKIT_P07_LIVE=1 node scripts/p07-ui-live.mjs --run-once ROUND`使用隔离profile、同一已授权模型，不注入fixture、不放宽安全/参数校验、不回退其他收费渠道。原Key不读取为明文、不进入日志；只复制加密绑定并在结束删除副本。

- `ui-live-2026-10-30-c01df21c-e869-4222-865d-ad5e81a6001a`：累计第9次在真实设置点击检测通过后才提交任务。数据因invalid_tool_arguments断流，工具0，estimated22946、actual未知。PPT响应完整actual2896，但name缺`.pptx`被Core拒绝。Host只读审计只输出schema路径/布尔值，0网络、0凭据读取；确认唯一name问题。修正工具文件名说明和固定恢复提示，保留严格schema；兼容6/6、check669文件、生产build均退出0，日志位于该目录。
- `ui-live-2026-10-30-c6cbcc3d-cfd2-4eda-821b-3065bb5fab32`：累计第10次设置检测通过，之后真实data.analyze run `01a18bbf-cf2b-7579-b793-396db72da039` succeeded/committed，actual5281（input4643/output638；cached42是输入子集，不能再加）。真实隔离执行/Office重算/Parser发布完成。4行输入、重复1行、去重后华东0.70/华南1.05，图表与导出生成。
- 原启动器错误地在step artifacts寻找XLSX（实际位于analysis.exports）而报告假阴性，原report与exit1保留。未重复数据请求；独立只读SQLite/Blob哈希及ExcelJS读取实际XLSX缓存，所有检查通过。见该目录`independent-artifact-verification.json`、`independent-artifact-after-budget-fix.json`。检查本身0网络。源文件SHA256保持，不使用图表截图代替数值验证。

结合上方当前证据及下方既有本地T07/T19、原生异常与桌面检查，P07-02升级implemented_and_verified。真实模型验证范围限定指定智谱Chat/GLM-4.7-FlashX、明确字段与统计口径的合成样例，不推广任意自然语言或其他供应商。PPT及局部修改的后续结果见P07-03/verification.md；本数据通过本身不等于阶段gate通过。旧失败、暂停和当时“不追加”判断保留为历史，新授权后累计及最终预算以最新汇总为准。
