# 智谱 Responses / GLM-4.7-FlashX关闭思考异常排查材料

这份材料可由用户提交给智谱官方支持；尚未发送。本材料不包含API Key、账户ID、私人内容、原生思考或本机profile路径。

## 问题描述

2026-10-04 20:20:33（Asia/Shanghai；UTC 12:20:33.091），使用官方`https://open.bigmodel.cn/api/v1/responses`、模型`glm-4.7-flashx`进行一个流式文本请求，发送`reasoning.effort=none`和`max_output_tokens=128`。收到HTTP200，但输出上限耗尽，未得到完成的公开回答。供应商报告output_tokens=128，reasoning_tokens=128。发送摘要确认端点/模型匹配、参数为none，且本机传输原样发送该JSON，无自动重试。

此前20:10:31的相同文本验收也报告20输入/128输出/128思考，发送摘要当时尚未采集。以前同模型基础文本/工具连接检测曾通过；不能由单次通过推断关闭思考稳定生效。

## 发送设置

以下为TapKit源码构造的首轮最小请求；实际诊断捕获的是字段白名单，不是完整HTTP抓包。本材料未增加真实请求。身份验证需在用户本机正常配置，不能将Key粘贴到工单或此文档中。

```json
{
  "model": "glm-4.7-flashx",
  "stream": true,
  "instructions": "Follow these short test instructions exactly.",
  "input": [{ "role": "user", "content": "Reply only TAPKIT_OK." }],
  "store": false,
  "max_output_tokens": 128,
  "reasoning": { "effort": "none" }
}
```

输入为message.content.string；无工具，无previous_response_id，首次请求没有原生历史。thinking.type未发送，因为所核对Responses接口定义使用reasoning.effort；没有盲目添加Chat专用参数。

## 发送摘要与返回统计

```json
{
  "checkedAt": "2026-10-04T12:20:33.091Z",
  "modelId": "glm-4.7-flashx",
  "httpStatus": 200,
  "reasoningEffortSent": "none",
  "maxOutputTokensSent": 128,
  "inputShape": "message.content.string",
  "storeFalse": true,
  "requests": 1,
  "retries": 0,
  "inputTokens": 20,
  "cachedInputSubset": 2,
  "outputTokens": 128,
  "reasoningSubset": 128,
  "applicationResult": "OUTPUT_LIMIT_REACHED"
}
```

运行环境为Windows/Node24.21.0，TapKit API adapter v2、正式HTTPS传输；审计仅观察，不修改请求。传输使用验证TLS/SNI的HTTPS，并以原JSON字符串结束请求；没有重定向、SDK自动重试或自动换模型。请求的实际上游request_id/response_id未被该回执采集，用户可在智谱控制台按上述时间和模型查找补充；不要用TapKit账户ID代替它。

## 官方支持需确认的问题

1. 当前`glm-4.7-flashx`在标准Responses端点是否支持reasoning.effort=none？所需字段是否与指南一致，有无模型/输入格式限制？
2. 为什么none模式仍报告全部输出为reasoning并达到128上限？这是实际思考未关闭，还是usage标注问题？
3. 对本材料的字符串消息输入、instructions和store=false组合，服务端是否正确解析reasoning？若有不支持的范围，请提供明确的模型/协议与参数说明。

官方[Responses指南](https://docs.bigmodel.cn/cn/guide/develop/responses/introduction)与[创建Response接口](https://docs.bigmodel.cn/api-reference/response/创建-response)在2026-10-04核对时，将none/minimal描述为放弃思考，输出预算包括回答与思考。当前响应行为与这个预期不一致。我们已排除本地漏发none；尚未把服务内部根因断言为某一个实现缺陷。

## 本地证据与边界

原始安全回执保留在仓库[responses-none-observed-2026-10-04.json](responses-none-observed-2026-10-04.json)。该内部文件含TapKit账户标签/ID及本机环境；提交官方时优先使用本材料的摘录，按需自行补供应商调用ID，不提供Key。

本轮停止重复真实Responses请求，不自动提高预算、添加未经文档确认的字段、换协议或把截断当成功。P01-02仍in_progress，完整真人验收未完成；可通过已有Chat账户继续验证共用框架，Responses组合单独保留为上游兼容问题待确认。
