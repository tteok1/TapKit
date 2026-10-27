# ADR 0064：公开网页、匿名网络与固定来源快照

2026-10-27：搜索服务、凭据及R06选择已由[ADR0066](0066-isolated-provider-hosted-search.md)替代；以下保留原决策背景，网页安全/快照/引用部分继续有效。

- 日期：2026-10-26；状态：accepted；任务：P05-01（FR-18-001—008）。
- 依赖：沿用自建 Core/Host、private vault、只读工具、BlobStore 和现有 citations，不引入服务器或登录浏览器。

2026-10-27组合安全复核：每轮Core仅授权当前用户显式URL、实际搜索候选和已读正文中的原始链接，按URL规范化后精确匹配，禁止模型附加query/path来外传历史、资料或记忆。搜索原文query约束保持；公开重定向仍逐跳核验地址/域名，动态页面没有本机数据或凭据。新来源chip只返回同会话的标题/版本/时间；会话软删除保留快照、永久清理才释放，见ADR0065。

NetworkPolicyService 统一公开 URL 和模型目的地址校验：每次连接重新解析，全部 DNS 地址必须为公开地址，连接绑定其中已验证 IP；网页只允许 HTTP(S) 常规端口，模型保留原自定义 HTTPS 端口支持。HTTP/HTTPS CONNECT 显式连接核验后的 IP，Host/SNI/证书验证仍对应原站点。网页最多5次跳转，跨跳转重验域名及网络策略；响应50MiB且拒绝不受控压缩。系统/手工代理沿用已有解析器，搜索 Bearer 只到固定 Tavily search 端点，不随重定向转发。

Tavily 为独立可选连接，Key 经 Host safeStorage 加密并受当前用户 ACL 保护，不进入设置、事件或普通请求日志。搜索只允许当前用户本轮原问题去掉 URL 后的有界 query；不接受模型追加的历史、记忆或文件正文。basic/max_results=8，无 answer/raw/image；时间、语言、地区和域名过滤显式映射。无 R06 返回 SEARCH_NOT_CONFIGURED，与空候选不同。

HTML 使用已锁定 parse5 7.3.0 做惰性结构抽取，排除脚本/样式/表单/导航，保留正文中的不可信指令作为来源数据。静态正文不足的动态页面由独立内存 session/WebContentsView 读取：无 preload/Node/应用 IPC，拒绝权限、下载、弹窗、POST、私网和非 HTTP(S)；禁 QUIC/非代理 WebRTC，强制认证本机代理并取消隐式 loopback bypass。受控代理重新解析并连接公开 IP，15秒有限 DOM 稳定观察，不等待无穷 networkidle，CDP 只执行固定观察表达式。每次读取清理连接和存储，不使用用户浏览器登录状态。

schema15 新增 web_sources 和每会话 web_options_json，将 citations 扩为 file_version_id/web_source_id 二选一；旧文件引用事务迁移保留。只有成功正文才写 BlobStore 快照及不可变 sourceId/revision/contentHash/fetchedAt/body locator。搜索摘要不能当引用，网页来源不会进入 system。每根最多2次搜索、16页且每轮最多8页，正文给模型最多20k字符；更长正文保留本地快照，取消/设置改变后的迟到结果不落来源表。

联网 off/on/auto 独立控制新增 web 工具；项目“仅依据资料”优先禁止网页，旧项目本地只读工具设置仍约束其原工具。auto 只匹配本轮明确 URL/查证/搜索/时效请求。来源只在本轮真实工具返回集合中核验；文件与网页结论共同校验引用范围、数字和引号，未知标记及未覆盖结论拒绝，不因有一个有效来源就通过其余文字。固定引用可在面板离线打开，正文及来源链接可显式存为项目资料。

工程、Chromium 原生边界、模拟搜索与真实 Tavily 分开记录。无 R06 不能标真实搜索通过；P01—P04 原 live/gate 状态不由本任务提升。
