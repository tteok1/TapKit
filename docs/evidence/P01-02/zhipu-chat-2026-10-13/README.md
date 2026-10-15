# P01-02 智谱普通 Chat 隔离联调准备

2026-10-13，Asia/Shanghai。用户指定智谱普通 API、`glm-4.7-flashx`、Chat 接口；Key 由用户本机输入。此次授权恢复这一条 API 联调准备，不扩为 Codex 订阅调用或其他渠道验证。

## 配置与入口

- providerId：`openai-compatible`；apiFormat：`openai-chat`。
- Base URL：`https://open.bigmodel.cn/api/paas/v4`；请求端点：`https://open.bigmodel.cn/api/paas/v4/chat/completions`。
- model ID：`glm-4.7-flashx`；reasoning：`off`，正式适配器在每个请求中映射 `thinking.type=disabled`。
- 新建 profile：`D:/Tapkit-public/.test-data/P01-02-live-zhipu-chat-20261013-K1ncxd`；账户标签 `Zhipu Chat FlashX 2026-10-13`，精确 ID 见 [preparation.json](preparation.json)。
- 使用现有十四个 SQL 迁移创建全新数据库，导入正式默认设置。配置账户为 `unconfigured`；仅分配尚无 vault 内容的凭据引用，未存假 Key 或真实 Key。此步骤不是生产迁移/磁盘原生状态验收。
- 测试复用正式 ApiKeyAdapter、secureApiFetch 和现有有界入口。最多六请求，每请求最多 128 输出 token，全流程 300 秒；首次失败即停止，无重试/后备。输入及取消前已产生的供应商用量另计。

在普通本机 PowerShell 中运行以下命令。启动脚本会先执行无 Key 的网络预检，失败时不请求 Key；通过后才显示隐藏输入提示。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\Tapkit-public\docs\evidence\P01-02\zhipu-chat-2026-10-13\run-live.ps1
```

仅检查 profile 配置、不联网、不输入 Key：同一命令加 `-PrepareOnly`。

Key 仅由现有 `api-live-key.ps1` 经隐藏提示读入并通过 stdin 交给测试进程，不进入参数、环境变量或文件。生成报告路径在最后的 `reportPath`；报告位于 `D:/Tapkit-public/test-results/P01-02-live/<唯一ID>/connection-report.json`，只有公开配置、阶段结果、白名单请求参数和用量，不含正文/Key/原生推理。

## 用户真实测试结果

用户11:53（Asia/Shanghai）本机隐藏输入Key完成测试；[安全报告](connection-report-62bb982b.json)六阶段全部passed，fullAcceptancePassed=true：文本流、native续聊、canonical续聊、echo工具调用、结果回传、收到正文后的取消。六请求全部HTTP200、端点/模型匹配、stream=true、maxOutputTokens=128、thinking.type=disabled，无重试。此工具仅纯echo，不执行OS工具。

完成五阶段actual usage合计：input442/output35；其中cache149为input子集、reasoning0为output子集，不重复相加。取消阶段usage=null，不冒充0或整轮费用。报告账户/公开配置与preparation一致；源码摘要、数据库摘要保持，归档报告SHA256与原文件一致。[复核记录](live-review-62bb982b.json)exit0；用户终端退出码未直接观察。Agent只读取安全报告并核对，不读取Key或另发模型请求。

## 准备与无 Key 预检记录

- 起始 main `9bbc44fe8f409f197a8e4d460c9ff3f102821b54`，clean；现分支 `codex/p01-02-zhipu-chat-live`。沙盒首次建分支/构建被工作区权限拒绝；以本地任务授权执行后成功，未改系统权限。
- 新 profile 创建 exit0，schema14、完整性/外键检查通过；公开账户配置预检 exit0；数据库摘要在预检之后保持不变，vault 不存在。
- `pnpm test:unit P01-02.zhipu P01-02.live P01-02.transport`：90/90，exit0。
- `pnpm test:integration P01-02.zhipu P01-02.live`：11/11，exit0。全部本地合成响应；包括 FlashX Chat 参数、截断/业务错误、六阶段闭环与取消。
- 首次生产无 Key 预检 exit1：DNS 非公网，`PERMISSION_DENIED`，未发出 HTTP/模型请求。用户关闭 TUN 后复检仍为 `198.18/198.19` benchmark 范围，生产检查继续拒绝；只读诊断 DNS 查询也返回此范围，尚不能确认是缓存还是持续拦截。见两份 network JSON 与日志。
- 用户补充代理软件为 Mesl。随后 `ipconfig /flushdns` exit0，Windows DNS 临时缓存已清理；重新启动独立 Node 复检仍为 benchmark Fake-IP，exit1，见 [network-after-dns-flush.json](network-after-dns-flush.json)。hosts 无该域名覆盖；未修改 DNS 服务器或代理配置，不能把关闭 TUN 当网络验收通过。
- 用户断开连接并完全退出 Mesl 后，11:51（Asia/Shanghai）复检 exit0：所有 DNS 结果为公网地址，正式 HTTPS 传输的匿名 GET 返回 HTTP401，错误码为空。见 [network-after-mesl-exit-20261013-115104.json](network-after-mesl-exit-20261013-115104.json)。无 Key、无请求体、未读取响应正文、模型请求0；此次仅验证网络可达，认证/模型权限和真实六阶段尚未验证。恢复前失败证据保留。
- 官方文档首次读取思考页超时/本地沙盒 DNS 失败，公开文档 GET 在本地权限下成功核对。未读取账户/vault/Key、运行 Electron、关闭 TLS/私网保护或更改代理/DNS。

当前正式网络与真实API适配链路均已验证，无须重复六阶段测试。下一步准备应用内凭据/原生状态加密持久化、重启续聊及真实账本验收，再逐项补既有P02/P04的真实模型缺口。上方命令保留为测试复现入口。

独立桌面启动入口与用户步骤见[应用内验收清单](app-acceptance.md)，使用[app-preparation.json](app-preparation.json)的新空目录；run-app.ps1的CheckOnly不联网/不启动，真实应用测试待用户在UI输入Key后执行。构建/检查结果见[app-checks.json](app-checks.json)，不将准备检查当应用启动或磁盘native/账本验收通过。

应用首次检测实际停点：用户已保存test1，文本阶段NETWORK_ERROR、32/disabled，等待约20秒。公开数据库配置/网络模式匹配；当前无KeyNodeGET401。独立utility也观察到401，但整套诊断因超时exit2，不算通过。20秒计时覆盖DNS到HTTP响应头，符合此次失败时间；原检测底层错误丢失，具体原因未确认。保持配置由用户单次复测，再相同失败则先补安全阶段诊断；不继续聊天验收。[本次复核及失败证据](app-network-error-review.json)。未读Key、复制截图中的Key末位或发新模型请求。

后续用户复测到工具阶段NETWORK_ERROR/128/disabled，说明该次文本通过，整个连接仍未过。32和128分别是文本/工具的最大输出Token，不是输入长度或实际消耗；真正生成截断会报OUTPUT_LIMIT_REACHED。误导文案“发送上限”已改为“输出上限”，参数不变。用户自行继续复测，具体网络原因不据此认定；持续失败下一步先补安全阶段诊断。[澄清与检查](app-token-limit-clarification.json)、[公开失败记录](app-tools-network-error-1791866255595.json)。

## 应用内最新反馈与核对

2026-10-13应用验收新反馈：用户确认除列数字格式外其余步骤正常，最后一次只观察输出、未点停止。只读隔离profile核对账户ready/12:41:55检测无错误；四个run均completed且cancel_requested_at为空。最后保存文本0换行/99逗号且与attempt正文一致，属于模型未遵循逐行指令，没有丢失换行。五条正常应用attempt均actual且无重试，670+68+689+708+1020=3155；68为首root自动标题，同root738，daily3155、预留0、无重复/未结算。金额未知因未配置价格，不推算费用；本账本范围不包含独立CLI和连接probe。9个native索引对应文件均存在，只读存在性不解密，用户报告重启历史/免重复输入Key正常，但实际native复用未独立证明。应用取消及最后重启后账本稳定性待补一次，见app-cancel-followup.md。证据docs/evidence/P01-02/zhipu-chat-2026-10-13/app-acceptance-review.json及app-public-state-1791867618947.json；元数据复核与脚本语法exit0，Agent Key/原生正文读取及模型请求0。P01-02=in_progress、P01-gate=failed，其余任务/资源通过范围保持；本次仅证据/进度，不新增产品改动。

[取消补验步骤](app-cancel-followup.md)。公开元数据脚本review-app-public-state.mjs以readOnly事务查询固定隔离目录，只导出计数、绑定和文件存在性；不输出正文或读取加密字节。app-preparation.json为空目录准备时的历史快照，不能当当前应用状态。

## 应用取消最新结果与下一项

用户15:08补验生成中停止/部分保留/完全退出重启账本，三项反馈正常。只读run和attempt均cancelled，消息interrupted并保存部分正文；原5条actual3155未变，新增estimated12911，合计6条16066，root/daily预留0，无重复/未结算。12911是缺最终usage按预留保守核销，不是实际消耗；native复用仍未独立证明。详见[取消复核](app-cancel-review.json)。

用户授权下一项，按依赖准备[P01-03预算上限补验](../../P01-03/zhipu-budget-2026-10-13/acceptance.md)，每日默认上限临时2000000→1并发一次应拦截的请求，再恢复原值；UI结果尚待用户执行。P01-02/in_progress及阶段failed保持。

## 验收边界

R13标`verified`，仅限智谱普通API/glm-4.7-flashx/Chat的真实两轮/echo/取消范围；不扩其他协议或供应商。P01-02保持`in_progress`，P01-gate保持`failed`。独立API live入口为memory-only native、`ledgerVerified=false`，应用内常规5条账本及native文件存在性已独立核对，取消/最后重启后账本已补用户反馈和只读核对，原生状态实际复用仍待独立核验；本轮资源通过不等于P01任务/阶段全部完成。其他资源、P01-01、P02、P04及P05状态保持；没有commit/push/PR/CI轮询。

## 官方依据与证据

- [GLM-4.7 系列与普通 Chat 调用示例](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7)：核对 FlashX 系列、流式/工具能力和标准端点。
- [思考模式](https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode)：本次读取官方 `.md` 版本，核对系列默认思考与轮级 `thinking.type=disabled`。
- 正式映射规则沿用 ADR0016，支持口径沿用 ADR0021，测试入口沿用 ADR0017；本次没有接口/依赖/安全决策变化。
- 配置/迁移摘要：[preparation.json](preparation.json)；命令结果及边界：[results.json](results.json)；全部成功和失败日志保留于本目录。
