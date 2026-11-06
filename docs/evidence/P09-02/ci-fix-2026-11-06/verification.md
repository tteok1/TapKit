# P09-02 CI84 修复与复验

- 失败提交dcdfbd213315ef88cb6926e3bb8ea9d874d6a834，run42107066983/CI84，51个Electron通过、P09-02一项失败。主job的unit/integration/perf、独立标准用户、Office和startup已通过。
- 实际失败不是测试仍在运行：P09界面显示SANDBOX_UNAVAILABLE，环境停在等待准备。主runner没有resources/runtime/capabilities.json。另一个office-native runner报告及随后标准用户副本都不在当前桌面资料/组件路径，不能补齐这个前置条件。
- 修复699055c6767b44f589f8b17ae8f988640b96b4d4：最终build之后、Electron之前，在check runner完整执行22项current-user probe，非零即停；上传报告/日志。独立standard-user步骤保持。主job总时限45→60分钟只容纳新增探测，不更改用例或应用预算/断言。
- P09 Electron在启动后直接校验Core原生与ConPTY能力，缺报告直接显示PROBE_REQUIRED，避免业务准备处等60秒。没有伪造available、复制他人报告、缓存跨机器能力或绕过安全校验。

## 本地验证

- missing-probe-reproduction.log：临时移除本机生成报告，3.5秒按预期失败，原因PROBE_REQUIRED；finally逐字恢复原报告。
- e2e-verified-probe.log：恢复真实报告后Node/Python失败→补丁→通过、ConPTY输入/停止、大输出/分页等完整链通过，退出0；原桌面截图与metrics逐字恢复，新产物另存本目录desktop。
- check.log、docs.log：退出0；未更改应用、helper或依赖，也未调用模型或供应商连接检测。
- ci84-check.log.gz按原始日志字节压缩，raw SHA及大小见ci84-log-integrity.json；失败片段、原始Playwright上下文和standard-user22/22报告保留。工具日志连接连续传输失败后，使用本仓库现有GitHub授权下载，凭据不输出/落盘/转发到签名下载主机。ZIP仅在.cache保存并按GitHub artifact digest校验。

## 远程复验

CI85/run42175765975最终失败：check集成Python旧字节码用例失败，52项Electron及其余两个job成功。既有维护文件保持，未改main、未创建PR、不扩大后续P09任务或模型实号范围。

## CI85发现的Python旧缓存与第二次修复

CI85的509unit通过；集成568通过/1失败/2显式跳过，Python等大小且同秒补丁误用旧pyc。显式固定mtime/大小并种下旧缓存的回归在旧代码失败，修复后14个P09原生用例全部通过（1个显式live跳过），check退出0。固定入口每次使用唯一只读空pycache命名空间并禁写字节码；不改源码时间戳、扩大ACL或把非零当通过，ADR0079同步。

修复64feffb推送后CI86/run42177795449三个job最终全部success。新的本地worker指纹151cc0487eb9f08e7ad1339fd7fa0051ea5e29054fd82dcf3a6cc64b7bd0b645已完成22/22真实current-user probe；生产桌面完整链e2e-pycache-final.log退出0。历史P00 journal和原桌面截图保持原字节。CI84/85旧失败及原始日志保留；最终远程结果见ci86-result.json、ci86-jobs.json和ci86-final-summary.log。

## 最终远程与交接

- CI86源64feffb2e3201281f4615ed40bfc5099fcc31c62：三个job全部success，509unit、570主集成通过/2显式跳过、52Electron、2性能；Office原生与关闭、独立标准用户和启动诊断均通过。
- 当前runner和独立medium/non-admin标准用户均真实22/22，三能力available；报告按artifact digest校验后分别保留，未复制到本机授权。最终日志按原字节压缩，完整性见ci86-log-integrity.json。
- source-manifest.json为首次本地验收快照，CI修复更改的5文件以本目录verification.json为准，其余原源码/构建及桌面证据保留；新Python worker本地指纹151cc048已重新22/22并完成生产桌面全链。
- 当前任务、需求台账与资源已同步；仅同名开发分支发布，不改main，不启动P09-03/04。模型/供应商新增调用0，原2/10余8；原维护与审计排除且保留。最终交接提交仅文档及证据并使用[skip ci]，验收源码仍为64feffb。
