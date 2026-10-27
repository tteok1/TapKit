# P05-01 托管搜索改造验收

2026-10-27，D:/Tapkit-public，codex/p05-chat-m1，ad85bc4 + 未提交工作树。用户要求先修改设计再实施，设计为 docs/plan/17-hosted-web-search.md / ADR0066；原任务和共享契约已同步。无commit/push/merge，不进入P06。

## 实现

当前模型账号执行独立托管搜索：Codex通过锁定pi-ai的payload hook与受控SSE，Responses使用web_search/sources，Anthropic使用服务端搜索块及最多一次pause_turn续传。Core仍掌管工具循环、并发/Token账本、取消、scope/version及引用。搜索不带历史、文件、记忆、客户端工具或原生状态；辅助回答/服务端推理不写聊天或原生存储。Chat协议明确不支持，无自动切换/重试/Tavily回退。

去重/限制候选，域名在本地强制校验，时间/语言/地区为界面明示的检索偏好。来源须经安全读取/固定归档和引用支持检查，保存项目/导出复用旧链路。移除Tavily Key表单、读取和请求；旧凭据仅可显式删除，公开网络层删除Bearer类型与Authorization构造，并拒绝遗留bearer参数。自动审批最初拒绝相关补丁后采用此更严格方案，最终无审批阻塞。

真实端点的model_not_found揭示锁定目录过期；仅增加官方gpt-6.1-sol元数据并同步冷目录/账号目录，low/medium/high如实声明，连接探针采用low。原默认选择不改变，不复制Codex缓存里的提示词。

## 真实服务范围

用户先授权最多2次、后追加最多2次公开问题隔离搜索；实际尝试3次，剩余1次未使用。使用已登录Codex订阅的凭据，仅内存读取，禁止写回全局认证或保存原生搜索状态。

| 次数 | 结果 | 证据 |
| --- | --- | --- |
| 1 | NETWORK_ERROR，未取得HTTP响应 | live-search-01.json |
| 2 | 经系统代理取得HTTP400/model_not_found，旧gpt-5.5不可用 | live-search-02.json |
| 3 | gpt-6.1-sol/low，HTTP200；观察到1次搜索；usage actual=input8725/output204/cached4096/reasoning40 | live-search-03.json |

无认证GET曾返回405，只用于确认已启用系统代理的连通性，不是模型搜索。第三次来源实际读取成功三页，另一次Node about读取失败保留在readErrors；未伪报所有候选可读。

随后使用已取得的真实候选（不新增模型请求）继续Core链路，重新读取TypeScript、Node.js和Electron原文，保存3个固定Blob快照；用原文的单段引文核验3条引用，关闭网络后逐一读取归档哈希一致。hosted-source-live.json / hosted-source-live.log通过；跨行引文的首次测试准备失败另存hosted-source-live-initial-failure.log。此为真实搜索与Core来源链的分段联验，未宣称真实模型自主完成整段聊天或验证TapKit OAuth完整登录流程。

R06的Codex/gpt-6.1-sol隔离搜索与来源链已验；Responses/Anthropic仅离线协议验收。R01—R05完整live原暂缓边界不变，不提升P01等历史gate。

## 自动检查

所有命令通过锁定Node24.21.0/pnpm12.4.1运行。完整命令、退出码与源码hash在P05-03各results.json，不把首轮整体失败计为全绿：

- hosted-run-01：check/build/unit385/P01 integration84 exit0，P05新增账本测试断言失败后停止。
- hostedFinish-run-01：check/P05 integration24 exit0，8个Electron中7过、连续链路计数断言失败。
- hostedModel-run-01：同步冷目录并修正测试的“单次用户发送”计数后，check/unit385/P01 integration84及模型设置/连续链路两个Electron退出0；连续11步完整通过。
- 合计8个不同Electron用例分轮通过，含浏览器隔离、浅深/960/200%、归档/断网、五格式导出/真实中文PDF和连续链路。不是同一轮8项全绿。
- 最终输入审计 hosted-input-audit.json：最新385单元/84项P01之后产品源未变；P05相关产品逻辑与24项集成一致，后置变化仅Codex冷目录共享及测试定位，已由模型目录/协议与连续链路复验。

新测试覆盖三个序列化路径、隔离拒绝、来源/引用合并、缺搜索/缺终止/额外搜索/服务端异常、Anthropic续传/累计用量，以及真实Router的同账号预约/结算、429不重试和取消/关闭/版本变化后拒绝结果。既有导出与浏览器边界未降低。

原P00—P04证据由runner恢复。原P05截图/产物恢复，当前UI另存P05-03/hostedModel-run-01/current-ui；原失败trace与steps保留。新开发包及原资料入口的最终结果见 P05-03/hosted-verification.md。
