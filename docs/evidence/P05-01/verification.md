# P05-01 验证与限制

源码基点 ad85bc467c921f4c44ad26fc0c1bba25269153cb，分支 codex/p05-chat-m1，dirty；锁定 Node24.21.0/pnpm12.4.1、Windows x64。初始工作区干净；未提交/推送，不使用原用户 profile 或真实模型。

## 冻结源码批次

[run-01/results.json](acceptance-2026-10-26/run-01/results.json) 逐命令记录真实退出码和 UTC 起止；[sources.json](acceptance-2026-10-26/run-01/sources.json) 记录产品输入哈希，批次前后相同。2026-10-26 23:46—23:49 Asia/Shanghai：

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| pnpm check | exit0，类型/格式/依赖/边界/E2E收集 | run-01/check.log |
| pnpm test:unit P05-01 P01-01.transport P01-02.transport | exit0，32/32（P05自身6项） | run-01/test-unit.log |
| pnpm test:integration P05-01 | exit0，8/8 | run-01/test-integration.log |
| pnpm test:e2e -- --grep P05-01 | exit0，3/3；结束恢复生产构建 | run-01/test-e2e.log |

此前相关 P04-01/P05-01 unit7、integration17 分轮通过，文件/网页共享结论校验的既有检索回归未放宽；见 earlier 日志。

## 覆盖与证据边界

- T09：无Key与空结果；Tavily字段与 query 隐私；mock搜索→3份正文→固定引用→项目资料；快照重读/离线/GC保护；长正文模型20k/归档全文；网页引用材料。
- T19：混合/私网IPv4/IPv6、URL别名与DNS取消；真实本地HTTP代理测试固定CONNECT地址、Host/path/query、跳转到私网、跳转次数、过滤、压缩/大小拒绝及传输取消；exe MIME/CAPTCHA/登录失败；伪造来源、错误数字/引号/无引用结论；项目限定、设置变更、迟到结果与临时内存。
- Chromium 使用真实 Electron WebContentsView/session；独立 harness 对合成公开协议响应验证 Node/IPC 不存在，设备权限/POST/私网/弹窗拒绝、强制代理和非持久partition。该 harness 不代表真实 Tavily 或任意网站均可读取，见 browser/isolation.json。
- 桌面验证实际聊天调用只读工具，点击已核验引用，归档面板及刷新恢复，off/未配置/CAPTCHA。desktop 中浅深/960/200截图首轮自动断言通过，但视觉发现截图早于原生缩放重排，已收紧视口和关闭按钮完整边界断言，desktop-v2 补验结果另记；旧截图不作为200%视觉通过证据。

## 失败与修正

初始默认工具链低于仓库要求，被 engine 拒绝；改用 scripts/pnpm.ps1 的锁定工具链。integration 首轮夹具 createRun 未在事务中发事件，4项失败，修正准备后通过。真实传输发现 Node 自动代理的 Host authority 约束，改显式 CONNECT 核验地址，未放宽 TLS/DNS/权限。共享 IPv6 校验补保留 zone-id 拒绝分支。check 首轮格式、次轮 parse5 依赖基线遗漏均保留日志，修正后完整 check 退出0。

## 外部资源

200%补验结论：使用应用正式 desktop.zoom=2、等待主题/视口就绪并由 BrowserWindow.capturePage 取原生图，定向 `pnpm test:e2e -- --grep 'P05-01 T09'` 1/1通过、命令正常结束并恢复生产构建。desktop-v3/bounds-200.json 为961×721逻辑视口（Windows取整1px），关闭按钮x663—875/y186—262.8，全部位于视口内；浅深/960/200原生图核对正常。早两批原生浏览器zoom/CDP截图保留但不作为200%通过证据。最终补验未改产品源码，仅修正测试准备和截图方法。

R06 pending：没有执行真实 Tavily 搜索→原文→引用验收；真实搜索不能记通过。R01—R05 仍按用户既有决定暂缓完整真实模型验收。工程实现与这些 live 缺口分开；P00—P04 gate 不由本任务提升。浏览器交互、网站登录、工作执行和服务器分享仍延期。
