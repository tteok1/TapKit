# TapKit

Windows 本地 AI 工作空间。已有中文桌面、独立 Core、本地数据和 Codex 连接诊断；真实模型联调及后续界面仍在开发中。当前状态以 [开发进度](docs/progress/CURRENT.md) 为准。

## 开发

要求 Windows 11 24H2+ x64 和用于首次引导的 Node 24。推荐入口（使用项目锁定的版本，不改变全局工具）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1
.\scripts\pnpm.ps1 dev
```

依赖已准备后，也可双击根目录 `Start-TapKit.cmd`。它读取锁文件中的项目 Node，启动相同的开发流程；失败时保留错误窗口。退出时使用 TapKit 菜单或托盘的“退出”，关闭窗口会保留后台 Core。

`dev` 每次先编译 Storage/Core，再启动 Host、Preload、Renderer 并监听源码；providers/tools 修改也会重建 Core。日常桌面开发不再先编译 Rust helper。`build:desktop` 编译完整桌面部分；`build` 和 `bootstrap` 仍包含原生 helper，不以桌面启动成功替代原生安全验收。缺失或未验收的原生执行/Office/终端保持不可用。

已安装 pnpm 12.4.1 时也可使用 `pnpm bootstrap` / `pnpm dev`。推荐项目脚本，避免全局工具版本差异。脚本在项目 `.runtime` 准备锁定 Node/Python/Rust/LibreOffice/MinGit，所有下载先校验哈希；不会全局安装工具或修改 Windows 安全策略。SQLite 13 使用官方 Node-API 预构建，校验哈希后在 Electron 内实测。原生 helper 的 SDK/CRT 使用项目内锁定依赖，见 ADR 0006。

```powershell
.\scripts\pnpm.ps1 check
.\scripts\pnpm.ps1 test:unit
.\scripts\pnpm.ps1 test:integration
.\scripts\pnpm.ps1 build
.\scripts\pnpm.ps1 build:desktop
.\scripts\pnpm.ps1 test:dev
.\scripts\pnpm.ps1 test:e2e -- --grep P00-01
.\scripts\pnpm.ps1 test:repro
```

默认开发数据位于 `.test-data/development`；可通过绝对路径 `TAPKIT_DATA_DIR` 指定专用目录。测试使用独立中文/空格目录。

`test:dev` 在独立中文/空格 profile 验证双击入口、开发脚本、数据重启和 Core 退出；仅测试进程使用临时 loopback 调试端口。运行开发/桌面测试需普通本地用户进程权限；受限工具沙盒内的失败需独立记录，不能直接推定为 Windows 安全策略拦截。不得通过关闭 Chromium 沙盒或安全中心修复启动。

所有直接依赖、运行时与 Python wheels 已精确锁定。版本决策见 docs/adr；真实进度和测试结果见 docs/progress。`docs/plan` 是规格，不能作为完成证据。

live、安全、恢复、性能、评测和安装包脚本在相应任务实现前明确返回退出码 2，不报告通过。

许可：MIT；第三方文件遵循 THIRD_PARTY_NOTICES.md。
