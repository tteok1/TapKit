# 智谱Chat/FlashX加密native重启复用：真实验收

2026-10-14 16:15（Asia/Shanghai），用户执行专用入口，case8c0fc973-e4c8-4ece-b1c4-4232d0e4a9c4两阶段passed。只读核对后，此指定范围的加密保存、独立进程退出/重启、正式Host恢复及adapter复用旧native已验收，无需重复执行。

- save/resume进程18056/38532，独立instanceId；第二阶段nativeLoadsDuringAdapter=1、nativeReuseConfirmed=true。每阶段仅1次请求，无重试/工具/自动标题/记忆调用。
- 同一隔离应用正式账本两条actual48/66，共114 tokens，各结算一次，root预留0。当前总12条46737=actual4154+estimated42583，未结算/重复/非零预留均0；每日上限仍2000000/revision4，金额未知。
- opaque索引2条/对应加密文件存在2项。Agent只做公开报告、源码摘要、只读SQL及文件存在性核对，未读取真实Key/native正文或发模型请求。
- 工程11份源码和两个bundle摘要与前次通过的快照一致。本轮没有产品代码变化，unit71/integration24/check结果引用前次记录，不冒充本轮重跑。

native-restart-report.json、save-report.json、resume-report.json为原公开报告的归档；review.json保存报告摘要、源码摘要和正式账本核对，checkpoint/native引用或密文不归档。review-public-state.mjs使用DatabaseSync readOnly/事务快照，最终exit0见review-final.log；首次只读表名错误exit1及修正说明见review-initial.log。

专用入口通过不改变普通ChatService标准历史策略；其他渠道/Codex、价格/金额和后台自动标题网络失败继续跟踪。P01-02=in_progress、P01-03=implemented_not_live_verified、P01-gate=failed保持，未提交/推送或开展P05。

本轮公开账本复核、docs检查37任务、全库格式432文件和git diff --check均exit0；归档JSON隐私标记扫描无匹配（rg exit1），实际命令/退出码见docs/evidence/P01-02/native-live-2026-10-14/checks.json。
