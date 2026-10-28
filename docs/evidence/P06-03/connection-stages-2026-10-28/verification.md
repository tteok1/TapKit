# 智谱 FlashX 连接超时定位与修复

2026-10-28 Asia/Shanghai。用户将此前连接检测累计上限从10提高到30，要求逐次定位。

- 旧10次检测共11次HTTP。本轮预检因源账户unavailable被旧脚本拒绝，0请求；调整隔离预检后实际3次检测共5次HTTP：第一轮文本20秒超时；第二轮仅在隔离诊断延长至60秒，文本56.064秒、工具43.341秒收到响应头，两阶段通过；第三轮使用修复后的正式ProviderService传输，文本48.591秒、工具39.524秒收到响应头，两阶段通过。累计13次检测、16次HTTP；本轮未发工作请求，检测用量未知。
- 第一轮固定阶段：DNS 14ms，TCP 36ms，TLS 57ms，请求写完57ms，20.010秒超时。说明本次超时位于TLS及写出之后等待响应头，不能证明服务端收到了请求或确定其内部原因。单次计时非全时段服务SLA。
- ADR0068：仅智谱官方Chat/GLM-4.7-FlashX单次响应头期限由20秒变90秒；其他渠道保持20秒，整个检测120秒、取消与安全校验不变。生产构建使用项目锁定Node执行 `scripts/build.mjs` 退出0。真实正式路径复验为隔离直连；原账户、网络代理、原用户数据未更改，当前运行中的窗口需要重新启动加载新构建。
- 单元：`P01-02.transport.test.ts` 17/17，`P01-02.zhipu.test.ts` 76/76，各退出0；两文件同时运行时测试缓存ENOENT失败，分开运行通过。`tests/integration/P01-02.api.test.ts` 受限环境6失败2通过，正常Windows环境重跑8/8退出0。锁定Node TypeScript项目检查退出0。
- `scripts/check.mjs` TypeScript与ESLint阶段通过，格式阶段因P06既有交接文件及本轮改动文件等14项格式不符退出1；代码与本轮测试文件已单独格式化，不改写既有交接的大段内容。原P06真实审批/重启/暂停尚未验证，P06任务和gate状态不升级。
- 三个运行实例均关闭并删除隔离凭据密文副本。逐次结果见同级 `connection-stages-attempt-1-2026-10-28/probe-report.json`、`connection-stages-attempt-2-2026-10-28/probe-report.json`、`connection-stages-production-2026-10-28/probe-report.json`。

- 补验 `scripts/check.mjs`：TypeScript/ESLint通过，格式检查仍退出1，列出9项文档（含既有P06交接及本轮ADR/进度）；随后单独格式化本轮ADR，产品代码与诊断脚本的Prettier检查退出0。`docs-check.mjs` 37项通过、`git diff --check` 退出0；未重新格式化大段既有交接。
