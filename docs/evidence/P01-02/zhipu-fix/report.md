# P01-02 智谱兼容与连接诊断修复

本报告为前次源码及验收快照。最新字段补充、unit147/integration68和修复后仍截断见responses-repair-2026-10-04.md、responses-results.json与handoff-2026-10-04.md；历史未提交/待反馈不代表当前交接状态。

日期：2026-10-04（Asia/Shanghai）。用户授权从main新建分支实现并测试；D:/TapKit / codex/fix-zhipu-api-probe / 基线2e785316b74b3dbdb38ae68990e07652dbadbd56 + working-tree。原有诊断文档改动保留；未提交或push。

## 问题证据与界限

用户自行关闭TUN，并执行同一独立非流式文本请求：默认思考、max_tokens=64时HTTP200/hasText=false/finishReason=length；仅加入thinking.type=disabled后HTTP200/hasText=true/finishReason=stop。这里不保存截图中的responseId或私有正文。这证明关闭思考的基础文本请求可用，不能证明TapKit流式/工具路径通过，也不能还原此前未保存业务码的HTTP429。

原Fake-IP无Key预检为修复前历史，见../zhipu-preflight-2026-10-04.md。没有修改用户DNS、代理、TUN或账户配置，没有读取/解密真实Key或代发真实模型请求。测试仅使用独立fixture profile和假Key。

## 修复结果

- 仅官方标准Chat端点 https://open.bigmodel.cn/api/paas/v4（允许尾斜杠）、openai-compatible/openai-chat、glm-4.7-flash且reasoning=off时发送thinking.type=disabled。模型匹配大小写不敏感，实际发送保留原ID。其他模型/端口/网关/Coding Plan/协议不附加该扩展，非off档仍不开放。
- text32/echo128输出预算与120秒总限时保持；length返回OUTPUT_LIMIT_REACHED/output_truncated，文本截断不会继续发工具请求；已完成却无正文返回PROVIDER_UNAVAILABLE/empty_text。部分输出不标ready，无自动重试或扩预算。
- 官方业务错误转换并保留安全code，例如1113→QUOTA_EXHAUSTED、1302→RATE_LIMITED、1305→PROVIDER_UNAVAILABLE、1311→PERMISSION_DENIED；未知429不猜原因。数字code规范化，UI显示检测阶段、真实HTTP错误状态和服务码，不转发原始message/body/推理。
- API_ADAPTER_VERSION=2；新增共享错误/诊断枚举，规范和ADR0016同步。无依赖/DB迁移；生产传输DNS固定公网IP、TLS、不重定向、Key目的地绑定规则保持。

## 实际检查

所有pnpm命令通过锁定运行时及powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\pnpm.ps1运行；只影响该进程，不修改系统ExecutionPolicy。

| 命令 | 退出码/结果 | 日志 |
| --- | --- | --- |
| pnpm build:desktop | 0，Storage/Core/Electron主进程、preload及Renderer | build-desktop-final.log |
| pnpm check | 0，根目录和Renderer类型检查、eslint、格式、边界及清单 | check-verified.log |
| pnpm test:unit | 0，15文件133/133 | unit-final.log |
| pnpm test:integration P01-02 P01-01 P01-03 | 0，7文件67/67 | integration-verified.log |
| pnpm test:e2e -- --grep P01-02 | 0，实际Electron2/2 | e2e-user.log |
| pnpm docs:check | 0，37项任务状态与需求证据路径 | docs-check-final.log |
| git diff --check / 最终改动文件格式检查 | 0 / 0 | diff-check.log / format-final.log |

新增unit验证默认思考回归、端点/模型负例、文本与工具截断、空正文、数字业务码/Retry-After/恶意code过滤和不泄漏私有推理。integration经真实本地mock HTTP、Core、SQLite验证ready/quota/truncated持久状态；公网生产传输没有改成loopback。E2E原有DPAPI保存/重启/清除用例保留，新用例使用测试侧IPC诊断回执验证实际preload和UI，后端准确性由前两层覆盖；这是fixture，未连接真实智谱。

桌面业务码与760px截断页面已查看，无横向溢出；PRIVATE_VISUAL_ARCHIVE.md、PRIVATE_VISUAL_ARCHIVE.md。截图中的HTTP200截断是测试回执示例；生产本地截断诊断不凭空补HTTP状态。

初次integration退出1（66/67）：测试把公共目录的documented错当底层failed；修正断言后验证SQL failed与公开documented均符合现有约定。初次E2E退出1：聚合契约导入触发Node JSON import attribute要求；测试改用协议模块导入。受限上下文E2E两项在启动阶段失败，当前用户上下文保持Chromium沙盒重验2/2通过。受限check扫描旧测试ACL目录EPERM；当前用户上下文重验发现既有RESOURCES格式警告，格式修正后最终check=0。原失败日志保留，没有关闭沙盒、放宽ACL或修改检查脚本。

本次受影响桌面完整构建已跑；未重跑未改动Rust helper，不把历史pnpm build结果算作本次结果。首次docs:check在收口报告创建前因缺results.json退出1；创建后重验退出0。检查实际命令/结果以及源码SHA256见results.json。

## 真实检测交接

已请用户关闭旧TapKit，在PowerShell中设置进程级TAPKIT_DATA_DIR为D:/TapKit/.test-data/P01-02-live-zhipu，再运行Start-TapKit.cmd，仅点击小写glm-4.7-flash账户检测一次，反馈通过或错误码/阶段/HTTP/业务码；不改现有网络模式，不重复点击，不发送Key。

后续先收到新版TapKit反馈PERMISSION_DENIED，Fake-IP无Key预检HTTP0及Meta接口观察见permission-denied-2026-10-04.md/json。用户清DNS后，最新Node也解析为公网39.108.102.11/39.108.52.113；真人检测截图为文本阶段HTTP429/1305/PROVIDER_UNAVAILABLE，11:18:02只读数据库公共状态一致。官方1305为模型访问量过大，当前映射正确；没有成功生成或进入工具检测，先保持配置稍后单次复测。详见model-busy-1305-2026-10-04.md/json。本次没有代发模型请求、读Key或改代码/用户配置。R13 configured，P01-02 implemented_not_live_verified，P01-gate engineering_passed_external_pending。真实流式/echo及完整两轮、取消、usage待验收，R02-R05/R14 pending和P00-gate failed保持，未启动P02。
