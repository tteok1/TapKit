# P06 工作模式执行底座阶段交付与验收

- 阶段/执行会话/日期：P06；Codex本地执行；2026-10-27—28 Asia/Shanghai。
- 源码基点：origin/main f453d81c34618c1845b0eb9f5c63a9d8eed1d61c；分支codex/p06-work-runtime；初始工作区干净。本轮工作树未提交、未推送；最终源hash见docs/evidence/P06-03/source-sha256.json。
- gate_status：engineering_passed_external_pending
- 环境：Windows当前用户，Node24.21.0 / pnpm12.4.1 / Electron44.3.0；隔离测试资料位于.test-data，原profile仅只读必要配置/密文，未启动原资料应用或迁移原库。

2026-10-28追加P06限定智谱live：用户授权最多6次尝试/2048输出/50000保守预留；实际4次应用尝试（1次本地校验拒绝、3次HTTP），保守预留24627 tokens。修复P06工具名wire映射后，POST仍连续响应头超时，256输出最小请求也失败；已停止并关闭入口，未完成真实链路，不提升gate。API实际usage/费用未知，不能把estimated账本当消耗。详见docs/evidence/P06-03/live-zhipu-2026-10-28/verification.md。

## 本阶段交付物

| 交付要求            | 实际入口/文件                                                   | 任务   | 状态与证据                                  |
| ------------------- | --------------------------------------------------------------- | ------ | ------------------------------------------- |
| Task/Run/Plan状态机 | /work；work-service.ts、storage/work.ts、work-plan.ts、schema17 | P06-01 | 指定智谱真实链分轮通过；其他渠道暂缓        |
| 工具网关与审批/授权 | 通知→权限与待确认；work-gateway.ts、tools/registry.ts           | P06-02 | 固定工具/具体预览/TTL/撤权/新审批通过       |
| 产物及副作用账本    | work-artifacts.ts、tool_calls/attempts、process_handles         | P06-02 | 真实Python/Office各1项及不可变版本/隔离通过 |
| 暂停/取消/恢复      | WorkService租约/epoch，NativeTools核验                          | P06-03 | 6项恢复状态、5个真实强杀点通过，未知先核对  |
| 任务中心与本地后台  | 列表/看板、优先级/批量；Host托盘/睡眠                           | P06-03 | 桌面闭环通过，旧聊天/导出回归通过           |
| 本地通知与清理      | notifications-ui.tsx、work-notifications.ts、session-cleanup.ts | P06-03 | 游标/dedupe/DND/已读/删除/深链/重启通过     |

## 可操作演示

1. 在仓库固定Node环境运行pnpm dev。选择“工作→新建工作”，填写目标和材料，开启“先查看计划”。没有可用真实模型时只查看/调整计划；不要将fixture启用于原资料。
2. 调整步骤/依赖/勾选，接受后在授权模型下执行。成果只有完成固定验证后才显示已完成；打开成果、另存副本、人工接受或反馈。
3. 对任务托管副本的修改进入“通知→待审阅操作”；核对修改前/后，编辑会生成新预览，过期需重新生成并再次决定。可选择一次/会话/同资源持续授权，并立即撤销。
4. 使用暂停/继续/取消/补充要求，切换页面仍可找回；关闭窗口进入托盘，明确退出停止执行。重新启动查看持久任务/通知；未知副作用先核对。
5. 无真实模型的可重现工程闭环：pnpm test:e2e -- --grep P06。它只在显式测试构建和新建标记资料目录启用合成通道，结束恢复生产构建。

## 门禁结果

- pnpm check与pnpm build均退出0；全量unit390/390退出0。
- 相关integration共204个不同用例分轮通过：首轮202/203、修复搜索触发器后80/80（79项重叠及1项新增迁移保护）。最终P06共33项通过，含真实原生2项、崩溃5点。
- 最终Electron6/6退出0：P06四项、聊天停止一项、可信导出一项；生产构建恢复完成。浅/深色、960px与200%视觉检查通过。
- 原生隔离：真实AppContainer=true、networkCapabilities=0、activeProcesses=0、exitCode=0；不修改原件，不改生产能力报告。当前用户验证不替代标准用户安装/P11验收。
- 历史P05证据被回归生成的新样本按原字节恢复，新样本单独保存在P06-03/regression-export；未清空、reset或覆盖原用户资料。
- 需求追踪：P06-01/02/03 implemented_and_verified（P06-01真实模型范围为智谱Chat/FlashX）。统一证据、失败轮和源hash见docs/evidence/P06-03/verification.md。

## 外部缺口与下一阶段

R01—R05/R13/R14中非本次授权范围继续保持。P06指定智谱已真实尝试但网络超时未通过；已配置Key，不是缺Key。固定工具和合成通道通过不能作为完整live通过；P01—P05原gate不提升。本阶段仍是工程通过、外部待验，不能称正式全部验收通过。

后续可依赖统一状态/预算/事件、固定网关、审批/恢复和成果接口；任意exec、完整办公生成、浏览器业务、用户定时、媒体/屏幕及商业化均未提前开放。按用户本轮授权停在P06，不开展P07。CURRENT、INDEX、requirements.csv、ADR0067及共享规格已同步。

## 2026-10-28 连接检测后再次真实联调

用户确认连接检测通过且无设置变更；本轮1次真实工作POST仍为NETWORK_ERROR / response_headers_timeout，保守预留4812，实际用量未知，无成果，停止且关闭隔离入口。P06状态和gate不变；详见 docs/evidence/P06-03/live-continued-2026-10-28/verification.md。

## 2026-10-28 先检测连接再执行真实工作

同一进程连接检测第1次通过（文本和工具，两次HTTP），随后1次真实工作生成文件并核验内容和hash；工作实际838输入、26输出tokens，检测实际用量未知。真实审批/重启链仍待验，任务与gate状态保持；见 docs/evidence/P06-03/live-probe-work-2026-10-28/verification.md。

## 2026-10-28 剩余真实验收的连接前置

按用户要求首次启动先调用TapKit连接检测，5次未完整通过（共6次HTTP，均最终响应头超时；第3次文本通过），未发送工作请求。无密钥HEAD配置/直连均401；系统代理已配置，无法证明为超时根因。真实审批/重启/暂停仍待验，状态不变；见 docs/evidence/P06-03/live-acceptance-2026-10-28/verification.md。

## 2026-10-28 额外五次隔离直连检测

用户将连接检测总上限提高至10次；新隔离资料直连检测5次均响应头超时，累计10次检测、11次HTTP，无本轮工作请求；实际检测usage未知，真实审批/重启/暂停仍待验，状态保持。证据 docs/evidence/P06-03/live-direct-acceptance-2026-10-28/verification.md。

## 2026-10-28 智谱真实工作与通知修复

首次TapKit连接检测通过；真实生成、审批及重启、版本核对、steer取消和真实流式暂停分轮通过。发现完成通知漏发并修复，回归12/12、桌面4/4通过；通知修复后以真实任务事件的隔离副本重放通过；进度文档格式整理后统一check退出0。智谱固定工具范围的真实链分轮通过。真实工作actual 2087及estimated 9250（实际未知），检测用量未知；详见 docs/evidence/P06-03/live-final-2026-10-28/verification.md。

## 2026-10-28 门禁复核

P06-01升级为implemented_and_verified，限智谱Chat/FlashX及固定安全工具；真实链分轮通过，通知修复以真实事件副本重放验证。P06-02/03保持implemented_and_verified。历史其他渠道/资源仍按用户要求暂缓，gate保持engineering_passed_external_pending，不进入P07。详见 docs/evidence/P06-03/live-final-2026-10-28/verification.md。
