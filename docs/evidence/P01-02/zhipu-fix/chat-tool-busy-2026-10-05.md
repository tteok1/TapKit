# Chat 工具检测 HTTP429/1305 用户截图

日期：2026-10-05（Asia/Shanghai）；本次仅解释用户回执与核对代码，不运行检测。

用户提供截图：账户 chat，glm-4.7-flash，OpenAI Chat Completions，https://open.bigmodel.cn/api/paas/v4；连接不可用；提示“连接检测未通过 (PROVIDER_UNAVAILABLE) · 工具检测：服务返回错误 [HTTP 429] [服务错误码 1305]”。截图不含检测时间、请求ID或usage，不能自行补写。

当前源码 adapter.ts/checkConnection 只有在文本收到非空正文、完整 finish=stop 且无错误时进入 tools。因此按当前实现，截图说明该次文本阶段已通过，工具请求获得 HTTP429/1305，完整连接检测未通过。errors.ts 将智谱1305映射 PROVIDER_UNAVAILABLE/retryable=true，与既有官方核对的模型繁忙含义一致；连接检测本身没有自动重试。

这次回执不同于此前198.18 DNS请求前PERMISSION_DENIED。它已获得服务HTTP/业务码，不能继续用DNS阻断解释这一次工具失败；不代表系统代理/Fake-IP产品兼容已经修复，也不证明当前所有请求都通畅。不能由模型繁忙断言Key无效、余额耗尽或工具能力不支持。

截图证明存在请求/响应，但未证明智谱控制台显示记录、计费或usage；官方记录缺失原因还需按该次时间和所属账户/项目核对，不能由本截图判定延迟或漏记。没有读取Key、账户数据库或请求正文。

实际只读源码命令（errors.ts前44行、adapter.ts检测段及git status）退出0。官方错误码页面 https://docs.bigmodel.cn/cn/faq/api-code 及其Markdown访问本轮超时，搜索未取得该错误码的官方新内容；1305含义依据2026-10-04已核对并记录的model-busy-1305-2026-10-04.md，不冒充本轮重新核验成功。

本轮没有模型请求、测试、Electron启动或产品/配置修改，仅文档与进度同步；git diff --check另行记录。P01-02=in_progress/P01-gate=failed保持，不把文本通过写为完整检测通过。不提交推送。本机后续测试暂停要求保持。
