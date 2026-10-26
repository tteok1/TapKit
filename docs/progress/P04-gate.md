# P04 阶段交付与验收记录

- gate_status：engineering_passed_external_pending；2026-10-12，Asia/Shanghai。
- 验收执行：本地工程测试及Windows CI；用户已授权压缩合入main，真实模型联调仍暂缓。
- 目录D:/Tapkit-public；当前分支main，源分支codex/p04-03-memory保留（最终834904b）；main基线97a309f；业务/测试源码保持已验收87633cf3c7c157e18049af7fc5e1a8ebcece0e3e。
- [源码CI38207594863](https://github.com/tteok1/TapKit/actions/runs/38207594863)及[最终源分支CI38209793097](https://github.com/tteok1/TapKit/actions/runs/38209793097)的check/startup-diagnostics全部success。源分支6个提交squash为包含交接的单一main提交；main push Actions为合入后检查，按用户要求等通知后再查看。无PR、不开展P05。

## 本阶段交付物

| 交付要求                     | 实际入口/组件                                                                              | 任务与状态                                 | 验收证据                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------- |
| 中文混合检索/引用验证        | 固定CPU模型、授权版本、混合检索/重排与EvidenceRef；原文定位                                | P04-01已合入main，implemented_and_verified | 金标准32/32、定位75/75、4无答案零来源；P04-01记录                 |
| 上下文预算/连续压缩/缓存失效 | ContextAssembler、checkpoint、原句来源与纠正/接续                                          | P04-02已合入main，implemented_and_verified | 三次压缩金标准100%；P04-02记录                                    |
| 自动长期记忆/管理            | MemoryService、schema14、来源证据/低优先级提取、记忆管理、写后提示/撤销                    | P04-03 implemented_not_live_verified       | 本地T10/T11最终16/16、Electron4/4及完整CI                         |
| 历史参考/删除及撤权失效      | 每次prepareContext验证ID/revision/scope，引用使用再授权；墓碑/来源删除/generation/租约屏障 | P04-03工程已验证，真实模型暂缓             | ChatService模型背景/used refs/并发与旧job测试；临时与删除Electron |
| 范围及设置                   | 个人/项目/当前会话开关优先级；项目外三开关默认关闭，智能体范围规划中                       | 本阶段规定部分实现完成                     | T10其他项目唯一标记/三个独立开关/projectOnly；管理范围UI          |

## 演示与检查链

合成模型的实际Electron和Core链已验证：项目问答并打开原文依据→长对话连续三次压缩→显式记住即时写后提示→两次独立普通偏好自动保存→管理搜索/纠正/撤销/清空→其他项目不串用→临时聊天不读写→删除会话预览来源影响并保留显式记忆→重启和使用提示重新验证。截图及对应测试见各任务证据，P04-03为四项真实Electron测试，模型数据为合成fixture。

本地使用锁定Node24.21.0/pnpm12.4.1；CI使用windows-2025同锁定运行库。实际入口为设置→个性化→记忆管理、消息写后提示/回答使用提示、会话开关和会话删除预览。真实供应商链由用户明确暂缓。

## 门禁结果

- 任务规定check、unit、integration、build/Electron通过；最终源码全量CI为unit293/293、integration314/314、perf2/2、Electron45/45；本地P04-03最终16/16、关联91/91及记忆/分页联跑5/5，均exit0。
- 跨任务T09—T12相关路径通过；最终CI分页10.0秒低于原45秒门槛，修复增量消息触发全消息记忆查询和当前会话重复历史装配，不放宽测试。
- 原生隔离/权限：独立标准用户P00 22/22、parser3/3、preview4/4，零failed/pending/missing；Office宏/外链及启动storage/vault各三轮通过。归档11728926189摘要匹配GitHub digest，11源码摘要与本地一致，66条本轮隔离报告验证身份匹配/AppContainer/零网络/零残留/Job约束。只读取本轮标准用户目录，历史归档排除，不移植CI能力到本机。
- schema13→14重跑、历史值/job保全、迟到/并发/CAS、空清空、来源删除journal、范围迁移撤销、复制回执、凭据/敏感/第三方拒绝、实际账户/root预算/taskVersion及账户失效拒绝已覆盖。
- 十项P04-03需求对应已同步requirements.csv；FR-29-008/014按既定范围部分实现，智能体域保持规划中。证据见[acceptance-map](../evidence/P04-03/acceptance-map.md)、[implementation](../evidence/P04-03/implementation-2026-10-12.json)及三个任务记录。
- 失败轮和修复保留在P04-03：下载超时复跑、预算遗漏、分页回归和首次CI有限preload键清单遗漏；最终完整CI通过，没有放宽门槛或隔离要求。

## 外部缺口与后续

用户2026-10-12明确暂不真实模型联调；R01/R13/R14已配置但完整live未验收，R02-R05资源缺口保持，既有P01/P02状态不提升。补测使用隔离profile/实际账户验证普通偏好两次提取、真实用量和后台失败恢复。当前状态不能称为包含真实服务的正式验收通过。

工程已验证的ContextAssembler、EvidenceRef、checkpoint、memoryCommand/MemoryService和失效机制可供后续任务复用；实际账户模型效果/完整供应商live仍待验。P10备份全量清理及物理残留语义按原计划延期。用户已授权squash合入main，未开始P05，不创建PR。CURRENT、INDEX、P04-03和十项需求已同步；合入证据见docs/evidence/P04-03/main-squash-2026-10-12.json，main CI待用户通知后查看。

## 2026-10-26 当前版本回归补充

本轮P04-03 unit2/integration16/Electron4最终通过，全部模型数据为新隔离profile的合成adapter。来源/纠正/撤销/清空/开关/重启链路已覆盖，真实供应商提取效果仍暂缓；保持engineering_passed_external_pending及implemented_not_live_verified，不开始P05。证据 docs/evidence/P03-01/acceptance-2026-10-26/verification.md，实际命令/退出码及首轮失败均保留；产品源码与原profile保持，未commit/push。

2026-10-26用户确认本轮M01/M02文件交互补测均通过，本轮人工清单已完成；这两项不验证P04真实供应商提取，原engineering_passed_external_pending保持。回执 docs/evidence/P03-01/acceptance-2026-10-26/manual-acceptance.json。下一阶段只列计划，尚未开展P05。
