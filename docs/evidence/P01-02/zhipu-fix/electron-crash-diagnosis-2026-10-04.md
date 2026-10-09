# Electron 弹窗只读诊断

日期：2026-10-04，Asia/Shanghai；分支codex/fix-zhipu-api-probe，HEAD2e78531+working-tree。用户反馈开发期间再次出现TapKit: electron.exe应用程序错误，0x80000003、地址0x00007FF61415D9C9，明确要求先定位、不修复。

## 当前结论

已确认一轮受限执行上下文中的Electron界面启动失败，与本次开发时段一致；弹窗没有进程ID/堆栈，尚不能将它唯一绑定到某个测试或原应用进程。启动上下文差异是排查线索，不能直接当根因。没有证据表明智谱HTTP错误、账户配置或新的thinking字段触发了这两次启动失败。

0x80000003对应STATUS_BREAKPOINT，指原生断点异常，内部断言等也可能触发；仅凭错误地址不能定位源码函数。[Microsoft异常码说明](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/bug-check-0x3b--system-service-exception)。这不是在诊断蓝屏，仅引用该文档的异常码定义。

## 已核对的证据

- e2e-final.log：10:48:34和10:48:36创建两个独立fixture profile；两项分别约697ms/518ms报Target crashed，清理阶段另有45000ms超时，最终退出1。不是业务断言已完成后的失败。
- 失败profile为P01-02-electron-rb01SM、P01-02-diagnostic-ui-GbHPF6：均有app.sqlite，无logs/ipc.jsonl。说明存储初始化已发生，但没有记录到界面IPC业务命令；不能说整个Core都未启动。
- e2e-user.log：当前用户上下文重跑同标签两项，10:50:15/10:50:20创建新fixture profile，8.2秒内2/2通过、退出0；保存/重启/清除及新诊断UI断言完成。测试没有调用真实模型。
- Windows Application的1000/1001、CodeIntegrity/Operational及Security-Mitigations/UserMode：查询10:45—11:03未发现匹配记录（当前用户上下文核对，返回NoMatchingEventsFound），不是权限拒绝。不能将“没有记录”解释为“没有崩溃”。
- Security-Mitigations/KernelMode同段有5条事件10：两个原dev profile在10:49:39，三个成功测试renderer在10:50:15/18/20；内容是阻止Win32k.sys系统调用。由于成功测试的renderer也有同类事件，该记录本身不能建立崩溃因果关系，更不能当作SAC拦截证明。
- 只读进程快照：仍有两组原dev watcher的Electron主进程（PID476/48784）及GPU/utility子进程；分别对应既有P01-02-live-zhipu和development profile。其watcher在08:53和09:37已启动，不是10:48的独立测试profile。没有观察到这两组renderer，主进程窗口标题为空；现有主程序关闭窗口后保留托盘/Core，所以这不单独证明原窗口崩溃。未终止这些进程。
- 历史windows-local-audit-2026-10-03.json已记录同类0x80000003反馈，发生在本次智谱改动前；本次不是新出现的异常类型，但不保证每次是相同根因。

## 影响与无法下结论的部分

实证影响：该轮两项桌面测试无效，测试清理等待超时，需要单独保留失败记录。后续通过只证明另一次启动条件下用例成功，不能覆盖或关闭本机启动稳定性问题。新智谱参数及业务诊断本地unit/integration证据仍有效；真实智谱验证依旧待补。

未发现用户账户被该轮测试修改的证据：测试使用独立目录，失败profile无业务IPC日志。用户回复原窗口状态“当时没注意”，因此原应用是否白屏/失去响应、进行中的操作是否中断无法从当时观察补证；不能仅从截图或存活主进程推断，本次不要求复现。没有执行用户数据库完整性检查，因此不声称已排除所有数据损坏。

项目现有main未注册render-process-gone/child-process-gone诊断，也未启动crashReporter；当前保存日志只有Target crashed，没有故障模块、原生栈或弹窗进程ID，未取得可用转储用于定位。[Electron崩溃诊断说明](https://www.electronjs.org/docs/latest/tutorial/crash-reporting)。更深入定位需要匹配进程角色、退出原因和脱敏原生栈；本次不加诊断代码、不启用转储、不改变系统安全配置或重启复现。

## 本次动作边界

只读取指定日志、相关进程角色/父进程、测试目录文件存在性、现有代码和官方文档；受限上下文无法读取CIM时转到当前用户上下文只读查询。没有读取真实Key或内存转储，没有真实模型请求，没有启动/关闭Electron，没有修改源码、测试脚本、依赖、用户配置或系统策略。仅新增本报告并同步进度。保持P01-02 implemented_not_live_verified、阶段engineering_passed_external_pending；本机启动稳定性问题未解决。
