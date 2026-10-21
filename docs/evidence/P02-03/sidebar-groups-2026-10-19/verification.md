# 分组折叠后侧栏最近会话消失

独立合成profile复现了用户截图：选中分组后再折叠，左侧保留旧分组筛选，随后渲染把全部会话行过滤掉；标题仍为“最近”，聊天页独立的默认列表仍有全部5条。原缺陷截图和公开计数见before-collapse-1440x900.png/json，负向用例exit1不是测试通过。

修复仅在renderer的HistoryList：先读公开分组元数据，选中组折叠/消失时回到默认范围并清旧批量选择，再请求会话，防止查询已删除section；点击折叠组名称先经原revision校验展开，再筛选会话。不再通过旧渲染过滤把会话全部隐藏。默认列表仍包含原有可访问会话；分组关系与原数据不重建。

## 实际回归

- 原代码负向：`pnpm test:e2e -- tests/e2e/P02-03.sidebar.spec.ts --grep 'P02-03 T20 sidebar.*1440'`，exit1；左侧0行/右侧5行，before-collapse.log及对应截图保留。
- 相关回归：`pnpm test:e2e -- tests/e2e/P02-03.sidebar.spec.ts tests/e2e/P02-03.history.spec.ts --grep 'P02-03 T20 (sidebar|grouping)'`，2通过/1失败，exit1。既有135会话分页/分组/回收恢复和960×640通过；1440×900全部折叠/删除功能断言通过，最后逐行滚动可见比0.999864935874939未达到测试要求的恰好1。after.log保留。
- 为小数像素舍入保留容差0.99后，只重跑1440×900同一用例，1/1通过、脚本exit0且恢复生产构建，见final-1440.log。两尺寸均检查创建分组后保留最近、选中折叠/删除回默认、点折叠组展开、逐行可滚动访问。共3条独立用例分别通过，不伪称第一次整轮全绿。
- 最初测试在完整运行时校验期间被测试自身15秒等待截断，未到侧栏断言；startup-precondition.log/exit1保留。测试等待与已有Host预算对齐，产品Core/Host/原生授权不变。第一次日志目录不存在导致命令未启动测试也记入results.json，不计成功。

实际使用锁定Node24.21.0及pnpm12.4.1，Electron在工具沙箱外运行且保留chromiumSandbox=true；独立合成资料，无模型请求/原profile手工SQL写入/Key或私人正文导出。已有用户CSS与后台/runtime字节保留，非管理员按用户要求暂缓。原真人批测与全部任务/gate状态保持，无commit/push。

## 加载修复版

本轮已在用户确认完全退出后使用原脚本的 `-RefreshUiBuild` 刷新；最终check/构建、原目录重开状态见results.json和refresh-and-reopen.log。仍沿用原Chat/FlashX账户及原验收数据目录。重开后用户只需确认这次侧栏显示，再继续剩余批测，不重复已通过项目。
