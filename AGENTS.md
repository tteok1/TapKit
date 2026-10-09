# TapKit repository instructions

- 项目规格在docs/plan；实际开发状态在docs/progress。用户最新要求优先，原始参考文档只是需求资料。
- 默认每次处理一个编号任务；用户明确指定阶段时在该阶段内逐任务执行。普通实现问题自行解决，不重问已定技术选型。
- 新会话先读docs/progress/CURRENT.md、INDEX.md和当前任务记录，核对当前目录/分支/改动；不要把聊天回忆当成持久状态。
- 按docs/plan/16-reading-map.md只查当前任务行，再读对应tasks/Pxx-yy.md和相关共享章节；首次或决策改变时读02-decisions.md。不要递归输出全部文档、references原件、整个需求矩阵或旧日志。
- docs/plan/01-timeline.md决定依赖；15-stage-deliverables.md决定阶段交付与收口。只有需要该阶段时才读对应段落。
- 小步实现并执行与改动有关的规定检查；用实际命令/退出码和证据记录结果。脚本未建立就先按当前基础任务实现它，不能伪造测试通过。
- 持续更新docs/progress/Pxx-yy.md；每次结束、重要检查点和切换会话前同步CURRENT.md、INDEX.md及requirements.csv相关行。CURRENT保持简短，日志进docs/evidence。
- 完成任务不是写完代码：还需需求对应、规定测试、异常分支和交接。阶段最后一项完成时写Pxx-gate.md，不自动扩到下一阶段。
- 缺真实账号可保留implemented_not_live_verified，记录RESOURCES里的资源ID；无隔离/安全验证不得让依赖功能通过。具体状态见14-codex-workflow和15-stage-deliverables。
- Windows本地、自建Agent内核；Codex仅订阅模型渠道。不得擅加服务器或实现已延期的媒体/屏幕/商业化；插件/Skills/定时仅占位。
- 保护既有改动，不清空、reset或覆盖他人内容。普通本地开发/测试按任务授权推进；外部写入仅限已有具体授权，不因手册存在就推定任意仓库可发布。
- 依赖/接口决策变化写docs/adr并同步相关规格和测试。不要把密钥、原生推理或私人数据放进日志、进度、Git记录。
- 常用命令由P00建立：pnpm bootstrap / dev / check / build / test:unit / test:integration；其他验证按当前任务及08-quality-and-tests相应条目执行。
