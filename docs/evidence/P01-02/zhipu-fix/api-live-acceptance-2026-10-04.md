# P01-02 API完整验收入口与重试分类补齐

用户要求继续下一步开发，先完成代码，需要配合时再提供明确步骤。本次补API完整验收入口和已观察的HTTP200/overloaded重试分类，未继续P02、系统代理/Fake-IP兼容或Codex登录问题。设计见[ADR0017](../../../adr/0017-bounded-api-live-acceptance.md)。

新增scripts/api-live.mjs、api-live-key.ps1和tests/live/P01-02.*、api.vite.config.ts。复用正式API适配器，覆盖三个协议/六个API provider的单账户入口；只读隔离profile中的API公开配置，用户本机隐藏输入Key，经stdin传递。配置摘要防止预检后账户/端点变更。无Electron启动、vault读取、账户/网络配置改动或真人请求；只查询既有FlashX Responses账户标签，未查询Codex账户。

测试范围包含六阶段、失败立即停止、native与canonical回传、完整工具闭环、首段正文后取消、未知usage和隐私边界；三协议通过真实本地HTTP服务器与正式adapter验证。正常routing的overloaded恢复/持续繁忙/部分正文分别验证1次重试成功/最多2次重试/不重试；已有连接检测单次失败回归保留。完整结果、命令/退出码及源码摘要见[api-live-results.json](api-live-results.json)，日志api-live-unit.log、api-live-integration.log、api-live-check.log、api-live-build.log、api-live-bundle.log、api-live-offline-cli.log。

离线CLI还核对公开profile预检、配置变化前置拒绝、Windows PowerShell5.1安全输入的fixture传递和中文参数，所有fixture无真实网络。测试辅助文件在忽略的.test-data，正式入口/测试均可重新运行。仅内存native不验证磁盘加密，独立脚本不记入原应用账本，报告固定ledgerVerified=false。

## 用户下一次配合

在普通PowerShell运行以下命令；测试profile和账户沿用已通过的FlashX Responses测试3，不需重启TapKit。停止其他连接测试，保证这一轮只运行一次。脚本会在本机提示隐藏输入此智谱账户的API Key，不要把Key发送给Codex。

```powershell
Set-Location D:\TapKit
$env:TAPKIT_LIVE_DATA_DIR = 'D:\TapKit\.test-data\P01-02-live-zhipu'
$env:TAPKIT_API_LIVE = '1'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\pnpm.ps1 test:live -- --provider openai-compatible --account '智谱 Responses 测试 3'
```

每次最多6个请求，每请求最大输出128 Token（合计请求预算768，输入和取消期间供应商用量另计），出现失败立即停止，不自动重试。将最后的JSON或生成的connection-report.json回传即可；其中只有公开配置、状态和用量。若繁忙或截断，先保留结果，不连续重复运行。Chat/Messages和Codex本轮无需再测。

可在不输入Key、不发模型请求的情况下检查入口：同一命令尾部加`--prepare-only`。它只构建及读取公开配置。原四API资源R02-R05、三协议完整真人验收、实际usage/账本、系统代理/Fake-IP兼容和Codex登录问题仍未收口，因此P01-02仍in_progress、P01-gate仍failed。未提交/推送本轮修改。
