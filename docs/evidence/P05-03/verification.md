# P05-03 验收记录

2026-10-27；D:/Tapkit-public；codex/p05-chat-m1；基点 ad85bc467c921f4c44ad26fc0c1bba25269153cb。用户授权整个P05开发验收，未推送/合并，不进入P06。

## 已执行

| 批次 | 实际命令与结果 | 证据 |
| --- | --- | --- |
| all-run-03 | check/build/unit370/integration373/perf2 均exit0；随后E2E未通过，整体exit1 | all-run-03/results.json、各log、sources.json |
| final-run-02 | check/unit370/P05 integration19 exit0；桌面失败后停止，整体exit1 | final-run-02/results.json、desktop-failures |
| ui-run-01 | check/unit370/P05 integration19 exit0；日志名包含Windows非法字符，E2E未启动，整体exit1 | ui-run-01/results.json |
| uiOnly-run-01 | 98项桌面91过/7失败，整体exit1；完整P05连续路径通过 | uiOnly-run-01/results.json、desktop-failures |
| repairs-run-01 | 7项补验5过/2失败，整体exit1；通过文件预览、弹窗、记忆重启、浏览器隔离和五格式保存 | repairs-run-01/results.json |
| two-run-01 | 960px/200%紧凑聊天含真实hover和全部后续断言通过；模型设置标题歧义，整体exit1 | two-run-01/results.json、HOVER_DIAGNOSTICS |
| model-run-01 | 无fixture生产构建下模型设置及重启持久化1/1，check与E2E exit0 | model-run-01/results.json |
| pack-run-01 | pack:dir exit1；工作区平铺后资源相对路径失效，原生五suite/0用例，能力拒绝；不交付此包 | pack-run-01/results.json、package-failure |
| pack-run-02 | pack:dir exit0、sourcesUnchanged=true；新目录当前用户原生22/22、无缺项、三个能力available | pack-run-02/results.json；package/runtime-probe.json |
| package-report/pack-smoke | 清单/关键hash/原配置/实际无测试profile通过；无fixture独立启动、真实TXT解析及ZIP原字节通过，exit0 | package-summary.json；pack-smoke.json；pack-smoke-exit.json |
| 最终静态/交接检查 | check、docs:check及git diff --check全部exit0；首轮CSV末尾空行修正后补验 | check-run-01/results.json；final-check-results.json |

完整集成按 P00/P01/P02/P03-01/P03-02/P03-03/P04/P05 分批，分别46/84/82/81/15/14/32/19，无跳过。冻结前后源码由runner核对，原历史任务证据逐字节恢复，本轮变更另存 historical-current；UI-redesign旧截图另行恢复。后置变更及定向复验单列，不声称全部命令在同一轮通过。

## 已知失败与修复

- all-run-01因D盘ENOSPC/Vitest崩溃退出3221226505，不计通过；恢复2504份历史证据，10份本轮变更保留，sourcesUnchanged=true。用户清理后按批末只清理本轮新增合成profile，低于8GiB停止新批。
- 旧启动等待和fixture Host代理准备错误、旧设置导航和异步页面切换均通过实际界面修正测试准备；不放宽Core安全/权限检查。
- 新联网工具条造成紧凑首页/聊天页间距回归：入口移入composer按钮，通过外置dialog打开，保留原布局断言；补首次发送前off及重进来源测试。
- 导出写盘阶段重启标SIDE_EFFECT_UNKNOWN，未进入写盘才可STREAM_INTERRUPTED；失败清理后重置进度，避免误导自动重试。模拟真实FileHandle的写入/fsync磁盘满、取消/重启和已有副本均有集成断言。

## 最终桌面与格式结果

| 规定场景 | 实际覆盖 | 可核对证据 |
| --- | --- | --- |
| T01—T06：连接、聊天、取消/断流/重启、编辑分支 | P00/P01/P02实际桌面/Core/Host用例，合成渠道不发真实模型请求 | e2e-coverage.json；all-run-03模型/聊天集成 |
| T07—T08：文件/损坏/版本/解析和恢复 | P03实际文件选择、DOM File拖入、CPU解析、原字节下载、异常和进程终止恢复 | uiOnly-run-01/test-e2e-filtered.log；all-run-03 P03各集成 |
| T09—T12：检索、项目隔离、记忆、三次压缩 | P04真实CPU混合检索/固定来源、管理删除/纠正、三次压缩与重启 | uiOnly-run-01；repairs-run-01；all-run-03 P04集成 |
| T19：注入、SSRF、IPC及匿名Chromium边界 | P00原生隔离/IPC；P05 DNS/重定向/URL授权/私有网络/权限/cookie/POST/popups | all-run-03；ui-run-01/P05集成；repairs-run-01浏览器 |
| T20：导出/备份/清理/恢复 | 实际五格式保存；已有目标拒绝、磁盘满、取消/重启未知副作用、源版本/CAS | repairs-run-01；P05-02集成；P00/P03/P04原测试 |
| T22：浅深色/960/200%/键盘和错误状态 | 紧凑聊天、来源与导出、表单/弹窗实际几何、命中和键盘操作 | uiOnly-run-01；repairs-run-01；two-run-01 |

114个不同Electron用例已分轮通过，e2e-coverage.json逐项列出实际通过批次，无缺项；不能解释为某轮114项整体全绿。来源、首次发送前off、缺key/CAPTCHA、真实Host五格式保存、无脚本中文PDF及独立Edge、连续M1路径均有本轮通过记录。连续截图11步以uncut/steps.json为准。

final-input-audit.json核对产品源码自ui-run-01以来完全未变；相对完整集成批次，仅导出恢复/公开摘要与联网面板布局有产品增量，已由ui-run-01的全unit370/P05集成19和本轮Electron覆盖。其他原生/模型/资料模块不重复全量执行，原完整373项通过回执保持。

dialogs保留原居中/边界/溢出检查；针对200%原生缩放中IntersectionObserver的0.9984比例，改为99%面积加精确viewport边界、四侧命中和真实键盘Enter关闭，不放宽实际位置。两处旧导航/重启首页定位、记忆多启动预算、浏览器夹具空正文等待探测、导出等待自动标题完成均仅修改测试准备，安全/版本门槛保持。

最终PDF核对exit0（pdf-final-check.log、P05-02/exported/format-verification.json）：11页、NFKC首尾正文/表格80/代码99通过，无PDF主动动作/OpenAction。Poppler最终1/5/11页已视觉核对中文、跨页表头、长代码及末段；PDF不保证原始Unicode逐码一致，使用TXT/MD保留精确UTF-8。

## 目录包与交付

开发包release/TapKit-chat-M1-2026-10-27T03-32-21-373Z，Start-TapKit.cmd启动；包内README-聊天开发版.md与docs/chat-milestone.md说明配置/数据/格式/限制。70017个清单文件、3476891834字节载荷、621份物化依赖；manifest SHA256=1c30c0e88647f9ceb7efd393572eb313892d02d82d1bc1a97e6f9f8f1f581d0b。清单遍历拒绝junction，实际.test-data/test-results已移除；原始Vitest配置hash与仓库一致，包内仅增加canonical源码解析别名。

pack-smoke使用包内Electron和Core、独立合成profile；正式Core无fixture入口，模型ready=0/fixture=false，真实TXT解析和Host/Core私有目标写盘返回ZIP且包含原字节，Renderer require/process均undefined。选择/保存对话框响应由测试提供，不宣称人工OS选择操作。截图pack-launched.png已核对，文件副本状态正确。

所有工程必需交付已完成，P05-gate=engineering_passed_external_pending；当前用户探测不替代标准用户/安装升级。未commit/push/merge，不进入P06。

首个失败目录的70015文件已按核验后的精确release子路径清理，原失败测试JSON/能力拒绝/日志与manifest摘要保留；failed-package-cleanup.json记录removed=true。最终文档格式首轮INDEX写入临时文件系统错误和CSV末尾空行均保留原回执，重试/修正后通过；不是产品测试跳过。

R01—R05完整live按用户暂缓，R06缺Tavily key；未读取真实Key/native推理或发起真实消费。当前用户原生验收不等同标准用户安装/升级/签名安装包验收。
