# P02-01 实现与验证（2026-10-05）

分支 codex/p02-01；基线 c9cd48293dadb93d5c4dacb198bf13b883e6bcc5，未提交工作区。范围是本地桌面外壳、设置、模型入口和首页元数据。决策见 ADR0022；未实施聊天发送、任务执行、资料导入或全文搜索。

## 实际实现

- 首页、聊天/工作列表、最近/置顶、项目、文件、名称搜索、通知、账户和设置导航；session+branch、项目名称记录由 Core 创建，置顶 CAS/幂等/删除检查。
- 窗口 1280×800 / 最小960×640；侧栏可调/折叠，详情可调/窄窗抽屉；槽位布局、路由与滚动重开恢复；1200/960和200%缩放验证。
- 个人头像/昵称/背景/称呼，长期指令与聊天/工作不同回答偏好，关闭保留和恢复默认；主题/字号/缩放/紧凑/Enter/目录/代理/推荐显示持久化。未发送草稿或私人指令。
- OAuth/API Key/模型目录/偏好/推理/后备/用量复用 P01；合成 Key 保存后清空输入、仅显示尾4位，离页 DOM 无完整输入。账户读取失败不会阻塞本地设置。
- schema5 迁移与旧备份兼容；设置事件仅 revision，窗口快照 eventSeq 后续订阅；手动代理拒绝密码/路径/查询，直连真实绕过旧代理。

## 实际命令与结果

全部 pnpm 命令使用仓库锁定包装：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\pnpm.ps1`。

| 命令 | 实际结果 |
| --- | --- |
| exec tsc --project tsconfig.json | 退出0 |
| exec tsc --project apps/desktop/tsconfig.renderer.json | 修正订阅参数后退出0 |
| check（当前用户） | 类型、格式、边界、清单检查退出0；最后文档检查见 results JSON |
| build:desktop | 退出0，Core/Storage/Host/Preload/Renderer均生成；第三方注释/use client警告，不冒充零警告 |
| test:unit | 220/220，退出0，其中P02-01为10项 |
| exec vitest run --config vitest.config.ts --project integration P00-02 P01-01 P01-02 P01-03 P02-01 | 100/100，退出0，其中P02-01为4项 |
| test:e2e --grep P02-01（当前用户） | 3/3，退出0，全部隔离资料/虚拟检测 |
| test:e2e --grep 'P02-01\|P01-03\|P00-01.*sandbox'（当前用户） | 6/6，退出0，包含旧模型偏好/后备账本和桥接/关闭回归 |
| docs:check / git diff --check | 最终退出码记录于 results JSON |

不使用 `test:integration -- ...`，以免旧包装把筛选误当普通参数。没有运行P00-03权限/Office/AppContainer套件，没有更改ACL。

## 中间失败与修正

首轮renderer类型检查失败：订阅参数误用limit而未提供streamId；修正后通过。首轮E2E格式化失败：getByLabel的options语法错误；修正后执行。

沙盒Electron首轮2项均Target crashed；当前用户运行可启动并进入实际断言。只记录环境差异，未确定沙盒崩溃的内部原因，未改关闭sandbox/GPU的启动选项，也没有复现原用户资料的0x80000003。

随后修正：项目文字精确定位/表单label、弹窗默认焦点、CSS百分比宽度与zoom重复折算、窄窗侧栏、重开时等待Core数据恢复滚动、重复首页/返回链接。avatar首次样本无法解码，换成本机生成的有效PNG fixture并增加WebP转静态PNG验证。检测fixture最初模拟命令错误而非ProbeView，改为真实契约形状的虚拟检测失败；没有更改服务错误码来让测试通过。

代理fixture首轮没有实现CONNECT导致15秒超时，补CONNECT和3秒AbortSignal后发现空映射不清除旧代理；按锁定Node接口行为修正直连，确认CONNECT后下一请求为直接GET，环境变量未改、无Authorization头、无外部网络。没有放宽测试超时。

旧P01模型页重启回归曾假定首页，因新布局恢复模型页而失败；改为断言模型页恢复，仍验证回答语言、预算和语气等原始数据。完整单元/定向集成与相关界面最终通过。

git diff --check中间发现PowerShell写入的额外EOF空行；最终去除后再检查。不得把这些中间失败记为首次即通过。

收口时将连接错误回执滚入截图后，一轮相关E2E为5通过/1失败：点击首页后立即读取DOM抢在React路由提交前，读取到旧输入。失败快照已为首页，增加首页heading可见断言后再检查卸载DOM，不删除Key清理断言。最后复验结果见results JSON。

## 截图和视觉核对

- PRIVATE_VISUAL_ARCHIVE.md：浅色首页、空记录引导与草稿。
- PRIVATE_VISUAL_ARCHIVE.md：深色设置。
- PRIVATE_VISUAL_ARCHIVE.md：960宽、200%缩放、自动折叠侧栏与可滚动设置。
- PRIVATE_VISUAL_ARCHIVE.md：虚拟 NETWORK_ERROR 检测回执、输入清空与尾4位。

截图只含本轮fixture资料。已通过像素查看核对布局，屏幕DPI使PNG物理像素不等于逻辑窗口宽度；宽度由Electron窗口设置，溢出由DOM检查。窗口外壳保留系统缩放，测试没有使用关闭sandbox的启动参数。

## 边界

真实模型请求0，未读原用户Key/vault/私人profile；测试仅对自己创建的合成凭据执行现有加密保存/读取。没有修改原用户账户、系统代理、预算或私人记录，没有新commit/push。P01真实账户/用量验证与P00原生隔离仍按原进度保持；本任务界面通过不提升它们或P02阶段门禁。个人偏好可保存，但实际回答生效链要由P02-02发送/上下文接入验证。

## 本地提交交接

上述结果为提交前的实际验证快照。随后用户明确要求写好交接并commit，授权将本任务源码、迁移、回归、ADR、共享规格、进度与四张fixture截图纳入一个本地提交；不包含P00-03残留，没有push。最新交付状态以docs/progress/P02-01.md及包含本文的git历史核对，结果JSON中的dirty/newCommit保留验证当时含义。
