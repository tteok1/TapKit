# P00-01 依赖兼容验证报告

## 已实测的开发基线

- 平台：Windows 11 25H2 x64（10.0.26200）；保留原 main/HEAD，所有实现尚未提交。
- Electron 44.3.0；React/ReactDOM 19.3.0；TypeScript 7.0.2；electron-vite 5.0.0；Vite 7.3.6；pnpm 12.4.1。其他直接包和 integrity 见 dependency-baseline.json，transitive 见 pnpm-lock.yaml。
- Core utilityProcess 中实际导入 better-sqlite3 13.0.3，执行 SQLite 3.53.4 / FTS5 查询；Electron ABI 149。预构建是官方 Node-API 文件，没有从开发 Node 复制 .node。
- Node 24.21.0、Python 3.13.15、Rust 1.98.1、LibreOffice 26.2.6（内部 26.2.6.3）、MinGit 2.55.0.windows.5 均运行版本探测，退出 0。Python pandas 3.0.5 / openpyxl 3.1.5 / matplotlib 3.11.2 实际导入成功。
- 工程源文件聚合 SHA256：34cb4b332972adeb9b50ea233b9c4c518f55015ab9dab687884623a703b63546；逐文件清单 source-manifest.json。

## 真实验证

- bootstrap.log：锁定 pnpm 12 的实际 bootstrap，含原生校验、构建和 Electron ABI 测试，退出 0。
- final-results.json：check、unit 4/4、integration 5/5、build、E2E 2/2，全部退出 0，逐条时间见 JSON。
- dev-verified.log：实际 pnpm dev；本地窗口/Renderer/Core ping 正常，关闭 Core 退出 0。
- PRIVATE_VISUAL_ARCHIVE.md：Playwright 实际窗口截图，已人工式视觉核验，中文文字正常，无假模型回答或发送按钮。
- runtime-probes.json：逐运行时命令、输出和退出码。
- 新中文/空格目录及删除 node_modules 后重建：全部退出 0，锁 SHA256 保持 69b760dec55e7f1cad08098b336965cfce0a0ab04bbddca92125a4608228b89a；最终源码同步复验也全通过。详见 repro-results.json / repro-final-source.log。

## 失败与修复

| 现象 | 真实结果 | 最终处理 |
|---|---|---|
| Windows 工具沙盒初始化失败 | 命令和默认文件工具未能启动，无应用测试结果 | 经工具审批改用沙盒外本地执行，未更改全局 Git safe.directory |
| pi-ai 旧 scope 返回 404 | initial-lock.log | 使用官方迁移后的 @earendil-works/pi-ai@0.85.1，版本不变（ADR 0001） |
| electron-vite 5 不接受 Vite 8 | install-initial.log，退出 1 | 无可用 5.x 补丁，Vite 单项降到兼容 7.3.6；严格 peer 校验保留（ADR 0002） |
| TS 7 不提供旧 AST API | check-first.log，退出 1 | TS 编译器保持 7.0.2，依赖扫描用 @babel/parser 8.0.5（ADR 0003） |
| 强制 SQLite 源码重建缺 MSVC | sqlite-rebuild.log，失败 | 使用官方 Node-API 预构建，hash 校验后通过实际 Electron/FTS5 测试 |
| Core 打包后找不到 SQLite | e2e-first.log，2 项失败 | Storage 单独编译，保留 workspace 导出及正确原生依赖解析；最终 2/2 通过 |
| dev URL 尾斜杠引发来源校验失败 | dev-smoke.log 虽退出 0，但含 IPC 错误，因此该旧证据不算通过 | 归一化受信 URL，新增真实 pong 条件；dev-verified.log 通过 |
| 中文/空格路径 MSI 参数停滞 | repro-first-failed.log；停止本任务 PID 后退出 1 | TARGETDIR 值单独加引号；ADR 0004；全新目录首次安装及删依赖重建已通过 |
| 系统 pnpm 11 不匹配工程 12 | system-pnpm-failed.log，退出 1 | scripts/pnpm.ps1 调用锁定工具，不改变全局版本 |
| bootstrap 覆盖正在运行的 pnpm.exe | pnpm-self-reextract-failed.log，退出 1 | 记录并验证既有 exe SHA256，bootstrap.log 已通过 |

## 限制与后续

- 未执行 GitHub 托管 CI；只交付 workflow，不声称远程绿灯。
- 未执行任何真实供应商/live。P00-01 不需要 R01—R07 凭据。
- 未执行安装包、Windows helper/AppContainer、Office 转换或真实标准用户隔离验收；这些属后续任务，版本探测不能替代其验收。
- 中文用户名使用中文目录和模拟 USERPROFILE/APPDATA 路径检验；未创建或切换实际 Windows 账号。
- 后续 suite 的入口明确返回 2 / NOT_IMPLEMENTED；不以空测试通过代替功能。
- Zod PURE 注释警告和上游 deprecated transitive 依赖已保留日志；不影响本任务实测成功，不据此宣称已完成发布安全评估。

最终同步复验曾误用不同 profile，触发 pnpm 模块迁移失败；repro-profile-mismatch-failed.log 保留。恢复原模拟 profile 后全部通过，没有为此修改应用或降低版本约束。
