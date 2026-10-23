# 录屏中的选区浮条遗漏：边界续修

当前ui_fix/main基线394418f，保留既有工作区；本轮仅Renderer选区识别、对应Electron测试与交接，不改Core/Host或原业务数据库，不提升真人任务/阶段门禁，无新commit/push。

## 录屏与失败证据

本地隔离Electron解码用户提供的43.2333秒/2538×1492录屏，查看全片3秒间隔及13—18.5、30—37.5秒半秒间隔帧。可见文字仍高亮但部分松手没有浮条，近字形松手时又可显示；录屏本身不能直接证明DOM Range边界，未将视频或私人帧放进Git。视频SHA和查看时间点见video-review.json。

原生Electron鼠标拖选的baseline复现八种位置：after-text/before-text/below-line/above-line/start-left-margin/start-above-line/after-next-paragraph/before-previous-paragraph。其中空白起点和正文外尾部终点均保留原生选区却无浮条，其余六种显示且移开鼠标后仍显示。baseline.log/json实际1失败/exit1，observations-before.json保留事件与选区边界。首次准备用例的fixture仅回显前80字符，整句被截断，setup-failure.log/json/trace单独保留；缩短合成前后文后才执行有效baseline。

## 实现范围

不再要求拖选起点或终点落在正文/glyph DOM。普通主键拖选结束后读浏览器最终Selection，在当前会话中寻找唯一能容纳全部所选正文的单条消息；对容器外纯布局空白作Range交集。可见Selection排除不可选UI，而原生Range包含这些节点，因此只有越出正文的边界才对比可见文字并忽略布局空白；原始Range及传给messages.transform的文字/固定版本完全不做空白归一化。跨消息/标题/其他实际文字、输入框、活动回复、非正文或无选区仍拒绝，已有唯一文本匹配与Core范围权限检查保持。五项命令、浮条样式、鼠标位置与视口约束保持。

首修fixed轮2过1失败：空白起点已修复，但正文外尾部仍受Range/Selection文字差异影响；附加最后段落测试未清除故意构造的跨消息选区，鼠标启动了原生拖放而非新选区。first-fixed观测和trace保留，随后修正比较和测试准备再回归；不把该轮记为全绿。

## 最终验证

最终三个Electron用例在同一轮通过（final.log）：新增八种拖选松手/移开光标、Escape、输入排除、跨消息拒绝及容器外尾部真实翻译；原双向边缘/双击/Shift/输入排除/翻译；代码表格复制与两尺寸×两缩放/深色/选区来源。八种原生选区在鼠标移开前后均显示，见observations.json，最终生产恢复与静态检查退出码以final.json/checks.json为准。

一次批量查看本轮margin-release-desktop.png与selection-960-200.png：五项操作横向排列，靠近松手处且在视口内，原样式保持；没有额外扩大视觉改动。首修失败截图及旧测试证据保留，生产Core不得含fixture，Core/Host冻结SHA在results.json复核。

原用户窗口继续运行，重新打开才载入新Renderer。原session-load-2026-10-21/run-app.ps1保留，经本地current-ui-review.json指针加载本轮通过检查的源码/生产产物；不在每次启动时编译，不改原profile。CheckOnly退出码另存launch-check.json。无真实模型请求，不重写真人T13a/gate结果。
