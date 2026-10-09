# P00-03 fork 用例 CI 失败复核

## 2026-10-01 CI run 19：pipe 被拒绝，改用 workspace ready 文件

CI run [36751759291](private-archive:TapKit) 中，fork 子测试使用 `stdio: ['ignore','pipe','inherit']` 后第一个 `spawn` 在 AppContainer 内同步得到 `EPERM`；finished event 的 peak/total 都是 2，输出只含 `fork_attempt:0;fork_denied_sync:EPERM:after:0;`。这次失败说明自定义 stdout pipe 这条进程启动方式不适用于当前容器配置，并未测试进程数容量。

最新 fork 探针恢复为上一版在 AppContainer 中已通过的 `stdio: 'inherit'`。每个 child 在负载开始时向其当前 sandbox workspace 写入 `.fork-ready-<id>` 文件；父进程轮询该文件，确认存在后才增加 ready 数并继续 fork。基线计算、容量精确断言、额外创建尝试和 activeProcesses 清零断言均保留。本地单测/build/typecheck 通过；此机制待 Windows CI 真实验证。

## 本地最新 Windows CI：office.executablePath

run 19 的 Office 错误为 `office.executablePath`。`office.rs` 以前把 Windows helper 期望路径写成 `runtime.path.join("program/python.exe")`；该路径分隔符保留在 `PathBuf` 字符串中，跟已由 `PinnedPath` 规范成反斜杠的实际路径比较失败。修复仅将路径构造改成 `.join("program").join("python.exe")`，保持精确 executable 检查。

## 2026-10-01 CI run 18：spawn 通知不足以确认负载已启动

CI run [36748972490](private-archive:TapKit) 的 fork 事件显示 `processLimit=4`、`peakActiveProcesses=5`、`totalProcesses=5`、`status=process_limit`，结束时 `activeProcesses=0`。stdout 有三个 `fork_started` 标记，它们来自 Node 的 `spawn` 事件；此事件只说明 Node 已发起进程创建，不能证明子进程代码已开始运行。CI 因而暴露了此前测试中两个固定假设的问题：把基础进程数假设为 1，以及把 `spawn` 通知当成负载就绪。

run 18 后的测试设计曾使用 child stdout ready 通知；run 19 证明该 pipe 在 AppContainer 中触发 `EPERM`。最新实现改为上述工作区 ready 文件，其他基线、额外创建与清理断言沿用。

注意：允许 `process_limit` 的前提是子进程 ready 数严格等于测得的容量、额外 fork 确已尝试、最终 Job 已清空；仅看到 helper status 或 `spawn` 事件不算通过。新断言本机无法运行未签名 helper，将由 Windows CI 进行真实验证。

## 历史断言（被 run 18 结果推翻）

以下 run 17 后的固定 `root + 3 children` / `peak === 4` 规则不再是当前标准：run 18 显示它忽略了基础进程占用和 Node `spawn` 与 child payload ready 之间的区别。当前测试以本文顶部说明为准。

## 2026-09-30 后续复核：进程上限测试改为严格检查

`JOB_OBJECT_LIMIT_ACTIVE_PROCESS` 的定义是 Job 中同时活动进程的最大数量；若关联进程会让数量越界，Windows 会终止该进程并拒绝关联，见 [Microsoft `JOBOBJECT_BASIC_LIMIT_INFORMATION`](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_limit_information)。此前本机事件出现 `processLimit=4`、`peakActiveProcesses=5`、`totalProcesses=5`。第一版测试把 helper 观察到超限后再杀 Job 当作通过，这只能说明兜底清理发生，不能证明配置的进程上限守住。

当前 fork 测试对子进程设置 `windowsHide: true`，避免控制台辅助进程影响数量；上限为 4 时要求根进程和 3 个长期子进程占满 Job，下一次 fork 被拒绝，根进程继续运行直到测试超时，`peakActiveProcesses` 必须正好为 4，结束时 `activeProcesses=0`。过早 `EPERM`、helper 报 `process_limit` 或峰值超过 4 均失败。此严格断言尚未在当前主机执行：Windows 应用控制策略阻止新编译的 helper；需允许执行的 Windows CI/标准用户环境确认。

以下记录了第一版修复的诊断数据，保留作历史，不代表当前 fork 用例通过。

日期：2026-09-30

## CI 失败证据

用户提供的 Windows CI 事件显示 AppContainer 已启动，Job 报告进程上限为 4。fork 用例最终得到 `status=exited`、子进程退出码 1、`totalProcesses=2`、`peakActiveProcesses=2`；标准错误来自 Node `child_process.spawn()`，错误码为 `EPERM`。

测试将 `.on('error')` 直接链到 `spawn()` 返回值上。Windows 的该次拒绝在 `spawn()` 调用中同步抛出，返回值和事件监听器都没有创建；异常使 Node 根进程退出，脚本末尾的 `setInterval()` 未执行。helper 因而看到根进程提前结束。观测峰值 2/4 说明这次失败并未达到配置的 Job 进程上限；仅凭 `EPERM` 无法确定 Windows 底层拒绝来自哪一层，也不应将它直接记作 Job 上限触发。

## 修复

fork 压力脚本现在分别捕获同步抛错与异步 `error` 事件，将拒绝写入受限的 stdout 标记，并继续保持根进程运行。断言要求观察到拒绝标记，或 helper 明确检测到 `process_limit`；原来的退出状态、进程数和峰值检查仍保留。若状态意外，失败消息附上完整协议事件，供 CI 直接诊断。

## 本地验证

- `pnpm check`：退出码 0。
- 锁定 Node/pnpm 运行 `test:integration`，排除 `P00-03.account.test.ts` 与 `P00-03.office-git.test.ts`，并仅匹配 `timeout, output flood and fork limits are enforced`：退出码 0，1 项通过、36 项跳过。
- 本地 fork 事件：`status=process_limit`、`totalProcesses=5`、`peakActiveProcesses=5`；helper 走进程上限处理路径并终止 Job。完整事件附在 `native-cases.jsonl`。

本地结果不能替代最新 GitHub Actions 的确认。P00-03 保持 `in_progress`，P00-gate 保持 `failed`。
