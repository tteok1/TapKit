# P01-02 当前支持口径与本地交接提交

用户2026-10-05明确要求先按不支持处理、写成交接，随后要求本地Commit。实际目录D:/tapkit/TapKit，分支codex/fix-zhipu-api-probe，提交前HEAD b92eece；包含本文件与ADR0021的提交为本轮交接基准，最终SHA从实际git历史核对。本次无push/PR授权，不复制profile、Key/vault/native。

## 内容与边界

- 原交接handoff-2026-10-04.md增加独立当前节，明确智谱标准API /api/v1 + glm-4.7-flashx Responses非思考组合暂按不支持使用交接，停止重复真人验证；旧段落整体标为历史操作快照，不作为当前指令。
- ADR0021及规格/进度/需求行同步。接续优先标准Chat /api/paas/v4 + FlashX，当前off已映射disabled，完整真人仍待验；不把历史Flash或Messages单次成功当当前FlashX完整通过。
- 本地commit包含本轮P01-02实现、回归、ADR0016/0018—0021、诊断/安全证据及进度。通用Responses保留，支持口径仅文档变更，没有新UI禁用、运行时拒绝、账户迁移、错误码重写或自动加预算。
- P00-03既有native-cases.jsonl改动和三份未跟踪CI日志排除并保留。P01-02=in_progress、P01-gate/P00-gate=failed保持，未启动P02。

## 实际检查

1. 核对probe-audit-results-2026-10-05.json记录的9个源码/测试SHA256，当前全部相同。最近全unit210/210、P01-02定向integration19/19、build:desktop通过的证据适用于这些源码；本轮没有重复执行套件或build。历史全integration108通过/15个P00-03权限失败不写为通过。
2. 提交候选文件限定P01-02相关路径；首次70个候选文件的凭据形态扫描（sk类令牌、JWT、私钥块）命中0，没有P00或private profile路径。扫描仅辅助核查，证据正文遵循此前安全白名单；不读取未知用户文件或凭据。
3. 首次本轮pnpm check退出1，仅CURRENT.md格式告警；定向prettier --write该文件退出0。随后实际check退出0：类型、格式、依赖边界、运行时/依赖清单通过；[实际输出](handoff-commit-check-2026-10-05.log)。
4. docs:check及git diff --check在文档准备检查点均退出0，提交前再核对。diff检查仅有CURRENT/requirements的换行规范提示。未运行真实模型请求、读取Key/vault/Codex/native、启动Electron或修改用户网络/账户。
5. 首次git diff --cached --check退出2，发现7份此前未跟踪日志有尾随空白/文件尾空行；仅规范这些空白，保留原命令、错误、数量和结果文本，不将失败日志改为成功。随后重新暂存并核对完整index。

本记录为提交准备时的安全证据；最终commit成功与所含文件须以git show/log实际结果为准，不回填既有历史结果JSON的committed/pushed字段。
