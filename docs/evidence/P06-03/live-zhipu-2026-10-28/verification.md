# P06 限定智谱真实联调：未通过，已停止

2026-10-28 Asia/Shanghai；codex/p06-work-runtime；用户本轮明确授权仅P06使用现有智谱Key，并要求有界预算。未开展其他模块的live，未使用其他供应商/模型，未追加预算。

## 预算与实际结果

硬上限：最多6次应用侧模型尝试、每次最多2048输出tokens、累计保守输入+输出预留50000 tokens。额度持久化在同一隔离目录，重启与手动排障均不重置；单逻辑调用singleAttempt，固定账号，无自动重试/模型后备。后续最小请求输出上限降至256。

- 应用侧尝试4次：1次在本地工具名校验阶段拒绝（HTTP=0）；3次进入正式HTTP传输尝试，均NETWORK_ERROR，无模型结果；后两次明确记录response_headers_timeout，第一轮未捕获细分诊断。
- 累计保守预留24627 tokens，未达到上限也主动停止，避免同样故障继续消耗。
- 应用账本4条均为estimated，合计24627；input/output实际usage均未知。此数包含本地未发HTTP的保守核销，**不能当作供应商实际用量或费用**，也不能声称外部计费为0。
- 预留余额0、未结算attempt0、工具调用0、生成成果0。真实生成→审批→重启链没有通过，不把离线fixture结果当live。
- 两次不带Key的HEAD连接诊断（原网络配置/直连）均401，证明检查时端点可达；不能据此认定携Key模型POST正常，不能确定超时位于服务端还是传输路径。
- 原账号公开配置/状态和原Key密文字节hash保持；未启动原资料应用、迁移原库或改原设置。隔离Key密文副本已移除；隔离marker已closed，入口拒绝再发请求。

原始脱敏计数见summary.json；每轮失败见create-*.json、create-report.json；network-report.json为不带凭据的连通性诊断。launch.json只含隔离目录与预算，不含Key或正文。

## 定位与修复

前期入口事务初始化、Electron受保护的profile加密元数据、原账号已有probed工具检测记录的迁移问题均在HTTP前发现并修正，没有因此发送请求。隔离目录仅复制必要的DPAPI保护元数据和受限密文，由正式AuthSecrets解密；未导出Key明文，权限/能力校验没有绕过。

实际P06兼容性缺陷：智谱Chat的函数名不接受点号，既有zhipu-tools映射只含旧只读工具，P06的五个规范名在HTTP前被拒绝。已为artifact.write、workspace.patch、python.analyze、office.convert、user.ask增加稳定wire别名。Core/审批/hash/账本仍使用规范名，未知工具、别名碰撞和参数完整性检查保持。新增5项名称映射及5项真实codec往返的离线用例。

随后正式模型POST两轮2048输出、最后一轮256输出均未在现有响应头期限内返回；保留response_headers_timeout，不修改TLS/地址安全策略或放宽授权以求通过。第三次同类失败后停止所有真实请求。

## 本地回归与交接

- P06及名称映射相关unit26/26退出0（aliases-test-second.log）；首轮Vitest临时目录ENOENT保留，固定仓库TEMP后通过。
- P06工作/审批/恢复integration25/25退出0（integration.log）。这些是隔离fixture，不能作为本次API成功证据。
- check-first.log退出0；完整生产构建build.log与最终文档/类型检查以命令回执为准。最新源hash及回执汇总见source-sha256.json/results.json。
- 真实联调状态failed_live_transport；P06-01仍implemented_not_live_verified，P06-gate仍engineering_passed_external_pending。其他历史资源/阶段状态不提升。
- 下一轮先定位携Key POST等待响应头超时，再另定有界计划；当前剩余预算不自动使用，当前入口已关闭，无后台续跑。未提交/推送。
