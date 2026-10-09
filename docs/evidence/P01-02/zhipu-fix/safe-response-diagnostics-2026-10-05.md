# P01-02 安全响应诊断补充

2026-10-05，用户要求“进一步补充安全诊断”。当前目录D:/tapkit/TapKit，分支codex/fix-zhipu-api-probe，HEAD b92eece52e88eb6bd16931cd6ed942bb91d4d1f6加工作区改动；未提交、未推送。此前Chat FlashX映射改动保留，P00-03既有日志未改。

## 实现与可判断范围

- contracts新增可选responseType固定枚举：event-stream/json/html/other/missing。HTTP状态仍为受限整数，旧调用方可省略新增字段，IPC版本及数据库结构保持。
- adapter收到响应后只捕获实际状态和类型分类，流错误经连接检测返回文本或工具阶段。响应前错误不编造HTTP事实；正常finish后由检测规则生成的截断/无正文失败不补造HTTP字段，没有新增原始错误message或堆栈。
- Content-Type只归一化为固定枚举，不透传原始MIME、参数、其他头或正文。HTTP成功分支的明确非SSE在读取正文前取消，取消异常不覆盖格式错误；非2xx保持既有最多64KiB业务码解析。缺失头继续执行原SSE格式与终止验证。
- 界面显示例如`[HTTP 200] [响应类型 JSON]`，此为示例，不是对用户02:05:20请求的重新观察。旧“可能收到网关或代理页面”改为“返回内容不是事件流，请查看响应类型”。JSON仅表示声明类型，不证明有效错误对象；HTML不能证明来自代理，分类不能单独确认供应商、网关或代理根因。
- 未修改payload、32/128检测预算、重试、协议回退、DNS/公共地址/TLS限制或用户代理配置。没有新增持久化列，刷新后的旧账户last_error无法恢复该次状态/类型；需后续经用户或接手者授权的新检测才有新诊断，本轮不主动发起。

详见[ADR0018](../../../adr/0018-safe-api-response-diagnostics.md)、[此前非SSE证据](responses-content-type-2026-10-05.md)。新增源码及Core指纹记录在[结果](safe-response-diagnostics-results-2026-10-05.json)，旧Chat覆盖结果中的哈希为上一快照。

## 验证与边界

实际命令均由`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\pnpm.ps1`调用：

- `exec prettier --write`仅对本轮源码、用例和ADR文件，退出0。
- `check`退出0，日志[safe-diagnostics-check-2026-10-05.log](safe-diagnostics-check-2026-10-05.log)。此前沙盒枚举被忽略的secrets目录会EPERM，因此本次直接在当前用户上下文运行静态检查；未更改ACL、忽略规则或读取该目录内容。
- `build:desktop`退出0，日志[safe-diagnostics-build-2026-10-05.log](safe-diagnostics-build-2026-10-05.log)。依赖Rollup注释位置提示为既有构建警告；Core bundle及Renderer bundle静态核对包含新增分类。
- `docs:check`退出0，日志[safe-diagnostics-docs-2026-10-05.log](safe-diagnostics-docs-2026-10-05.log)；`git diff --check`退出0。不把静态检查称为回归通过。

unit用例补三协议类型分类、实际HTTP201/202、取消异常、不读取非SSE正文、无私有头/正文标记、IPC拒绝原始MIME、工具阶段、缺失头有效/无效SSE、响应前网络失败无HTTP事实、HTTP401分类。integration扩本地HTTP+Core的Chat/Responses及Flash/FlashX JSON/HTML失败状态、诊断、安全字段和请求计数。**遵照用户本机测试暂停要求，这些新增用例未执行**；unit/integration/e2e/live均NOT RUN，无真人请求，也无匿名网络探测。

未读Key/vault/Codex账户或原生状态，未改账户/网络/代理配置，未启动Electron/dev，未复现崩溃。没有代发模型请求或对外消息。P01-02仍in_progress，P01-gate仍failed；真实Chat新映射结果、Responses具体返回来源及完整真人验收继续待补。
