# 选中文字后浮条未出现：触发边界修复

ui_fix / main基线394418f，保留所有既有改动，无新commit/push。本轮仅改Renderer选区事件处理、定向测试、交接及本地已验UI启动入口；Core/Host/协议与范围权限校验不变。

## 复现与修复

使用截图提供的英文整句，在隔离fixture会话执行真实鼠标正向/反向拖选，把鼠标松在正文旁边的screen-scroll空白处。原生选区仍完整保留，但pointerup旧代码要求松开目标也位于chat-markdown/chat-user-text，否则直接隐藏浮条。baseline.json/log实际1失败/exit1，observations-before.json记录两个方向visible=false，原截图另存margin-*-before.png。

现在记录拖选起点是否在正文，松开后按实际Range核验是否仍属于当前会话的同一消息，而非要求松开DOM位于正文。用下一帧读取浏览器最终选区，拖选/待读取期间不被延迟scroll立即清掉；与选区无关的其他滚动不再关闭浮条。相同Range的迟到selectionchange保留鼠标松开位置；Escape、外部点击、相关滚动、取消与组件卸载会取消待读取。唯一匹配/固定版本/原messages.transform后端校验继续沿用。

原profile只做只读状态聚合：截图英文匹配的6条assistant均final，其中2条所在run completed、4条无run，未见活动回复限制；selection-state-summary.json仅保存计数，无正文/ID/Key/native导出。首次诊断用错text字段而SQL拒绝，按实际content_json字段纠正后得到以上结果，未写业务库。

## 实际验证

- baseline：原逻辑正反方向均不显示；1失败，exit1。
- fixed：T13固定版本原文预览与inline-copy两个用例通过，包含两尺寸/两缩放、深色、真实拖选/代码表格复制与翻译来源；新触发用例的正反拖选、双击选词已通过，随后Home/Shift+End无法在未启用光标浏览的只读正文创建选区，原生Selection为空；2过1失败/exit1，失败trace另存keyboard-test-failure。此失败不当成业务通过，测试改用原生Shift+鼠标扩展选区，未使用DOM Range伪造鼠标结果。
- final：只补验改过的触发用例，1/1通过、exit0。覆盖正反边缘释放、双击、Shift扩展、输入框内Ctrl+A不出现正文浮条及实际翻译原文引用。上述已过两项未无故重复，共3项分轮通过。

首次截图批量复核margin-forward.png与selection-960-200.png：桌面边缘松开仍在鼠标附近显示五项横向浮条，窄窗200%仍约束视口；截图样式和原模型/进展精简保持。最终pnpm check、pnpm docs:check和git diff --check均exit0，463文件格式/84项E2E发现以及37任务/交接/需求证据链接检查通过。最终静态检查与源码/619产物SHA见checks.json/results.json，生产Core无fixture且Core/Host保持原SHA，真人任务/gate不提升，不关闭原用户窗口或发真实模型请求。

## 原启动命令继续可用

上一轮session-load-2026-10-21/run-app.ps1仍作为入口。它增加读取.test-data/current-ui-review.json的本地指针（只允许P02-03证据目录下的results.json），从本轮通过检查的结果核对源码/产物；旧结果和旧SHA保留为历史，不伪装成新UI验证。新指针只在本轮验证/生产恢复完成后写入，启动不重新编译，仍复用原profile并要求从托盘退出旧进程。CheckOnly已实际exit0并核对新指针、源码和产物，见launch-check.json/log，本轮不实际重启用户窗口。
