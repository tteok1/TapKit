# P09-02 既有设计系统比对

2026-11-06；D:/Tapkit-public；codex/p09-02-terminal-runtime。

结论：本次是既有工作详情 CodePanel 的 Operate 扩展。完成实现保留 TapKit 的绿/中性色、中文任务界面、平面分组、圆角表单和明暗主题；未形成新的视觉体系或需要持久化的新全局规则。DESIGN.md 与 .impeccable/design.json 保持原样；本轮只写本记录。

## 上下文与取证范围

- 已读已安装 Impeccable 的 `agents/impeccable_documenter.toml` 和完整 `reference/document.md`，按普通扩展保留 incumbent 系统的规则执行。
- 父任务已记录 context 启动器 `cache_directory_failed`；本轮承接直接读取既有上下文的回退，不重复启动，不声称 detector 运行或通过。
- PRODUCT.md 缺失；按 SKILL 对既有代码窄范围扩展的明确路由，使用现有 DESIGN.md、任务记录和实际实现。没有创建产品假设、产品文件、方向稿、comp 或新身份素材。
- 源码抽样：`apps/desktop/src/renderer/src/{design-system.css,form-controls.css,code.css,code-ui.tsx,terminal-ui.tsx,terminal.css,terminal-command.ts}`、`apps/desktop/src/renderer/locales/terminal.zh-CN.json`、`packages/ui/src/terminal.tsx`。
- 证据读取：下列六张最终 Electron 截图、`desktop/metrics.json`、`e2e-focused-final.log`、相关 E2E 用例源码及三份独立复核记录。未执行测试、构建、浏览器操作或 UI 修改；日志的通过结果归属于父任务的实际执行。

## 完成实现与既有系统

| 对照项 | 实际实现与已检查证据 | 判断 |
| --- | --- | --- |
| 颜色与主题 | 终端表面和 xterm viewport 同用 `--code-surface`，正文、光标、选中分别复用 `--ink`、`--focus`、`--accent-surface`；错误复用 `--danger`。最终截图保留浅绿侧栏/白色主面和对应深色角色。metrics 中浅色 viewport/表面均为 rgb(246, 248, 246)，深色均为 rgb(21, 27, 23)。 | 保留 Semantic Green Rule；没有第二套终端品牌色。 |
| 字体与层级 | 中文标题、标签、说明和动作继承既有 Windows 系统文字栈。命令字段使用 Consolas/Cascadia Mono；xterm 使用相同等宽方向并补 Microsoft YaHei UI 中文回退，实际为 13px/1.5。 | 等宽只承担技术内容；13px 是终端局部实现值，不改写 DESIGN 的通用代码字号或全局字体层级。 |
| 布局与间距 | TerminalPanel 由已准备且未撤销的 CodePanel 挂载；同用 24px 纵向间隔、20px 起始内边距与细分隔线。操作条允许换行，字段两列使用 minmax，历史有界滚动，输出保持独立区域。源码另有 900px 以下字段改单列规则。 | 延续既有工作流和空间语言。截图只覆盖声明的桌面宽度；未把源码中的更窄断点或全部字号/缩放偏好冒称为本轮实测。 |
| 控件、形状与层次 | 环境选择、命令/目录字段、准备/运行/交互/停止/日志操作继承当前共享表单样式。历史行以细线分隔，选中用浅绿面；局部高优先级规则使历史行保持平直，而非继承全局胶囊按钮。终端是 8px 圆角代码面，没有新增卡片阴影。 | 保留既有后续 ADR 的圆润控件和 Floating Surface Rule；历史行的局部覆盖服务列表语义，不升格为全局按钮规则。 |
| 操作顺序与恢复 | 环境选择/准备及版本状态在前，随后命令、副本内目录、执行动作、历史、选中进程及日志。源码在环境未 ready、准备中或已有运行进程时限制启动；提供缓存、下载、完整性、锁文件、权限、隔离不可用等中文错误和恢复说明。 | 符合 Operate 的明确入口和可恢复状态。环境准备失败的具体视觉未在六张截图中捕获，此项为源码核对。 |
| 失败、历史与真实输出 | failed-node.png、failed-python.png 均展示退出码 1 和真实断言栈；后续截图仍保留失败记录，同时展示通过和停止后的记录。状态文字和退出码不依赖单独颜色传达。命令拆分源码与说明一致，不把命令输入表现成可展开宿主 Shell 的入口。 | 保留事实与失败证据；没有用视觉状态替代执行结果。 |
| 输入、焦点与有界日志 | 有原生字段标签、历史 aria-pressed、状态/错误区域、xterm 命名输入和 screenReaderMode；终端 focus-within 复用焦点绿。源码将可见日志控制在每段 64KiB，UTF-8 边界续读，并提供从头/下一段。E2E 源码和最终日志对应真实语言输入、窗口调整、停止及分页链。 | 使用既有语义和控件语言；本轮未独立做完整辅助技术、后台性能或隔离安全认证。 |

## 最终画面与复核链

直接打开并检查的权威截图均位于 `docs/evidence/P09-02/desktop/`：

| 截图 | 范围 |
| --- | --- |
| terminal-light.png / window-light.png | 声明窗口 1360×960，记录 client 宽 1347；分别为上部与较低滚动位置。 |
| terminal-dark.png / window-dark.png | 声明窗口 980×960，记录 client 宽 967；分别为上部与较低滚动位置。 |
| failed-node.png / failed-python.png | 浅色主题的两语言非零状态及真实断言输出。 |

这些是有界真实窗口截图；上下两张不构成拼接长页，视口以外的控件不因未出现在某帧中而被宣称已完整捕获。未使用 first-*、pre-review-*、review-1-* 历史截图作为最终依据。

`ui-review.md` 首次发现终端实际网格裁切；`ui-review-verdict.md` 确认原问题 resolved，同时发现修复引入的黑色底部 gutter；`ui-review-verdict-2.md` 对这两项给出 resolved、disposition: ship。最后一份 ship 仅覆盖已评分修复及其回归，不等于全产品复核。

最终源码使用 xterm 实际渲染单元和内部可用区域计算网格。最终较低滚动位置的两主题画面中，完整的右侧中文字符和底行可见，未见此前黑色 gutter；metrics 同时记录 843×293≤849×306、558×293≤565×306，外层横溢出均为 0。实际网格数据与视图共同支持裁切修复，单独的外层零溢出不足以证明网格可见。

`e2e-focused-final.log` 记录完整 P09-02 桌面用例 1 passed；metrics 记录 visible、focused=true 和两帧间隔 26.6ms。较早 `e2e-review-final.log` 的约 1.97s 失败被保留，彼时没有焦点记录，原因未定。本记录不将前台通过推广为后台性能结论，也不掩盖早前失败。

## 保留的既有文档漂移

DESIGN.md 的原 frontmatter/早期组件段仍有 8/9px 控件和原焦点轮廓描述，末尾 2026-10-23 ADR0062 已追加胶囊文字操作与共享焦点阴影；实际 `form-controls.css` 的字段为 12px 圆角，文字动作使用 999px 圆角并复用 `--field-focus-shadow`。`.impeccable/design.json` 的 generatedAt 为 2026-10-12，普通按钮、输入和 composer 的展示片段仍携带较早圆角/焦点/内边距值，未完整表达后续追加规则。这是本次扩展之前的持久化上下文漂移；本轮依据当前共享实现和已追加规则比对，未刷新、合并或修补上述文件。

只读核对的 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| DESIGN.md | 14db315180f2c0dd31a4c32c36a1a734b9fdbbd07627e5a09939603970c52144 |
| .impeccable/design.json | 89ec714e4dc5214ab1e1e297116a967945fd6a730213851513a65a6d8d3c186f |

未将文档漂移、终端局部 13px/1.5、已修复的裁切或黑色 gutter 固化为新的系统规则。未发现需要本次扩展另立设计系统的证据；本记录不扩展为无关页面审计或设计重建。
