# P09-01 验收证据

基线：2026-11-05 fetch 后 origin/main=1a91688；分支 codex/p09-01-code-review。2026-11-05按用户追加授权推送此开发分支；不合入main，不开始P09其他任务。首次工作区的磁盘审计改动保留。

## 覆盖

| 需求 | 实现与验收定位 |
| --- | --- |
| FR-22-001 | Host专用本地目录选择、Core私有路径、Git/非Git检测；远程接入按P09-03依赖另验 |
| FR-22-002 | 排除元数据/缓存/凭据路径的文件树、正文与行读取；Core校验版本与行号生成统一code locator引用 |
| FR-22-004 | 指定已检测分支、私有bare对象复制、独立分支worktree和私有索引；默认不带dirty，显式tracked及选定untracked带入时重验hash |
| FR-22-005 | 独立副本真实新增/修改/删除、左右正文与真实行号；大小写重命名保留为删除/新增，别名写入拒绝 |
| FR-22-006 | 左右逐行反馈绑定path/hash；新task版本保留旧副本、继承当前正文和反馈，使用独立分支/元数据映射 |
| FR-22-009 | 接受仅标记本文件当前版本；撤销/恢复校验当前hash，保留冲突，提前持久化前像 |

安全与恢复：恶意Git配置/hooks/继承环境不执行；不hardlink、不继承alternates；符号链接/junction、元数据、Windows别名、跨run和过期行拒绝。已授权目录之外无读取入口。代码工作工具仅能修改副本，复用根账本/预算，修改回执不声称运行项目测试；进程中断无回执转unknown，不自动重放。

## 命令与结果

所有命令在D:/Tapkit-public。仓库脚本通过scripts/lib.mjs使用已锁定Node24.21.0 / pnpm12.4.1；直接使用环境pnpm11.25被engines拒绝，原失败见tsc-initial.log，不作为通过。

- `node scripts/check.mjs`（即pnpm check）：最终回执见delivery-check.log。
- `pnpm test:unit`：完整505项见unit-delivery.log；此前501项通过见unit-alias-final.log。
- `pnpm test:integration P09-01`：最终回执见integration-recovery-final.log，最终19项，包含真实MinGit、Windows junction和迁移握手。
- `pnpm test:integration P09-01 P08-03 P06-01 P00-03.git-broker`：49项通过，见regression-first.log；当时P09为13项，后加5项另验。P08生成报告另存P08-03-regression-ablation.json，历史报告已按精确hash保全，见regression-report-preservation.json。
- 生产桌面构建：build-final.log；随后仅补私有Git基线索引的Core重建core-final.log，两者均退出0，无fixture。
- `node scripts/e2e.mjs -- --grep P09-01`：最终回执e2e-review-confirm.log；明暗1280/980宽截图desktop/code-light.png与code-dark.png。此前握手版本、传输UUID和测试MemoryRouter问题的失败日志均保留；pre-review-empty截图是旧状态刷新问题的失败证据，不作为最终视觉验收。

## 真实模型

本任务新增连接检测10次，未继承旧任务余量。通过当前已配置智谱Chat账号的隔离密文副本，先启动真实TapKit，在应用内检测成功后才允许正式任务。单根上限1次模型请求、2工具、20000 tokens，无自动模型重试/后备，仅合成代码。结果及凭据清理以live-*/report.json最终回执为准，尚未出回执不写通过。

## 边界

支持已提交Git仓库或非Git的UTF-8文本项目（1000文件、16MiB正文、单文件1MiB、镜像对象1GiB）；链接、子模块、二进制或超量明确拒绝。应在选择器选择Git根目录；选择的普通子目录只授权该目录，不向上扩大权限。根预算/授权撤销/历史任务边界保持。终端执行、依赖准备、远程GitHub/提交/PR及网站预览仍由后续P09任务验收。

## 真实验收最终回执

第二轮live-ffb5a22e-3977-42b0-b3d3-b4970080cda4为passed：检测#2通过后实际1模型/1工具，副本sum.mjs精确修正，原文件不变，actual940、reserved0。首轮本地别名拒绝保留，estimated12649实际未知；两轮合计保守13589仅为正式根，检测usage未知另列。两份secrets条目均0、marker均closed、未知工具0，见live-final-audit.json。

19项P09 integration包含不同commit的分支选择、准备中断缺失补写和冲突保留，见integration-recovery-final.log。新增UI差异模型的4项unit通过（插入/删除、空侧、重复/CRLF、2200行）；provider mock另1项，共5项定向，见ui-fix-validation.log。独立UI复核F1–F4的修改与最终判定单列ui-review.md，不用原短文件截图替代长文件/焦点/滚动证据。

独立UI四项修正已全部resolved（ship范围仅F1–F4），长代码行高24px、滚动和3px焦点回执在desktop/interaction-metrics.json。全功能验收结合本页各类证据，不将视觉局部结论扩大为其他功能通过。UI文档核对在ui-documentation.md，DESIGN及全局令牌保持。

## CI修复与远程最终验收（2026-11-06）

CI80唯一失败是P00-01桌面闭合桥白名单漏列chooseCodeProject/codeCommand。修复be10fc4补齐精确白名单，新增越界路径、未知字段及非法run ID拒绝断言，并将P09-01加入CI桌面筛选；未修改应用代码或放宽权限。原失败及错误上下文保留在ci-fix-2026-11-05。

本地`node scripts/check.mjs`退出0；锁定pnpm运行`test:e2e -- --grep "P00-01 sandbox|P09-01"`为2/2通过。CI81（42058171082，源码be10fc45f58836c3f0f73b9c3b70cda9307c9310）三个job全部success，覆盖主check/unit/integration/perf/构建/桌面、独立标准用户、Office原生/关闭及启动诊断。最终run/各step回执与产物元数据见ci-fix-2026-11-05/ci81.json。

CI修复无新增连接检测或模型调用，仍2/10余8；既有维护改动、原审阅截图和真实验收失败历史均保留。最终验收补交仅含文档，沿用此CI已验代码；不合入main，不开始P09-02，不关闭P09 gate。

## 单提交合入main（2026-11-06）

按用户最新授权，原5个P09-01提交压成一个提交，main以1a91688为父快进到该汇总提交，开发分支按旧head校验同步。原提交历史保留本地backup ref，未提交维护改动保留。压缩合入只补交接文档，全部非文档树与已通过CI81的be10fc4一致；沿用旧验收，不声称新main run已通过。合入记录main-merge-2026-11-06.json；不启动下一任务或关闭P09 gate。
