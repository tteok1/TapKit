# TapKit 开发计划手册

版本1.1：12阶段、37项开发任务，无具体日期。本目录是待实施规格，应用尚未开发。当前更新补充Codex执行、阶段收口、进度与换会话交接机制。

## 用户先读

- [怎样用Codex执行：目录摆放与四组提示词](14-codex-workflow.md)
- [总开发时间线](01-timeline.md)
- [每阶段交付到什么程度](15-stage-deliverables.md)

把手册内容放进未来项目docs/plan；在Codex打开项目根目录，使用14中的首次启动提示词。不要把整个目录全文贴入聊天，也不要要求每次通读全部文件。

## Codex按需读

1. 根AGENTS.md + 实际docs/progress/CURRENT.md、INDEX.md、当前任务交接；首次或范围变化时读[已定决策](02-decisions.md)。
2. 仅定位[阅读地图](16-reading-map.md)中当前任务行，读对应任务、共享章节和[本阶段标准](15-stage-deliverables.md)。
3. 实现/测试后更新实际进度和交接；默认一任务收口，阶段最后一项再完成阶段验证。必要的祖先模块修复纳入当前交接，不重做整个计划。

首次初始化种子：[INDEX](execution-state/INDEX.md)、[CURRENT](execution-state/CURRENT.md)、[RESOURCES](execution-state/RESOURCES.md)、[需求验收台账CSV](execution-state/requirements.csv)。只复制缺失文件到docs/progress，不能覆盖后续实际进度。

持久入口：[AGENTS模板](codex/AGENTS.template.md)。详细记录：[任务交接模板](templates/progress-template.md)、[阶段收口模板](templates/phase-gate-template.md)。模板不是已完成的开发记录。

## 其他规格索引

[架构](03-architecture.md) · [数据](04-data-contract.md) · [IPC](05-ipc-and-events.md) · [模型](06-model-adapters.md) · [工具/隔离](07-tools-and-isolation.md) · [测试](08-quality-and-tests.md) · [原需求追踪](09-requirements.md) · [核验来源](10-sources.md) · [资源待办](11-external-todos.md) · [交互DTO](12-interaction-details.md)。

这些是查阅入口，不是一次全部读取的清单。references只在需要追溯原文/依赖事实时读。

缺账号只阻塞相应live，不得虚构通过；缺隔离等真实技术门禁不能跳过。用户最新要求优先，普通实现细节由Codex处理，已延期范围不得擅自扩大。

文档校验见[交付校验记录](13-document-validation.md)和SHA256SUMS.txt；本报告不代表应用已经测试。
