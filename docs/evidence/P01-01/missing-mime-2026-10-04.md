# P01-01 真实连接误报修复

2026-10-04（Asia/Shanghai），D:/tapkit/TapKit，codex/p01-01，HEAD3840347+working-tree；未提交/推送。

用户显式代理后仍收到HTTP200/unexpected_content_type。对用户一直使用的独立TapKit测试profile执行固定文本诊断，确认contentType=missing、bodyKind=sse；因此先前“收到网关或代理页面”提示不代表实际正文类型。响应头省略由上游还是代理造成尚未区分。

修复缺失响应头时的有界SSE事件验证后，发现完整终结事件之后仍误报unterminated_sse。临时有限诊断显示terminal=true、residualLength=0；原因是pi终结后取消reader，正在等待的read随取消返回done，TapKit再close已取消controller产生异常。规范化流现在记录取消并停止后续操作。该临时生产日志已经移除。

修复后真实固定文本finished=true；再运行同一checkConnection文本与echo提议，返回ready/text=true/tools=true/errorCode=null。两次响应均HTTP200、缺响应类型、完整SSE与终结事件；见response-inspect-text-passed.log与response-inspect-live.log。首次缺响应头失败、兼容中间检查和取消竞争定位分别保留在response-inspect-before/intermediate/structure/cancel-race.log。全部为固定枚举、数量和布尔值，无响应正文、token、完整headers、URL、原生状态或私人内容。

共7次固定模型请求（5次文本诊断、最终checkConnection的文本与echo提议2次）。最初两次初始化失败在请求前结束，不计模型调用。只读原TapKit SQLite及凭据，拒绝临近到期凭据，未强制刷新、注销或执行echo工具。不是读取Codex等其他产品账号。隔离Electron Host先设当前用户专属ACL，仅复制原Local State里的DPAPI封装encrypted_key，退出后删除该临时Host；原Local State、数据库和账户无诊断写入。

实现和异常分支：明确其他MIME仍拒绝；仅缺失MIME允许首个有效事件前64Ki字符的严格SSE字段/JSON/response.*事件验证；HTML、普通JSON、过大前缀、不完整帧及真实无终结事件仍失败。单元覆盖中文逐字节拆包、非SSE内容、前缀限制、真实EOF与终结后pending read取消；真实pi集成覆盖文本/工具无响应头，Electron utilityProcess验证编译Core同路径。

实际命令均由powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/pnpm.ps1调用，不修改系统执行策略：

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| pnpm build | 退出0 | missing-mime-build.log |
| pnpm test:unit | 46/46，退出0 | missing-mime-unit.log |
| pnpm test:integration P01-01 P00-02.storage | 65/65，退出0 | missing-mime-integration.log |
| pnpm test:e2e -- --grep P01-01 | 7/7，退出0 | missing-mime-electron.log |
| pnpm exec vite build --config tests/live/diagnostic.vite.config.ts | 退出0 | missing-mime-runner-build.log |
| 固定只读真实文本/echo检测 | ready，退出0 | response-inspect-live.log |

Electron回归在实际桌面用户环境执行，测试使用独立mock profile，不停止用户实例。默认执行沙箱的第一次check在Prettier枚举旧.test-data凭据目录时EPERM（已有当前用户专属ACL），不是源码检查失败；保留missing-mime-check-sandbox.log。最终check/docs:check/diff检查及源文件SHA256以missing-mime-results.json为准。

用户重启步骤：从托盘明确退出TapKit（关窗口仍会保留旧Core），保留原TAPKIT_DATA_DIR，设置TAPKIT_HTTP_PROXY=http://127.0.0.1:7688，通过进程级ExecutionPolicy Bypass运行pnpm.ps1 dev。现有登录保留；若自行注销，活动账户行会移除，旧无凭据记录有“清除账户记录”按钮。

任务仍in_progress，R01 configured：真实Luna文本与工具提议已验证，完整两轮原生连续性、真实重启刷新/注销未执行。避免对用户正在使用的账户运行末尾注销的完整live脚本。P00-gate仍failed，不启用隔离/工具执行，不推进P01-02/P01-03，不写P01-gate。先前logout-proxy/diagnostic/repair证据保持历史快照。
