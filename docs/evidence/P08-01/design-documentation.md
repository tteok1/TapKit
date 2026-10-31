# P08-01 设计文档收尾

2026-10-31；范围为既有 Work / Operate 界面中的匿名浏览器扩展。

结论：**ordinary extension，保留 incumbent。** 浏览器面板沿用已有绿色/白色语义表面、平面分隔、Windows 中文系统字和带明确文字标签的控件。没有建立新视觉体系，也没有批准耐久的系统变更。本次仅增加本证据文档，保留 `DESIGN.md` 与 `.impeccable/design.json`，不创建 `PRODUCT.md`，不修改产品代码或进度状态。

## 核对范围

- 既有视觉契约：[DESIGN.md](../../../DESIGN.md)、[design.json](../../../.impeccable/design.json)。
- 实际共享样式：[design-system.css](../../../apps/desktop/src/renderer/src/design-system.css)、[form-controls.css](../../../apps/desktop/src/renderer/src/form-controls.css)、[work.css](../../../apps/desktop/src/renderer/src/work.css)，并抽查 `styles.css` 的应用字体/结构。
- 最终扩展：[browser-ui.tsx](../../../apps/desktop/src/renderer/src/browser-ui.tsx)、[browser.css](../../../apps/desktop/src/renderer/src/browser.css)、[work-ui.tsx](../../../apps/desktop/src/renderer/src/work-ui.tsx) 中的工作创建开关和详情挂载。
- 独立审查与结果：[design-review.md](design-review.md)、[acceptance-electron.log](acceptance-electron.log)、[takeover-integration.log](takeover-integration.log)、[geometry.json](desktop/geometry.json)、[work.json](desktop/work.json)。本次读取既有结果，未重新运行浏览器、模型请求或测试。

技能角色文件实际为 `agents/impeccable_documenter.toml`；所给同名 `.md` 不存在。已读取该角色、完整 `reference/document.md` 和 `reference/new-work.md` 中 established world / extend an existing surface 的规则。后者要求局部扩展继承既有世界与构图；角色要求普通扩展保留 incumbent，报告既有漂移而不自行修复。

## 与既有系统的对照

| 维度       | 最终实现与证据                                                                                                                                                                             | 结论                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 语义配色   | `browser.css` 复用 `--border`、`--muted`、`--accent-surface`、`--ink`、`--accent`、`--muted-surface`、`--focus`，没有增加品牌色。当前标签使用浅绿选中面；审批表格使用细横线。              | 延续 The Semantic Green Rule。                                            |
| 字体与层级 | 面板沿用 `Segoe UI Variable Text / Segoe UI / Microsoft YaHei UI / Microsoft YaHei` 字体栈；标题继承现有 h3（1em、600），快照明确 `font: inherit`。地址、模式事实和操作均有中文标签。      | 沿用中文系统字体及现有层级，没有显示字体或装饰眉题。                      |
| 结构与留白 | `BrowserPanel` 仅在已有工作详情中按 `browserEnabled` 挂载；面板/审批以 `1px` 分隔线连接工作内容，使用既有 8/12/16/20/24px 留白步长。工具栏可换行，标签行可横向滚动，长快照与字段允许换行。 | 延续既有工作流和主区结构；局部视口高度与 600px 规则不升级为全局布局令牌。 |
| 形状与深度 | 文字按钮继承 `form-controls.css` 的胶囊轮廓；视口使用 8px 圆角、轻边框与 muted-surface；审批保持开放表面。没有新增卡片阴影。                                                               | 延续 The Floating Surface Rule 和当前共享控件。                           |
| 操作与状态 | 原生 button/input、可见标签、`aria-selected`、status/alert、禁用态和焦点样式沿用现有语义；明确展示接管/交还、一次审批范围、会话结束和材料保存。未知结果保留用户核对选择。                  | 局部功能扩展，无视觉身份变化；源码存在的分支与截图实际覆盖分别记录。      |

## 可见证据及边界

| 证据                                                                   | 本次直接确认的事实                                                                                                         | 不能单独据此确认的事实                                                         |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [review.png](desktop/review.png)                                       | 有效父渲染器截图；既有侧栏/顶栏、地址、两个标签、导航/接管文字控件、Agent 模式和最近观察内容均可读。                       | 父窗口截图不包含原生 child，不能单独证明网页与应用合成位置。                   |
| [compact.png](desktop/compact.png)                                     | 有效紧凑截图；工具操作换行，文字没有横向裁切；可见禁用控件、会话结束说明和材料保存反馈。                                   | 物理像素尺寸不能替代逻辑 CSS 宽度/缩放测量；没有覆盖实时网页或审批状态。       |
| [approval.png](desktop/approval.png)                                   | 有效截图；目标地址、字段/内容表、一次审批说明与批准/拒绝按钮均可读。                                                       | 可见审批内容不能独立证明后端请求绑定、一次性语义或实际提交次数。               |
| [current-web-page.png](desktop/current-web-page.png)                   | 有效、独立的原生 Chromium child 截图；合成网页显示备注值、分类、提交按钮及页面滚动条。                                     | 网页保留自己的原生样式，属于内容，不提取为 TapKit 令牌；也不证明真实网站支持。 |
| [geometry.json](desktop/geometry.json)、[work.json](desktop/work.json) | 既有运行结果记录 scrollport 裁切时隐藏、应用弹窗时隐藏及关闭后恢复均为 true；记录 stale recovery 实际重新观察网页为 true。 | 这些是测试结果证据，本次文档核对没有独立复跑；不以父截图推断原生遮挡通过。     |

[独立审查](design-review.md) 的最终结论仅关闭原四项发现：4 resolved、0 partial、0 unresolved。既有 Electron 日志记录 2 passed（51.5s），集成日志记录 2 文件/17 测试通过。该局部 verdict 不代表完整产品、真实模型/网站、深色主题、全键盘流程或 200% 缩放均已验收。

## 既有漂移与保留项

**存在既有文档滞后，不在本次扩展中修复或重新定为规则。** `DESIGN.md` 后附的 2026-10-23 / ADR0062 已说明共享文字操作改为胶囊、表单焦点使用柔和外阴影；实际 `form-controls.css` 使用按钮 999px 圆角、字段 12px 圆角和 `--field-focus-shadow`。但较早的 frontmatter/sidecar 普通按钮与字段示例仍描述 8px 控件圆角，sidecar 按钮预览仍沿用旧片段。系统文件与这些共享样式在本次任务前已存在，本次浏览器扩展继续继承实际共享控件；不把旧示例或局部残留升格为新界面的规范，也不擅自刷新系统文件。

另一个局部继承结果是 `.work-detail form` 的较高 specificity 将 `.browser-address` 变为 grid，最终地址、打开与前往按钮上下排列且占满宽度。该现象在截图中可见，是既有工作详情表单规则对新增表单的作用；本次如实记录，不把它写成全局地址栏构图规则。当前证据没有显示需要改变 incumbent 身份的理由。

## 检测器与文件保全

[design-detector.log](design-detector.log) 实际输出为 `The system cannot find the batch label specified - cache_directory_failed`。检测器未运行完成，**不记录自动检测通过**；本次一致性结论来自上述源码、视觉证据与已有独立审查。

系统文件只读核对，SHA-256 保持：

- `DESIGN.md`：`14DB315180F2C0DD31A4C32C36A1A734B9FDBBD07627E5A09939603970C52144`
- `.impeccable/design.json`：`89EC714E4DC5214AB1E1E297116A967945FD6A730213851513A65A6D8D3C186F`

本收尾不提升 P08-01 的功能或 live 验收状态；后续验收与进度同步仍由主任务完成。

文档检查记录：默认 `pnpm exec prettier --check docs/evidence/P08-01/design-documentation.md` 因该进程使用 Node 24.19.0 / pnpm 11.25.0、不满足仓库锁定版本而退出 1；没有安装或调整依赖。证据目录被 `.prettierignore` 排除，因此改用仓库锁定 Node 24.21.0 直接执行已安装的 Prettier 3.9.6，并以 `--ignore-path NUL` 明确检查本文件；写入与最终 check 均退出 0。此检查只验证文档格式。
