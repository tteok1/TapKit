# P01-02 Responses JSON核验及兼容修复

2026-10-05，用户要求“进一步核验，并且修复”。目录D:/tapkit/TapKit，分支codex/fix-zhipu-api-probe，HEAD b92eece52e88eb6bd16931cd6ed942bb91d4d1f6加工作区改动，未提交/推送。P01-02仍in_progress，P01-gate仍failed。

## 已核验与修复

官方llms.txt索引可访问；浏览工具读取Responses两页仍失败，沙盒curl因Windows TLS SEC_E_NO_CREDENTIALS退出35。随后当前用户上下文curl仅GET官方公开Markdown文档，两页均退出0，不含认证头/Key，不调用模型。源码与文档的对照确认：

- [创建Response](https://docs.bigmodel.cn/api-reference/response/创建-response.md)的InputMessage要求type/role/content；现有body.input的文本消息缺type。现已仅对精确官方Responses端点补type=message，覆盖当前消息与缺少类型的native回放消息；function项及其他服务不改。
- 官方error事件允许顶层code，原SSE分支只读嵌套码。现已补读顶层码，使用实际HTTP状态，并补官方Responses字符串别名（参数、模型、认证、权限、额度、过载/降速、内容策略），HTTP401/403优先。Chat数字码/其他服务范围保持。
- [Responses指南](https://docs.bigmodel.cn/cn/guide/develop/responses/introduction.md)确认/api/v1基址、stream=true的SSE和none非思考；现有这三个设置符合文档，不改为Chat字段或增加预算。文档示例的新模型不等于用户FlashX的本次实际支持证明。

用户HTTP200/JSON截图未包含正文或发送审计，故这些是可确认的代码兼容问题，而不是截图唯一根因的证明。没有重新调用该账户、读取vault或解析历史私人响应。

## JSON核验

成功HTTP响应声明为JSON时，最多读取65,536字节，严格UTF-8/JSON解析，支持现有取消/超时；超限停止读取并取消，释放reader。函数只返回固定结构分类和受限error.code/type，不输出JSON对象、message、头、Key、正文、推理、工具参数或响应ID。

业务error对象/顶层error变为upstream_error及具体错误类别，沿用安全HTTP/响应类型/业务码字段；无错误的普通Response对象仍STREAM_INTERRUPTED/non_streaming_response，其他JSON为unrecognized_json，非法、超限、空或读取失败使用既有固定原因。JSON头下的SSE不被放行；HTML/其他仍不读取且拒绝，缺失头保持严格SSE验证。没有非流式成功回退，连接检测及live不新增请求/重试；正常router复用既有有界策略。决定见[ADR0019](../../../adr/0019-zhipu-responses-json-and-message-compatibility.md)，其JSON规则优先于ADR0018旧规则。

## 实际检查

命令使用`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\pnpm.ps1`：

- 初次指定文件格式化报告pnpm退出2，http.ts写入UNKNOWN错误，其他文件已格式化；后续仅重试必要文件退出0，见[format日志](responses-json-fix-format-2026-10-05.log)。未确认初次写入错误的底层原因，未改ACL。
- 首次check退出1：新增native回放用例把undefined显式赋给可选属性，被exactOptionalPropertyTypes拒绝；已改为在fixture正常结束后传入实际ref，保留[失败日志](responses-json-fix-check-2026-10-05.log)。修正后check退出0，[首轮修正结果](responses-json-fix-check-final-2026-10-05.log)；随后静态复核发现回放用例应包含首轮实际assistant正文，补齐断言后再check退出0，[最终静态结果](responses-json-fix-check-reviewed-2026-10-05.log)。这些是类型检查，不是执行用例。
- build:desktop退出0，[构建日志](responses-json-fix-build-2026-10-05.log)，依赖Rollup注释位置警告为既有提示。Core与Renderer bundle已静态核对含消息类型、JSON核验及新增固定原因；指纹见[结果JSON](responses-json-fix-results-2026-10-05.json)。
- docs:check与git diff --check结果见结果JSON和对应日志，不将静态验证冒充真人通过。

新增/调整unit覆盖JSON错误/正常对象/其他结构、坏UTF-8/JSON、空与超限、取消与读错、不保存native/不发工具/无正文泄露、顶层SSE码、官方别名/HTTP优先级、消息类型及两轮native回放、非官方负例；integration覆盖Chat/Responses和Flash/FlashX的HTTP200 JSON业务错误、Core失败持久化、消息type和请求数。**全部新增回归未执行**，遵守用户本机测试暂停要求。unit/integration/e2e/live均NOT RUN，不能写通过数。

无真人模型请求、Key/vault/Codex/native状态读取、用户配置变更、Electron/dev启动或崩溃复现。既有Chat FlashX和安全分类改动保留，P00-03日志未改。官方文档核验不替代真实JSON业务码和完整验收；下一位开发者在自己的隔离环境运行用例，真实诊断按新结果核对，不连续重复供应商调用或提升阶段状态。
