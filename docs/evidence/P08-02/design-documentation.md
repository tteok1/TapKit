# P08-02 设计实现记录

2026-11-01；目录 `D:/Tapkit-public`；分支 `codex/p08-02-research`。本记录基于当前研究界面源码、既有设计系统和已生成的 Electron 证据，记录普通 Operate 界面扩展的实际落地。

本次保留 [DESIGN.md](../../../DESIGN.md) 与 [.impeccable/design.json](../../../.impeccable/design.json)，没有新设计方向、全局令牌变更或身份替换。项目根目录 `PRODUCT.md` 不存在；本次只披露缺失，不补造产品文档或设计 seed。范围是 P08-02 开发与验收中的界面交接，不启动重设计。

[design-verdict.md](design-verdict.md) 的 `ship` 仅表示原审查提出的两项修复已解决；本记录不把它扩大为整个界面、真实模型研究或 P08-02 全任务验收通过。

## 实现与既有系统对照

实际界面来自 [research-ui.tsx](../../../apps/desktop/src/renderer/src/research-ui.tsx)、[research.css](../../../apps/desktop/src/renderer/src/research.css) 及 [work-ui.tsx](../../../apps/desktop/src/renderer/src/work-ui.tsx) 中的研究模式接入；全局基础来自 [design-system.css](../../../apps/desktop/src/renderer/src/design-system.css) 与 [form-controls.css](../../../apps/desktop/src/renderer/src/form-controls.css)。

| 系统维度 | 当前实现与核对结果 |
| --- | --- |
| 身份与表面 | 保留白色内容面、浅绿侧栏、克制绿色强调及其 dark / system 语义角色。研究样式引用既有 `border`、`muted`、`muted-surface`、`warning-surface`、`ink`，没有新增品牌色或独立主题。符合既有 **The Semantic Green Rule**。 |
| 字体与层级 | 继承 Segoe UI Variable Text / Segoe UI / Microsoft YaHei UI / Microsoft YaHei 系统栈；标题依靠字重、正文依靠行高区分。研究原文显式 `font: inherit`，计数使用等宽数字特性；没有下载字体或增加展示字体系。字号与缩放仍受应用偏好控制，沿用 **The Preference Scale Rule**。 |
| 布局与密度 | 配置嵌入既有工作表单，详情嵌入工作任务页；提纲、来源、发现、原文与成果按纵向阅读顺序展开。来源和发现使用细分隔线、每行上下留白；原文使用既有柔和表面与圆角。普通列表没有增加浮起卡片或装饰阴影，沿用 **The Floating Surface Rule**。 |
| 控件与形状 | 继续使用真实字段标签、fieldset、details / summary、按钮和文件工作台。文字按钮保留 ADR0062 的胶囊轮廓，字段、选择与焦点沿用已加载的通用控件样式；没有为研究另造按钮系统。研究源码的 800px 表单重排规则是局部实现，不升格为新的全局断点。 |
| 范围、进度与证据 | 配置明确主题/公开问题用于公开检索、文件正文不自动转成搜索词；可关闭网页研究。详情显示根搜索 8 次/来源读取 40 次上限、问题搜索次数、归档或不可访问状态及真实时间元数据。原文陈述、推断、证据缺口和未裁决冲突使用文字区分，不通过成功色代替判断。 |
| 固定原文与成果 | 原文区保留 URL 或本地固定版本、字符窗口起点、固定时间及 SHA256；引文在上下文中逐字高亮。MD、JSON 来源清单、DOCX、PDF 复用既有预览和下载入口。文件内容的白纸与页影属于预览内容，不形成新的应用材质规则。 |
| 中途控制与状态 | 继续查证、排除来源、修改提纲的界面说明保留新版本/新运行及根预算边界；提前结束明确保存部分成果。源码保留忙态禁用、空态、状态/告警语义，以及原文打开后聚焦、关闭后恢复触发点的处理。后者本轮没有独立键盘焦点截图，不作对应视觉验收声明。 |

本次没有引入图片素材、字体文件、全局令牌、装饰眉题或新的动效规则。研究的范围说明、计数和固定证据是任务信息，不推广成其他页面必须采用的构图。

## 两项修复的实际结果

1. **原文高亮。** `research.css` 的 mark 现在使用既有 `--warning-surface` 与 `--ink`。浅色、深色和 system-dark 的同一段“公开价格 42 元。”均保留可读高亮与上下文。深色两种模式的 E2E 计算色断言为前景 `rgb(230, 237, 231)`、背景 `rgb(58, 51, 34)`；这是对既有语义色的复用，没有新增高亮令牌。
2. **进度读取失败与恢复。** `ResearchPanel` 分开保存 `loading`、`readError` 和操作错误；读取结束后停止加载文案，成功回读清除旧读取错误，提供“重新读取进度”入口。已知版本、权限、任务/来源不存在、校验、网页和预算错误映射为中文原因与相应建议。实际故障恢复证据覆盖研究元数据校验失败与成功重读；其他错误映射本轮只有源码核对，不宣称每种错误均有截图验证。

## 已检查的证据与边界

本轮逐张打开并核对以下八张现有截图；没有重新启动应用、访问浏览器或发起模型请求。

| 证据 | 支持的结论 |
| --- | --- |
| [.impeccable/review/desktop.png](../../../.impeccable/review/desktop.png) | 正常桌面下根计数、来源归档、细分隔线及“不同证据 · 未裁决”可见，保留既有完整导航。 |
| [.impeccable/review/compact.png](../../../.impeccable/review/compact.png) | 实际紧凑窗口下来源和计数仍可读，纵向内容由现有滚动区承接；E2E 同时断言研究面板没有横向溢出。 |
| [quote.png](desktop/quote.png)、[quote-dark.png](desktop/quote-dark.png)、[quote-system.png](desktop/quote-system.png) | 同一固定原文的浅色、深色和 system-dark 高亮可读，时间、字符定位与哈希仍可见。 |
| [progress-error.png](desktop/progress-error.png) | 明确说明“研究进度读取失败”“研究数据未通过校验”，保留诊断建议与就地重读入口，没有残留“正在读取研究进度…”文案。 |
| [progress-recovered.png](desktop/progress-recovered.png) | 重读后恢复搜索 1/8、来源读取 2/40 与发现计数，旧告警消失。 |
| [pdf.png](desktop/pdf.png) | 真实文件工作台已打开 PDF，研究成果、预览与文件操作继续使用既有界面。仅检查截图显示的工作台区域，不作为完整 PDF 文档版式检查。 |

[viewports.json](desktop/viewports.json) 记录桌面 CSS 视口为 1267×899、紧凑 CSS 视口为 947×839，均为 DPR 2；图片分别为 2534×1798 与 1894×1678。Windows 既有最小窗口限制了请求的 760 宽度，本记录没有 760 宽度验收结论。

[P08-02.research.spec.ts](../../../tests/e2e/P08-02.research.spec.ts) 通过 Playwright `colorScheme='dark'`、Electron `nativeTheme.themeSource='dark'` 与 DOM `data-theme` 切换来覆盖 dark / system-dark；这不等于 Windows 系统设置切换流程已验收。故障测试向真实 SQLite 写入无效研究元数据、重新挂载面板、恢复数据并点击重读，核对加载和旧告警均不残留。

[resumed-p08-verified.log](resumed-p08-verified.log) 记录命令 `node scripts/e2e.mjs "--" "--grep" "P08"`，结果为 3 项 P08 E2E 通过（2 项 P08-01、1 项 P08-02），末尾 `COMMAND_EXIT=0`。这些是合成模型/网页输入下的真实 Electron、Core、SQLite、Blob、隔离与 Office 流程证据；不证明真实模型研究效果。本轮仅复核已有测试日志，没有重跑测试。

[design-detector.log](design-detector.log) 先前记录 `cache_directory_failed`；检测器没有通过，本轮未重跑。原始 [design-review.md](design-review.md) 保留修复前结论，修复后的局部裁定见 [design-verdict.md](design-verdict.md)，不改写历史失败。

## 既有记录漂移与交接

现有设计文件包含早期基础描述及后续 ADR 补充。`DESIGN.md` 的 frontmatter/早期控件段落和 sidecar 预览仍有普通按钮 8px 圆角、输入 8px 圆角与轮廓焦点；随后已确认的 ADR0062 与实际 `form-controls.css` 使用文字操作胶囊、字段 12px 圆角和柔和外阴影焦点。`main.tsx` 在 `design-system.css` 后加载 `form-controls.css`，当前研究界面继承该有效覆盖。

这是 P08-02 之前存在的设计记录层漂移，不把 ADR0062 的已确认控件处理判为本次缺陷，也不以旧 sidecar 片段要求研究界面回退。按本次普通扩展范围，`DESIGN.md` 与 sidecar 均保持不变；没有把不一致、局部值或修复前低对比高亮重新写成全局规范。全任务状态、真实研究验收和最终交接继续以 [P08-02 进度](../../progress/P08-02.md) 为准。
