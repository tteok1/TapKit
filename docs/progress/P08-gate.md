# P08 匿名浏览器研究和有界子任务交付与验收

- 日期/执行：2026-11-05 Asia/Shanghai，当前开发验收会话；D:/Tapkit-public。
- 源：main 21604b1a851e2db19fde48c927e57e26eae809e1基点，codex/p08-03-delegation源码提交6e971d1已按用户授权推送远端；源指纹见docs/evidence/P08-03/source-manifest.json。发布记录见docs/evidence/P08-03/publication.json；未合main，新CI尚未核对结果。
- gate_status：passed（限定当前匿名浏览/研究/显式只读委派范围）。

## 本阶段交付物

| 交付要求                                   | 实际入口/模块                                                              | 对应任务与状态                  | 验收证据                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------- |
| DOM观察/操作/接管、提交审阅与失效句柄防护  | 匿名Browser工作页、Host/BrowserService、审批网关                           | P08-01 implemented_and_verified | docs/progress/P08-01.md；docs/evidence/P08-01及CI76；本轮浏览桌面2项回归                       |
| 研究流程、固定来源与原文引用、诚实缺口报告 | ResearchPanel、ResearchService、证据编号与Core报告                         | P08-02 implemented_and_verified | docs/progress/P08-02.md；docs/evidence/P08-02/final-core-closeout.json及CI77；本轮研究桌面回归 |
| 显式只读委派、同根额度、子分支控制及父汇总 | SubtasksPanel、DelegationService/Driver、WorkGateway/UsageLedger、schema21 | P08-03 implemented_and_verified | docs/evidence/P08-03/verification.md、94集成、500unit、桌面和live-final-audit.json             |
| 同预算评测及默认开启决策                   | tests/evals/delegation、P08-03.ablation.test.ts                            | 完成；默认单Agent               | docs/evidence/P08-03/ablation.json，60轮合成操作对照；不构成生产资格                           |

## 演示与检查步骤

1. `pnpm dev`进入工作页，显式启用匿名浏览器，在自建固定页面观察、填写并审阅提交；页面变化后旧句柄拒绝，重新观察或人工接管。提交结果未知不得自动重放。可用P08-01两个桌面用例复现。
2. 创建深度研究，读取来源、查看原文定位/引用，导出报告/来源清单；失败分支/单源事实注明缺口。P08-02真实第44轮双源采集/报告闭环既有验收保持，产物quality=partial，不证明发布者独立或事实为真。
3. 新建普通MD工作并先看计划，在子任务区为固定资料创建researcher/reviewer并指定依赖。单独暂停一个分支，另一个失败后补充要求修订，成功结果保留；返回主任务并打开依据原文。父汇总前重新授权/核对固定版本。
4. 可选择主模型汇总或显式“仅汇总子任务”Core清单。后者不追加主模型请求，不将来源定位核对当外部事实核验。费用入口进入现有模型用量页，实际/估算分列、未知金额不报零。
5. 本轮真实验收必须先启动TapKit并在设置中检测现有智谱成功，再发正式任务；第4/5轮分别验证两条汇总链。检测5/10、五份隔离凭据副本清理、预留0，无需重复请求复核已有证据。

## 门禁结果

- 任务级检查：P08-01/02既有任务验收和CI保持；P08-03本轮check、500unit、94相关集成、桌面及两条真实闭环通过，详情与原始日志见docs/evidence/P08-03/verification.md。最终费用导航桌面1项退出0（final-desktop-with-usage.log）；源/生产构建复核保持。
- 跨任务组合：本轮浏览2项、研究/委派2项桌面回归；94集成含浏览/研究/新委派/Work/账本。重复面板key冲突已修复并加单实例断言；首次失败日志保留。
- 隔离/保全：不访问用户浏览器资料，不增加原生权限；子任务只允许source.read/task.result；父取消/版本失效不发布晚到结果。schema21保留历史与根唯一约束，旧任务生成产物先归档后恢复。
- 需求映射：FR-21-001..009、FR-18-009..016沿用既有任务证据；FR-11-006..009见P08-03逐项映射与requirements.csv。
- 外部资源：本轮使用已配置智谱glm-4.7-flashx，当前P08限定范围无必补资源项；不扩大其他协议/账号的验收，P01/P02/P04/P05/P06原外部暂缓保持。
- 已知限制：多Agent未达到生产默认开启证明，显式可用且automatic=false；只读、深度1/并发2。前三轮正式not_verified和第5轮provider失败重试保留，未回写为成功。

## 下一阶段交接

可复用BrowserAction/固定快照、研究成果契约、委派/恢复/同根预算接口，依赖决策见ADR0075—0077。P09-01具备依赖输入，但本次不自动进入P09，当前分支已按本轮用户授权发布，仍不合main。CURRENT/INDEX/P08-03/requirements已同步最终状态。当前无P08规定验收遗留；最终交接格式/文档校验日志归入P08-03。
