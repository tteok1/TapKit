# P01-02 官方文档复核与 FlashX 替代路径

2026-10-05，用户问无法获得智谱确认时能否从官方 API 文档找到方案。当前分支 codex/fix-zhipu-api-probe、HEAD b92eece 加已有工作区改动；本轮仅公共文档核对及进度记录，不修改产品代码或账户，不发送模型请求，不读取 Key/vault/native 状态，不提交推送。P01-02=in_progress、P01-gate=failed。

## 实际读取

浏览工具可读官方 llms.txt，用户给出的入口及目标正文超时。沙盒 curl 仅匿名 GET Responses 指南失败，退出35（Windows TLS SEC_E_NO_CREDENTIALS）。随后当前用户上下文 curl 匿名 GET 以下六份公开 Markdown，全部退出0，临时文件只用于核对，不含认证头或模型请求：

- [用户给出的 API 快速开始](https://docs.bigmodel.cn/cn/api/introduction.md)：标准基址 /api/paas/v4，示例调用 /chat/completions。
- [OpenAI API 兼容](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction.md)：SDK 的 Chat Completions 使用上述标准基址。
- [Response API 兼容](https://docs.bigmodel.cn/cn/guide/develop/responses/introduction.md)：独立基址 /api/v1；reasoning.effort 默认 max，none/minimal 都是放弃思考的参数值。
- [创建 Response](https://docs.bigmodel.cn/api-reference/response/创建-response.md)：ReasoningConfig 同样定义 none/minimal；max_output_tokens 包含回答与思考；此次读取的请求定义未列出 thinking 字段。
- [思考模式](https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode.md)：GLM-4.7 系列默认思考，使用 thinking.type=disabled 关闭；文档明确的强制思考例外是更新的其他模型，不能推断 FlashX 强制思考。
- [GLM-4.7/FlashX](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7.md)：列出 FlashX，介绍按轮控制思考并关联思考模式文档。

## 结论与边界

当前 Responses 的 none 与文档一致，没有找到可确认遗漏的关闭开关或针对 FlashX 的专门修复说明。指南和请求定义没有提供 FlashX 的独立 Responses 非思考兼容矩阵；既不能证明不支持，也不能证明当前服务按文档执行。不能因文档有 minimal 就宣称换成 minimal 必然修复；不能把 Chat 的 thinking 字段无依据塞进 Responses。

可绕过当前 Responses/FlashX 路径，使用官方标准 Chat Completions：接口格式 openai-chat、Base URL https://open.bigmodel.cn/api/paas/v4、原模型 glm-4.7-flashx。TapKit 当前官方端点白名单在 reasoning=off 时已发送 thinking.type=disabled；文本/工具仍分别32/128，源码位于 packages/providers/src/api/adapter.ts。无需等待官方答复就能选择并验证此路径，但没有自动修改现有账户或迁移原生历史。

最新 Responses 回执仍是准备 none/32、HTTP200/SSE、input13/output32/reasoning32、文本截断；这不是 Chat 的回执。Chat 替代路线当前账户的真实文本/工具成功仍待验证，历史其他模型或协议通过不可替代。只读文档不能区分服务参数执行与 usage 标注内部原因，也不应将当前失败改为成功或单纯加预算掩盖问题。

先前“需要智谱确认”的表述只适用于唯一内部根因认定，不是获得可用替代方案的前置条件。本次未改变架构/接口决定，不新增 ADR；沿用 ADR0016 和 ADR0020。无产品代码变更，不重复单元/集成测试。

实际检查：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\pnpm.ps1 docs:check` 退出0，输出 All 37 task states, started handoffs and completed requirement evidence links verified；`git diff --check` 退出0，仅 CURRENT/requirements 的既有换行规范提示，没有空白错误。

## 用户提供 GLM-5 issue #39 后续核对

用户随后提供 [issue #39](https://github.com/zai-org/GLM-5/issues/39)，询问是否实际上不支持 Responses。网页正文没有展示评论，不能只看3月30日的需求正文。匿名 GitHub API GET issue 与 comments（per_page=100）均退出0，实际43条评论，状态 open，最后更新2026-08-26；未写 GitHub，未认证或运行评论中的命令。

- 组织 MEMBER [8月4日回复](https://github.com/zai-org/GLM-5/issues/39#issuecomment-5176410539)表示仍在开发。
- 同一组织 MEMBER [8月14日回复](https://github.com/zai-org/GLM-5/issues/39#issuecomment-5290246719)表示已经更新，链接国内和国际 Coding Plan 的 Codex 接入文档。该回复没有证明所有模型、账户和关闭思考参数均已支持。
- [8月25日普通用户](https://github.com/zai-org/GLM-5/issues/39#issuecomment-5408756207)追问是否仅 Coding Plan 支持，报告普通 API 不行；[8月26日用户](https://github.com/zai-org/GLM-5/issues/39#issuecomment-5428913280)报告接入仍失败。两条为用户反馈，未提供可据以确认当前 FlashX 请求唯一根因的详细回执。

本轮浏览工具已能读取官方一般 Responses 指南/创建Response；[国内 Coding Plan 文档](https://docs.bigmodel.cn/cn/coding-plan/tool/codex.md)通过匿名 curl GET 退出0，[国际文档](https://docs.z.ai/devpack/tool/codex)亦可读。国内文档指定 https://open.bigmodel.cn/api/v1，国际指定 https://api.z.ai/api/v1；一般 Responses 文档也列出国内端点。没有找到明确声明目前所有标准按量账户不支持或 FlashX 不支持的官方结论。

因此 issue 证明历史上缺支持且后来存在更新及用户兼容反馈，不能证明当前智谱一概不支持 Responses；当前官方声明提供此接口，也不能证明用户账户 + FlashX + none 组合可用。用户当前HTTP200/SSE与usage终止回执区别于评论中的404，但只证明获得协议响应，不代表文本/工具或思考开关通过。TapKit 保留当前组合未通过的状态；Chat 替代路线建议不变。不把 Coding Plan 权益范围猜测为用户已确认根因，也不自动迁移账户或增加请求。
