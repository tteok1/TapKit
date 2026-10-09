# 最新FlashX Chat文本截断：关闭思考映射范围未覆盖

2026-10-05（Asia/Shanghai）。用户截图chat / glm-4.7-flashx / OpenAI Chat Completions / 官方标准Chat基址；提示OUTPUT_LIMIT_REACHED，文本检测输出达到Token上限，工具阶段未进入。

只读development数据库公开列退出0，确认同账户last_error_code=OUTPUT_LIMIT_REACHED，last_check_at=1791135597480（2026-10-05 01:39:57.480 +08:00）；报告chat-flashx-truncated-account-2026-10-05.json。未读取credential_id、Key、vault、native或模型正文。

当前adapter.ts/checkConnection固定文本outputLimit=32、reasoning=off。Chat关闭思考条件只接受glm-4.7-flash；glm-4.7-flashx只有官方Responses的none映射，Chat不发送thinking.type=disabled。源码查询退出0；映射范围与ADR0016原来刻意限定的修复范围一致，本次未改代码。

本轮成功读取官方[4.7/FlashX模型说明](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7)（同页列出FlashX与思考能力），以及[思考模式](https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode)（说明4.7系列默认开启思考、thinking.type=disabled关闭）。因此可以确认Chat FlashX未覆盖关闭思考的产品适配缺口，当前32Token检测预算仍发送；不只是Key/网络问题。

最新截图和数据库表明直接失败是文本输出截断，与此前PERMISSION_DENIED、工具429/1305、NETWORK_ERROR分别记录。关闭字段未映射可能导致默认思考占用预算，但本轮没有实际请求审计或usage，不能断言32Token全部用于思考，也不能用最新截断解释或确认01:27的网络错误。工具能力、稳定性、原账本与完整live仍未验收。

合理修复方向：在精确官方标准Chat端点和已核对模型范围内，将FlashX的off映射为thinking.type=disabled，保持32/128预算和无自动重试边界，更新ADR/规格并验证映射两阶段及截断异常分支；真人结果须另行取得。不向所有GLM/网关/协议加同一字段，不用提高预算掩盖适配问题。

本轮仅源码/公开记录/官方文档核对与文档同步；模型请求0，无测试套件、Electron启动或产品/用户配置修改。P01-02=in_progress、P01-gate=failed与本机完整测试暂停要求保持，未提交推送。
