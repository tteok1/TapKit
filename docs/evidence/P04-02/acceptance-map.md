# P04-02 验收对应

实现提交：496f46334d5854ca55e9da63bf8d05eec045c44d；本记录只对应P04-02。实际结果、失败轮及CI见[实施证据](implementation-2026-10-11.json)和[任务交接](../../progress/P04-02.md)。

| 条件 | 可核查依据 | 实际边界 |
| --- | --- | --- |
| FR-08-011 查看和纠正摘要 | tests/e2e/P04-02.context.spec.ts；tests/integration/P04-02.context.test.ts的durable用例 | UI查看原始消息、连续更新、CAS纠正、原始用户修正事件与下一轮taskVersion=2、重启保持 |
| FR-08-012 选择背景接续 | 同一集成用例与Electron用例 | 仅空会话、同项目范围；用户选择字段；下一轮保留背景；未完成调用阻止迁移；每次使用复核源会话 |
| T12 连续三次精确约束100%保留 | tests/evals/compaction/gold.json；tests/unit/P04-02.context.test.ts | 独立3例各3轮，全部既有用户原句与预定义ID/金额/日期/否定literal均校验；每轮最新目标正确，压缩后不超过50%目标 |
| 中文计数和完整请求预算 | 同一unit的Chinese byte upper bound用例 | 未知tokenizer采用UTF-8序列化字节上界；模型tokenizer可注入；输出、独立推理、下一工具和安全余量计入，已含输出的推理不重复扣 |
| 65%/80%/50%与不可再压缩 | 同一unit的thresholds、large tool results、small model windows用例 | 大工具结果保留调用配对与精确literal并明确重新检索；无法保留用户约束时BUDGET_EXCEEDED，不截断必保信息 |
| 未完成调用及批准状态可恢复 | 同一unit的pending tool pairs；同一integration的pending approved ledger用例 | 原参数/hash/状态/approvalId与账本校验，真实SQLite重开后仍一致；不复制执行权，不补造工具结果 |
| T03 小窗口模型后备 | tests/unit/P04-02.routing.test.ts；tests/unit/P01-03.routing.test.ts的cross-model用例 | 实际router耗尽后使用128k→16k窗口重装；跨模型去除opaque；既有用例验证已完成工具证据只带入一次、pending阻止后备 |
| 校验失败重试一次且保留有效状态 | P04-02 unit的invalid schema/source/literal/execution用例 | schema、来源、关键literal和执行引用失败均只尝试两次，返回旧有效检查点；实际Core失败不覆盖既有行 |
| 缓存命中和旧requestId均不能越权 | P04-02 unit缓存用例及integration后三个撤权用例 | 来源删除、项目/范围变化、实际文件unlink后重新校验；重新生成时排除已撤权文件的派生助手内容；供应商actual缓存未知显示null |

供应商原生compaction没有已验证能力，保持禁用；不做最终答案语义缓存。测试资料与截图为合成内容，未调用真实模型。P01/P02的既有live资源状态保持；扩展旧P02长粘贴预览失败单列在实施证据，预览service/repository/test均与main相同，不作为P04通过依据。

实现496f463的完整Windows CI38123776382已通过check与startup-diagnostics；标准用户、Office与启动诊断报告均绑定同一实现提交，见[CI汇总](ci38123776382/run-summary.json)。交接只同步文档，最终分支push Actions作为人工合入最后校验。人工确认前不创建PR、不合入main，不启动P04-03或阶段gate。
