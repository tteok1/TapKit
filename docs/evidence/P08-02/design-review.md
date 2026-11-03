disposition: fix

缺失/范围：PRODUCT.md 已知不存在，按委托不补造；本次为既有 Operate 界面扩展，无新方向、comp 或概念 seed。未提供深色、错误、忙态与键盘焦点截图，这些项仅作源码审查，不构成相应视觉验收；QUALITY BAR 使用委托中的文字标准。

## persistence

pass（本次扩展的持久设计约束）：已读取实际 AGENTS.md、CURRENT.md、INDEX.md 的本任务行、P08-02 记录、阅读地图本任务行、任务规格、DESIGN.md、.impeccable/design.json 及 craft-floor。目录为 D:/Tapkit-public，分支为 codex/p08-02-research；现有工作区包含多项进行中的改动，本审查只写本文件。

六张指定截图均存在且有效：无黑区或意外空白，内容与所命名的界面状态对应。它们是可滚动界面的视口截图，不是完整页面或完整 PDF 文档：

- `docs/evidence/P08-02/desktop/create-desktop-current.png`、`create-compact-current.png`：当前生产构建的研究配置，公开检索外发范围说明可见；ui-preflight.json 记录 accounts/attempts/runs 均为 0。
- `.impeccable/review/desktop.png`、`compact.png`：研究计数、来源列表和阶段发现；桌面 CSS 1267×899、紧凑 CSS 947×839，DPR 2，与图片 2534×1798、1894×1678 相符。未达到的 760 宽度不在验收范围内。
- `docs/evidence/P08-02/desktop/quote.png`：固定原文、时间与逐字高亮；`pdf.png`：真实工作台中的滚动 PDF 预览。未使用无效的 report-page.png，也未声称整页文档视觉检查。

revision-safe-desktop.log 中实际记录 P08-02 E2E `1 passed`，覆盖合成模型/网页下的真实 Core、SQLite、Blob、隔离与 Office 流程；这只支持相应交互证据，不证明真实模型效果或整任务发布条件。design-detector.log 记录 `cache_directory_failed`，检测器未通过；本审查未重跑检测器、启动应用、访问浏览器或读取账户副本。

## fidelity

| 元素/承诺 | 判定 | 证据与边界 |
| --- | --- | --- |
| TYPE / OWN-WORLD | match | Windows 中文系统字体、正文与字重层级沿用既有应用；未增加展示字体、眉题或新身份。系统字体由既有 Windows 工作界面契约明确要求。 |
| MATERIAL / FORM | match | 表单有边界，来源与发现使用平面横线；没有新增拟物、玻璃、装饰阴影或替代栅格素材。既有胶囊文字操作由 DESIGN.md 的 ADR0062 条目授权。 |
| GROUND / OWN-WORLD | match（浅色） | 六张图的白色内容面与灰绿侧栏符合既有语义表面；不是偏暖奶油或另一套品牌。深色基础角色仅核对源码，未作截图验证。 |
| 主题、提纲、公开/本地来源 / THESIS | match | 配置截图可见主题、问题、用途、网页、日期和域名控制；外发说明明确主题/问题用于公开检索、文件正文不自动转成搜索词。本地附件及格式选择在 work-ui.tsx 中真实接入，位于这些滚动截图之外。 |
| 8/40 根计数、来源、发现 / FIRST VIEWPORT | match | 桌面与紧凑图均可读到搜索 1/8、来源 2/40、问题搜索次数、来源归档状态及不同证据；紧凑视口未出现横向裁切，超出纵向内容由现有滚动区承接。 |
| 固定原文与高亮 / STORY | contradicted（深色源码） | quote.png 的浅色高亮可读；research.css:127–130 使用未定义的 --selection-bg 回退 #ffe2a8，文字却继承深色 --ink=#e6ede7，计算对比度约 1.06:1，核心引用内容在深色主题不可读。renderer 范围未发现该变量的定义。 |
| 排除、提前结束、继续查证 / STORY | adaptation | 操作通过新任务版本/新运行保留固定来源并继承根预算，依据 P08-02 规格与委托中的 E2E 证据；截图中的继续查证与来源排除入口真实存在。未将合成模型流程等同真实模型成功。 |
| 报告、来源清单、预览下载 / STORY | match（界面范围） | quote.png、pdf.png 展示 MD/JSON/DOCX/PDF 入口、下载与真实文件工作台。仅核对已显示的预览区域，未评判完整报告版式。 |
| 读取错误与恢复 / QUALITY BAR | contradicted（源码） | research-ui.tsx:139–145 的读取失败只设置 error；293–295 仍同时输出“正在读取研究进度…”。143 的成功读取也不清除旧错误。错误直接输出原始代码并统一要求刷新，不能准确说明失败状态与恢复动作。 |
| 焦点、空态、禁用与忙态 / FORM | match（源码范围） | 标签关联、来源/发现空态、busy 禁用、role=status/alert、原文打开后聚焦与关闭后恢复焦点均有实现；通用焦点样式来自 design-system.css。没有对应真实焦点/忙态截图，不能声称这些状态已作视觉验证。 |

THESIS 为可审查的研究配置与证据链；OWN-WORLD 为既有绿色/白色 Windows 工作界面；STORY 从范围到来源、发现、固定原文及成果；FIRST VIEWPORT 的重点是可编辑配置与可读进展；FORM 沿用已有表单、按钮、分隔和工作台。没有新方向或新 comp 的 fidelity 义务；既有设计系统漂移不列为本次修复。

## ceiling

未用足：异步读取的明确失败状态与就地恢复路径。现有原生表单、渐进展开、可见语义分隔和文件工作台已被沿用；本次功能扩展无需新增装饰、字体、素材或动效。深色高亮未达到既有语义主题的可读性底线。

## material_fixes

1. [Floor Contrast / OWN-WORLD] `apps/desktop/src/renderer/src/research.css:127–130`：把原文 mark 的背景/文字改为兼容明暗主题的现有语义配对，例如 `var(--warning-surface)` 与 `var(--ink)`；当前浅色为 11.52:1、深色仅 1.06:1，现有深色 warning-surface 配对约 10.52:1。修复后补同一引用片段的真实深色截图，核对 dark 与 system-dark，保留清晰定位。
2. [Floor States / QUALITY BAR] `apps/desktop/src/renderer/src/research-ui.tsx:139–159,293–295`：将研究进度读取失败与加载状态分开，成功回读时清除对应旧错误，提供明确的“重新读取进度”入口；把已知错误代码映射为中文原因与合适恢复动作，避免对版本/权限/来源失效一律要求刷新重试。补首次读取失败、恢复成功的界面证据，确认没有残留加载或旧告警。

## keep

保留公开检索外发范围的明确说明、根 8/40 计数、固定来源与原文上下文、冲突/未知表述，以及既有绿色语义表面和平面分隔；修复不扩展到 P08-03 或重做全局设计系统。
