# P07 CI66 故障定位与修复

2026-10-30，用户要求检查修复CI；分支codex/p07-office，提交b9673f1f169befa5af0bdc30e68954665da4b95c。只修当前分支，不合入main、不开始P08、不增加模型请求。

## 远程事实

- CI66：[run 41032120183](https://github.com/tteok1/TapKit/actions/runs/41032120183)，失败job 123984073253。
- unit 444/444通过；integration 17失败、464通过、1跳过，9个失败文件全部P07原生任务，断言为能力status expected available、received failed，均未到达对应业务断言。摘要ci66-failure-summary.log。
- Check、perf、Build/Electron、独立标准用户隔离及Office诊断均通过；读取时startup-diagnostics仍在运行，不伪造最终结论。
- GitHub插件job日志两次Transport closed，故使用本机既有Git认证在内存中读取此公开仓库指定job日志，原始约7万行存ignored .test-data，仅保留不含凭据的失败摘要到证据。

## 根因与修复

干净checkout不含被忽略的resources/runtime/capabilities.json。bootstrap只准备运行时、构建和ABI检查，不运行runtime-probe。P07新原生测试通过readExecutionCapabilities要求真实且绑定当前源码指纹/账户身份的报告；缺报告按设计安全拒绝。本机此前实际probe已生成报告，掩盖CI缺少前置。独立标准用户kit的报告位于另一个隔离目录、时间也更晚，不能替代主runner报告。

在Check后、原生集成前新增node scripts/runtime-probe.mjs --scope=current-user，真实执行规定P00-03代表集后生成当前runner绑定能力报告，失败即阻止依赖测试。保留后续独立标准用户检查，不能把current-user误记为standard-user。上传此轮探测日志/报告便于审计；增加真实前置及新增P07原生用时后将check job上限从45调整为60分钟。未更改业务代码、门禁断言或安全策略，未注入available或复用其他机器报告。

本地已备份并临时移除生成报告，P07-01.native-candidate真实运行1/1失败，available/failed断言与CI完全一致；实际测试退出1，报告在finally恢复。见missing-report-reproduction.log，不把预期失败写成通过。文档格式和docs:check通过；真实探测、相关测试与新CI结果待实际运行后补充，P07 gate暂failed。

补充核对：CI66 startup-diagnostics最终success；失败仅check中的17项。修复后本地pnpm check退出0（673文件），check-before-push.log；当前真实runtime-probe已启动，原生报告/日志待完成，不提前计通过。提交修复后跟踪新一轮干净runner结果，保留失败CI。
