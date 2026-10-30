# ADR 0070：固定数据分析、版本证据与隔离重算

2026-10-29；P07-02 实施中，尚不代表验收通过。

DatasetSpec 声明固定文件版本、列类型、单位、时区和缺失规则；AnalysisSpec 仅接受有界的选择、筛选、排序、填空、去重、连接、拆分、分类、四则计算和汇总操作，不接受 Python、SQL、表达式、路径或网络来源。固定 Python 程序复用已锁定 pandas/openpyxl/matplotlib，在现有 AppContainer/Job 无网络环境执行。重复键连接默认拒绝，显式允许也受总单元格预算约束。金额使用十进制舍入；非法类型和除零明确失败，不伪造统计值。

2026-10-30补充：日期按DatasetSpec的IANA时区解释；带偏移时间先转换到该时区，未带偏移视为当地时间，DST歧义/不存在的当地时间拒绝。XLSX保存当地日期时间，ISO结果保留偏移及输入时区证据。复用锁定tzdata，不下载系统时区；数值分类规则也转换为Decimal，避免0.1与二进制浮点比较导致静默错分。

分析结果以不可变的受管 JSON 文件保存 AnalysisSpec、SpreadsheetSpec、ChartSpec、输入版本/hash、固定程序 hash、数据概况、警告和导出引用。它属于既有 fileVersion 与 task，不增加第二套任务状态；相关导出和工具收据同一事务提交。更正口径沿用 runs.steer 创建新 taskVersion，不覆盖原件。读取结果及提交前重新核对输入权限与版本。

新增 data.analyze，复用工作网关的派发、预算、工具收据和原生身份。未知进程状态保留 staging 并阻止自动重放。结果界面仅使用可信 React/SVG，分页读取明细；筛选/排序不改原数据。静态 HTML 导出使用固定模板，是否包含明细为显式参数；CSV 默认保护字符串公式注入，按原值保留须用户明确选择并提示风险。

分析→LO重算→缓存核验共三阶段，每个受限阶段最长120秒，工具总时限360秒，同时服从根任务剩余活跃预算和取消。超时不能留下成功收据或绕过核验。

工作工具目录升级 p07-tools-2；旧 p06-tools-1 和 p07-tools-1 保留原工具范围。新增 tool.validation 仅记录固定错误枚举对应的可操作提示，不保存任意原生 stderr。dataOptions 的 CSV 原值和 HTML 明细开关由用户表单决定，模型不能自行扩大导出范围。

2026-10-30：请求XLSX且目录支持data.analyze时，模型只收到完整data.analyze和user.ask工具；其他格式不发送数据分析schema。避免无关文档schema放大每次模型请求，但派发仍按完整Zod/目录/权限验证；网络失败不能因此认定已定位根因。

XLSX 生成写入受控公式；不把 Python 统计结果冒充公式缓存。扩展现有 LOK 固定转换的输出枚举为 PDF 或 XLSX，仅 XLSX 输入可重算导出 XLSX；保留 AppContainer、最小目录租约、禁宏、禁外链和原件 hash 校验。重算后由受限 openpyxl 读回缓存并与独立十进制计算比较，失败不发布。依据 [LOK saveAs 官方接口](https://github.com/LibreOffice/core/blob/master/include/LibreOfficeKit/LibreOfficeKit.hxx)。原 PDF 默认保持兼容，helper 变化需重新构建并复验隔离报告。

图片只由固定 matplotlib 导出，使用随包字体；SVG 不包含外链、脚本和 foreignObject。模型不提供任意 HTML/SVG。规范上限为 200,000 行、200 列、总 2,000,000 单元格；图表最多 1,000 个数据点，超限明确失败或要求先汇总，不能静默截断。

defaults.data 保存并由 Zod 校验本流程上限：最多8数据源/输出表/图表、40操作、1,000图表点；结构化数据64 MiB、结果文件100 MiB、SVG4 MiB，与原文件和单元格限制共同生效。较长单元格最多32,000字符。Core 对导出 SVG 再做白名单消毒，HTML 由 Core 固定模板转义生成，不采信原生进程提交的任意 HTML。
