# P00-03 / ADR 0007 实施检查点（2026-09-24）

> **路线更新（2026-09-30；下方实施记录仅作历史证据）**：本记录所称“新方案”是当时的专用账户实现。当前标准已优化为 AppContainer + Job 承担 Node/Python/终端/Office 转换隔离，Git 使用可信 GitBroker；不需要账户初始化或账户级 WFP。旧账户测试结果不迁移为新路线证据。当前生产代码仍保留 account.execute，后续需按当前方案迁移并重新验收。

## 授权与变更边界

用户明确同意采用重新调整的方案，并要求同步文档供审计。工作目录 D:/TapKit，分支 main，基线 HEAD 071d15c5c45db4e91d232a4d26db7904061bc89b；保留此前未提交改动，没有提交、推送或切换阶段。

ADR 0007 为 accepted / implementation in progress，**不是 implemented / verified**。已同步 02 决策、03 架构、07 隔离、08 T21、P00-03 任务与 15 P00 门禁；ADR 0006 明确标记被替代范围。失败日志与成功兼容实验均保留。

## 已落地代码

- `packages/tools/src/execution/git-broker.ts`：P00 内部验证器，接受固定 status/diff 和 Core 提供的文件字节；每次新建私有布局的 bare 元数据及工作快照，明确 git-dir/work-tree。禁止 `.git` 指针、Windows 路径别名和额外参数；固定配置/环境/空模板，禁止 hooks、外部 diff、textconv、fsmonitor、凭据助手和协议；不读模型指定宿主路径。输出 1 MiB、每次 Git 子命令 15 秒、快照 16 MiB/1000 文件，退出后清理本次生成的目录。
- GitBroker 的私有根目录由可信 Core 提供。本轮验证字节快照和固定执行边界，**没有取得专用执行账户无法读取该根目录的跨账户 ACL 证据**；P09 的持久镜像、commit、远程认证未提前实现。
- `office-worker.ts`：固定 Office 转换工作流和 `AccountExecutor` 接口。版本 ID/输入哈希校验，独立 profile，固定三格式转 PDF 参数，保留原件哈希检查；退出码非零/隔离失败/活跃子进程未归零拒绝成功。没有宿主直接启动 LibreOffice 的回退。
- `contracts/execution.ts`：严格 GitInspect、OfficeRender、AccountExecution 契约与 `dedicated-account-v1` 方案标识。
- 能力读取拒绝旧方案报告；指纹覆盖新增执行代码。旧 runtime probe 仅允许显式 `--legacy-appcontainer` 历史诊断，即使通过也不能启用新能力。标准用户入口在新后端未就绪时先失败，避免先复制/下载整套组件再报错。

## 实际执行与结果

使用 `.runtime/node/node-v24.21.0-win-x64/node.exe`，确认版本 v24.21.0；通过 `scripts/lib.mjs` 的 `pnpm` 包装设置锁定 PATH。首轮直接 pnpm check 曾经使用全局 Node v24.18.0 并因格式检查失败；最终通过轮次改用锁定 PATH，不能混用首轮环境作为最终证据。

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| pnpm check（锁定环境） | exit 0：类型、格式、依赖边界、清单通过 | 本任务命令输出；首次格式错误已修复 |
| node scripts/build.mjs | exit 0：原 helper、storage/Core、Electron 三入口构建通过 | 本任务命令输出；Zod 注释警告非失败 |
| pnpm exec vitest run --config vitest.config.ts --project unit --reporter=json --outputFile=docs/evidence/P00-03/adr0007-unit-results.json | exit 0，15/15 | 同名 JSON |
| pnpm exec vitest run --config vitest.config.ts --project integration P00-01 P00-02 P00-03.capability P00-03.git-broker --reporter=json --outputFile=docs/evidence/P00-03/adr0007-integration-results.json | exit 0，29/29；其中真实 GitBroker 4 项 | 同名 JSON |

GitBroker 覆盖中文 status/diff、并发独立目录、模型参数/路径拒绝、恶意继承 Git 配置、输出超限与清理。OfficeWorker 是模拟执行器的边界单测，**没有进行新账户下的实际 PDF 转换**，也不能计入 T07 原生通过。

## 未完成与接续要求

1. **原生专用账户后端尚未实现**：管理员初始化、受保护凭据、账户租约、受限令牌启动、宿主/runner 自保护、内核网络规则核验、句柄固定及跨账户读写隔离。
2. 持久权限变更日志、崩溃/部分初始化回滚、并发根任务隔离及账户复用验证。
3. 把实际后端接入 OfficeWorker；真实三格式 PDF/中文字体、恶意文档、宏/外链、Node/Python/ConPTY 与网络/进程树测试。
4. 初始化后由独立标准用户重跑新路径全套验收。旧 test 账户 9/9 仅保留为旧 Core/AppContainer 子集证据。

本轮没有创建/修改 Windows 账户、ACL 或网络规则；native helper 仍是原 AppContainer 实现。它的构建成功不代表新方案实现。P00-03=in_progress，P00-gate=failed，能力保持失败。不要要求用户现在重跑旧标准用户全量命令，也不要将上述实现缺口标记为“只差管理员批准/只差 live 凭据”。
