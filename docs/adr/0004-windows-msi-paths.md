# ADR 0004：Windows Installer 属性路径引号

- 状态：接受；2026-09-15。
- 首次中文/空格目录复现时，Node 自动将整个 TARGETDIR=路径 参数包在引号中，MSI 未生成日志，进程长时间停滞；核对 PID 后停止，保留 repro-first-failed.log。
- 改为 Windows Installer 所需 TARGETDIR="路径"，连同包路径和日志路径明确传参，并设置 windowsVerbatimArguments；只对 msiexec 使用此格式，不经过另一层 shell。
- 单次试验已能创建中文目标下的文件和详细 MSI 日志；45 秒试验超时不能视为成功，等待其事务结束后再执行完整 bootstrap 复现。
- 最终结果以 repro-results.json 和任务交接为准。

最终验收：全新中文/空格目录首次 bootstrap、删除 node_modules 后重建及最终源码同步复验均通过（repro-results.json）。
