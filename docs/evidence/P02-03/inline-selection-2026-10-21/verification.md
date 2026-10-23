# P02-03 复制图标、紧凑底栏与光标选区操作

当前分支 `ui_fix`，HEAD为main基线394418f；保留全部既有未提交内容，无新commit/push。

## 本轮改动

- 共享ChatMarkdown的代码复制改为右上角无文字图标，hover/title与可访问名称解释动作，复制后勾选反馈；表格复制位于右上角，hover/键盘聚焦时出现，无新增操作行，横向滚动的表格不带走复制入口。原代码全文与TSV复制格式保持，复制失败可重试，不触及用户OS剪贴板的测试以合成写入拦截检查内容。
- 侧栏入口由40px缩至32px，底栏上padding由8缩至4，侧栏外层底部6；原侧栏内容间距独立保留。输入底部padding6，工具行margin-bottom显式归零，清除旧10px下边距。
- 删除更多菜单中的选区操作。ChatSurface只挂一个选区监听器，正文选中后以原生manual popover显示横向五按钮，跟随鼠标释放点或键盘选区末端定位，按实际缩放约束视口。输入框/跨消息/空选区/工具过程不展示；Escape、外部点击、滚动、窗口变化和新回复时隐藏。点击保留cloned Range，继续原唯一匹配、版本和Core范围校验及messages.transform请求；后端/权限/协议未改。

## 实际验证

实际命令为 `pnpm test:e2e tests/e2e/P02-03.chat-simplify.spec.ts tests/e2e/P02-03.history.spec.ts tests/e2e/P02-03.inline-selection.spec.ts --grep "P02-03 T22 compact|P02-03 T13 selection|P02-03 inline copy"`；中间定向诊断仅运行最后一个用例。以下日志及退出码保留，不把失败轮记为通过：

| 回执前缀 | 实际结果 | 处理 |
| --- | --- | --- |
| electron-initial | 5过1失败，exit1 | 新建会话路由未完成即填写首页草稿；测试改为等待sessionId和加载完成。四种布局及原T13通过。 |
| electron-copy-selection | 1失败，exit1 | Markdown内联components对象使Code/Table随状态刷新重挂载；改为模块级稳定组件与动态链接Context。 |
| electron-final | 1失败，Playwright exit1 | 前三种尺寸/缩放下复制与真实拖选通过，960×640/200%拖选为空。包装器恢复未变化的P00旧图片时遇OSError22，后续改为只恢复字节不同的文件；该轮没有最终JSON。 |
| electron-pointer | 1失败，exit1 | 拖选前首尾DOM命中正确；中心滚动后仍失败。 |
| electron-narrow-diagnostic | 1失败，exit1 | 仅960×640/200%诊断，拖选中即无选区，浮条尚未显示。 |
| electron-verified | 5过1失败，exit1 | 尝试限制后台自动跟随未解决；此推测性源码改动已撤回。 |
| electron-events | 1失败，exit1 | 原生事件证明：输入框焦点引发延后的外层MAIN滚动，文字y从约375移到-70，鼠标实际命中DIV；是测试旧坐标，不是浮条清空选区。 |
| electron-complete | 6过0失败，exit0 | 测试先释放输入框焦点并等待两帧布局，再测量坐标执行真实拖选，未以DOM选区替代鼠标；四种配置全部通过，翻译原文引用保持。 |

新综合用例覆盖两窗口1440×900/960×640及100%/200%缩放（含深色），代码与表格精确复制内容、无文字按钮、右上角位置、hover及聚焦隐藏、真实鼠标拖选、五项操作/水平布局/视口与光标距离、Escape和翻译原文引用。T13继续核对原文来源与固定版本预览。布局测试同时断言底栏高度和输入底部间距。

初始pnpm check退出0，格式461文件/82项E2E发现。稳定Markdown组件时发现exactOptionalPropertyTypes的href可选属性错误，修复后Renderer类型检查退出0。最后同步文档后，check先因四份Markdown待格式化exit1（check-before-format.log/checks-before-format.json）；只格式化四个目标文档后，最终pnpm check、pnpm docs:check、git diff --check均exit0，461文件/82项E2E发现及37任务状态/交接/需求证据链接检查通过，见checks.json及对应日志。

截图初次批量检查桌面/窄窗/200%深色，修正测试滚动后最终复核selection-1440-100.png和selection-960-200.png：复制无文字框，表格区域不再多一行按钮；浮条靠近选区、五项保持横向且未越界；底栏及输入下沿间距紧凑。无进一步视觉缺口。

e2e脚本finally恢复生产构建exit0；Core/Host SHA与上一轮生产基线一致，生产Core不含installChatFixture。运行器逐字节恢复此前证据，Git核对旧跟踪证据无差异，新的相关测试产物收在本目录。最终results.json绑定源码/Renderer产物SHA和检查结果。全程合成profile、Chromium sandbox开启，不调用真实供应商、不改真人/gate状态；原用户窗口保留，本轮不强制关闭或刷新，需重开窗口载入新UI。
