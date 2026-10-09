# P01-02 截断诊断核对、修复与恢复本地测试

2026-10-05，用户要求“核对并修复”，随后在本地fixture测试范围问题下明确答复“不用停止啊？测试并修复”。因此恢复本机虚拟响应unit/integration测试；不扩大为真实API请求、真实Key/vault读取或Electron启动。HEAD b92eece52e88eb6bd16931cd6ed942bb91d4d1f6，分支codex/fix-zhipu-api-probe，加未提交工作区改动。

## 核对与修复

Responses终止usage原来已解析并发出，但checkConnection未消费；finish后合成截断/无正文错误也丢失HTTP状态和响应类型。这两个诊断缺口已补。fetch前从实际序列化body摘取outputLimit、stream和固定reasoning分类，不保存原始payload/headers/Key；摘要仅证明准备发出的参数，不宣称服务器收到并执行。

检测按当前阶段保留规范化输入/输出/缓存/思考计数和source，未知用量为null不填零，不把文本usage串到工具阶段。只有明确准备none/disabled且服务报告outputTotal>0=reasoningSubset时，细分reasoning_output_truncated，说明“请求已设置关闭思考，但服务报告输出全部为思考Token”；并非供应商内部原因的证明。其他截断保持旧分类。

界面现在可显示发送上限、固定思考设置、HTTP/类型、实际用量及未知项。原生推理、正文、工具参数和私人数据不进入新增字段，strict schema拒绝额外key字段。预算仍32/128，失败不放行、不新增检测重试/真实请求；不修改供应商未知参数或自动换协议。详见[ADR0020](../../../adr/0020-probe-request-and-usage-evidence.md)。

## 实际测试与检查

命令均由`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\pnpm.ps1`调用；没有真人模型请求。

| 命令与轮次 | 实际结果 | 证据 |
| --- | --- | --- |
| test:unit -- P01-02 首轮（实际未筛选，全unit） | 203通过/1失败，退出1；新JSON认证用例错误期待unavailable，实际正确expired，修正断言 | [before](probe-audit-unit-before-2026-10-05.log) |
| 同命令补audit后 | 207通过/3失败，退出1；两条全思考fixture需期待新细分类，一条发现网络失败没有诊断，补request_failed | [after](probe-audit-unit-after-2026-10-05.log) |
| 同命令最终全unit | **210/210通过，退出0** | [final](probe-audit-unit-final-2026-10-05.log) |
| test:integration -- P01-02（实际未筛选，全integration） | **108通过/15失败，退出1**；全部15失败位于P00-03 AppContainer/Office运行库权限路径，不声称全integration通过 | [完整失败](probe-audit-integration-2026-10-05.log) |
| exec vitest run --config vitest.config.ts --project integration P01-02 | **P01-02定向19/19通过，退出0**；本地HTTP+Core，无真人Key | [定向结果](probe-audit-integration-targeted-2026-10-05.log) |
| check（当前用户上下文，避开已知沙盒忽略目录枚举EPERM） | 退出0，类型/格式/依赖边界/manifest通过 | [check](probe-audit-check-2026-10-05.log) |
| build:desktop | 退出0；既有Rollup依赖注释提示，Core/Renderer含新字段和原因 | [build](probe-audit-build-2026-10-05.log) |

pnpm脚本带双`--`没有按预期限定文件，是本轮调用方式错误，现改为直接exec vitest筛选。意外带入P00-03测试的失败保留，不扩修该任务、不提升P00门禁；当前P00-03仍in_progress/P00-gate failed。只读失败日志显示Office path.open.office.runtime.component.3:0x80070005及AppContainer运行库权限拒绝，没有修改权限/隔离/系统配置或用户private profile。全unit通过也覆盖了此前标“新增未运行”的本地用例，但不是历史真人验收升级。

新增回归验证32预算/none摘要与实际发送body一致，明确/零/未知思考用量，工具128独立摘要，缺HTTP/usage时不伪造，非法额外字段与私有标记不泄露；集成本地Responses返回32全思考并经Core IPC保留诊断和失败状态。截图的真实用量仍未观察，供应商是否执行none/usage是否准确仍未知，不能宣称账户恢复或只需加预算。

docs:check和git diff --check结果与SHA256见[结果JSON](probe-audit-results-2026-10-05.json)。无真人模型请求、Key/vault/Codex/native用户状态读取、代理/账户/预算配置改变、Electron/dev启动、推送或提交。P01-02=in_progress/P01-gate=failed；此前预算/模型兼容实现保留，旧“本机测试暂停/新增用例未运行”为各记录时的历史快照，当前只恢复本地fixture。
