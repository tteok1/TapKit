# ADR0055 当前账户能力验证与独立标准用户验收分开

2026-10-19；P02-03 补验所需的 P00-03/P03-01 依赖。用户明确要求优先完成当前管理员账户全部功能测试，非管理员账户验收暂缓。当前用户是管理员组成员、medium integrity；不等同提升权限启动。已准备的标准用户 seed 保留但不运行，新源码指纹改变后不得将其旧产物直接用于当前目录。

## 决定

保留 `runtime-probe.mjs` 和 `p03-parser-probe.mjs` 默认独立标准用户验收语义及原 CI，增加显式 `--scope=current-user`。该范围仍执行原完整固定原生隔离/解析测试；失败、缺项、跳过、运行时变化继续失败关闭。不是跳过隔离或修改成功标记。

当前账户的原生报告为内部 schemaVersion 2，增加 `verification.scope=current-user` 和实测宿主令牌绑定：用户 SID 的 SHA256、完整性 SID、是否包含管理员组。只记录哈希/权限分类，不记录账户名、原 SID 或 whoami 原输出。`standardUser` 仍如实为 false，`standardUserAcceptance=not_verified_in_this_scope`；不把本机有限通过提升为标准用户验收通过。

Core 沿用原 executionPolicy、固定完整运行时/隔离源码 fingerprint、能力字段和 AppContainer/ACL/Job/无网络/资源限制。消费 schema2 时还须报告原生 exit0、总数为正且全部通过、失败/跳过/缺项为零，当前账户和完整性/管理员组分类与实测相同。换账户或权限令牌须重新验证，旧报告失败关闭；无身份或未知范围也失败关闭。原 schema1 标准用户报告按原规则兼容；未带范围的管理员报告仍拒绝。共享验证模块加入 fingerprint，不能修改验证规则后沿用旧能力报告。

解析报告用相同显式范围标识并真实记录结果，但仍不写生产 capabilities；本轮只运行附件所需 P03-01 三项，不运行 P03-02 预览。没有宿主解析 fallback、系统策略/账户修改、原目录手工 ACL 放宽或 fixture 报告转植。

## 验证及交接

针对默认标准用户门禁、同一账户报告接受、跨账户/完整性/组变化拒绝、失败/缺项/跳过拒绝、旧策略/旧 fingerprint 拒绝和失败报告快速拒绝做单元验证。实际 native22、parser3及生产构建/原 profile 单次附件内容重试分别记录；执行结果见 progress 与本轮 evidence，本文不提前宣称通过。非管理员验收按用户要求暂缓，发布兼容/完整阶段安全验收不因此宣告完成。
