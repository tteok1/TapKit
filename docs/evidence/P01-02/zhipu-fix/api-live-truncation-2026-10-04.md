# 完整Responses验收首次文本截断与单请求诊断

最新：2026-10-04 20:20:33用户单次对照已完成，真实发送摘要为none/128，HTTP200仍报告128思考并截断；停止重跑此组合，见[最新结论](responses-none-confirmed-2026-10-04.md)及[官方支持材料](zhipu-responses-support-2026-10-04.md)。下方待对照命令为历史，不再要求执行。

用户于2026-10-04 20:10:31（Asia/Shanghai）执行完整入口：glm-4.7-flashx、官方Responses端点、直接网络、128输出上限。首个文本请求返回实际inputTotal=20、outputTotal=128、reasoningSubset=128、inputCachedSubset=2，OUTPUT_LIMIT_REACHED；请求总数1，后五阶段未运行。回执保存于[api-live-user-truncated-2026-10-04.json](api-live-user-truncated-2026-10-04.json)。模型处理已发生，验收失败；不是此次overloaded，也不是未发请求。缓存和思考是子集，不重复加账；本脚本未核对原账本，不能据此确认具体金额。

本次源码adapter SHA256 a6f36cbf7f80cb5a61323cb65ade0bd685d7106cf46d09ff670d699198288989、运行bundle SHA256 3c75c09070f1d09ef71c88271526c9dca1059246969f7d2bc13d9bfd9771af7c，与上一工程报告一致。适配器按此配置会发送reasoning.effort=none；与基础probe相比，完整入口更换了固定系统/用户测试提示、输出预算为128而非32。真实失败报告尚未采集发送字段，不能把离线预测冒充实际网络记录，也不能用先前一次基础通过证明none总能生效。

2026-10-04再次只读智谱公开官方[Responses指南](https://docs.bigmodel.cn/cn/guide/develop/responses/introduction)及[创建接口](https://docs.bigmodel.cn/api-reference/response/创建-response)：仍定义none/minimal放弃思考，max_output_tokens包括回答和思考。普通web读取失败后用公开Markdown GET核对；只访问文档，无Key和模型请求。实际模型行为与关闭预期不一致，待补发送摘要后区分TapKit路径与上游参数执行/用量标注问题，暂不增加预算或猜测额外字段。

新增诊断只修改验收脚本：auditedApiFetch在正式fetch边界记录白名单参数（none、128、stream、配置匹配、输入形状、工具数、HTTP状态），不读取/记录请求头、Key、提示正文、工具参数或native。包装器原样传给secureApiFetch，不改payload。--text-only固定同一首轮输入和128预算，只发送一次；成功也不冒充完整验收，fullAcceptancePassed=false。文本未通过不发后续阶段，无自动重试或fallback。

CLI现正常传播退出码1/2，不因预期验收失败再抛Node的powershell.exe exited堆栈。pnpm.ps1仅对带--account的API live保留退出码并显示报告提示；其他检查/Codex行为保持。离线fixture验证失败报告和非零退出码均保留，不将失败改成成功。检查/源码摘要见[api-live-diagnostic-results.json](api-live-diagnostic-results.json)，对应diagnostic日志。

用户下一次只运行下面命令一次，隐藏输入智谱Key后回传最后JSON中的requestAudit和checks；不用增加预算，不测试Codex，不连续重跑：

```powershell
Set-Location D:\TapKit
$env:TAPKIT_LIVE_DATA_DIR = 'D:\TapKit\.test-data\P01-02-live-zhipu'
$env:TAPKIT_API_LIVE = '1'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\pnpm.ps1 test:live -- --provider openai-compatible --account '智谱 Responses 测试 3' --text-only
```

若requestAudit显示none/128且仍128思考，优先形成智谱Responses关闭思考不符合预期的可提交证据，不反复加预算；可由用户查该时间/模型的供应商调用详情核对。若摘要没有none则修TapKit发送路径。成功也只算文本对照，完整五阶段仍未验收。agent本轮真人请求0，不读Key/vault或Codex账户、不启动Electron或改用户配置；P01-02=in_progress、P01-gate=failed，未提交推送。
