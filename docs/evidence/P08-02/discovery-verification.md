# P08-02 发现搜索补验（2026-11-03）

当前：完整智谱闭环未通过，P08-02整体为implemented_not_live_verified。检测30/30已用完，真实调用已停止；指定URL历史通过范围保留。分支codex/p08-02-research，未提交/推送。

## 授权与约束

用户新增10次连接检测：累计上限20→30，原14次不重置。原智谱Chat/glm-4.7-flashx账户；每轮启动实际TapKit，应用内文本与工具检测通过后才发正式任务。工作预算8次模型/12工具/100000 tokens/600000ms，不追加正在运行的预算。检测用量未知，不混入正式根用量。

最后一轮#28/#29失败、#30通过后才发正式任务；最终30/30，不能追加检测。全部17个实际隔离目录的凭据副本已清理，marker closed；原账户与网络配置保留。JSON指针不作为目录计数。详live-attempts.json、credential-cleanup.json、discovery-audit-final.log。

## 网络诊断与修复

1. 无模型诊断复用生产NetworkPolicyService、代理解析、AnonymousReader、WebTools。原环境DNS公网校验、Example Domain静态/动态读取正常；Bing查询在代理解析阶段被拒，错误proxy_resolution_failed。Host的resolveSystemProxy错误禁止search参数，未发请求就映射NETWORK_ERROR。证据network-diagnosis-before.json；新增回归修复前确实失败，search-proxy-regression-before.log。
2. Host允许已授权HTTPS查询URL，长度2048→4096与web.read对齐；仍拒绝URL用户名/密码、片段、非HTTPS及不支持的代理；Core公开DNS/固定地址/TLS/查询授权保持。代理/传输32项unit通过（search-proxy-regression-verified.log）。
3. 修复后原代理路径HTTP200但公开搜索结果与主题无关；三条查询及编码/固定参数对照均保留。相同iana查询直连返回相关IANA结果。这里只证实路径差异，不断言代理链中哪个外部组件造成异常。证据network-diagnosis-queries.json、network-diagnosis-routes.json及对应public extraction JSON。
4. 正式用例仅在隔离副本的TapKit通用设置页保存“直连”，截图network-direct.png；原网络配置与账户保留。无模型直连已读取实际候选IANA和LARUS，见network-diagnosis-direct-full.json、network-search-iana-direct.log。动态读取中UNKNOWN_ERROR失败也保留；正式研究走成功的静态GET提取，不据此扩大动态网页通过范围。

## 真实任务与失败保全

用例：无起始URL，公开研究IANA协调哪些资源；search发现候选→至少两个主域名实际读取→逐字事实/位置/hash→显式research.report→MD/来源JSON。来源不同域名不自动证明发布者独立，各条结论不足独立核验时继续partial；不改变质量算法换取通过。

- 第一轮live-3e4eed7e-cef0-47aa-85df-42eae8a91d00：检测#15通过后才发任务；5模型/7工具，3成功搜索/3实际读取，0引文/无显式report，not_verified。actual14935，reserved0，副本清理。随后Core暂不声明重复搜索，先消化候选/新原文，显式gap仍可再搜索；只接收当轮声明的工具。
- 第二轮live-7301c8b0-e871-4b94-a001-8fd77419365c：#16响应头超时失败、#17检测通过后才发任务；8模型/11工具，1成功搜索/3实际读取/双域名6引文及位置/hash/报告字节通过。最后模型工具名未声明（安全trace仅tool_name分类），显式report未成功，预算兜底partial，not_verified保留。actual35539+estimated26606，reserved0，副本清理。后续在每问题已有两组事实且候选已消化时优先列出report，保留其他工具和原参数修正次数；不额外增预算。
- 第三轮live-8989dde3-18ce-4489-a8c5-1426ee05c551：#18检测通过后发任务；7模型/9工具，搜索1/读取3；一次NETWORK_ERROR按原策略重试，后续逐字事实拒绝/批次数量过大，0引文/无显式report，not_verified。actual20755＋estimated53293，reserved0，副本清理。模型侧record改为每次一条发现，多引文/冲突/内部批量验证保持；可信错误码给固定逐字修正提示，不回显原参数。两组事实齐备时优先报告，无需读完未选候选；同预算用例只需每域名一页一条事实，验收门槛保持。
- 第四轮live-1818ecaa-4723-4468-bbec-6b3a362e00b0：#19检测通过后发任务，8模型/8工具，搜索1/实际读取2/一条事实；三次参数拒绝后PARSE_FAILED、无报告，failed保留。actual31244＋estimated25931，reserved0，副本清理。补Core二次校验的安全字段路径/错误码，不再只反馈笼统错误；完整UUIDv7和逐字标准不放宽，研究集成25通过。
- 第五轮live-bdc5d4ad-f53c-4d54-ae76-b8f71ddd1177：#20-23直连模型探测响应头超时；#24为路由诊断终止隔离测试，记interrupted仍消耗次数；0正式任务，副本清理。只终止唯一测试harness后代Electron主进程，未操作原应用/账户；见route-stop.json。未把中断当通过。
- 第六轮live-78bb2c2b-3135-4cd1-9600-a2039629bab2：仅隔离启动NO_PROXY增加bing.com/iana.org/larus.net，模型保留environment原路由；#25-27探测仍响应头超时，0正式任务，副本清理。每路由最多3次，再诊断；总上限30保持。
- 第七轮live-23d37b33-f6c9-4f2e-8dcf-c189f4e2edbe：相同隔离路由，#28/#29响应头超时，#30通过后才发run 01a1a012-f3a6-7832-928e-d0ee7263a09e。6模型/7工具、搜索1/实际读取2、核验到一条fact；候选读取遗漏queryIndex、事实改写与QUOTE_NOT_IN_SOURCE累计三次拒绝，PARSE_FAILED/无报告，failed。actual26400，reserved0，副本清理。全部本任务正式根actual170356＋estimated279917，保守450273；估算不当实际，连接检测用量未知/不含其中。

## 最终本地修复与尚未完成项

最后捕获的候选读取缺queryIndex已修：仅在同一问题恰有一个ready且非空的已批准查询时补齐索引；多查询、不可用查询、无匹配问题和显式无效值均不猜。Core严格联合契约仍验证完整参数、URL及权限。新增unit/integration已实际执行，完整check/unit487和研究集成26通过，见final-local-verification.log。该修复在额度耗尽后完成，**尚未再次真实调用验证**。

对最后实际公开工具参数仅在内存做归档原文对照，不读取原生推理或输出参数值：失败引文与指定原文存在文字差异，空白折叠、Unicode规范化及其他已读来源均不能匹配（final-quote-diagnosis.json）。引用验证器保持拒绝，不以宽松匹配伪造通过。原failed/not_verified报告保持。

尚需验证当前智谱在预算内稳定完成两组有效事实及显式research.report，并真实导出报告/来源清单；包括最后索引投影的live回归。仅成功搜索/读取或单条事实不满足完整验收。后续真实检测需用户另行授权额度，不能重置现有30次。

## 最后连接阶段诊断

无Key/无模型调用的两公网地址TCP/TLS对照均完成证书/域名校验；生产API传输匿名GET公开根网站200（直连146ms，原代理1947ms），生产匿名网页传输同样200。没有读取或记录根网站正文。证据model-tls-only.json、model-transport-diagnosis.json、model-http-control.log。

实际应用探测新增默认关闭的固定阶段日志：只有P08显式开关、profile/case匹配才启用，不覆盖案例、不跟随链接、上限1MiB，只记录请求v7 ID、阶段/耗时/时间，不记录URL/headers/body/Key/原生推理。第28次dns_complete=17ms、proxy_resolved=40ms、客户端request_finished=1670ms，随后request_error=90011ms，未收到response_headers。发送结束不能证明服务端已处理，具体服务端内部或路径原因不据此虚构。第30次最终检测成功，连接额度即停止追加。

## 本地验证

所有命令通过仓库锁定Node24.21.0/pnpm12.4.1运行。诊断脚本退出0仅表示采集完成，具体成功/失败读JSON，不冒充验收通过。

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| 代理/固定TLS unit | 32通过，退出0 | search-proxy-regression-verified.log |
| 最终check/unit/研究集成 | check与487单元、26研究集成通过，退出0 | final-local-verification.log |
| API阶段诊断相关回归 | 486单元、40相关集成（含研究25）通过，退出0；此后研究由最终26覆盖 | api-transport-stage-verification.log |
| 单条记录投影 | 484单元/24研究集成通过，退出0 | flat-record-verification.log |
| 研究/网络/智谱定向集成 | 31通过，退出0；此后report优先阶段由下行覆盖 | discovery-final-integration.log |
| 报告提示阶段研究集成 | 23通过，退出0；后续单条投影由上行24项覆盖 | report-readiness-integration.log |
| P08-02真实桌面 | 1通过，退出0，DOCX/PDF、引用、排除、提前结束；此后只有模型提示变化 | discovery-phase-e2e.log |
| 最终P08-02真实桌面 | 最终源1通过，退出0；真实Electron/Core/SQLite/Blob/AppContainer/Office，模型/网页合成；生产构建恢复 | final-desktop-verification.log |
| 真实探测所用生产Core | 构建退出0，无fixture，API固定阶段诊断默认关闭；最后索引修复晚于该live | api-transport-production-build.log；final-live-production-snapshot.json |

沙箱首次Electron启动退出1、Vitest临时缓存ENOENT、两次格式/测试类型门禁失败均留原日志，修复后用独立日志记通过。全量集成515过/1既有skip保持原稳定基线范围，未伪称重跑最新全套或远端CI。

最终交接：本地规定检查完成，当前生产包无fixture；真实完整链未通过，后续仍需在获授权额度内验证双源有效事实及显式报告。未提交/推送，不开始P08-03或P08阶段收口。verification.json记录当前范围，verification-before-discovery.json保全原2026-11-01验证快照。
