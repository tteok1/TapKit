# P05 托管搜索改造交付

2026-10-27；D:/Tapkit-public；codex/p05-chat-m1；ad85bc4 + 未提交工作树。先完成17-hosted-web-search/ADR0066与原规格修改，再实施代码、自动验收及新开发包。无commit/push/merge，不进入P06。

## 检查与真实服务

- hostedModel-run-01：check、unit385、P01 integration84、模型设置及连续链路两个Electron均exit0，sourcesUnchanged=true。
- hostedFinish-run-01：check/P05 integration24 exit0；8项Electron中7过、连续链路助手数量断言失败。后者改为核验单次用户发送、最终正文和completed，11步完整路径在hostedModel-run-01通过。8个不同Electron分轮通过，不称某轮全绿。
- hosted-run-01首轮check/build/unit385/P01 integration84通过；新增账本测试错误后停止。失败及后续修正均保留，不计为整体通过。首轮P01日志在test-integration-P01.log单独保留，避免旧runner重用日志名覆盖。
- hosted-input-audit.json：当前输入与pack开始一致，最近385单元/P01回归后产品源无变化。P05后置变化仅共享Codex冷目录元数据及测试定位，已做相关模型/连续链路复验。
- 真实Codex：先2次再追加2次授权，实际3次请求（连接失败、400/model_not_found、gpt-6.1-sol/low的200成功），余1次未用。实际搜索及三页来源、Core归档/三条引用/断网回看通过。分段联验范围、用量和失败见P05-01/hosted-verification.md，不宣称真实模型自主完整聊天、完整OAuth或其他账号已验。

## 新目录包

pack-run-03：`pnpm pack:dir` exit0，sourcesUnchanged=true，实际目录：

`release/TapKit-chat-M1-2026-10-27T09-23-01-322Z`

70022个清单文件，3477016183字节载荷，621份物化依赖；manifest SHA256：`5db58c766e2790fb7376a1470c8bee57371b78e28e1c68e4d9dcd30f79c132e5`。旧03-32包保留，latest.json仅在新检查通过后更新。

hosted-package-summary.json与hosted-package/：新路径重新验22/22，无缺项，nativeExecution/officeRender/terminal均available；scope=current-user、standardUser=false，不转植旧能力报告，不代表P11标准用户安装验收。原测试配置哈希保持，无junction，实际包内无.test-data/test-results。

`node docs/evidence/P05-03/hosted-pack-smoke.mjs` exit0：使用包内Electron/Host/Core、无fixture、全新合成profile，空已连接模型目录、真实TXT解析及ZIP原字节通过；Renderer无require/process。对话框选择由测试提供合成路径，实际保存与解析由产品执行，不宣称人工OS对话框操作。回执hosted-pack-smoke.json，图hosted-pack-launched.png。

## 原资料启动与边界

本机外置`release/Start-TapKit-original-data.cmd`（同名ps1）从latest.json选择已验包，并显式指向已确认的原人工验证资料目录；不扫描、不复制、不迁移账号、聊天或密钥，启动器不随通用包分发。`powershell -NoProfile -File release/Start-TapKit-original-data.ps1 -CheckOnly` exit0：原DB存在，指向新09-23包，applicationStarted=false，networkRequests=0/modelRequests=0；见hosted-original-launcher.json。沙箱PowerShell策略首次拒绝后，仅在已授权宿主正常权限执行该只读检查，未改变系统策略。

用户需正常退出使用同一资料目录的旧TapKit实例后再运行本机入口。通用包Start-TapKit.cmd仍使用AppData；两者资料目录不同，不能用空白新目录推断原数据丢失。旧实例和原资料保持，未为验收启动原资料或自动关闭原窗口。

P05-01/P05-03 implemented_not_live_verified，P05-02 implemented_and_verified，gate=engineering_passed_external_pending。R06仅Codex/gpt-6.1-sol隔离搜索与来源链通过；Responses/Anthropic真实账号及原R01—R05完整live保持待验/暂缓。当前不需要新增必需人工测试；用户可按需体验界面，不能将体验替代缺资源的live。
