# ADR 0020：连接检测保留发送摘要和实际用量

- 日期：2026-10-05
- 状态：accepted，离线测试与静态构建通过；真人结果未验证
- 范围：P01-02；用户要求核对并修复文本截断，随后明确恢复本机本地测试

## 核对结论

当前文本检测预算32/off，官方Responses请求映射为none，工具阶段128。Responses终止事件中的usage已被解析并作为usage事件发出，checkConnection原来未消费该事件；它在finish.reason=length后另建错误，丢失HTTP状态和响应类型，界面无法区分实际思考用量与未知用量。旧截图与历史none128回执不能替代当前请求证据。没有证据授权改变供应商参数、自动增预算或把截断判成功。

## 接口与实现

ProbeView.diagnostic新增可选request和usage。request只包含序列化请求在fetch调用前的outputLimit、stream、固定reasoning分类none/disabled/unspecified；这是准备发出的字节摘要，不是供应商已收到/执行参数的证明。不包含请求正文、headers、Key、URL、模型回答或native内容。每次stream观察器局部传递HTTP响应状态/类型，避免共享实例属性串请求；正常stream接口及ModelEvent不新增事件。

checkConnection消费标准usage事件，原样保留规范化计数（输入、输出、缓存子集、思考子集及source）。缺失为null，不填0；计数只接受安全整数，非法子集继续归一化为null。文本通过后进入工具阶段时清空摘要和usage，防止沿用文本阶段数值。数据仅随该次检测结果返回，不新增数据库列或持久化用户内容。

finish后的截断/无正文错误现在保留实际HTTP/类型、当前阶段发送摘要及已观察usage。发送前准备成功但网络失败可报告request_failed及准备摘要，不能伪造HTTP和usage。OUTPUT_LIMIT_REACHED状态及文本/工具成功条件保持，预算仍32/128，没有新增模型请求、重试或协议回退。

只有明确准备none/disabled且供应商报告outputTotal>0并等于reasoningSubset时，截断原因细分为reasoning_output_truncated；文案说明“请求已设置关闭思考，但服务报告输出全部为思考Token”，不宣称已证实供应商内部推理或usage标注原因。其他截断保留output_truncated。界面显示数值和固定设置，未知数值明确显示未知，不向用户泄露原生推理。

## 验证与限制

用户恢复的是本地虚拟响应单元/集成测试，不扩为真实API/Key读取或Electron启动。全unit210通过；P01-02定向integration19通过；check/build:desktop通过。首轮未运行过的新认证用例错误地期待unavailable，已按实现既有expired语义修正；新增回归覆盖正文/工具阶段摘要、全思考/零思考/未知用量、错误前无HTTP及不泄露私有字段。

带`--`的pnpm脚本调用未按预期筛选，曾运行全integration：108通过/15失败，全部失败为P00-03的AppContainer/Office运行库权限路径；改为直接exec vitest带P01-02筛选后19通过。不得把定向通过说成全integration通过，也不自动修复P00。本次结果和指纹见[证据](../evidence/P01-02/zhipu-fix/probe-audit-fix-2026-10-05.md)。仍无真人模型请求，FlashX实际none执行或供应商usage语义未知，P01-02=in_progress/P01-gate=failed保持。
