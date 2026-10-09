# Responses FlashX修复后用户回执：文本截断

2026-10-05用户提供新截图：response / glm-4.7-flashx / OpenAI Responses / https://open.bigmodel.cn/api/v1，OUTPUT_LIMIT_REACHED，文本检测output_truncated。截图无请求时间、HTTP状态、MIME、usage或发送审计；本轮未另读数据库或私人响应。

核对当前checkConnection：文本请求outputLimit=32/reasoning=off；官方Responses映射为reasoning.effort=none/max_output_tokens=32。stream的Responses终止状态归一化为finish.reason=length后，检测生成OUTPUT_LIMIT_REACHED；文本未通过，不进入128预算的工具阶段。该检测规则生成的错误没有HTTP/类型字段，截图缺这些字段不代表请求未到达。

本次回执表明进入了可解析的响应终止处理，没有再次停在JSON Content-Type拒绝；不能将其记为文本/工具成功，亦不能由错误变化确认旧JSON唯一根因或所有请求字段已经实发。实际HTTP状态、响应声明类型、输出正文/思考占比均未知。32是当前源码的请求上限，不是本次已观察usage值；none是当前源码映射，不证明上游实际关闭思考。

历史[2026-10-04单请求回执](responses-none-confirmed-2026-10-04.md)已观察同一模型/Responses组合实发none/128后output128=reasoning128并截断；那是前一次独立请求，不能回填本次用量或判断消息type修复后仍有同样内部原因。仅提高32预算不足以证明非思考参数执行正确；真实原因仍需有界安全usage/发送摘要或供应商确认，不猜测字段、换协议或无限重试。

本轮只核对源码及用户截图并同步交接，无产品修改、模型请求、测试套件、预算/代理/账户配置改变、Key/vault/native读取或Electron启动。此前check/build通过及新回归未执行仍为上一轮记录。任务in_progress、P01-gate failed与用户本机测试暂停保持；工作区未提交推送。
