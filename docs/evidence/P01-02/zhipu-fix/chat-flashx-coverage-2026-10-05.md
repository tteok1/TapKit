# Chat FlashX关闭思考映射交付

2026-10-05（Asia/Shanghai）；任务P01-02。用户明确要求覆盖glm-4.7-flashx。D:/tapkit/TapKit，codex/fix-zhipu-api-probe，HEAD b92eece52e88eb6bd16931cd6ed942bb91d4d1f6 + working-tree；本轮没有提交或推送。

## 实现

packages/providers/src/api/adapter.ts的官方标准Chat非思考模型白名单从仅glm-4.7-flash扩到glm-4.7-flash与glm-4.7-flashx。reasoning=off时发送thinking.type=disabled；文本/工具检测和正常adapter请求共享映射。保持精确provider/format/HTTPS origin/path、大小写识别但发送原ID；Responses的none、Messages、其他模型、Coding Plan和网关范围不变。检测预算仍32/128、无自动重试，没有schema/依赖/账户配置变更，沿用未发布tapkit-api/2。

tests/unit/P01-02.zhipu.test.ts扩充FlashX大小写/尾斜杠与两阶段参数、预算、端点负例、未实现思考档、文本及工具截断/无重试/隐私断言；移除已不成立的“官方FlashX Chat无任何扩展”负例（现在由Chat正例覆盖）。tests/integration/P01-02.zhipu.test.ts增加FlashX Chat，复用本地HTTP+Core状态持久化、额度/截断失败分支及请求预算断言。以上是编写的回归用例，**本次没有执行**，不记录新通过数量。

ADR0016、06-model-adapters、P01-02规格、当前进度/需求追踪和原交接同步范围变化。依据是此前本会话重新读取的官方4.7/FlashX及思考模式文档，链接见ADR；不会将官方语义或构建成功当作真人验收通过。

## 实际检查

| 命令/检查 | 结果 | 证据 |
| --- | --- | --- |
| scripts/pnpm.ps1 exec prettier --write（仅adapter和两个回归文件） | 退出0 | 工具输出，源码格式化 |
| scripts/pnpm.ps1 check（沙盒） | 退出1；TS和ESLint之前步骤未报告代码错误，Prettier枚举已忽略secrets目录EPERM | chat-flashx-check-2026-10-05.log |
| scripts/pnpm.ps1 check（当前用户上下文） | 退出0，类型/格式/依赖边界/清单通过；未改ACL | chat-flashx-check-user-2026-10-05.log |
| scripts/pnpm.ps1 build:desktop | 退出0；依赖注释位置警告非失败 | chat-flashx-build-2026-10-05.log |
| Core产物范围核对 | index.cjs包含官方Chat两个模型及disabled字段 | 构建后rg实际输出及results.json指纹 |
| scripts/pnpm.ps1 docs:check | 退出0，37任务状态/交接/需求证据路径检查通过 | chat-flashx-docs-2026-10-05.log |
| git diff --check | 退出0（源码检查点和文档同步后均通过） | 实际工具输出 |

所有pnpm入口使用项目scripts/pnpm.ps1、锁定Node v24.21.0；进程级ExecutionPolicy Bypass不改系统策略。check的当前用户重跑经自动审批允许，目的仅消除沙盒目录枚举权限差异，忽略规则未变、未读取Key内容。

编译产物包括新映射；开发watcher可能自动刷新，应以实际运行实例为准。没有由agent主动运行dev、启动Electron或点击检测；用户若自行重启，启动命令见Start-TapKit.cmd。未改网络/账户/Key，不读取vault/Codex，不做模型请求。

## 未完成验证与交接

用户之前要求后续测试不在其本机继续，本轮仅授权覆盖模型；因此未运行unit/integration/e2e/live，也未进行修复前红测。已完成源码及静态/构建检查，回归实际执行及FlashX Chat真人结果待补，P01-02=in_progress/P01-gate=failed保持。既有unit167/integration76是旧代码历史记录，不用于验证当前修复。接手者在授权环境执行相关zhipu unit/integration和真人有界检测。

本次关闭字段映射不能证明供应商实际执行成功，更不能确认01:27 NETWORK_ERROR、解决Responses none异常、系统代理/Fake-IP或完整P01验收。保留此前诊断和原三个P00-03未跟踪日志，不覆盖或清理工作区。
