# ADR0046 可验证的应用检查点与模型预算

- 日期：2026-10-11；任务：P04-02；状态：已实施并验证，证据见progress/P04-02.md和CI38123776382。
- 依赖：P04-01固定来源与P01-03预算/后备接口。P01既有live缺口保持。

聊天每次装配按可信产品规则、回答/工具配置、项目规则、应用任务状态、资料/背景和最近消息处理。稳定模块不加入时间或trace；角色仍由provider转换。未知tokenizer按UTF-8序列化字节上界计数，已知tokenizer可注入；输出、独立推理、下一工具结果和安全余量独立预算，已含输出的推理不再扣除。65%评估压缩，80%停止扩大结果，压缩必须达到有效输入的50%以内；无法保留必要内容时明确BUDGET_EXCEEDED。

初版应用检查点使用可验证的确定性抽取，不追加模型调用。保留全部用户原句及来源版本；助手短摘录/精确literal保留来源，原始事件和消息保留。字段为goal/constraints/decisions/completed/active/next/artifacts/evidence/open_questions/execution_refs。最新goal和纠正优先，历史约束可核查；未完成调用保存ID、参数与hash、状态及审批引用，不复制执行权或重做副作用。生成候选校验Zod、来源范围、完整用户约束、literal及执行账本；通用候选最多两次，失败保留旧有效状态。

schema13新增checkpoints/context_snapshots，sessions增加context_seed_json/context_version；不建立第二套run状态。检查点引用只存消息ID/revision，查询时重读原文。删除消息/会话同步清理检查点与快照；来源、项目、权限或版本改变拒绝旧检查点/缓存，重新生成时排除已失效资料的派生助手/工具内容。初版资源戳保守覆盖profile的资料和项目版本；无关资料变化可能要求重新生成摘要，这是安全与简洁性取舍。

Core提供context.get/compact/correct/continue。纠正追加原始用户消息、生成新检查点和task.steered事件，下一run使用递增taskVersion，不改供应商opaque块。接续仅限空会话、同项目范围且无未完成调用，所选字段在下一轮始终保留并继续校验源会话；来源删除后不能靠缓存继续。

router为每个实际候选模型调用Core.prepareContext，重新按模型窗口与输出上限装配；model/account切换仍不迁移opaque状态，工具配对由既有账本控制。没有provider原生compaction的已验证资源，因此该能力不启用；应用检查点可独立工作。不做最终答案语义缓存。UI展示真实本地缓存计数/字节与供应商报告的实际cached_input_tokens，未报告显示未知，不把配置当命中。

验收：T12连续三次压缩、精确约束100%、pending/approved/unknown恢复、T03小窗口后备、CAS纠正、同范围接续、删除撤权与原始来源查看；unit/integration/Electron及Windows完整CI。无PR、不合入main，等待用户人工确认。
