# P02-03 弹窗视口布局修复（2026-10-19）

范围：按用户要求在 `D:/Tapkit-public` 当前 `main` 分支修复多处弹窗越界，不创建分支。既有未提交改动保留，无 commit/push；不操作原验收 profile、账户、模型或聊天内容。

## 原因与改动

`styles.css` 的 `.history-dialog` 遗留 `inset: 10vh auto auto 50%` 和 `transform: translateX(-50%)`；`design-system.css` 后续已对原生 `dialog` 应用 `inset: 0; margin: auto`。浏览器先居中再平移半个弹窗宽度，造成左偏和窄窗口越界。

移除旧位置/位移，统一让原生 dialog、history-dialog（含非原生记忆删除影响确认框）及已有聊天 role=dialog 使用同一居中规则，沿用按 UI zoom 换算的最大视口宽高和内部滚动。不更改表单字段、功能或数据流程。

## 验证方式

新增 `tests/e2e/P02-03.dialogs.spec.ts`：真实 Electron/Host/Core，独立临时合成 profile；1440×900、960×640 两种内容尺寸，100%/200% UI 缩放，统一使用大字体。覆盖会话信息、创建分组、批量移动、删除影响、永久删除确认和搜索。检查四边位于视口、横纵居中、无内容横向溢出、长表单内部滚动，以及滚动后底部取消/关闭按钮全可见、可聚焦且 Enter 可关闭；原生分组/搜索也验证 Escape。窗口尺寸可能受 Windows DPI 整数取整影响，以 JSON 中实际 `innerWidth/innerHeight` 为准。

负向回归在隔离实例临时注入旧 `translateX(-50%)`，结束后恢复测试源文件；1440×900/100% 中心偏移实测 350px，新增居中断言失败（exit 1）。截图/几何为 `before-session-info-1440x900-100.*`。这是旧样式的定向注入复现，不声称完整回退原代码。

## 环境与首次失败

- 默认 PATH 的 Node 24.19.0/pnpm 11.25.0 不满足仓库锁定要求，命令 exit 1。后续显式使用 `.runtime/node/node-v24.21.0-win-x64/node.exe` 和 `.cache/tools/pnpm/package/bin/pnpm.mjs`，不安装或变更依赖。
- 仅 grep 的原始 test:e2e 会收集无关测试，并在 `resources/catalogs/defaults.json` 缺 JSON import attribute 处中断（exit 1）；之后显式指定相关 spec 文件，不把未收集的测试视为通过。
- 工具沙箱内 Electron GPU 子进程以 0xC0000135 崩溃；同一测试经批准在工具沙箱外执行，保留 Chromium sandbox。
- 早期独立测试曾在 Core 连接前置超时/失败。只对独立合成 profile 临时显示忽略目录构建产物的启动诊断，产物在 finally 恢复；未发现额外业务异常，后续进入实际表单。
- 首次进入修复后表单的诊断轮已通过会话/分组/移动/删除影响布局，但回收站按钮的标题包含更新时间，测试错误地按精确标题匹配导致超时（exit 1）。修正为行内既有 `.history-link` 后再执行完整回归，不将该轮记为全通过。

## 最终结果

- 锁定工具链执行 `pnpm check`：exit 0，451 个仓库文件格式检查零失败，类型/依赖边界/运行时清单通过；日志 `check.log`。
- `pnpm test:e2e -- tests/e2e/P02-03.dialogs.spec.ts tests/e2e/P02-03.history.spec.ts tests/e2e/P02-01.ui-redesign.spec.ts --grep 'P02-03|P02-01 UI redesign preserves|P02-01 UI redesign workbench'`：exit 0，10/10 通过（新增布局 4、原历史 4、原相关 UI 2），24 份表单几何和截图；日志 `e2e-and-production-build.log`。测试流程结束时正式生产构建通过，Core 不含 fixture 安装代码。
- `pnpm docs:check`：exit 0，全部 37 项任务状态、交接和完成需求证据链接通过；日志 `docs-check.log`。
- 实际目检 960×640/100%、960×640/200% 和 1440×900/200% 会话/确认表单：四边留在视口、居中，高表单内部滚动。200% 会话表单的底部取消按钮已由测试滚动、全可见断言、聚焦及 Enter 关闭实际验证。
- 既有 UI 回归生成的 16 张历史截图在初始工作树均干净，已恢复为 HEAD 原字节；本次相关搜索/文件详情及历史截图另存本目录 `related-*`，不覆盖旧验收证据。

完整命令/退出码、失败尝试和逐表单几何见 `results.json`。仅样式和布局回归测试，无依赖/接口决策变化，不新增 ADR。原用户窗口未重新加载，重新打开应用后加载新样式。工程修复不提升 P02-03 的总体真实验收状态或 gate，原 T01—T30 批测与非管理员验收约定保持。
