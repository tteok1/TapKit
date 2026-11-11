# P09-03 GitHub 区域设计对照

GitHub 区域接在 Windows 工作详情的「代码」区末尾，沿用工作区的标题、工具栏、按钮和字段。审阅、确认及结果直接在此处呈现。本次对照采用仓库现有的设计说明和运行态样式。Impeccable 上下文启动器未运行，仓库缺少 `PRODUCT.md`。[设计说明](../../../DESIGN.md) · [组件预览](../../../.impeccable/design.json) · [代码区入口](../../../apps/desktop/src/renderer/src/code-ui.tsx)

## Electron 实测

两张截图都显示「审阅本地提交」、本地工作区、工作分支、完整的当前分支 HEAD、提交说明、文件路径及两个操作按钮。浅色截图为 2694 × 1798 像素，深色截图为 1934 × 1798 像素。测试通过 Electron 请求两种原生窗口尺寸，CSS 视口和颜色来自渲染进程。横向溢出按 GitHub 区域的 `scrollWidth - clientWidth` 计算，分隔线取审阅区 `dl` 的顶边颜色。[浅色截图](desktop/commit-review-light.png) · [深色截图](desktop/commit-review-dark.png) · [度量](desktop/metrics.json) · [对比度](desktop/contrast.json) · [测试](../../../tests/e2e/P09-03.github.spec.ts)

| 主题 | 请求窗口宽 × 高 | CSS 视口宽 | 横向溢出 | 标签 `muted` | 背景 `code-surface` | 分隔线 `border` | 标签对比度 |
| --- | ---: | ---: | ---: | --- | --- | --- | ---: |
| 浅色 | 1360 × 960 | 1347px | 0px | `#66736b` | `#f6f8f6` | `#e1e9e3` | 4.65:1 |
| 深色 | 980 × 960 | 967px | 0px | `#a3b2a7` | `#151b17` | `#303c33` | 7.90:1 |

## 与现有设计系统的对应

- **颜色与层级。** 两组实测颜色与 `DESIGN.md` 的浅深色令牌一致，sidecar 也为这些角色提供预览元数据。确认按钮使用 `accent-surface`、`accent` 边框及 `ink` 文字，返回按钮使用工作区默认按钮。审阅和结果区用 1px 细边框、10px 圆角、12px 内边距及代码面分层，符合现有小容器轮廓和平面层级。[设计说明](../../../DESIGN.md#colors) · [主题样式](../../../apps/desktop/src/renderer/src/design-system.css) · [局部样式](../../../apps/desktop/src/renderer/src/code.css)
- **字体和信息顺序。** 标题和中文文案继承 Windows 的 Segoe UI／微软雅黑字体栈，分支、SHA、文件路径使用 `<code>` 的等宽渲染。审阅先列出范围、分支和提交标识，再给出说明、文件及操作。推送和 Draft PR 使用各自的标题及字段。CSS 让字段值和长标识可换行，操作行可折行，长列表可在 240px 高度内滚动。[设计说明](../../../DESIGN.md#typography) · [局部样式](../../../apps/desktop/src/renderer/src/code.css) · [界面实现](../../../apps/desktop/src/renderer/src/github-ui.tsx) · [中文文案](../../../apps/desktop/src/renderer/locales/github.zh-CN.json)
- **控件和状态。** 两张截图都显示了现有焦点色勾勒的审阅标题。Electron 测试通过 Enter 打开本地审阅、返回编辑并确认提交，断言焦点分别移至审阅标题、原操作按钮和提交回执。源码将状态重试成功后的焦点移至 GitHub 标题，加载和远程待核对使用状态文本，失败使用可读提示并提供对应恢复操作。[键盘测试日志](e2e-keyboard.log) · [界面实现](../../../apps/desktop/src/renderer/src/github-ui.tsx) · [通用控件](../../../apps/desktop/src/renderer/src/form-controls.css)

## 基线文档差异

`a2c3264` 已存在以下差异。设计说明前置令牌和 sidecar 的次要按钮预览仍用 8px 圆角，运行态文字按钮已用 999px 胶囊轮廓。sidecar 字段预览仍用 8px 圆角和 2px 外轮廓，运行态文本字段用 12px 圆角及 `--field-focus-shadow`。`DESIGN.md` 的正文保留了旧 16px 复选框描述，运行态为 18px 圆形。胶囊与焦点外阴影已见 `DESIGN.md` 末尾的 ADR0062 更新。这些差异属于既有共享控件的预览与文档。本次局部扩展沿用运行态控件，设计系统文件无差异。[设计说明](../../../DESIGN.md#components) · [组件预览](../../../.impeccable/design.json) · [通用控件](../../../apps/desktop/src/renderer/src/form-controls.css)

R07 专用 GitHub 仓库与凭据仍待配置。真实 GitHub 写入和 Draft PR 读取留待 R07 验收。[真实验收预检](live-preflight.log) · [任务记录](../../progress/P09-03.md)
