# 开发与验收

按 [README](README.md) 准备锁定依赖。Windows 主机需允许正常启动 Electron、Core 和 AppContainer helper。使用一次性合成 profile，连接实号时使用单独授权的测试账户、测试资料与专用仓库。

```powershell
.\scripts\pnpm.ps1 check
.\scripts\pnpm.ps1 test:unit
.\scripts\pnpm.ps1 test:integration
.\scripts\pnpm.ps1 test:e2e -- --grep P11-01
.\scripts\pnpm.ps1 test:security
.\scripts\pnpm.ps1 test:recovery
.\scripts\pnpm.ps1 test:perf -- --desktop
.\scripts\pnpm.ps1 eval:agent
.\scripts\pnpm.ps1 docs:check
```

原生 Office、终端和代码任务先生成当前用户能力报告：

```powershell
.\scripts\pnpm.ps1 runtime:probe -- --scope=current-user
```

普通 CI 在 Windows 上运行本地测试与冻结依赖构建。Windows 原生作业使用各自的能力报告，独立标准用户结果绑定该 runner。高级桌面性能测试应单独运行，等集成和 Electron 进程退出后再采样。保留集输出位于 `test-results/P11-01/eval-*/summary.json`，用确定性断言评估合成回归、检索和同预算委派。

## 真实资源验收

| 资源           | 专用入口或操作                                                                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 Codex      | 准备独立 `.test-data/P01-01-live-*` profile，经授权后设置 `TAPKIT_CODEX_LIVE_R01=1` 和 `TAPKIT_LIVE_DATA_DIR`，运行 `test:live -- --provider codex-subscription`。测试包含该专用账号的刷新和退出。                    |
| R02–R05 API    | 本地用独立的 `.test-data/P01-02-live-*` profile，设置 `TAPKIT_API_LIVE=1` 与 `TAPKIT_LIVE_DATA_DIR`，运行 `test:live -- --provider <deepseek\|hunyuan\|xai\|doubao> --account <测试账户>`，通过本机安全提示输入 Key。 |
| R06 托管搜索   | 使用授权模型执行公开查询，归档三页并逐条打开引用，记下通道和模型。                                                                                                                                                    |
| R07 GitHub     | 仅在已授权专用 fixture 仓库和最小权限 PAT 上运行 `test:live P09-03 --github`，读回 Draft PR 并记录测试资源清理。                                                                                                      |
| R08 代表性资料 | 用脱敏样本复核保留集、人工评分和 Office/PDF 版面，保留 fixture 哈希、评分依据和单独的失败样本。                                                                                                                       |

管理员可在上游将 `tapkit-live` 环境限制为受保护的 `main` 并要求审批，再配置各通道的 `TAPKIT_LIVE_<provider>_KEY`，需要时配置 `TAPKIT_LIVE_<provider>_MODEL`。手动选择一个通道触发 API 工作流，工作流使用固定服务商地址，密钥仅进入 API 验收步骤。Fork PR 使用普通 CI。凭据、私人内容和原生推理请勿写入日志、证据或 Git。

每项交接应记录运行命令、退出码、可重查结果及未验收范围。提交前检查差异和生成文件，验证产物时执行 `node scripts/scan-release.mjs`。
