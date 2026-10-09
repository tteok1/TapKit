# Responses FlashX非事件流回执

2026-10-05（Asia/Shanghai）。用户截图response / glm-4.7-flashx / OpenAI Responses / https://open.bigmodel.cn/api/v1，文本检测STREAM_INTERRUPTED，提示返回内容不是事件流（unexpected_content_type）。截图中“可能收到网关或代理页面”是通用诊断文案，不是代理根因证据。

默认development数据库仅选公开配置/状态列，退出0；同名response账户记录STREAM_INTERRUPTED，last_check_at=1791137120786（2026-10-05 02:05:20.786 +08:00）；见responses-content-type-account-2026-10-05.json。没有credential_id/Key/native读取，数据库只读。将现有公开列查询诊断脚本参数限定为chat或response及对应固定官方基址，未扩大到任意账户枚举。

源码核对：adapter当前已为官方Responses FlashX/off映射reasoning.effort=none，body.stream=true、store=false；刚完成的Chat FlashX映射不替代该既有Responses字段。没有本次实际请求审计，因此这里是源码行为而非本次发送边界证据。

adapter在response.ok=false时先走安全HTTP错误分类；apiEvents仅在已有body且明确Content-Type的MIME不为text/event-stream时返回unexpected_content_type，并取消body。因此按当前实现，截图说明拿到了响应、进入了事件流前置类型检查（HTTP为2xx分支），而不是此前DNS请求前拒绝或32Token截断。但确切HTTP状态及Content-Type都没有保存在这次回执中，不能断言200、JSON、HTML、网关/代理或官方错误。类型校验前没有解析正文，也没有收到正文/工具成功证据。

当前若要确认原因，需在真实失败请求中附安全HTTP状态与MIME类别（JSON/HTML/其他）；不要把非SSE强行当成功、忽略类型检查、混入Chat专用thinking字段或输出原始响应/Key/headers。没有新的真人请求，不能用匿名接口替代该请求的内容类型证据。

本轮只读核对及文档记录；没有产品修改、模型调用、测试套件、Electron启动或用户配置改变。官方Responses说明页本轮访问超时，不冒充新文档核验成功。P01-02=in_progress/P01-gate=failed及本机测试暂停保持，未提交推送。此前Chat修复仍是已构建、回归/live未执行的状态；本截图不提供Chat通过反馈。
