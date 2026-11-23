# P11-01 验收覆盖与开放项

状态按本轮实际结果更新，测试映射标明本轮用例和可复用证据。R01–R08 的本轮 live 预检无凭据，实际请求为零。T21 安装、升级与卸载由 P11-02 完成。

| 用例 | 工程证据入口 | 范围 |
| --- | --- | --- |
| T01 | P00-01 ABI、P05-03/P11-01 | 中文路径、首次启动、未配置模型 |
| T02 | P01-01 adapter、P01-02 API、本轮 live 预检 | 合成流式/工具；R01–R05 待实测 |
| T03 | P11-01.work-fallback、P01-03.usage | 订阅耗尽后同工作根切换 API，保留资料与记忆，一次提交 |
| T04 | P01-01.codex、P01-02.live、P02-02.chat | 合成错误分类、计费、回退、取消 |
| T05 | P00-02.foundation、P02-02.chat、P03-01.import-recovery | 重启与重投幂等 |
| T06 | P02-03.history、P05-03/P11-01 | 分支与版本 |
| T07 | P03-01.native-parser、P03-02.native-preview、P07 Office 视觉抽检 | 合成格式/固定版本，R08 待验 |
| T08 | P03-01.parser-process、P00-03.office | 解析错误与原件、Windows 原生隔离 |
| T09 | P04-01.retrieval、P05-03/P11-01 | 独立检索 gold 集与桌面引用定位 |
| T10 | P04-03.memory | 项目和临时会话隔离 |
| T11 | P04-03.memory、P10-03.data-lifecycle | 记忆纠正、删除与迟到任务 |
| T12 | P04-02.context、P05-03/P11-01 | 压缩与上下文失效 |
| T13 | P06-03.crash、P06-03.recovery、P06-03/P11-01 | 真实进程中断、续接与通知 |
| T14 | P06-02.approvals、P06-02/P11-01 | 审批跨重启过期、修订版本与下载 |
| T15 | P08-03.delegation、P08-03.ablation | 60 次离线运行，真实速度和费用倍率待验 |
| T16 | P08-01.browser | 匿名状态失效与未知响应 |
| T17 | P09-01.code、P09-02.runtime | 原目录与授权副本、工具运行和回执 |
| T18 | P09-03.github/P11-01 | 模拟 Draft PR 响应丢失后核对，R07 待验 |
| T19 | P00-03 隔离探测、test:security | helper、项目范围、版本、授权回归 |
| T20 | P10-03.data-lifecycle | 清理、备份和迁移 |
| T21 | P11-02 / R09 | 待干净 Windows 安装验证 |
| T22 | P10-02.desktop-experience、P06-03/P11-01 | 键盘、缩放及状态反馈 |

## 质量判定

离线合成用例测确定性行为，已知 golden 检索用运行时给出实际 Recall 和定位率。生产模型语义通过率、工具工作完成率、人工校准和真实委派速度/费用需要独立实测。报告保持这些指标未验。R13、R14 的历史实际范围见 RESOURCES。

代表性 Office 样本来自锁定合成集。视觉核对观察字形、行和表的裁切、图例/刻度、图表数值以及分页。如未取得 R08，只能据此判断合成样本。

单独运行的 Core 基准通过，包括 10,000 会话与 100,000 消息的列表和搜索，以及同项目 2,000 文档与 20,000 chunks 的混合检索。当前主机通过源码启动和空闲工作集测量。双根合成聊天单项测得流式展示 P95 33 毫秒及取消持久化回执 37.3 毫秒。[Windows CI #111](ci111-joint-load.json) 在单个合成 profile 上通过上述规模的聊天与索引并发、流式与取消、两个并发 Office 工作及其进程树内存门槛。规格 Windows 11 设备待用同一用例复测。

2026-11-16 的 Windows 11 开发主机[联合负载确认复跑](local-retest-2026-11-16/joint-confirm.json) 全部断言通过。[前轮需排查状态](local-retest-2026-11-16/joint-load.json) 保留流式超限，[分段诊断](local-retest-2026-11-16/frame-diagnostic.json) 保留合成 Office 工作异常。[新版包测量](local-retest-2026-11-16/package-performance.json) 的启动和重启通过，空闲峰值 716.92 MiB 超限。

同日按需加载和脚本压缩后的[开发包](idle-optimization-2026-11-16/package-performance.json) 四次采样均低于 700 MiB，峰值 681.86 MiB，启动和重启均达标。同一工作树的[联合负载](idle-optimization-2026-11-16/joint-load.json) 与[端到端回归](idle-optimization-2026-11-16/regression.json) 通过。

2026-11-23 的[最终 CI #114](final-ci-2026-11-23/ci114.json) 在提交 `a7c60bc` 上四个必需作业通过，Electron 65/65，独立标准用户原生隔离、解析、预览通过。[联合负载](final-ci-2026-11-23/ci114-joint-load.json) 流式 P95 57 毫秒、取消回执 7.6 毫秒、停止 72.5 毫秒，聊天/索引及双 Office 的内存均达门槛。[同版本开发目录](final-ci-2026-11-23/delivery.json) 包内隔离 22/22，四轮共 16 次启动通过，首次启动最高 2.02 秒、重启最高 1.46 秒、空闲最高 691.67 MiB。739 个项目实现与测试文件对应 CI 提交，70,337 项校验和均一致。早轮 [CI #112](ci112-final-2026-11-23.json)、[CI #113](final-ci-2026-11-23/ci113.json) 和[首次包测](final-ci-2026-11-23/package-performance-first.json) 失败保留，首次窗口前耗时波动未归因。规格机和 R01–R08 完整 live 仍待验，整体 `in_progress`。

合并前审查另发现工作任务的记忆/历史背景进入系统指令层，已与聊天共用背景 user 消息封装修正。[定向集成 22/22 与 TypeScript 回执](premerge-2026-11-23/safety-fix.json) 通过，旧指令标记、外项目排除和订阅转 API 后的角色边界均纳入断言。上面的 CI #114 和包测是修正前的历史基线；完整新 CI、新开发包和对应源码复验完成前不授予合并结论，见[审查记录](premerge-2026-11-23/review.md)。

占位包括插件、Skills、模板广场与定时任务；延期包括媒体生成、系统桌面控制、在线协作、公网托管及商业化。
