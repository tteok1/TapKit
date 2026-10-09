# ADR 0019：Responses消息类型与JSON错误核验

- 日期：2026-10-05
- 状态：accepted，本地实现及静态构建完成；新增回归和真人结果未验证
- 范围：P01-02，用户要求进一步核验并修复HTTP200/JSON检测失败

## 核验依据

浏览工具仍无法打开Responses正文页；官方llms.txt提供了对应Markdown链接。沙盒curl因Windows TLS SEC_E_NO_CREDENTIALS失败，当前用户上下文仅GET公开文档成功，未向模型端点发请求或使用Key。[官方Responses指南](https://docs.bigmodel.cn/cn/guide/develop/responses/introduction.md)确认/api/v1基址、stream=true时返回SSE、none非思考以及无需[DONE]；[创建Response](https://docs.bigmodel.cn/api-reference/response/创建-response.md)确认InputMessage的type/role/content必填、content支持字符串，以及顶层error事件的code和独立字符串业务码。

源码已发送stream=true/none/store=false，但消息input缺少必填type=message；SSE错误分类亦遗漏顶层event.code及部分Responses字符串错误码。这是已确认的兼容缺口，不是该次HTTP200/JSON真实正文的证明。尚无本次请求审计及JSON业务码，不能断言其中某项就是截图的唯一根因。

## 决定与安全边界

仅精确官方Responses端点的输入消息补type=message，涵盖当前消息及native回放中缺少type的已知角色消息，不修改function_call/function_call_output/已带类型项；其他服务、Chat、Messages不扩展。保持未发布分支tapkit-api/2、native绑定与结构，不读取用户native状态。

API adapter在成功HTTP分支遇到JSON声明类型时，最多读取65,536字节，严格UTF-8和JSON解析，支持原有取消/超时；超过上限立即停止并取消，读取后释放reader。私有正文仅临时内存使用，函数只返回固定分类及最多80字符、受限字符集的error.code/type；不返回原始对象、message、正文、头、Key、URL、推理、工具参数或响应ID。

识别嵌套error对象或顶层type=error，用既有错误机制报告upstream_error；JSON中object=response、固定status、output数组且无错误对象时报告non_streaming_response，不能当成功。其他合法JSON报告unrecognized_json；非法JSON/UTF-8、超限、空响应、读取失败分别用既有固定原因。HTML/其他声明类型继续拒绝不读取；缺失声明继续严格SSE解析。此JSON有界读取决定替代[ADR0018](0018-safe-api-response-diagnostics.md)中成功HTTP非SSE一律不读正文的部分；没有通用非流式成功回退，也不容忍JSON头下的SSE冒充JSON成功。

SSE错误分类补顶层code，使用实际HTTP状态。只在精确官方Responses启用文档字符串别名（请求、认证、模型、权限、额度、服务过载/降速和内容策略）；HTTP401/403优先于业务码。Chat数字码和其他兼容服务映射保持。检测与live没有新增请求/重试，正常router按既有有界策略处理可重试错误，不提高预算或更换协议。非2xx仍用既有有界错误解析。

contracts只增加两个固定diagnostic原因；界面沿用安全HTTP/类型/业务码字段。数据库/IPC版本、密钥与网络策略保持；未知真实原因、未知usage或费用不被补造。新增回归只编写，遵守用户暂停本机测试要求，静态检查/构建与真人验证分开记录，见[实现结果](../evidence/P01-02/zhipu-fix/responses-json-fix-2026-10-05.md)。P01-02=in_progress，P01-gate=failed。
