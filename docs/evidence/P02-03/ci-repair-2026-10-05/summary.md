# 2026-10-05 CI Electron 回归修复

目录 D:/tapkit/TapKit；分支 codex/p02-01；基线 a2c27852f71ed7663862ff3336dc511e6efcb510；开始时工作区干净。本轮仅修复用户提供日志中的 P00 两处断言，不推进新编号任务或提升阶段门禁。

## 原因与修复

- P00-01 preload 白名单漏掉 P02 已交付的 initialRoute/openEntity/saveConversation/historyCommand/openPublicLink/chatCommand。补齐精确列表，继续禁止额外桥接 API；require/process 不可见、真实 Renderer sandbox、异常参数拒绝和 Core 退出断言保留。
- P00-02 高版本数据库 fixture 写死 user_version=7，与当前 schema7 相同，因此应用正常连接。改为读取首次启动后已迁移数据库的版本并写入 version+1；继续检查恢复提示、DATABASE_RECOVERY_REQUIRED 和数据库字节完全不变。以后追加迁移仍生成更高版本。
- 应用代码、接口、迁移和依赖没有变化，不需要新 ADR。

## 实际验证

命令均经 scripts/pnpm.ps1，使用锁定 Node24.21.0/pnpm12.4.1。Electron 在当前 Windows 用户下运行，专用 .test-data，chromiumSandbox=true；未读取日常 profile/vault 或请求真实模型。

| 命令 | 退出码 | 结果/证据 |
| --- | --- | --- |
| pnpm build | 0 | [build.log](build.log)；Windows helper/Core/桌面生产构建 |
| pnpm test:e2e -- --grep 'sandbox bridge\|higher schema'（修复前） | 1 | [e2e-reproduced.log](e2e-reproduced.log)；新构建下两项失败，与用户 CI 一致 |
| pnpm test:e2e -- --grep 'P00-0[12]'（修复后） | 0 | [e2e-after.log](e2e-after.log)；8/8，使用 CI 同一过滤表达式 |
| pnpm test:unit P00-01 P00-02 | 0 | [unit.log](unit.log)；22/22 |
| pnpm test:integration P00-01 P00-02 | 0 | [integration.log](integration.log)；24/24 |
| pnpm check | 0 | [check.log](check.log)；类型/格式/依赖边界/运行资源清单 |
| pnpm docs:check | 0 | [docs-check.log](docs-check.log)；37项状态与证据路径 |
| git diff --check | 0 | [diff-check.log](diff-check.log)；无差异空白错误 |

新截图：[恢复提示](PRIVATE_VISUAL_ARCHIVE.md)、[桌面](PRIVATE_VISUAL_ARCHIVE.md)；旧任务截图已逐字节恢复为本轮开始时版本。

首次工具沙箱 Electron 启动因 GPU 子进程失败，已中止，见 [e2e-sandbox-attempt.log](e2e-sandbox-attempt.log)，不计作业务测试结果。发现本地旧构建曾使原断言通过后，重新完整 build，再取得上表失败/通过证据；不把旧产物结果当当前源码验收。

## 交接

本轮按用户授权本地提交修复与证据，提交主题为 `test(ci): refresh P00 Electron regression assertions`；未推送，远程 CI 待复验。本轮不声称 GitHub workflow 全绿，不替代 P00-03 标准用户或原生隔离验证。P02-03=implemented_not_live_verified，P02-gate=engineering_passed_external_pending，P00/P01 failed 门禁及既有外部资源缺口保持。
