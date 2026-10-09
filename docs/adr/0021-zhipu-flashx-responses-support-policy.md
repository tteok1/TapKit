# ADR 0021：智谱 FlashX Responses 暂按不支持使用交接

- 日期：2026-10-05（Asia/Shanghai）
- 状态：accepted；用户明确要求先按不支持处理并写成交接
- 任务：P01-02

## 当前决定

智谱标准 API `https://open.bigmodel.cn/api/v1` + `openai-responses` + `glm-4.7-flashx` 的非思考检测/使用路径，当前按不支持处理，不作为推荐配置或已通过能力，不继续重复该组合的真实请求，也不以联系官方为当前接续前置条件。

这是用户指定的暂定支持口径，不是智谱官方全面不支持 Responses 的事实公告。一般官方文档已列出 Responses，issue #39 有组织成员的接入更新及普通用户失败反馈，但不足以证明当前账户/模型/none 组合可用。范围不扩到其他厂商 Responses、OpenAI/xAI 或未经验证的 Coding Plan；不得因此删除通用 Responses codec。

保留既有适配代码、失败回执和历史成功记录；本次只更新规格、进度与交接，不增加 UI 禁用、保存拒绝或运行时自动迁移。既有 OUTPUT_LIMIT_REACHED 公共错误码不改为 MODEL_UNSUPPORTED，不伪造服务端返回的错误或能力探测结果。产品中仍可保存/选择该格式，不代表该智谱组合已获支持。

## 依据与替代路线

最新真实回执是 none/32、HTTP200/SSE、input13/output32/reasoning32，文本截断、工具未开始；历史 none/128 也被报告 output128/reasoning128。客户端构建符合文档，但服务参数执行、转发或 usage 标注内部原因未定。见 [当前回执](../evidence/P01-02/zhipu-fix/responses-none32-reasoning32-2026-10-05.md)及[文档/issue复核](../evidence/P01-02/zhipu-fix/official-docs-workaround-2026-10-05.md)。

接续优先使用官方标准 Chat：`openai-compatible` / `openai-chat` / `https://open.bigmodel.cn/api/paas/v4` / `glm-4.7-flashx`。当前适配器 reasoning=off 已发送 `thinking.type=disabled`，文本32/工具128预算保持；此修复后当前 FlashX Chat 的完整真实验收仍待完成，不能借历史 Flash Chat 或 Messages 单次通过代替。

不自动改用户账户、凭据、模型、网络或原生历史，不盲加字段/预算/重试；真实调用须有对应授权。本地 fixture 单元/集成测试已由用户恢复。P01-02保持in_progress、P01-gate保持failed，其他真实验收与网络尾项保留。

将来只有明确的新支持证据且用户重新要求恢复该组合时，才重开有界验证，按实际结果另行更新支持决定；本次交接不安排持续监测或自动复测。
