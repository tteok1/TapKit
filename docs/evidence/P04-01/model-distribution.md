# P04-01 模型分发

`embedding-model-lock.json`是模型资产唯一锁定清单；ONNX/tokenizer/config的revision及SHA256随源码保存。较大的二进制按已有resources/models忽略规则不进入Git，bootstrap按固定revision下载并逐文件核验，Core构建复制全部锁定文件至packages/core/dist/models/bge-small-zh-v1.5。运行时local_files_only，无嵌入API和远程降级。

模型来自[Xenova固定ONNX版本](https://huggingface.co/Xenova/bge-small-zh-v1.5/tree/75c43b069aac4d136ba6bc1122f995fedcfd2781)，基于[BAAI/bge-small-zh-v1.5](https://huggingface.co/BAAI/bge-small-zh-v1.5)，MIT；保留上游名称与来源，不把转换权重标为TapKit训练。推理依赖@huggingface/transformers4.2.0及其ONNX Runtime版本沿用已有pnpm锁定；Core声明同版本依赖并保持外部加载，以使真实utilityProcess解析其原生依赖，不把开发环境临时路径写入产物。

输出维度从已核验config.hidden_size检查为512，max_position_embeddings为512，CLS/SEP占2；每窗内容最多384，重叠64，权重是该窗新增token数。每窗CLS池化、按新增token平均后L2归一；中文query前缀来自原模型说明。长chunk tail由实际CPU推理差异测试覆盖。

新的源码/开发包构建必须先完成bootstrap准备模型；缺失或损坏不能仅用关键词假装混合检索成功。此任务未生成或发布安装包，P11继续完整第三方许可清单和安装分发验证。
