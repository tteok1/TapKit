# P05-01 联网搜索、匿名网页读取与来源归档

2026-10-27 新请求：status=in_progress。先完成17-hosted-web-search及ADR0066，再实施托管搜索替换；原Tavily工程验收只对应旧实现。用户已允许最多2次现有Codex订阅隔离搜索，只发公开问题。三路径适配、隔离账本及Key界面替换已实现；真实Codex第3次请求HTTP200、读三页成功，Core归档/三条引用/断网回看通过。最终自动回归进行中，尚未收口。

## 当前状态

- status：in_progress
- updated_at：2026-10-27 Asia/Shanghai
- 目录/分支/基点：D:/Tapkit-public；codex/p05-chat-m1；ad85bc467c921f4c44ad26fc0c1bba25269153cb。
- 已 fetch origin/main 并 fast-forward 核对；初始工作区干净。用户授权本地 P05 开发与验收，未授权推送/合并。
- 前置 P04-03 工程实现已验，真实模型仍 external_pending；R06 Tavily pending，仅阻塞真实搜索验证。

## 交付清单

FR-18-001—008：工程实现及规定自动/Chromium/桌面/视觉验收完成；真实搜索 R06 pending。NetworkPolicy/受控代理、独立加密搜索连接、正文抽取/固定快照/混合引用、联网过滤、来源/活动面板和保存项目均已接入。详细需求与证据见 docs/evidence/P05-01/verification.md。

## 执行检查点

- 2026-10-26：建立开发分支，读取最小任务/共享章节，核对既有 Core 只读工具、引用、Host 保存授权。
- 2026-10-26 23:49：冻结产品输入批次 check/unit32/integration8/Electron3 均exit0，sourcesUnchanged=true。独立Chromium1项亦复验通过。仅视觉200%补验待收口；尚未开展P05-02实现。
- 2026-10-26 23:58：正式应用zoom=2、原生capturePage及关闭按钮边界的定向Electron补验1/1通过；desktop-v3截图核对正常。旧原生zoom/CDP截图不作为有效200%证据。工程收口，允许P05-02依赖公开来源/引用边界；R06保持pending。

## 验证记录

- git fetch origin main / git merge --ff-only origin/main / git switch -c codex/p05-chat-m1：退出0；基点如上。
- 产品检查实际结果及源码哈希见 docs/evidence/P05-01/acceptance-2026-10-26/run-01/results.json；原始失败及修复分轮保留，不冒充单轮全部通过。

## 接口、迁移与决定

schema15 / ADR0064；WebCommandSchemas 及 Core→Host 私有 web.key/read/cancel。parse5固定7.3.0，与既有锁文件相同版本，补直接依赖及基线。共享网络目的验证用于模型/搜索/网页，模型保留原端口支持。规格04/05/07已同步。

2026-10-27 P05-02回归修正（ADR0065/schema16）：网页快照软删除保留、回收站拒绝访问、恢复后hash一致，永久清理才释放；增加只读web.sourceInfo提供标题/版本/访问时间chip。相关P05集成15/15通过，最终冻结回归见P05-03；R06状态保持。

## 未完成、阻塞和恢复

- 实现无剩余；R06 真实 Tavily 搜索→3页→引用及真实模型组合路径另验，不把mock通过计为live。
- 无本任务启动的应用进程；保护既有 profile/窗口和历史证据，不替换原用户数据。

## 交接

P05-02与P05-03均已完成工程交付；最终114项Electron分轮、P05集成19和新包22项原生隔离/启动验证见P05-03。联网入口收进composer按钮的独立dialog，首次发送前off和来源重进已复验。R06真实搜索仍待资源，不提升为live通过；本轮停在P05。
