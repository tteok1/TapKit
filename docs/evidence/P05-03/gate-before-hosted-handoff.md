# P05 聊天开发版本 M1 阶段验收

2026-10-27 gate_status=in_progress：用户要求托管搜索替换，按ADR0066重开P05-01及受影响P05-03验证；以下为旧工程交付记录，不代表新方案通过。

- 阶段/执行会话/实际日期：P05；本次Codex本地自动验收；2026-10-27 Asia/Shanghai。
- 源码：D:/Tapkit-public；codex/p05-chat-m1；基点ad85bc467c921f4c44ad26fc0c1bba25269153cb + 未提交P05工作树；冻结输入见pack-run-02/sources.json与final-input-audit.json。
- gate_status：engineering_passed_external_pending

## 本阶段交付物

| 交付要求                            | 实际入口/文件                                                                            | 对应任务 | 实现状态                   | 验收证据                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | -------- | -------------------------- | ------------------------------------ |
| 公开网页、Tavily搜索、来源快照/引用 | 输入栏“联网与来源”、来源原文面板                                                         | P05-01   | 工程完成，R06真实搜索待验  | docs/evidence/P05-01/verification.md |
| 引用交互、本地分享导出              | 会话/消息/文件/项目/成果“导出分享副本”                                                   | P05-02   | implemented_and_verified   | docs/evidence/P05-02/verification.md |
| 聊天开发目录包、启动说明和连续路径  | release/TapKit-chat-M1-2026-10-27T03-32-21-373Z/Start-TapKit.cmd；docs/chat-milestone.md | P05-03   | 工程完成，真实模型联调待验 | docs/evidence/P05-03/verification.md |

## 演示与检查步骤

按docs/chat-milestone.md启动包内Electron，先退出使用同一原资料目录的旧实例。设置模型后可聊天、编辑分支、导入文件/项目问答、管理记忆/摘要、读取公开URL/核查来源并导出。Tavily搜索需独立key；项目限定阻止联网。缺连接时显示明确错误。连续合成演示的11步截图/日志在P05-03/uncut，实际包内启动/解析/导出在pack-smoke.json和pack-launched.png。

## 门禁结果

- check/build/unit370/integration373/perf2通过；导出/布局增量再check/unit370/P05集成19通过。114项不同Electron分轮全部通过；e2e-coverage.json逐项核对，不称某轮全绿。
- 连续路径覆盖连接→聊天/分支→资料/项目RAG→记忆/三次压缩→原文引用→导出→重启。T01—T12/T19/T20/T22映射见verification.md。
- 新目录原生隔离22/22、无缺项，三个能力available；scope=current-user，standardUser=false，不推广为标准用户安装验收。
- pack:dir退出0；70017个清单文件/约3.48GB载荷，无junction；实际无测试profile。manifest与关键文件、原测试配置hash见package-summary.json。
- 无fixture生产包独立profile启动、真实TXT解析、ZIP原字节和Renderer无Node通过（exit0）。对话框选择响应由测试提供，不宣称人工OS对话框操作。
- 中文PDF/静态HTML/五格式保存、磁盘满/已有目标/取消/源版本变化/写盘未知副作用已验证。完整失败和修复回执保留，原用户数据与历史证据保持。
- 真实资源：R01—R05完整live按用户暂缓；R06 Tavily pending，真实搜索→3页→引用仍待验。R13既有指定范围保持。合成响应不计真实服务通过。

## 是否进入下一阶段

本阶段工程交付完成，外部资源缺口单列，因此不称正式全量验收通过。本轮停在P05，不进入P06，不发布或合并。可复用已验证的来源/引用、Host本地保存、资料/上下文及目录运行组件；真实模型和搜索联调须在资源就绪后另验。任务记录、CURRENT、INDEX、requirements.csv和RESOURCES已同步，原profile/窗口保持，无commit/push/merge。
