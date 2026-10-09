# Responses单请求对照结果：none已设置，仍全思考截断

2026-10-04 20:30更新：用户要求停止其本机后续测试，下面原Chat验收命令已撤回、不需要执行，Chat完整live未运行。其他开发者按[最新交接](handoff-2026-10-04.md)在自己的隔离环境接手；本文保留20:20诊断结论和此前步骤作为历史。

用户于2026-10-04 20:20:33（Asia/Shanghai）回传新版text-only结果：[安全回执](responses-none-observed-2026-10-04.json)。发送边界摘要明确reasoningEffort=none、maxOutputTokens=128、stream=true、model/endpoint匹配、message.content.string、store=false、HTTP200；只有1个请求，无自动重试，原profile未修改。返回实际input20/output128/reasoning128/cache2，OUTPUT_LIMIT_REACHED，后五项未运行，完整验收未通过。

核对源码及运行bundle与api-live-diagnostic-results.json记录一致；secureApiFetch直接req.end(init.body)，没有二次改写JSON。因此本次可以排除TapKit漏发none和旧构建遗漏，但不能由参数设置证明上游已关闭思考。实际行为指向智谱Responses对此模型的参数处理或usage标注；内部根因仍需供应商确认。不是本次overloaded，不靠重试/加预算解决参数语义问题。thinkingType=null只表示没有添加Chat专用参数，不能单独据此判为TapKit缺陷。

CLI只保留预期失败退出码1及报告提示，用户回执没有此前Node/PowerShell异常堆栈；退出码非零是验收失败，不是另一笔API调用。本轮不修改源码、预算或账户/代理/DNS配置，不读取Key/vault/Codex账户，不启动Electron，也不代发真人模型请求。

已准备[官方支持材料](zhipu-responses-support-2026-10-04.md)，尚未发送。所引用官方文档按上一轮公开GET核对；本轮web工具仍不能获取，未用失败读取伪造新内容。材料含公开固定复现提示和白名单统计，不含Key/推理/私人内容。此Responses组合暂停重复真人测试；其他账户不被清除或改状态。

下一步以已有稳定Chat账户补完整API验收，保持最多6请求、每次128、首次失败停止，Key仍由用户在本机隐藏输入，不使用Codex：

```powershell
Set-Location D:\TapKit
$env:TAPKIT_LIVE_DATA_DIR = 'D:\TapKit\.test-data\P01-02-live-zhipu'
$env:TAPKIT_API_LIVE = '1'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\pnpm.ps1 test:live -- --provider openai-compatible --account '智谱 Chat 测试 2'
```

该验证针对Chat的文本、native/canonical两轮、echo提议及结果、取消。Chat成功不自动代表Responses通过，也不核对原应用账本；独立脚本ledgerVerified=false保持。用户完成后回传安全JSON，若失败则保存首次失败，不连续重跑。真人Chat结果待补，P01-02=in_progress/P01-gate=failed保持。检查本轮仅docs:check/diff；上一代码检查点unit167/integration76/check/API bundle=0为历史，不冒充本轮重跑。
