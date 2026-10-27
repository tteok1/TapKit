# P05 聊天开发版本 M1 阶段验收

- gate_status：engineering_passed_external_pending
- updated_at：2026-10-27 Asia/Shanghai
- 源码：codex/p05-chat-m1，ad85bc4 + 未提交工作树；未push/merge。

## 本轮交付

P05-01按17-hosted-web-search/ADR0066先设计后实施：Codex/Responses/Anthropic隔离托管搜索，无独立Key；Core权限、账本、安全读取、快照及引用保留。P05-02本地导出继续通过。P05-03新包release/TapKit-chat-M1-2026-10-27T09-23-01-322Z及本机原资料入口已验证，旧包保留。

check/build/unit385/P01 integration84/P05 integration24通过；8个不同Electron分轮通过，完整连续11步/真实中文PDF等回归通过。新目录当前用户原生22/22，无缺项；无fixture独立启动/真实TXT解析/ZIP原字节通过。source审计及原阶段证据恢复见docs/evidence/P05-03/hosted-verification.md；不称某轮全部114项重跑。

## 真实范围与剩余项

Codex/gpt-6.1-sol隔离搜索、三页原文、Core归档/3条引用/断网回看通过；3次请求尝试中1次成功，剩余授权1次未用。来源链为分段联验。Responses/Anthropic仅离线协议通过；原R01—R05完整live暂缓，P01—P04历史gate不提升。P05-01/P05-03 implemented_not_live_verified，P05-02 implemented_and_verified。

当前无新增必需人工项。新包隔离scope=current-user、standardUser=false，不替代P11安装/标准用户验收。停在P05，不进入P06。旧阶段记录保存在docs/evidence/P05-03/gate-before-hosted-handoff.md。

2026-10-27 Git交付：用户已授权将本轮累计P05工程及验收记录提交推送到codex/p05-chat-m1；不合main。提交包含此交接，最终SHA以Git回执为准，原implemented_not_live_verified/资源待验边界保持。
