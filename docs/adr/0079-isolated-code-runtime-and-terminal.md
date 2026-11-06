# ADR0079：受限代码环境、真实运行回执与ConPTY终端

日期：2026-11-06（Asia/Shanghai）。任务P09-02；状态：已采纳，实际验收范围以progress/P09-02为准。

P09-01的独立代码副本继续作为唯一写入根。终端、测试和生命周期脚本均使用既有Rust helper的独立AppContainer、零网络capability和Job。不给原目录、DATA/db、DATA/secrets或应用私有Git元数据授权，不增加服务器或任意宿主执行入口。

## 契约与账本

- schema23追加runtime_profiles；process_handles追加process_json。任务仍使用原runs状态、root预算和tool_calls/tool_call_attempts，不引入第二套任务状态。每次进程执行计工具额度；人工准备与运行也占既有根并发槽。
- RuntimeProfile保存随应用提供的精确Node/Python版本、根cwd引用、声明/依赖锁hash、实际可选命令、许可、准备状态和进度。支持npm package-lock v3及精确版本Python requirements；VCS、任意URL、未锁定依赖、源码编译或其他语言运行明确拒绝。
- exec.run只接收runtime枚举、argv数组、相对cwd与有界timeout。terminal.start/input/resize/stop与exec.poll/cancel由有限typed bridge转发；没有executable、env、绝对工作目录或通用IPC入口。
- p09-tools-1为新任务开放exec.run；旧p08-tools-2仍能调用原研究/代码工具，不因升级获得执行权限。智谱只在协议边界映射exec.run↔exec_run，恢复canonical后继续严格校验。

## 环境与依赖

DependencyBroker在可信端只解析声明/锁文件、获取固定registry的元数据与包字节、核对integrity并缓存；不运行npm/pip、仓库脚本或包代码。复用NetworkPolicyService的TLS、固定公开地址、重定向及代理约束；遵守项目隔离和会话联网开关。

npm缓存按完整性摘要准备，在AppContainer中用随附npm执行ci --offline；明确指定空user/global配置、无audit/fund/update notifier、只读缓存及固定System32/cmd.exe生命周期解释器。cmd仅作为隔离npm的子进程，不作为Host或模型的任意执行入口。项目脚本不能继承用户.npmrc、代理、凭据或HOME。npm ci由锁文件校验后运行生命周期脚本的行为见[npm官方文档](https://docs.npmjs.com/cli/commands/npm-ci/)。

Python使用已固定版本的requirements及匹配Python 3.13的wheel，所有间接依赖也需列入锁定清单；拒绝源码构建。只在沙箱中运行固定wheel安装器，检查归档路径、链接、展开大小与布局；每个环境使用独立site目录，执行入口显式加入当前副本和该环境site。PyPI解析/下载hash持久化为受控锁，不执行项目发现脚本。可重复、离线与hash约束参考[pip官方安全安装](https://pip.pypa.io/en/stable/topics/secure-installs/)及[离线安装文档](https://pip.pypa.io/en/stable/user_guide/)。

Node沿用ADR0041的preserve-symlinks/main固定加载参数，解决沙箱中模块解析向未授权盘根lstat的问题，不扩大ACL。当前Node内建测试采用显式--test-isolation=none，在同一AppContainer进程内真实运行全部匹配测试，避免默认多进程测试IPC的兼容问题。该模式的共享模块/堆状态及串行执行是已知语义，命令中明确保存；不等同减少测试或取消OS隔离。见[Node 24官方CLI](https://r2.nodejs.org/docs/latest-v24.x/api/cli.html#--test-isolationmode)。其他脚本按实际命令执行，失败或超时保持失败。

## 终端、生命周期与验证

helper按UTF-8边界流式发送受限输出，完整日志受控落盘，上限4MiB；前端每段最多64KiB并按字节游标回看。ConPTY支持有界resize/input，关闭Job并确认activeProcesses=0才结束；输出由已锁定xterm 6.0.0渲染，不执行HTML、外链、剪贴板或窗口控制。resize/关闭使用微软[ConPTY API](https://learn.microsoft.com/en-us/windows/console/creating-a-pseudoconsole-session)，持续读输出避免关闭管道死锁。

每个进程绑定helperInstance、nativeRunId、task lease、PID及Windows创建时间，保存请求argv、实际固定参数、cwd、开始/结束、退出码与logRef。重启将未完成进程置unknown，不按PID重连或重放；重新准备必须复核HEAD、源hash、依赖锁和worker hash，使用新环境身份。运行期间阻止代码补丁并在撤权/取消/租约变更时中止Job。输出、进程、内存、时间与工作区大小/条目数均有界。代码入口每200ms采样主文件流逻辑大小、深度和条目数；同时按Job I/O WriteTransferCount累计进程树写入量（包括ADS、已删文件及保守计入的管道输出），在原生结束时再核对。Core把已知回执累计到同一根的2GiB写入预算；未知写入回执拒绝盲目重跑。采样存在有界时间窗口，不宣称硬文件系统配额。原Office等非流式底座入口不附加本任务扫描策略。

工具执行完成和测试通过分开：非零退出、取消、超时、输出/工作区超限及unknown均不能通过检查；普通node -e成功也不充当测试验收。Agent使用实际项目测试/lint/build命令；最后成功检查须匹配当前副本与环境指纹，修复最多沿用工作循环的两轮限制。失败历史与原目录保持。

## 验收边界

必须取得真实Node/Python失败→修复通过、缓存离线安装、恶意postinstall、取消树、ConPTY输入/resize、日志分页与恢复不串环境的证据。原生能力指纹包含新增固定Python入口；新helper需重新探测，缺隔离验证不放行生产执行。UI继承现有工作详情与DESIGN语义令牌，独立复核按实际范围报告。无P09-03远程提交/PR、无P09-04预览，不关闭P09 gate。

## 2026-11-06：Python验证不得复用旧字节码

CI85暴露同秒且同大小补丁可能满足CPython时间戳/大小缓存校验，修复后仍加载旧sum.pyc。固定启动器现把pycache_prefix设为本次唯一argv文件旁的只读、空命名空间，并关闭写入字节码；既有项目__pycache__不参与自动运行。标准库仍来自已校验的随附运行时。每次执行重新编译项目源码，工作区/环境/退出码规则和AppContainer边界不变；worker字节变更必须重新probe。真实回归显式种下时间戳型旧缓存、同大小补丁并恢复相同mtime，要求失败→修复后通过且原目录保全。
