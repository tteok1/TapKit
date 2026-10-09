# ADR 0009：Codex OAuth、SSE与原生状态边界

- 日期：2026-10-02（Asia/Shanghai）；状态：采用；任务：P01-01。
- 延续ADR0001的pi-ai 0.85.1，无版本升级。不接入Codex CLI、App Server或pi任务引擎。

## 决定

每个TapKit账户独立创建公开Models collection，仅注册openaiCodexProvider。CredentialStore.modify串行读改写；Host私有保险库采用持久版本CAS，轮换token加密落盘完成后才放行请求。logout写无凭据的版本墓碑，阻止其他Core世代或迟到刷新覆盖注销。

OAuth使用上游公开models.login，保留上游client_id、PKCE、loopback端口与device_code流程。Host仅打开auth.openai.com的授权/设备码固定路径。上游手工输入允许裸code，TapKit入口收紧为完整localhost:1455回调URL，并验证唯一code/state；不读取其他应用账号或环境中的未知凭据。端口占用交上游手工入口恢复，不结束其他进程。登录状态仅在内存，Core重启后重新登录；持久凭据与账户记录保留。

请求采用上游SSE、maxRetries=0和应用systemPrompt/tools。受控fetch锁定订阅endpoint，拒绝重定向/自定义地址。上游0.85.1的SSE分隔及UTF-8解码不满足共享严格契约，因此在fetch响应体上规范化CRLF/多data行/心跳并使用fatal UTF-8，逐帧交回pi处理；无终结事件、无帧边界、工具完整参数非严格JSON均报STREAM_INTERRUPTED。HTTP和SSE错误code从结构化响应提取，丢弃人类错误文本。429不自动判为额度耗尽。

tool_end在完整assistant的done到达、所有调用配对、参数快照核对且native状态落盘后发出；失败流不释放工具。ProviderAdapter只产生提议，不执行工具，后续网关仍须schema校验。

SQLite迁移0002新增规格已有的opaque_states/model_catalog，数据库user_version=2；仍接受v1备份恢复并升级，拒绝更高版本。原生消息/签名经Host safeStorage加密，SQLite仅存绑定元数据、密文引用与hash；加载时核对解密文档content hash，账户/模型/adapterVersion/分支或canonical前缀不符拒绝回用。JSON文档与IPC协议版本仍为1，数据库版本不等同文档版本。

认证UI为MemoryRouter内的/dev/codex诊断入口，P02再整合设置页。Renderer仅通过白名单方法获得账户、候选目录、脱敏探测结果与登录交互；没有secret/native读方法。文本与echo两次最小探测均成功才标账户ready、对应模型probed，其他目录项维持documented。

## 证据与限制

发行包npm公开gitHead为d981de1229ef899957bbe968bc8dcda02a21f477，不同于原规格静态参考53816d7。实现依据发行包公开exports和types，不依据旧源码私有路径；包integrity与P00锁文件相同，见resources/catalogs/codex-adapter.json。

R01未配置，真实OAuth/订阅权限、工具及刷新联调未执行。官方认证资料及新公开SIWC文档只用于核对边界，不以文档或bundled目录推定当前账户权限：<https://learn.chatgpt.com/docs/auth>、<https://developers.openai.com/siwc/token-sharing-open-source>。本任务保留既定pi兼容路径，live发现协议变化后应根据具体证据调整适配。
