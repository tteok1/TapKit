# P05-03 聊天版本端到端验收

2026-10-27 托管搜索改造进行中：status=in_progress；旧包和以下旧结果仍对应改造前快照。需新方案回归后更新交付说明，不提升历史live。

- status：implemented_not_live_verified
- updated_at：2026-10-27 Asia/Shanghai
- 目录/分支/基点：D:/Tapkit-public；codex/p05-chat-m1；ad85bc467c921f4c44ad26fc0c1bba25269153cb + 未提交P05工作树；初始干净。
- 工程交付完成；R01—R05完整live沿用用户暂缓，R06 Tavily pending。阶段为engineering_passed_external_pending，不称完整真实服务验收通过。

## 需求与交付

FR-37-001：未配置→合成连接→聊天/早期编辑分支→导入文件/项目限定检索→自动记忆→三次压缩与纠正→公开网页原文/引用→接收者预览/导出→退出重进同一会话，完整11步截图与日志在docs/evidence/P05-03/uncut。合成模型与公开响应显式标记，不发真实模型消费请求。

pack:dir开发包：release/TapKit-chat-M1-2026-10-27T03-32-21-373Z，Start-TapKit.cmd启动；docs/chat-milestone.md与包内README-聊天开发版.md说明模型/数据/格式/限制。包含锁定Node/Python/Git/LibreOffice/Electron、解析模型和中文字体。70017个清单文件、3476891834字节载荷、621份物化依赖；manifest SHA256为1c30c0e88647f9ceb7efd393572eb313892d02d82d1bc1a97e6f9f8f1f581d0b。

## 实际验证

- all-run-03：check/build/unit370/integration373/perf2退出0；八个集成批次46/84/82/81/15/14/32/19。后置产品改动限导出恢复/公开摘要和联网面板布局，ui-run-01再次check/unit370/P05集成19退出0。
- 114个不同Electron用例已分轮通过，无跳过或缺项；e2e-coverage.json逐项指向实际批次，完整连续路径在uiOnly-run-01通过。失败轮和测试准备修复保留，不称某一轮114项全绿。
- final-input-audit.json：产品源码自ui-run-01以来未变；此后仅测试定位/等待/亚像素命中校验和打包布局修复。
- 中文PDF最终11页、NFKC首尾/表格80/代码99、无主动动作核验退出0；最终1/5/11页Poppler视觉核对通过；PDF兼容字符差异已在产品/说明公开，精确UTF-8使用TXT/MD。
- pack-run-02 pack:dir退出0、sourcesUnchanged=true；新目录重新执行当前用户原生22/22，无缺项，nativeExecution/officeRender/terminal均available。保留原测试配置hash，canonical源码别名仅修复物化包相对路径，不改变断言/预算。
- package-summary.json：关键文件hash/原配置及实际无.test-data/test-results通过；pack-smoke退出0，生产Core无fixture入口、空模型目录、真实TXT解析和ZIP原字节、Renderer无require/process通过。选择/保存对话框响应由测试提供，实际执行包内Host/Core/解析器/写盘，不称人工OS对话框验收。

## 证据与失败边界

完整命令/退出码、需求场景映射和后置源码差异见docs/evidence/P05-03/verification.md。开发检查点已移到development-checkpoints.md；首轮ENOSPC、旧测试导航/启动/时序失败、首包0测试收集失败分别保留，均未计通过。旧任务证据逐字节恢复，本轮图像另存historical-current；原profile和窗口保持。

## 交接

P05-01 implemented_not_live_verified；P05-02 implemented_and_verified；P05-03 implemented_not_live_verified。R01—R05/R06及R13历史边界见RESOURCES，不读原Key/native推理、不代发真实请求。当前用户隔离不等同标准用户/安装升级验收；目录是聊天M1开发快照，安装包属P11。只完成P05，不进入P06，未commit/push/merge。
