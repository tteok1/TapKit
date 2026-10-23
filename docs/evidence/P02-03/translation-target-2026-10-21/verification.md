# 翻译原样返回：明确目标语言与回显检查

ui_fix/main基线394418f，保留此前全部UI改动。本轮根据用户23:21截图排查并新增Core修复，之前三轮UI工作没有修改Core翻译实现；与上次selection-v2成功译文不同的原因不能从本地统计推断为供应商内部某个过程。

## 只读诊断

diagnosis.json在原profile只读查询最近三次选区翻译：2026-10-21 23:21一轮为translate，源范围27—80/53字符与截图完整英文匹配，结果SHA与原文完全相同且没有汉字，completed/1模型回合/0工具。2026-10-20 22:16中文成功轮也为selection-v2，相同选区与上下文统计；更早v1曾因额外evidence标记触发VALIDATION_ERROR。当前该会话无项目、无会话语言覆盖，个人/全局语言auto，无个人附加指令。诊断只存范围、布尔、统计与SHA，不存Key/原生数据/原始私人正文；未手改业务库或发模型请求。

## 修改

Core将auto解析为本轮明确目标（沿用原约定：含汉字原文→en，其他→zh-CN）；显式zh-CN/en优先。该目标同时写入供应商canonical用户指令、message.selection与answer-preferences，不改存储中的回答偏好。上下文仍只含本轮动作与核验原文；不恢复旧历史、工具、来源ID或知识引用。快照为selection-v3，ADR0056/契约/交互规格同步。

对明显跨语言中英文自然句，若结果仅原样回显，消息final和轮次completed之前产生TRANSLATION_UNCHANGED，保留返回及所选原文，记interrupted/partial并显示“翻译未完成”，可手动重试/换模型；无自动请求。检查保守地排除标识符、数字、URL、代码符号、产品名称列表及同语言目标，不声称完整语言检测或翻译质量判定；准确边界见ADR0056。正常流式引用编码清理与字面示例保留不改。

## 实际回归与失败

baseline：新回显用例复现原实现将原样结果记completed；另四个新语言用例在准备偏好时遗漏事务而失败，不当成四项产品基线。首修集成相关47项为43通过/4同一测试准备失败；修正准备事务后四种语言配置补验4/4，累计47个不同用例分轮验证，非单轮全绿。包括新四语言canonical/偏好不落库/正确响应、原样回显1次请求/重放无重复、其他四动作、范围/版本、预算、工具拒绝、标记与真实知识引用隔离。unit全量354/354通过。

首轮Electron旧T13来源预览及录屏拖选2项通过，新回显UI已展示正确错误但因页面两个role=status的严格定位而失败；保留e2e-initial-failure trace，定位到.chat-progress后只补验该项，未改产品来迁就测试。最终桌面/生产/检查的实际命令、退出码及源码/产物SHA见final.json、checks.json、results.json；历史收据保留。

本轮E2E在单独标记的fixture profile，用仅test build存在的传输强制回显，检验桌面错误提示和状态；不把它当真实智谱翻译语义通过。最终生产必须移除installChatFixture/TAPKIT_TRANSLATION_ECHO_FIXTURE。原用户窗口和旧回复保留；需从托盘退出后用原run-app.ps1重开，载入新Core/Renderer，之后才可真人复验一次。原真人/gate仍待验证，无commit/push。

## 2026-10-22 恢复收尾

用户说明暂停期间未修改，并要求继续。暂停前最后回显桌面用例1/1及生产恢复exit0；首补验另一次因直接DOM Range与输入光标延迟滚动导致浮条消失，e2e-selection-setup日志/trace保留；改为等待标题、释放输入焦点、等待两帧并真实鼠标拖选后通过，不改产品来绕开失败。

恢复后批量复核暂停前两张截图，发现文件尺寸和内容相同，原1440/960标签不能证明窄窗已生效；保留pre-resume截图及final回执。只补验同一回显用例：退出最大化后设置内容尺寸，并直接断言innerWidth、消息左右边界与页面scrollWidth，再截图。已通过的其他回归不重复；最终几何以translation-echo-geometry.json为准，真实模型语义继续未验。


补验初轮退出最大化已生效，但Windows分数DPI将请求1440客户区取整为1441，严格等值断言失败；window-dpi-failure日志/trace保留。测试按实际客户区±1px记录，仍严格核对消息左/右边界及根scrollWidth。补验最终1/1通过，translation-echo-geometry.json实际1441/961、高901，无页面横向越界。一次纠正截图批量复核translation-echo-1440.png/translation-echo-960.png：错误说明和partial状态清楚可读，窄窗正常换行；未再扩大视觉调整。最终test:e2e的finally已恢复生产，Core/Host产物应与暂停前生产SHA一致；fixture必须移除，检查及绑定以results.json为准。

本轮最终pnpm check、pnpm docs:check、git diff --check退出码见checks.json。原run-app.ps1未改功能，经current-ui-review.json指针改指本轮审查后才允许载入新Core/Renderer；本地CheckOnly会核对全部本轮产品源码及619产物SHA，不实际打开或结束用户窗口。启动指针及校验回执另见launch-check.json。历史pause.json仍表示当时暂停状态，已由用户2026-10-22明确恢复；本轮记录不将已有窗口当作新构建已加载。
