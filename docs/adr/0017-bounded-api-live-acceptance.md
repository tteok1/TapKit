# ADR 0017：API完整验收入口与繁忙重试分类

2026-10-04 20:30交接停点：用户要求后续测试不在其本机继续，原Chat完整live请求撤回、未运行；接口决定保持，真人验收转接手者自己的隔离环境与账户，见[更新的P01交接](../evidence/P01-02/zhipu-fix/handoff-2026-10-04.md)。下方Chat接续描述为此前计划，不是继续在用户本机执行的指令。

- 日期：2026-10-04
- 状态：accepted，P01-02本地工程决定；真人结果待补

2026-10-04 20:20单请求真实对照：fetch边界none/128与匹配模型/端点已确认，HTTP200仍全128思考截断。停止重复此Responses组合，不添加猜测字段或自动升预算；供应商参数执行/usage语义待确认，见[结论与支持材料](../evidence/P01-02/zhipu-fix/responses-none-confirmed-2026-10-04.md)。可用已有Chat账户独立补完整live，不冒充Responses通过或自动更改账户配置。

2026-10-04首次真人完整入口在text失败：128输出全部计入思考，仅1请求。发送参数未入旧报告；新增无payload变更的fetch边界白名单审计及--text-only单请求模式，保持128预算、固定原首轮输入和无自动重试。文本对照成功也须fullAcceptancePassed=false，不提升完整live。预期失败正常传非零退出码，不抛额外CLI堆栈；详见[本次记录](../evidence/P01-02/zhipu-fix/api-live-truncation-2026-10-04.md)。

P01复核确认原`test:live`只有Codex入口；智谱三协议的连接检测通过，不能代替两轮、native/canonical历史、工具结果回传和取消的完整证据。真实HTTP200 SSE中的`response.failed/overloaded`虽被识别成失败，但缺少可重试分类。

新增`pnpm test:live -- --provider <API provider> --account <精确账户标签或ID>`，覆盖四预设及两兼容provider。Node验收脚本复用正式ApiKeyAdapter和secureApiFetch，不启动Electron；只读`.test-data/P01-02-live-*`中的API账户公开配置，不读取凭据列或vault，不改原profile或账本。Key由用户在本机Windows PowerShell隐藏输入，经过stdin传递，仅在当前进程使用；不进入参数、环境变量或文件。预检和执行间用账户ID与配置摘要校验绑定，变化则请求前拒绝。

每次只测一个账户，顺序为文本、native两轮、canonical两轮、echo提议、纯echo结果回传、收到首段正文后取消。最多6个请求，每请求最大输出128 Token（合计请求预算768），每阶段90秒、全流程300秒；首次失败停止，无自动重试或fallback。不自动提高预算、探测其他模型、耗尽配额或执行OS工具。`--prepare-only`只构建和检查公开配置，无Key输入和模型请求。

报告写入`test-results/P01-02-live/<唯一ID>/connection-report.json`，包含账户标签/ID、模型、协议、adapter、环境、阶段状态及usage。只报告已知错误码；不保存正文、工具参数、原生状态或推理。未知用量为null，取消不冒充零费用。native状态仅在内存中用于协议回传；磁盘加密与真实账本核对不能由此验收，`ledgerVerified=false`。这些仍按P01-01/P01-03现有入口另验。

只对正式智谱标准Chat/Responses端点的已观察`overloaded`映射`PROVIDER_UNAVAILABLE/retryable=true`；HTTP401/403不因该码变为可重试。正常ModelRouter复用既有最多两次、1秒/3秒加抖动、正文开始后不重试的策略。连接检测和live脚本直接调用adapter，仍只请求一次；不引入隐式换协议或持续重试。

用户补充的Codex登录/刷新/控件异常先记录、后处理。任何使用该Codex账户的真实调用都须先获得用户本次明确同意；不因已有脚本opt-in或历史测试授权而自动执行。API验收入口排除codex-subscription，不读取Codex账户或凭据。
