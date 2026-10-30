# P07 CI66 故障定位与修复

2026-10-30，用户要求检查修复CI；分支codex/p07-office，提交b9673f1f169befa5af0bdc30e68954665da4b95c。只修当前分支，不合入main、不开始P08、不增加模型请求。

## 远程事实

- CI66：[run 41032120183](https://github.com/tteok1/TapKit/actions/runs/41032120183)，失败job 123984073253。
- unit 444/444通过；integration 17失败、464通过、1跳过，9个失败文件全部P07原生任务，断言为能力status expected available、received failed，均未到达对应业务断言。摘要ci66-failure-summary.log。
- Check、perf、Build/Electron、独立标准用户隔离及Office诊断均通过；读取时startup-diagnostics仍在运行，不伪造最终结论。
- GitHub插件job日志两次Transport closed，故使用本机既有Git认证在内存中读取此公开仓库指定job日志，原始约7万行存ignored .test-data，仅保留不含凭据的失败摘要到证据。

## 根因与修复

干净checkout不含被忽略的resources/runtime/capabilities.json。bootstrap只准备运行时、构建和ABI检查，不运行runtime-probe。P07新原生测试通过readExecutionCapabilities要求真实且绑定当前源码指纹/账户身份的报告；缺报告按设计安全拒绝。本机此前实际probe已生成报告，掩盖CI缺少前置。独立标准用户kit的报告位于另一个隔离目录、时间也更晚，不能替代主runner报告。

在Check后、原生集成前新增node scripts/runtime-probe.mjs --scope=current-user，真实执行规定P00-03代表集后生成当前runner绑定能力报告，失败即阻止依赖测试。保留后续独立标准用户检查，不能把current-user误记为standard-user。上传此轮探测日志/报告便于审计；增加真实前置及新增P07原生用时后将check job上限从45调整为60分钟。未更改业务代码、门禁断言或安全策略，未注入available或复用其他机器报告。

本地已备份并临时移除生成报告，P07-01.native-candidate真实运行1/1失败，available/failed断言与CI完全一致；实际测试退出1，报告在finally恢复。见missing-report-reproduction.log，不把预期失败写成通过。文档格式和docs:check通过；真实探测、相关测试与新CI结果待实际运行后补充，P07 gate暂failed。

补充核对：CI66 startup-diagnostics最终success；失败仅check中的17项。修复后本地pnpm check退出0（673文件），check-before-push.log；当前真实runtime-probe已启动，原生报告/日志待完成，不提前计通过。提交修复后跟踪新一轮干净runner结果，保留失败CI。

## 修复后的实测检查点

- 修复提交0bdbbcab49a5dac2d880e99c53e9de8661bc8763已推origin/codex/p07-office，未合main；新CI67 [run41037299776](https://github.com/tteok1/TapKit/actions/runs/41037299776)运行中。
- 本地执行与新增CI步骤相同的node scripts/runtime-probe.mjs --scope=current-user，退出0、22/22、pending0、missingCases空；当前用户能力全部available，不冒称独立标准用户验收。证据runtime-current-user/runtime-probe.json、runtime-probe-command.log。
- pnpm test:unit P00-03.execution-scope P00-03.runtime-probe P07-02.probe-report，退出0、3文件6/6。证明默认标准用户拒绝admin、当前身份/token绑定、缺失/失败/跳过/不完整/旧报告拒绝等规则保持，probe-guards-unit.log。
- CI66失败的9个文件17项正在使用新真实报告复验，未提前计通过。测试旧输出先备份，本轮另存retest-artifacts后恢复旧文件字节，避免覆盖此前验收快照；最终恢复核对与日志待完成。

本地最终补验：上述9文件17/17全部通过，退出0、676.49秒，native-failed-set-retest.log。缺报告失败→真实probe22/22→同一失败集17/17形成前后对照；未改门禁断言或业务代码。native-retest-manifest.json确认原57个文件按SHA256恢复、全部本轮输出另存retest-artifacts，未覆盖历史证据。远程CI67完整结果仍待结束，当前不把本地通过替代干净CI。

CI67途中检查点：新增当前runner能力探测success，unit444/444通过，完整集成步骤仍failure、perf success，其他检查继续运行。可下载的job日志暂仅到10:18的前半段，其中P07 native-transform和native-limits4项已通过，尚无最终失败摘要；未完成run的归档404、job注释0。等待job完整日志进一步定位，不推断剩余失败根因，不提前标通过。

## CI67完整结果与第二次修复

CI67 check最终cancelled、startup-diagnostics success。unit444/444；integration 473通过、8失败、1跳过。8项是native-image、native-layout、native-render三份和native-slides三份：中文字符绘制提取顺序错乱，文档例“长期实施方案”变为“期施方案长实”，PPT标题校验也失败，ci67-failure-summary.log保留完整断言。原先的能力门禁问题已消失；本地系统已安装Noto/中文字体而CI环境缺少显式字体加载，固定转换Worker只指定字体名称未提供字体资源。

桌面实际50/50通过（22分钟），独立标准用户通过。CI67的有效能力报告使每次桌面启动执行完整运行时指纹核对，最终60分钟上限在末尾Office重复诊断时取消，不把取消记为通过。浏览器备用读取因工具不能可靠确认URL而停止，随后只用GitHub API取完整日志，未绕过浏览器保护或自动化登录。

按ADR0073修复Office字体资源，并把当前runner probe和原生P07组放入独立office-native job；主job仅排除同组9文件17项，其他覆盖及独立标准用户保持，三个job全部通过才算CI通过。主45分钟/原生30分钟。保持完整安全指纹校验，不靠伪造报告、删除测试或降低内容断言通过。

第二次修复本地：font-unit.log退出0、6/6（新增缺失/损坏字体拒绝及实际暂存SHA）；font-build.log生产build退出0；private-font-native.log退出0，实际DOCX/XLSX/PPTX三格式隔离转换均成功（该条P00代表项1通过/4按过滤跳过，不能称整个P00通过）。check-font-fix.log退出0、674文件。新的font-current-user完整22项probe正在运行，不能采信旧指纹报告；后续P07/native/CI结果待补。

字体修复214e265aeb4f2c4afcb981ca1da16d6ffa0566ea已推，触发CI68 run41047994263。与此同时，本地新helper完整probe实际20/22、退出1：两个正向控制因拼接的固定Python代码超过HelperRequest每参数8192字符，在派发前被拒绝。font-current-user/runtime-probe.json和font-runtime-probe-command.log保留失败，不能启用此报告。正向控制也须显式暂存已锁定字体；已改为同一隔离workspace内wx创建固定脚本文件再执行，参数上限不变、不放宽宏/外链断言。font-controls-retest.log实际2/2通过、退出0，其他3条仅按过滤跳过。修复后的完整probe必须重新运行，不将20+2拼成已验证报告。后续以最新源提交CI为准，过时CI68可停止但不称通过。
