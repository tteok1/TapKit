# 下一项：加密原生状态的重启与实际复用

## 2026-10-14 本case已通过

用户case8c0fc973-e4c8-4ece-b1c4-4232d0e4a9c4真实两阶段passed，正式只读复核native重启/复用及原profile账本通过，actual48+66=114、预留0无重复。本case无需重跑；结果见docs/evidence/P01-02/native-live-2026-10-14/review.json。以下为此前准备步骤/历史检查点。

2026-10-13工程更新：以下计划已按ADR0050实现，unit71/integration24/check与专用bundle退出0；合成真实Electron双进程及九种拒绝路径通过。真人阶段仍待验。下一步使用[正式用户步骤](../native-restart-2026-10-13/acceptance.md)和run-native.ps1，结果见[工程证据](../native-restart-2026-10-13/results.json)。

2026-10-13用户的新聊天复测返回OK，前台actual885、无重试，已经只读核对。本次同root自动标题仍NETWORK_ERROR，作为独立后台缺口保留，不继续让用户重复发送试探网络。详见P01-03/zhipu-budget-2026-10-13/network-recovery-review.json。

## 为什么不能再用普通重启续聊补验

- ChatService的普通请求携带ContextAssembler生成的标准历史，但未携带旧nativeStateRef/nativeOrigin。重启后答对口令只能证明标准历史续聊。
- 当前六阶段CLI在进程内Map保存native状态，报告明确为memory-only。
- 本机10条opaque绑定对应加密文件存在。存在性证明不等于重启后读取、绑定校验和协议复用已发生。

## 接手者先完成的工程准备

在P01-02内准备专用、可复核的有界验收入口，复用正式HostSecrets的加密保存/读取和正式API adapter，先用合成响应完成离线验证，再交付用户最小真实操作。上述入口已实现，下面保留验收范围；普通聊天上下文策略保持。

1. 首轮使用固定、无私人资料的测试输入，保存绑定account/model/adapterVersion/branch的native引用。
2. 完全结束首进程；第二进程通过正式HostSecrets解密接口读取同一隔离目录状态，并在同绑定、标准前缀匹配时携旧引用续答。
3. 公共报告只记固定阶段、进程重启事实、读取/复用成功布尔值、usage和预算/账本结算结果；不记录Key、原生正文、推理、headers、工具参数或解密值。
4. 离线异常验证覆盖绑定不匹配、删除/撤权、篡改/缺失文件以及标准前缀不一致时拒绝；不得绕过加密或绑定校验。
5. 真实阶段由用户本机执行，使用已指定智谱Chat/FlashX账户，最少两次请求、无自动重试、首次失败停止；不用Codex订阅或其他渠道，不提高预算，不自动生成标题/提取记忆等额外请求。
6. 与正式账本逐attempt核对actual/estimated、恰好一次结算及预留释放；若入口不接正式账本，应明确ledgerVerified=false，不能替代已验应用账本。

通过标准为加密保存→进程重启→正式解密接口读取→adapter实际携旧引用续答的证据齐全，不凭回答正确或文件存在提升状态。若复用方案要求改变产品接口/普通聊天策略，应先评估既有ContextAssembler和分支边界，再按仓库规则写ADR并补规定回归。

用户无需重复预算1、取消或普通重启续聊；现在仅需执行新入口的一次有界真人验收。P01-02=in_progress、P01-03=implemented_not_live_verified、P01-gate=failed保持；后台标题网络错误、其他渠道/价格和各自编号live缺口保持。
