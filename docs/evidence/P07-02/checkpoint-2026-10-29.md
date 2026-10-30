# P07-02 实施检查点

本页为较早的实施快照；最新结果与用户暂停指示见 pause-2026-10-29.md。桌面复验已1/1、相关便携集成13/13、原生数据/异常5/5、多文件清洗轮2/2通过；最终验收未完成，P07-02保持in_progress，开发已按用户要求暂停。

2026-10-29 Asia/Shanghai；D:/Tapkit-public，codex/p07-office，HEAD aa6debf；现有 P07-01 改动保留。用户授权按 P07-02、P07-03、阶段收口顺序完成。本记录是实施检查点，不代表任务完成。

## 已写入

共享 DatasetSpec/AnalysisSpec/SpreadsheetSpec/ChartSpec；固定 pandas/openpyxl/matplotlib 程序；data.analyze 工具、来源再授权、原子发布与不可变结果 JSON；XLSX 原生重算和独立十进制缓存比较；React 数据表/图表、筛选/排序/分页与导出入口；CSV 原值和 HTML 明细显式选项；SVG 消毒和固定 HTML 模板。版本证据包含输入版本/hash、程序 hash、统计口径和导出 hash。决定见 ADR0070。

## 已执行的命令与结果

使用锁定 Node 24.21.0 / pnpm 12.4.1，测试 TEMP/TMP 指向工作区 `.test-data/p07-data-temp`（原生探测使用独立 p07-probe-temp）。

- `node scripts/helper-build.mjs`：退出 0；helper-build.log。
- 固定 Python 程序 `compile(..., 'exec')`：退出 0，仅语法检查。
- `pnpm check`：初步检查退出 0，E2E 仅收集 122 项；check-foundation.log。后续增补仍需最终检查。
- 相关 unit `P07-02 P07-01 P06-02`：33/33，退出 0；unit-related.log。同一批的 TypeScript 检查有 fixture 和事件枚举错误，已修正，不把整批命令误计为全部成功。
- `pnpm exec vitest run --config vitest.config.ts --project unit P07-02`：报告新鲜度修复后 4/4，退出 0；unit-probe-freshness.log。其后的 SVG/HTML 用例仍待执行。
- `pnpm exec vitest run --config vitest.config.ts --project integration P07-02.data-access`：初轮 2/3，测试未激活 run 导致 CONFLICT；修正后 3/3，退出 0，见 integration-access-retest.log。后续与 P07-01 组合时 10/11，一项异常停顿后超时，失败轮 integration-compatibility.log 保留，需复验；不能替换为通过。
- `node scripts/runtime-probe.mjs`：标准用户范围首轮测试 22/22、子进程退出 0，但当前身份不符合标准用户验收，探测脚本退出 1、能力关闭，证据 runtime-preflight。
- `node scripts/runtime-probe.mjs --scope=current-user`：首次当前用户轮子进程超时、exitCode=null，探测退出 1；旧脚本读取了前轮同名报告，显示的 22/22 不算本轮通过，证据 runtime-current-user。无法据现有证据断言计时停顿根因。
- 修复探测脚本：每轮独立 UUID 报告名，缺失/损坏/早于本轮的报告不采信；新模块纳入 runtime fingerprint。使用相同命令复验退出 0，22/22、无 missingCases，native/Office/terminal available；证据 runtime-current-user-fresh、runtime-current-user-fresh.log。此为当前用户范围，不宣称独立标准用户通过。
- `pnpm exec vitest run --config vitest.config.ts --project integration P07-02.native-data`：正常 Windows 权限退出 0，1/1，88.86 秒；native-data-first.log。实际隔离分析→LO XLSX 重算→隔离缓存读回→原子导出；重复行统计 1、汇总华东 0.70/华南 1.05、3 个公式缓存一致，源 CSV 不变，撤权后拒绝。结果在 native-data；人工查看图表1.png，中文、分类和柱高正常。

## 尚待完成

完整原生异常分支、桌面端到端与视觉检查、口径纠正/版本恢复、CSV 注入与多文件/类型/空值等代表集、最终 check/build 和相关回归；真实模型仍须先在 TapKit 内连接检测成功。本任务无新增真实请求（连接检测累计仍为 P07-01 的 6 次）。P07-02 保持 in_progress，P07-03 未开始。
