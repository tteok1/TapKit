# P02-01 圆滑图标、长按排序与设置分类

2026-10-23，ui_fix / 394418f。用户恢复此前暂停的三项UI需求，按 ADR0060 完成。保留全部既有UI/翻译改动及原窗口/profile，无真实模型请求、commit/push或真人/gate状态提升。

## 已实现

1. 新建任务、聊天、工作、项目、文件、置顶、设置七类图标换为现有Lucide依赖的圆滑轮廓，圆头圆角描边及主题一致；不是仅把尖角路径的描边端点变圆。
2. 删除“调整导航入口”及其隐藏/上移控制。四个主导航始终显示；长按450ms后上下拖动，提供原位预览，松手保存；提前移动、Escape、指针取消或窗口失焦可撤销，不触发链接导航。普通点击和键盘Enter保留原跳转；Alt+上下方向键可排序并保持焦点。
3. 旧导航配置缺少的选项自动补齐，保留已有相对顺序；排序复用窗口槽位的localStorage持久化，通知仍位于品牌右侧。无新依赖、Core/Host/IPC/数据库改动，路由保持。
4. 设置分类中的归档、回收站移除图标，只保留原文字和页面跳转。

## 实际验证

- pnpm exec vitest run --config vitest.config.ts --project unit P02-01：12/12、exit0。包含旧隐藏项恢复、已有顺序/滚动/收起状态保持、保存补齐及存储不可用回退。
- pnpm build:desktop：exit0。先构建生产版本，再使用 pnpm exec playwright test tests/e2e/P02-01.navigation.spec.ts --grep "P02-01 navigation" 直接验证该生产产物，无fixture模型。
- Electron 同轮3/3、exit0：真实鼠标长按/拖动不跳转、普通点击与重启保存；提前移动/Escape取消、键盘排序及旧隐藏恢复；真实设置页切换深色200%后窄窗抽屉拖动、全部导航可达和设置分类无图标。完整命令、日志、退出码与旧证据备份路径见 initial-electron.json。
- 最终 pnpm check、pnpm docs:check、git diff --check 见 checks.json。首轮格式检查发现新增测试文件格式需再次规范化，已修，原 initial-check.log 保留；没有产品行为失败或放宽断言。

## 视觉及范围

一次批量查看浅色整页/侧栏与200%深色侧栏，图标的笔头、气泡、提包、文件夹、文件、图钉和齿轮均有实际圆弧过渡。设置两项与其他分类文字左对齐；普通/缩放导航完整可达，无额外隐藏入口。截图 rounded-icons-light.png、sidebar-icons-light.png、sidebar-icons-dark-200.png；几何数据 navigation-geometry.json。沿用已有本地技能参考，不将缺失的引擎/搜索模块记为已运行。

本轮仅7个前端源文件相对上次审查发生变化，源码范围见product-scope.json。测试前后生产文件SHA一致，旧证据逐字节保持；本轮未运行后端集成，因Core/契约无改动。全部结果及106源码/626生产文件快照见results.json。

## 加载新版

先从托盘正常退出旧TapKit，再运行原命令：

```powershell
& "D:/Tapkit-public/docs/evidence/P02-03/session-load-2026-10-21/run-app.ps1"
```

本轮仅以 -CheckOnly 验证原入口，未代用户重启原应用。新入口指针激活本轮结果，无需每次启动编译；launch-check.json记录只读校验结果。
