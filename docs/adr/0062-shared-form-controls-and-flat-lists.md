# ADR 0062：统一表单控件与平整列表

- 日期：2026-10-23
- 状态：采用；本地检查和界面证据见对应 progress/evidence，不提升原 live/gate
- 范围：P02-01，关联 P02-03；当前 ui_fix 工作区，仅 UI

## 决策

1. 所有自有表单沿用可见标签及原字段，聚焦统一使用聊天输入区同一个 `--field-focus-shadow`，保留中性边框。复合搜索框在外层显示阴影，内部输入不叠加；键盘按钮焦点及系统高对比模式仍有清楚的轮廓。
2. 使用 Electron 44 / Chromium 152 已实测支持的 `appearance: base-select` 和 `::picker(select)` 绘制主题菜单：圆角容器、灰绿选中态、圆滑箭头、右侧勾选、受视口限制的滚动区域。沿用 HTML select 的值、onChange、标签、键盘、disabled 与 option 语义，不改成另一套状态管理。无新增依赖。技术依据：[Chrome customizable select](https://developer.chrome.com/blog/a-customizable-select)。
3. 选择框统一圆形外观，checkbox 仍然是独立多选，checked/indeterminate/disabled/键盘行为保持；radio 保留单选语义。强制颜色模式使用原生选择控件。
4. 默认文字操作统一胶囊轮廓，相邻动作以共享 `--control-gap` 分隔并允许换行。原生控件、菜单项、图标、导航与标题各自保持正确语义。表单、聊天工具、分组/会话、项目、模型/账号、文件、记忆及阅读器复用同一规范，原处理函数不改、不删除。
5. 聊天/工作/项目会话详情列表共用 HistoryList 的平整单行结构：选择、标题、右侧小字和动作同排；移除中间标题框，长标题省略，分隔线两端淡出。归档/回收站列表复用此结构，恢复和删除仍走原流程。相似文件/项目/记忆列表使用同一分隔线，不把网格卡片改成列表。

## 验证边界

以修改前源码为基线比对所有 JSX 控件属性和事件，核对 Host/Core/preload/contracts 未变；生产构建 Electron 实测真实菜单鼠标/键盘选择、禁用项、保存/取消、分组与项目变更、圆形多选和批量归档/恢复/删除预览。覆盖浅深色、小窗口与 200% 缩放，保存截图和实际退出码。无账号、模型调用、数据库迁移、原用户 profile 编辑、提交或推送。

本轮证据目录：`docs/evidence/P02-03/forms-theme-2026-10-23`。
