# P08-03 开发与验收

状态：implemented_and_verified；P08 gate=passed。

2026-11-05，D:/Tapkit-public；codex/p08-03-delegation。从已fetch核对的main 21604b1a851e2db19fde48c927e57e26eae809e1建立，原验收交付为未提交工作区，当前源码6e971d1已按用户授权提交推送，见publication.json；完整源文件SHA256见source-manifest.json，不能将基点视为新实现的提交号。

## 交付与边界

内置researcher/reviewer，只读固定资料，深度1、最多2并发、最多12分支；固定DelegateSpec与结构化结果。子任务经过现有模型路由、全局/credential槽、根用量账本和工具网关，不复制父历史/凭据，不获得文件/浏览器/外部写入或递归委派权限。

父子结果发布前重新授权读取固定版本，核对hash和逐字位置；来源位置准确不证明资料为真或来源独立。失败/暂停/取消/预算停止/版本失效均保留独立结果与历史，已成功无依赖分支可partial交付；actions只展示建议。旧终态后修订创建新父版本，同根预算不刷新。

保留主模型汇总；显式Core模式仅生成单份普通Markdown的结论/逐字依据/不确定性/缺口清单，不追加主请求。普通无模板Markdown父汇总仅声明artifact.write/user.ask。费用查看复用设置中的“模型与用量”，显示实际/估算、未知金额；子任务面板提供入口。schema21/接口见ADR0077及共享规格。

## 规定检查

使用锁定Node24.21.0与scripts/lib.mjs调用pnpm；原始日志保留命令及退出结果。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| pnpm check | 0；类型、格式、脚本lint、边界、运行清单、127桌面测试收集通过 | final-check-after-summary.log；最终交接复验见final-delivery-check.log |
| pnpm test:unit | 0，74文件500项 | final-unit.log |
| pnpm test:integration P08-01 P08-02 P08-03.delegation P06-01.work P01-03.usage | 0，7文件94项；含本任务21项 | final-related-integration.log |
| pnpm test:integration P08-03.ablation | 0，10例×3单/多共60轮 | final-unit-and-ablation.log、ablation.json |
| pnpm test:e2e -- --grep P08-03 | 0，新Core模式/单独控制/修订/跳转/原文高亮 | final-core-summary-desktop.log；费用入口复验0，final-desktop-with-usage.log |
| P08桌面兼容 | 浏览2项通过；唯一key修复后研究及委派2项通过 | prior-p08-desktop-regression.log、final-desktop-unique-keys.log |
| 真实调用 | 第4/5轮passed，Core和主模型两条汇总链 | live-final-audit.json及对应原report.json |

集成覆盖深度/并发/调用与工具封顶、独立暂停、超期/超长输入、注入/错误引文、撤权、父取消/旧版本晚到、崩溃收尾、终态修订与迁移保全。实际ApiKeyAdapter单元验证智谱task_result线名及完整schema投影，未放宽响应或权限。部分检查包含重叠用例，不相加冒充独立总数。

旧任务输出先归档并逐字节核验后恢复原HEAD：prior-task-regression-outputs、desktop-regression-outputs、final-regression-outputs的zip/json。历史任务验收和失败记录均未覆盖。

## 真实模型验收与用量

只用现有配置智谱glm-4.7-flashx。每轮启动实际TapKit、在隔离副本的设置中检测成功，才创建正式工作；原账号/网络未改，隔离副本直连。连接额度本任务10次，实际5次全部检测成功，剩余5次未用；不叠加P08-02额度。所有闭环调用及失败尝试保留账本。

| 次数 | 正式工作结果 | 账本attempts | actual tokens | estimated tokens |
| --- | --- | --- | --- | --- |
| 1 | 子任务本地参数拒绝，主任务诚实partial；not_verified | 3 | 3241 | 14661 |
| 2 | 子任务别名本地校验拒绝，主任务诚实partial；not_verified | 3 | 3425 | 15595 |
| 3 | 两真实子任务完成、5条逐字证据；父响应中断；not_verified | 3 | 1607 | 21174 |
| 4 | 两真实子任务完成、4条逐字证据、Core MD；passed | 2 | 1602 | 0 |
| 5 | 两真实子任务完成、6条逐字证据、主模型MD；passed | 4 | 3161 | 14509 |

第5轮主模型首尝试PROVIDER_UNAVAILABLE，既有路由在同根限制内重试成功；实际attempts=4、根usedCalls=4/maxCalls=6。不是零失败或每次响应保证。总actual13036+estimated65939=保守78975，估算不能当实际付费；连接用量未知且不计入正式合计，金额未知。前两轮有预派发校验失败，账本attempts不代表均已向供应商发送。

第4轮根01a1aacf-81f1-7a2e-acdd-f32a54dc687f，第5轮根01a1aad2-4c0b-7310-b6af-bfcdd287a1ab。原字节MD分别在live-62760905-5075-4c29-bc0e-42b79ffba227和live-31aa2282-bf6d-43db-8571-e950048c2ac3目录；来源及产物hash、引用位置、账本合计、检测时间先于正式attempt、unfinishedRuns=0、预留0均经只读数据库与Blob复核。五份隔离凭据副本全部清理；当前入口closed。live-final-audit.json记录与正式Core/Main二进制匹配且无fixture。后续只增加费用导航及桌面断言，Core/模型/网关源码未改；最终构建Core/Main与成功回执一致、无fixture；46份变更源码已重新计算指纹。

## 同预算对照与限制

10例各3轮、单/多各30轮，预算相同（32768 tokens、30000ms、6请求、12工具），逐字支持/准确位置/失败披露均30/30。实际运行时间、调用/工具计数逐轮保留在ablation.json。固定25ms合成响应、无真实费用，不证明生产质量、时间改善或≤1.5费用倍率。automaticDelegationEnabled=false，默认单Agent，用户显式委派可用。

当前验收限于固定资料研究/审查、已有配置智谱与上述合同。没有扩展屏幕/托管登录/任意写入/其他模型协议验证；以前阶段的外部资源缺口保持原状态。P08收口见docs/progress/P08-gate.md，不启动P09。
