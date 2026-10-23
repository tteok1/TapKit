# 旧会话重复加载与启动方式排查

当前ui_fix/main基线394418f，保留既有改动，无新commit/push。只调整Renderer及测试/说明，不改变Core、Host、事件协议或本地执行权限。

## 改动与原因

- 按用户截图移除回复头部providerId协议名，模型名/时间/状态保留；移除进展区的rootUsageHint辅助计费说明。实际用量、估算标记、错误及停止能力保持。
- 旧会话每次挂载，首次snapshot未返回时就以afterSeq=0订阅，Host从头重放持久事件；回调对每条旧chat事件重新请求messages.list，重复打开仍重演。修复为首次snapshot返回后从它的eventSeq订阅，窗口间隙的新事件由既有replay补齐，活动状态变化仍从当前snapshot续订。无历史消息缓存，也不跳过权威读取或权限校验。
- git show/blame确认afterSeq回退0及挂载订阅在这轮UI修改前的main中已存在（最早可见752ab6a/2026-10-09）；本次UI变更没有新增这段逻辑。症状随历史事件增加放大。
- 上次提供的scripts/dev.mjs是热更新开发入口，先buildCore（包含三个本地构建和锁定嵌入模型校验/复制），再启动Vite开发界面。它确实增加每次启动的编译开销；已提供本目录run-app.ps1直接打开本轮已验证生产产物，保留原profile并核对源码/产物SHA，不在每次打开时重新构建。源码/产物后续变化会拒绝旧验证，避免误开过时UI。
- Core启动还同步await readExecutionCapabilities。它对锁定Node/Python/Git/LibreOffice目录完整读取/hash，再核验执行报告/账户范围；capability-timing.json实测16913ms，状态仍available。该只读计时与生产恢复构建末尾重叠，不能作为无负载P95或声称全部启动时间均来自此处。两次隔离窗口约0.5–0.6秒建立，Core ready分别约20.8/15.0秒；差异受缓存/负载影响，不归因于UI修复。没有放宽或跳过完整性校验。

## 前后实测

命令：pnpm test:e2e tests/e2e/P02-03.session-load.spec.ts --grep "P02-03 old sessions"。合成profile，12轮与2轮两个会话，各打开三次；记录可见消息DOM就绪耗时，并额外观察750ms内的队列读取次数。fixture无真实供应商请求，不读写真人聊天内容。

| 会话/轮次 | 修复前messages.list次数 | 修复后次数 | 修复前内容出现ms | 修复后ms |
| --- | ---: | ---: | ---: | ---: |
| 12轮首次 | 101 | 1 | 1029 | 151 |
| 12轮再次 | 101 | 1 | 1121 | 304 |
| 12轮第三次 | 101 | 1 | 1133 | 306 |
| 2轮首次 | 21 | 1 | 367 | 172 |
| 2轮再次 | 21 | 1 | 407 | 172 |
| 2轮第三次 | 21 | 1 | 440 | 173 |

baseline.json/log为预期1失败/exit1，六次读取量断言均检出；measurements-before.json及chat-before.png保留。修复后命令增加P02-03 T06 two turns与P02-03 inline copy两个用例，fixed.json/log记录3/3通过、exit0，测量见measurements.json。覆盖旧会话六次打开、两处文案删除、实际新事件仍更新；T06覆盖编辑/候选/分支/反馈/重启草稿，inline覆盖代码/表格复制与四种窗口缩放下真实选区操作。

截图chat-clean.png已复核：头部只保留模型、时间和状态，进展下辅助说明消失，无多余空行或分隔符。布局/图标系统沿用已验UI。

最终pnpm check、pnpm docs:check和git diff --check均exit0，462文件格式/83项E2E发现及37任务/交接/需求证据链接检查通过，见checks.json。E2E finally生产恢复exit0，Core/Host SHA与上轮生产基线一致、无fixture。此前跟踪证据字节恢复，原用户窗口/账号保留，不关闭或重新运行真实模型；未手工编辑原业务库，不声称仍运行的用户应用数据逐字节不变。真人任务/gate状态保持。源码/产物SHA及实际回执绑定在results.json。

## 正常打开

先从托盘退出TapKit，再在PowerShell执行本目录run-app.ps1。它复用现有聊天与模型配置，仅核对已验产物并打开，不运行dev.mjs；本地Core初始化的校验等待仍存在。CheckOnly实际648ms/exit0，仅验证不启动，结果另存launch-check.json/log；原用户窗口没有被自动关闭或重启。
