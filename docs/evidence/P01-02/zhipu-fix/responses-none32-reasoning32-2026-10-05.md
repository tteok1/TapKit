# Responses FlashX：新真实回执none32/思考32

2026-10-05用户提供截图，账户response / glm-4.7-flashx / OpenAI Responses / https://open.bigmodel.cn/api/v1。截图无请求时间戳，本轮没有再读账户数据库、Key或私人响应；与旧请求分别记录。

## 本次观察

| 字段 | 截图值 |
| --- | --- |
| 检测阶段 | 文本 |
| 错误 | OUTPUT_LIMIT_REACHED / reasoning_output_truncated |
| HTTP | 200 |
| 声明响应类型 | 事件流 |
| fetch边界准备的输出上限 | 32 Token |
| fetch边界准备的reasoning.effort | none |
| 服务报告inputTotal | 13 |
| 服务报告outputTotal | 32 |
| 服务报告reasoningSubset | 32 |

此次安全摘要取自实际序列化body，fetch使用同一字符串，secureApiFetch直接req.end(init.body)，本轮已静态核对。可排除当前实现“只显示off但序列化漏掉none”的缺口；摘要仍不是服务端实收/执行参数的独立证明。HTTP200及已解析SSE说明当前失败不是请求前拒绝或非SSE内容类型失败，不代表其他请求的网络或账户问题全部排除。

文本响应在输出上限处结束且服务将输出全部计为思考，因此文本未通过、工具阶段未运行。剩余问题定位到这笔Responses/FlashX非思考请求的参数执行、转发或usage标注兼容；客户端字段按已核对文档准备正确，不能据此断言供应商内部实际仍执行了32Token原生推理、JSON旧根因或唯一服务缺陷。none执行与usage语义须供应商/进一步独立证据确认。

[历史独立none128回执](responses-none-confirmed-2026-10-04.md)也报告output128=reasoning128，不能回填本次，但说明提高32预算并不能证明非思考兼容修复；当前不自动加预算、猜测Chat专用字段、切换协议或重复真人请求。已有[支持材料](zhipu-responses-support-2026-10-04.md)可补本次安全统计供用户自行提交，agent未对外发送。

## 边界

本轮只读代码与用户截图并更新进度/交接，无新增产品改动、模型请求、回归测试、账户/代理/预算配置改变或Electron启动，未读Key/vault/native用户状态。上轮全unit210通过、P01-02集成19通过和全integration15项P00-03权限失败保持为上轮记录。本地fixture测试授权已恢复，真实调用仍另验；P01-02=in_progress/P01-gate=failed，工作区未提交推送。新截图提供真实usage，旧“当前usage未回传”已由此次更新替代，但完整真人验收没有通过。
