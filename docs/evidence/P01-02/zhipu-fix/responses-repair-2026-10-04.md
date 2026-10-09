# 智谱三协议检测与 Responses 非思考补充

日期：2026-10-04，Asia/Shanghai；codex/fix-zhipu-api-probe，基于main2e78531+working-tree；同一P01-02修复分支，未提交或push。

## 真人结果与配置判定

用户截图：智谱 Chat 测试 2（glm-4.7-flash）文本与工具检测通过；新增智谱 Messages 测试也文本与工具检测通过；智谱 Responses 测试在文本阶段OUTPUT_LIMIT_REACHED。只读指定测试profile的公开账户配置/状态确认：Chat ready（11:23:57）、Responses unavailable/OUTPUT_LIMIT_REACHED（11:26:39）、Messages ready（11:29:04）。数据见protocol-probes-2026-10-04.json；不读取credential_id或Key。

Responses配置为openai-compatible/openai-responses、https://open.bigmodel.cn/api/v1、glm-4.7-flash；基址匹配官方独立Response API，不能据此判断用户填错或模型不支持。截断是当前输出预算耗尽，未进入工具阶段；没有读取原始正文、推理或usage，所以不声称已用真人原始回执证明全部Token花在思考上。

## 已确认的适配遗漏与修复

核对[官方Response API兼容](https://docs.bigmodel.cn/cn/guide/develop/responses/introduction)及[创建Response](https://docs.bigmodel.cn/api-reference/response/创建-response)：reasoning.effort默认max；none/minimal放弃思考；max_output_tokens包含思维链。此前TapKit输入声明reasoning=off，却仅在Chat请求添加thinking.type=disabled，Responses省略reasoning。该参数映射遗漏已由源码与官方定义确认，与观察到的截断一致；修复后仍需真人单次对照闭环。

本次只对openai-compatible/openai-responses + 精确https://open.bigmodel.cn/api/v1（允许尾斜杠）+ glm-4.7-flash + off增加reasoning:{effort:none}。不混用Chat thinking字段、不发送OpenAI encrypted include、不改变store=false、32/128输出预算或120秒限时；其他模型/厂商/端口/Coding Plan/格式和非off档维持原约束。官方Chat及Responses端点使用已核对的智谱业务码映射；Messages没有新扩展。所有生产DNS/TLS/Key目的地规则保持。

补充属于同一未发布/未提交的tapkit-api/2修复，ADR0016与相关规格已同步；无依赖、迁移、账户或网络配置变化。此前原始验收源码指纹保留在results.json；本次实际快照见responses-results.json。Chat/Messages已成功的真人事实不会被写成未提供账户，R13/R14均configured；完整两轮/取消/usage验收仍待补。

## 实际验证

通过锁定运行时和powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\pnpm.ps1运行，不修改系统ExecutionPolicy。

| 命令 | 实际结果 | 日志 |
| --- | --- | --- |
| pnpm build:desktop | 退出0；受影响Storage/Core/Host/preload/Renderer | responses-build.log |
| pnpm check | 当前用户上下文退出0；类型/格式/边界/清单，不改ACL | responses-check.log |
| pnpm test:unit | 退出0；15文件147/147 | responses-unit.log |
| pnpm test:integration P01-02 P01-01 P01-03 | 退出0；7文件68/68 | responses-integration.log |

新增14项unit覆盖默认max→截断回归、双阶段none/固定预算、模型大小写/尾斜杠、其他端点/格式/模型字段负例、非off不发请求、残余截断只请求一次、不泄漏私有推理及1305/1113业务码。integration参数化Chat/Responses，用真实本地mock HTTP→Core→SQLite验证ready/quota/truncated状态、正确请求URL/字段与持久结果；生产传输没有换成loopback。

本次仅基础适配模块变更，按P01-02纯模块规则用同标签integration覆盖；Renderer没有新改动，没有主动启动新的Electron测试。原桌面2/2为此前快照，用户本轮Chat/Messages界面真人通过已单独记录，不以此关闭原Electron 0x80000003稳定性缺口。未重跑未改动Rust helper。

## 真人复测与交接

已请用户退出旧TapKit（托盘退出）后用原.test-data/P01-02-live-zhipu启动新版，只检测智谱 Responses 测试一次；Chat/Messages不需重复，不发Key。用户已反馈修复后仍OUTPUT_LIMIT_REACHED，11:39:53数据库文本阶段失败一致。Core产物包含none且应用/Core已重启；尚无真实请求及usage，不能确认全部原因。用户随后要求停止排查并交接，又授权提交/push分支和交接文档。未再发请求或改业务代码，见handoff-2026-10-04.md及responses-residual-2026-10-04.json。新直连脚本草稿未验证或执行。

P01-02 implemented_not_live_verified、P01-gate engineering_passed_external_pending、P00失败门禁保持；R02-R05 pending，R13/R14 configured。不得把基础probe算作完整真实两轮、生成中取消或usage验收，未启动P02。
