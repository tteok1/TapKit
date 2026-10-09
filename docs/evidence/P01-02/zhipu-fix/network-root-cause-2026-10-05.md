# NETWORK_ERROR 根因核对：当前链路恢复，历史底层原因缺失

日期：2026-10-05（Asia/Shanghai）；用户要求“帮我确认根因”。本轮授权按必要的无凭据网络诊断执行，不运行真人模型或Electron，也不改变代理/DNS/TUN/账户/产品代码。没有凭据、私人正文或native进入诊断。

## 确认的事实

- 默认development profile的公开账户列只读查询确认chat / glm-4.7-flashx / openai-chat / 官方标准Chat URL，status=unavailable，last_error_code=NETWORK_ERROR，last_check_at=2026-10-05 01:27:20.273 +08:00。未选credential_id、未打开vault或复制profile；报告见network-account-readonly-2026-10-05.json。
- 01:30:23及01:31:46（UTC记录换算Asia/Shanghai），沙盒与当前用户上下文DNS均返回39.108.52.113/39.108.102.11；每个地址TCP/TLS握手成功、证书验证成功，耗时33—50ms。使用原样源文件经Node内存TS转换的secureApiFetch发出无Key GET /api/paas/v4/models，两上下文均收到401，耗时103/123ms。两条GET不是模型生成，也不代表账号认证或模型验收通过。
- 01:34:50，无Key、无model字段、固定body={}，相同生产传输向实际Chat路径POST /api/paas/v4/chat/completions，收到401，耗时134ms，TCP及TLS均成功。此匿名认证拒绝说明当前该方法/端点/传输可达，不证明真实Key请求的服务端响应速度或模型能力。
- 以上共3个匿名HTTP请求、4个仅TLS握手；modelRequests=0，自动重试0。没有发送Key、使用Codex或调用生成模型。报告分别为network-root-cause-sandbox/user/post-2026-10-05.json。
- source SHA256=3c989c3f6cb92ee74c9d228f6ed57cf9dc349ad899ecac360106bac61c51ce5c。实际Core产物为packages/core/dist/index.cjs，01:16:18生成；已核对DNS固定IP、proxyEnv、20秒timer和错误回调与当前源码一致。当前用户进程元数据表明该仓库Electron在01:16:20启动，未关闭或重启。产物读取不能证明进程加载后的全部环境，更不能恢复历史请求。
- 当前用户HKCU系统代理ProxyEnable=1、ProxyServerConfigured=true、AutoConfigURLConfigured=false；诊断进程所有受支持HTTP(S)代理环境变量均未配置。沙盒账户HKCU对应值为0/false，不能用沙盒HKCU代表当前用户。没有输出代理地址、账号或密码；没有读取运行中进程内存/环境（避免触及凭据）。API代码不自动读取Windows系统代理；这是已知缺口，但直连本次成功，不能据此将它确定为截图失败根因。

## 代码中已确认的诊断缺口

packages/providers/src/api/http.ts的20秒timer从DNS前开始，到HTTPS的response回调（收到响应头）才clearTimeout。它不仅涵盖建立连接，还涵盖服务端首响应等待。超过20秒会abort，并可能被归入NETWORK_ERROR；不能把此错误限定为TCP连接失败。

HTTPS request error回调不接收或保存底层Error（例如具体TLS/连接错误码），仅抛出统一NETWORK_ERROR。adapter的非ApiFailure fetch异常也被合并。账户持久化仅有公共last_error_code和last_check_at，UI缺具体网络类别。因此当时错误若未另行采集，后续不能从现有记录恢复它究竟是连接重置、TLS、DNS异常还是20秒首响应超时。

Chat FlashX的thinking.type=disabled映射当前未实现，只有Chat 4.7-Flash和Responses Flash/FlashX的相关映射。该模型适配差异已确认，但未采集这次响应等待/思考/usage，不将它断言为NETWORK_ERROR根因。

## 结论与下一步

当前公网DNS、TCP/TLS以及生产无凭据GET/POST传输均可达，原NETWORK_ERROR没有在这些诊断中复现。已确认错误诊断丢失和计时范围，**尚未确认01:27那次的具体底层根因**；不将瞬时故障、代理缺口或模型思考标为既定原因。当前匿名通路通过不能替代真人live。

已请求用户补充从点击到失败的等待时长，以及是否调整过代理/TUN/DNS或重启；截至本记录尚未取得回答。约20秒只能支持超时线索，不能单独证明模型思考导致。若需最终确认，须在实际失败请求中保留白名单底层错误码、DNS/TCP/TLS/等待响应阶段和耗时；不得输出原始Error message、请求头、Key、正文、proxy URL或native。任何真实模型复测需单独约定有界范围；原本机完整测试暂停、Codex调用需明确同意仍保持。

## 实际执行与异常

诊断脚本network-root-cause-2026-10-05.mjs只读当前http.ts，在自己的进程内包裹node:https.request，采集事件名称与白名单错误字段；TLS固定官方公网地址、SNI为官方域名、证书验证开启。不修改源文件或运行中应用，HTTP结果body只取消不输出。

- 初次默认stripTypeScriptTypes失败ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX，退出1；因为参数属性须mode=transform。诊断脚本修正后沙盒诊断、当前用户诊断、匿名POST均退出0；不把首次失败当通过。
- 当前用户诊断经exec_command require_escalated运行，以核对沙盒/当前用户差异；自动审批允许。沙盒Get-CimInstance拒绝访问不作为网络故障证据；当前用户只读进程元数据成功。没有读取完整CommandLine或环境内存。
- 只读SQL报告生成命令退出0，当前Core产物读取/定位退出0（更早误查index.js失败后已改为真实index.cjs）。
- 早期rg .test-data文件名枚举遇到secrets目录权限拒绝；没有打开内容，未提升访问secrets权限，也未再次递归查询。后续仅访问默认development的明确数据库路径及公开列。
- 没有运行unit/integration/e2e/live验收或启动/复现Electron；任务P01-02=in_progress/P01-gate=failed保持，不提交或push。
- 两个诊断脚本node --check及文档git diff --check退出0；CURRENT压缩历史诊断并修正实际checkout目录，其详细过程保留在对应证据和任务记录。

阅读依据：当前任务/交接、16-reading-map P01-02行、06-model-adapters相关网络说明、07-tools-and-isolation§6、ADR0012、当前API传输及Core/Host启动代码。安全设计和系统代理兼容要求不变。
