# ADR0045：本地混合检索与受版本约束的证据

日期：2026-10-11；任务：P04-01；实施/验收状态见实际 progress。

## 决定

- 保留 P03-03 的 `knowledge.query` 项目命令和只读工具，承担共享规格中 `knowledge.search` 的检索行为；不另增重复 IPC 名称。不允许模型选择任意项目或 profile，Renderer/模型只能使用 Core 已限定的固定版本范围。
- schema12 复用 parsed_documents/file_versions/resource_links；chunks.document_id 指向已解析结构，旧 P02 托管文本兼容路径为空。新增 chunks/embeddings/citations，不新建另一套文件或运行状态。重新解析、删除资料清掉衍生块，消息删除清掉引用；原件/旧固定版本保持既定生命周期。
- `embedding-model-lock.json` 固定 Xenova/bge-small-zh-v1.5 revision `75c43b069aac4d136ba6bc1122f995fedcfd2781` 与每个文件 SHA256；ONNX q8 CPU，配置校验为512维。bootstrap 下载并核验，构建携带核验后的模型/tokenizer；运行时只读本地模型，local_files_only，不调用嵌入 API。模型来自 [ONNX 发布](https://huggingface.co/Xenova/bge-small-zh-v1.5/tree/75c43b069aac4d136ba6bc1122f995fedcfd2781)，[原模型说明](https://huggingface.co/BAAI/bge-small-zh-v1.5)规定 CLS 池化和中文 query 前缀。
- 以实际 tokenizer 的800 token/120重叠切分，保持 UTF-16 定位；标题和表头/单位作为附带、可独立核验的上下文。PDF/slide/sheet 长块通过定位材料内 textRange 固定选区；代码保留行定位。父/邻居关系保存在索引。embedding 分窗 min(384,512-2)、重叠64，逐窗 CLS 归一后按新增 token 权重平均再归一，不截断尾部。
- 索引按授权源增量准备；模型 revision/维度或切块策略变化时该固定版本全量重建。先在内存完成向量，重新核对来源权限/索引版本，再事务切换整版，取消/撤权丢弃未提交结果。冷索引耗时单独计，热检索20k基线遵守P95≤2秒。
- 召回前限定 profile、project、固定版本和 active_index_version；FTS5 trigram 前30（2字词用有界作用域匹配）、精确余弦前30，RRF k60 取前30，0.55余弦归一+0.30关键词覆盖+0.15实体覆盖重排。错误码/数字必须匹配，不用语义邻近值替代。最多8块/每文档3块/总12k token；无答案阈值以本轮金标准报告校准。
- EvidenceRef 保留本轮 ID、sourceVersion、chunkId、indexVersion、modelRevision、Locator/选区 hash 和确切原文。回答 `[[evidence:ID]]` 必须来自当前 run 实際返回集合；提交前回查授权、原文/hash/索引。未知或失效引用令运行 partial，保留正文，不能标成功。核验引用作为文件附件复用 P03 的右面板定位；P05 再完成消息引用的完整交互。
- 无依据和过期分别诊断；确定性冲突检测仅对明确字段/不同数字或肯否值标记，保留双方原文，不能将标题相似当支持。一般语义矛盾仍由带双方证据的模型解释，不能宣称此规则覆盖所有自然语言冲突。

## 范围与验证

2026-10-11 T09校准：初始首条引用来源支持率28/30低于95%；改为授权候选集余弦min/max归一和12组通用中文词组覆盖（关键词0.4原字词+0.6概念组），仍保持总权重/上限及0.65无词命中阈值。实测32/32召回和首条来源支持、75/75定位、4无答案零来源；详见[校准记录](../evidence/P04-01/calibration.md)。标题只作为附带上下文，不单独返回为支持块。

仅 P04-01；上下文预算、压缩、长期记忆分别留给 P04-02/03。T09 真实 CPU 金标准、引用定位/拒绝、模型升级、索引取消/撤权和既有项目固定版本回归必须通过；报告记录样本量，不能将合成基线推广为任意用户资料保证。本任务不要求模型渠道 live，P01/P02缺口保持。
