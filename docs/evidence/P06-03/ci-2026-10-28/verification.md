# P06 分支 CI 失败修复

2026-10-28 Asia/Shanghai；分支 codex/p06-work-runtime；失败提交 385afd586b1d081f6aba03c2a8bf1925e89cb022；GitHub Actions run 40655805534，check job 122706427109，startup-diagnostics success。原check作业的Check、Unit and current-route integration、performance、standard-user与Office诊断步骤通过；Build and Electron checks失败。

读取作业诊断artifact 12803077072的Playwright trace，确认两个失败：P00-01 bridge白名单未包含新增workCommand；P03-01 T08仍定位旧的“保存工作草稿”，P06实际入口已变成“创建工作”。前者补充严格白名单，后者只更新按钮名，原真实IPC延迟、导航后不导入、不覆盖草稿、原件保持及授权计数断言均保留；产品逻辑/隔离校验未修改。

- 正常Windows权限、TAPKIT_STARTUP_DIAGNOSTICS=1，生产构建下 `pnpm test:e2e -- --grep 'P00-01 sandbox bridge|P03-01 T08 late session creation'`：2/2，退出0。
- 同环境 `pnpm test:e2e -- --grep 'P02-unused-alternative|P00-01 sandbox bridge|P03-01 T08 late session creation'`：触发与CI相同的隔离fixture构建，2/2通过，退出0；脚本随后恢复生产构建。P02-unused-alternative仅使runner启用与CI相同的构建，不匹配其他测试。
- 原CI错误保留于GitHub Actions工件；下载副本留在忽略的.test-data，不提交测试profile/凭据。远程新CI结果以对应提交和GitHub回执为准。
- 无真实模型调用，P06 live及gate状态不变；不合main、不创建PR。

- 最终 scripts/check.mjs 退出0（含类型、格式、依赖边界、manifest、118项E2E收集）；git diff --check退出0。
