# P06 工程验收证据

日期：2026-10-28 Asia/Shanghai。D:/Tapkit-public；codex/p06-work-runtime；基点f453d81c34618c1845b0eb9f5c63a9d8eed1d61c。新分支来自已fetch的origin/main，初始干净，无commit/push/merge。源文件SHA256见source-sha256.json，机器结果见verification-results.json。

所有pnpm命令使用.runtime/node/node-v24.21.0-win-x64/node.exe和.cache/tools/pnpm/package/bin/pnpm.mjs，PATH优先固定Node。Vitest使用仓库.test-data/p06-runner-temp作为TEMP/TMP；真实原生/桌面/junction测试在正常Windows权限下运行，独立新资料目录，无真实凭据。

| 命令/范围 | 实际结果 | 退出码 | 日志 |
|---|---|---|---|
| pnpm check | 双TypeScript、格式、依赖边界、manifest、118个E2E模块收集通过（收集不等于执行） | 0 | check-final.log |
| pnpm build | 锁定SDK/CRT的Windows helper及全部生产桌面构建通过 | 0 | build-final.log |
| pnpm test:unit | 54文件，390/390 | 0 | unit-final.log |
| pnpm test:integration P00-02 P01-03 P02-02 P02-03.history P03-01.files P03-01.migration P03-02.artifacts P04-02.context P04-03 P05-02 P06 | 首轮202通过/1失败：迁移丢失tasks搜索触发器 | 1 | integration-final.log |
| pnpm test:integration P02-03.history P03-01.migration P06 | 修正触发器及追加schema16保护后80/80；含P06的33项 | 0 | regression-corrected.log |
| pnpm test:recovery | 6项恢复/通知及5个真实进程强杀，11/11（最终组合再次执行） | 0 | recovery-third.log |
| pnpm test:e2e -- --grep P06 | 首轮最终组合4/4，生产恢复完成 | 0 | e2e-final-first.log |
| pnpm test:e2e -- --grep 'P06\|P02-02 T05 IME\|P05-02 T20 recipient' | 最终6/6，生产恢复完成 | 0 | e2e-final.log |

集成按不同用例合计204项：203首轮+新增迁移1项；修正组合与首轮重叠79项。只报告分轮通过，不把首轮失败抹去，不将E2E收集118项当执行118项。

## 覆盖与实测

- P06-01：DAG/依赖选择、同会话调度、定义与幂等receipt、真实文件条件、虚假完成/错误格式两次修复上限、提问/旧答案、steer迟到、root预算不重置、共享路由重试；旧schema16任务/run/tool身份和历史搜索触发器保留。
- P06-02：完整参数、具体patch预览/编辑/TTL/新审批、参数/目标/version/hash篡改、grant撤销、伪造归属及能力不可用。真实CSV统计/Office→PDF由实际AppContainer执行；AppContainer=true、networkCapabilities=0、activeProcesses=0、exitCode=0，输入hash不变，见../P06-02/native-cases.jsonl。
- P06-03：two-window CAS、暂停时间、过期租约/旧worker、睡眠/恢复、unknown人工核对、通知游标/DND/dedupe/重启、任务归属与永久清理、批量逐项结果。
- 真实子进程SIGKILL：before_dispatch、after_intent、after_blob、after_commit、after_native，逐项JSON保留实际退出码和重启后的成果数/调用数。after_commit/after_native模型调用0且仅1份成果；epoch递增；测试未用抛异常冒充进程崩溃。
- 桌面闭环实际运行：创建计划→接受执行→成果、编辑审批→新版本、通知已读与计划跨重启、深链、托盘同Core PID、睡眠模拟；聊天停止和可信Host导出回归。desktop下浅/深色/200%截图经人工模型视觉检查，动画在截图时结束，控制项可读且可滚动到达。
- regression-export保存本轮导出PDF和预览；preserved-history.json记录旧P05文件恢复hash，旧证据字节等同HEAD。

## 失败轮与处理

早期pnpm指向非锁定Node、受限Electron/junction EPERM、Vitest短寿命临时模块ENOENT、SSR原生SQLite解析路径、可访问名称定位、队列快照竞争、重复receipt/格式验收修复路径均保留日志。最终unit390及对应集成/桌面补验通过；check-first的6处格式已修正。WorkDriver初期过早抛attempt错误，已允许共享路由决定重试，新增回归验证只消费最终完整工具。

自动审批曾拒绝移除owner检查的草案，实际未执行；已改用保留profile/task/session/run来源检查的task作用域，跨任务/原件/删除攻击测试通过，无待审批阻塞。

## 范围

无真实模型请求、Key读取或外部写入；R01—R05/R13/R14沿用原live范围。当前用户真实隔离不替代标准用户安装验证。未制作新分发包，未触碰原profile/窗口/旧release；未开展P07。P06-gate=engineering_passed_external_pending。
