# P00-03 CI 排除参数转发复核

- 日期：2026-09-30。
- GitHub Actions：用户提供 run `36668659550` / job `109738725851`。当前 GitHub 连接器对该仓库的 job/log 请求返回 404，网页读取也未取到该运行日志，因此以下根因由 workflow 命令和本地同版 pnpm/Vitest 调用复现。

## 发现

原 workflow 命令为：

```text
pnpm.mjs test:integration -- --exclude "**/P00-03.account.test.ts" --exclude "**/P00-03.office-git.test.ts"
```

pnpm 将独立的 `--` 保留在传给 Vitest 的参数中。使用该调用形态进行诊断时，Vitest 输出的实际命令包含 `"--" "--exclude" ...`，仍收集了旧 `P00-03.account.test.ts`；中断前显示该文件 5 项中有 3 项失败。该次诊断被手动中断，只是复现参数未生效，不作为测试或验收结果。

修正后的调用去掉独立分隔符：

```text
pnpm.mjs test:integration --exclude "**/P00-03.account.test.ts" --exclude "**/P00-03.office-git.test.ts"
```

以 `--help` 进行的无测试 CLI 核对退出码为 0，Vitest 收到的是两个直接选项；新 CI 运行仍需确认完整集成步骤结果。

## 影响范围

此问题使 CI 继续运行旧专用账户集成测试，未达到排除旧路线用例的目的。修复只更正参数传递；P00-03 当前生产执行器、Office LOK 接入和验收门禁状态不变。
