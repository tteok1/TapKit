# 开发进度总表

这是初始化种子。首次复制到实际项目docs/progress/INDEX.md；以后只更新实际记录，不能用本种子覆盖。应用尚未开始开发。

当前阶段：P00；当前任务：P00-01；已真实验收任务：0/37。

状态说明：not_started未开始；in_progress执行中；resource_blocked存在阻塞；implemented_not_live_verified实现及本地规定检查完成但缺外部live；implemented_and_verified全部规定验证通过。阻塞任务仍可部分实现，必须在任务记录说明。

| 任务 | 标题 | 前置 | 状态 | 任务记录（项目相对路径，开始后创建） |
|---|---|---|---|---|
| P00-01 | 工程初始化与依赖锁定 | — | not_started | docs/progress/P00-01.md |
| P00-02 | 本地数据、IPC、凭据与后台作业底座 | P00-01 | not_started | docs/progress/P00-02.md |
| P00-03 | Windows隔离与文件运行组件验证 | P00-01, P00-02 | not_started | docs/progress/P00-03.md |
| P01-01 | Codex订阅OAuth与模型直连接入 | P00-02 | not_started | docs/progress/P01-01.md |
| P01-02 | DeepSeek、混元、Grok和豆包API适配 | P00-02 | not_started | docs/progress/P01-02.md |
| P01-03 | 模型目录、费用账本和自动后备 | P01-01, P01-02 | not_started | docs/progress/P01-03.md |
| P02-01 | 桌面布局、设置和模型连接体验 | P01-03 | not_started | docs/progress/P02-01.md |
| P02-02 | 聊天发送、流式消息和只读执行循环 | P02-01 | not_started | docs/progress/P02-02.md |
| P02-03 | 会话组织、消息分支与全局搜索 | P02-02 | not_started | docs/progress/P02-03.md |
| P03-01 | 文件导入、版本、资料库与解析流水线 | P02-03, P00-03 | not_started | docs/progress/P03-01.md |
| P03-02 | 文件预览、定位与右侧工作面板 | P03-01 | not_started | docs/progress/P03-02.md |
| P03-03 | 项目管理、资料范围与索引版本 | P03-02 | not_started | docs/progress/P03-03.md |
| P04-01 | 中文混合检索、重排与引用证据 | P03-03 | not_started | docs/progress/P04-01.md |
| P04-02 | 上下文预算、压缩检查点与缓存 | P04-01, P01-03 | not_started | docs/progress/P04-02.md |
| P04-03 | 自动长期记忆、历史参考与管理 | P04-02 | not_started | docs/progress/P04-03.md |
| P05-01 | 联网搜索、匿名网页读取与来源归档 | P04-03 | not_started | docs/progress/P05-01.md |
| P05-02 | 引用交互、会话导出和本地分享快照 | P05-01, P03-02 | not_started | docs/progress/P05-02.md |
| P05-03 | 聊天版本端到端验收 | P05-02 | not_started | docs/progress/P05-03.md |
| P06-01 | 持久化工作任务、计划和执行编排 | P05-03 | not_started | docs/progress/P06-01.md |
| P06-02 | 写入工具、审批与产物验收网关 | P06-01, P00-03 | not_started | docs/progress/P06-02.md |
| P06-03 | 故障恢复、暂停取消与本地任务通知 | P06-02 | not_started | docs/progress/P06-03.md |
| P07-01 | 报告与文档成果生成、版本修改 | P06-03 | not_started | docs/progress/P07-01.md |
| P07-02 | 表格分析、图表与可交互数据成果 | P07-01 | not_started | docs/progress/P07-02.md |
| P07-03 | 演示文稿生成与办公质量回归 | P07-02 | not_started | docs/progress/P07-03.md |
| P08-01 | 匿名浏览器交互与用户接管 | P07-03, P05-01 | not_started | docs/progress/P08-01.md |
| P08-02 | 深度研究工作流与来源核验 | P08-01 | not_started | docs/progress/P08-02.md |
| P08-03 | 有界子Agent与独立任务协调 | P08-02 | not_started | docs/progress/P08-03.md |
| P09-01 | 代码项目、Git隔离与差异审阅 | P08-03 | not_started | docs/progress/P09-01.md |
| P09-02 | 终端、依赖准备与代码测试执行 | P09-01, P00-03 | not_started | docs/progress/P09-02.md |
| P09-03 | GitHub连接、提交与Draft PR闭环 | P09-02 | not_started | docs/progress/P09-03.md |
| P09-04 | 网站生成和本地交互预览 | P09-02 | not_started | docs/progress/P09-04.md |
| P10-01 | 轻量文档画布和局部AI修改 | P07-03, P09-04 | not_started | docs/progress/P10-01.md |
| P10-02 | 占位页面、通用体验与无障碍完善 | P10-01 | not_started | docs/progress/P10-02.md |
| P10-03 | 数据导出、清理、备份和恢复闭环 | P10-02 | not_started | docs/progress/P10-03.md |
| P11-01 | 系统评测、故障回归与源码开发版交付 | P10-03 | not_started | docs/progress/P11-01.md |
| P11-02 | Windows安装包、升级与标准用户验证 | P11-01 | not_started | docs/progress/P11-02.md |
| P11-03 | GitHub开源交接与官网下载准备 | P11-02 | not_started | docs/progress/P11-03.md |

## 阶段状态

| 阶段 | gate_status | 收口报告（收口时创建） |
|---|---|---|
| P00 | not_started | docs/progress/P00-gate.md |
| P01 | not_started | docs/progress/P01-gate.md |
| P02 | not_started | docs/progress/P02-gate.md |
| P03 | not_started | docs/progress/P03-gate.md |
| P04 | not_started | docs/progress/P04-gate.md |
| P05 | not_started | docs/progress/P05-gate.md |
| P06 | not_started | docs/progress/P06-gate.md |
| P07 | not_started | docs/progress/P07-gate.md |
| P08 | not_started | docs/progress/P08-gate.md |
| P09 | not_started | docs/progress/P09-gate.md |
| P10 | not_started | docs/progress/P10-gate.md |
| P11 | not_started | docs/progress/P11-gate.md |

每次完成或阻塞任务更新当前/下一任务、任务行和必要阶段行。数字由真实状态计算，实施数量与真实验收数量分开，不按写了多少代码估百分比。
