# 资料、核验记录与适用边界

核验日期：2026-09-15。仅引用用户原始资料、上游源码和官方技术文档；未使用第三方文章推断厂商内部系统。

## 用户资料

- [完整产品功能池原件](references/product-original.md)
- [底层策略设计原件](references/strategy-original.md)
- 用户最后25项答复已整理到[范围与决策](02-decisions.md)，不是原件中所有需求都需要本轮开发。

## 模型与pi

| 资料 | 核验结果及用途 |
|---|---|
| [OpenAI认证](https://learn.chatgpt.com/docs/auth) | 订阅和API认证边界；不用于证明任意第三方直连获得官方稳定性承诺 |
| [pi锁定源码](https://github.com/earendil-works/pi/tree/53816d7dcc5ebe3a0eedec3cd07196c3a66d83fd/packages/ai) | 实际读取OAuth、provider、Codex Responses转换和测试源码；复用0.85.1公开模型包，不复用Agent内核 |
| [pi provider源文件](https://github.com/earendil-works/pi/blob/53816d7dcc5ebe3a0eedec3cd07196c3a66d83fd/packages/ai/src/providers/openai-codex.ts) | 模型适配与编排可分离；旧pi-mono链接已迁移 |
| [DeepSeek入门](https://api-docs.deepseek.com/) | 实际打开的页面优先于搜索摘要；当前deepseek-flash别名与旧缓存不同 |
| [DeepSeek工具](https://api-docs.deepseek.com/guides/tool_calls/) | 工具配对和Beta strict边界 |
| [混元兼容接口](https://cloud.tencent.com/document/product/1729/111007) | 浏览工具正文抓取失败后下载官方页面读取，确认/v1/chat/completions与Bearer鉴权 |
| [方舟快速开始](https://www.volcengine.com/docs/82379/1795150) | 官方搜索内容有baseURL/model示例；部分正文抓取失败，账户实际model/参数仍列为P01真实验证项 |
| [xAI Responses](https://docs.x.ai/developers/rest-api-reference/inference/responses) | Responses路径与显式store配置 |

## 工程与执行

- [Electron安全](https://www.electronjs.org/docs/latest/tutorial/security)：Renderer/IPC/远程内容边界。
- [utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)：Core故障隔离进程。
- [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)：Windows凭据保护，不等于整个数据库加密。
- [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)：内置网页面板。
- [SQLite FTS5](https://sqlite.org/fts5.html)：本地全文索引，具体中文短词策略为本项目决定。
- [AppContainer](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation)、[Job Object](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)：Windows隔离基础，仍须实际对抗验证。
- [BGE中文ONNX转换模型](https://huggingface.co/Xenova/bge-small-zh-v1.5)：本地CPU检索资源，使用前按revision/hash和许可锁定。
- [LibreOffice下载](https://www.libreoffice.org/download/)：官方发行运行时来源；不能把其他便携版来源默认视为官方。
- [Playwright Electron](https://playwright.dev/docs/api/class-electron)：开发E2E支持，存在实验性限制。
- [Tavily搜索](https://docs.tavily.com/documentation/api-reference/endpoint/search)：独立搜索API，用户本机配置key；本地URL读取不依赖它。
- [GitHub PR接口](https://docs.github.com/en/rest/pulls/pulls)、[GitHub认证](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api)：最小权限与PR创建/查询。

## 版本事实和验证区别

NPM版本来源于公开registry元数据，留存[依赖版本快照](references/npm-version-snapshot.json)。版本存在不等于新工程中已兼容；P00-01负责构建验证。Windows helper是指定待开发模块，不是当前已存在并通过审计的成品。

模型可用性、账号权益、费用和部分协议会变；本手册指定适配器和确定的探测/锁定/错误处理程序，不要求coding agent把缺失事实编造成常量。修改基线须写ADR与相关回归证据。
