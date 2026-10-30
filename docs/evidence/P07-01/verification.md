# P07-01 验收记录

2026-10-28，工作分支 codex/p07-office，基于 origin/main aa6debf25399a328ca993e2c8a03c0d0722a6032；结果针对当前工作树。

- 结构化文档、固定模板、明确字段、来源权限、局部审批修改、不可变新版本、MD/DOCX 和隔离 PDF 已接入；授权静态 PNG 可嵌入 DOCX/PDF。候选 PDF 的正文与边界须先经隔离解析；仅排版边界失败时最多重排两次，内容缺失或未知进程状态不盲目发布。
- `pnpm check` 退出 0，日志 check-final-2026-10-28.log；`pnpm exec vitest run --config vitest.config.ts --project unit P07-01 P06-02` 退出 0，31/31，日志 unit-final-2026-10-28.log。
- 最终补充集成退出 0，24/24，日志 integration-supplement-2026-10-28.log；排版及隔离候选定向退出 0，14/14，日志 layout-repair-test-2026-10-28.log；图片授权、撤权、恢复等 4/4，见 P07-01 进度。综合回归首轮 37/39，原生强杀项超时和旧代码并发启动下新增断言失败，失败日志 integration-final-2026-10-28.log 保留。后者在补充集成通过；`pnpm exec vitest run --config vitest.config.ts --project integration P06-03.crash -t after_native` 以正常 Windows 权限退出 0，1 通过、4 跳过，日志 recovery-native-retest-2026-10-28.log。
- `pnpm test:e2e -- --grep P07-01` 以正常 Windows 权限退出 0，3/3，实际 Electron、文档修改审批、隔离 PDF 和授权 PNG 链路；日志 e2e-final-2026-10-28.log。生产构建在测试后恢复。三份代表报告实际隔离渲染 3/3，人工检查全部七页，见 native-render-run-2026-10-28.log 和 native-render；长报告固定模板候选真实转换 1/1，页数 3/2/2，人工检查修复候选，见 native-layout-run-2026-10-28.log 和 native-layout。
- TapKit 内连接检测 6 次，最近一次成功，低于 20 次上限；之后受控真实任务实际生成、解析与人工查看通过，见 connection-2026-10-28-06/probe-report.json、live-task-report.json 和 live-render/report-page-1.png。7 次任务请求中前 4 次无响应头等失败且实际用量未知，第 5、6 次分别发现虚构来源/字段与无依据验收结论，不能视为语义通过；第 7 次限定已提供示例事实，实际输入 2735、输出 194 tokens。三次完成请求实际共 8795 tokens，失败请求估算及连接检测用量不当作实际用量。
- 限制：模型对开放式缺失事实仍可能虚构结论，需人工核对；页面边界检测不能识别所有视觉重叠；静态图片仅支持授权 PNG，Markdown 图片和 JPEG 明确不支持。用户模板目录及其他延期能力仍按既定范围占位。
