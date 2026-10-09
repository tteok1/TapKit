# Chat FlashX NETWORK_ERROR 用户回执

2026-10-05（Asia/Shanghai）。最新用户截图：chat / glm-4.7-flashx / OpenAI Chat Completions / https://open.bigmodel.cn/api/paas/v4，连接检测未通过 NETWORK_ERROR；未显示阶段、HTTP状态、业务码、检测时间或usage。

本次只读命令均退出0：读取http.ts、adapter.ts、zhipu.ts及相关rg；Resolve-DnsName open.bigmodel.cn -Type A返回公网39.108.52.113/39.108.102.11（含公开CNAME）；项目锁定Node仅执行dns.promises.lookup(all:true,verbatim:true)，同样返回上述两个IPv4地址。本次DNS已不同于此前198.18.0.92，不将旧DNS快照用于解释最新回执；未确认用户是否修改网络配置，不推定代理兼容已经解决。

http.ts将DNS/连接超时、HTTPS request的error等归入NETWORK_ERROR，request error回调没有保留底层错误码；adapter.ts将非ApiFailure的fetch异常也归入NETWORK_ERROR。截图因此不足以区分连接、代理、TLS、超时等具体来源，不能断言Key错误、模型错误或本次是否到达供应商。未执行HTTPS/模型请求或读取凭据，无法凭只读DNS诊断官方控制台记录缺失。

额外源码发现：Chat非思考映射只白名单glm-4.7-flash；glm-4.7-flashx当前只有官方Responses的none映射，Chat不会发送thinking.type=disabled。该适配差异不能解释当前NETWORK_ERROR；不能把它与此前Responses截断或429/1305合并为同一原因。未改变字段、模型或预算，未核对FlashX Chat新的官方语义。

当前需保留底层网络故障的安全原因以定位，而不能靠反复检测或猜测。仅解释/记文档，产品源码、用户配置未改；无测试、Electron启动或模型请求，不提交推送。P01-02=in_progress/P01-gate=failed及用户本机测试暂停要求保持。
