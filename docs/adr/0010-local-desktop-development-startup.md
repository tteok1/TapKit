# ADR 0010：本地桌面开发启动与原生构建分开

- 日期：2026-10-03；状态：采用；范围：用户授权的本地启动修复，P00-01 工程入口及 P01-01 回归。

原 dev 无条件执行完整 build，Rust DLL 被本机策略阻止时，尚不调用原生执行的桌面也无法启动。原 main/preload watch 未开启，已有 Core watch 又缺 providers/tools，造成修改后看见旧行为。

dev 只先构建 Storage/Core，随后以 electron-vite --watch 启动 Host/Preload/Renderer；Core、storage、contracts、providers、tools 的 src 均纳入 Host watch。新增 build:desktop 供桌面分项构建；build/bootstrap 继续完整原生构建并传播失败。此变更不更新依赖版本、不复制他处旧产物，也不绕过能力指纹或安全门禁。

Start-TapKit.cmd 从 runtime-lock 解析项目 Node，调用同一 dev 脚本，不依赖全局 pnpm、不修改执行策略/注册表/ACL/安全中心。开发数据仍为 .test-data/development，可显式指定绝对 TAPKIT_DATA_DIR；异常退出保留错误窗口。

Playwright 1.63 默认 chromiumSandbox=false 会添加 --no-sandbox。桌面 E2E 改为显式 chromiumSandbox=true，并实际核对 Renderer 的 app metrics sandboxed=true。test:dev 改为驱动真实 cmd/dev 入口、同一测试 profile 两轮启动、正常 app.quit 和 Core 清理。调试端口仅用于测试子进程，日常入口不设置。

工具沙盒内出现过 Playwright 连接断言/Electron 0x80000003；相同既有桌面构建在沙盒外普通用户进程、Chromium 沙盒开启下通过。此次正常本地启动未复现该故障，不据此声称已证明其底层 Windows/ACL 原因。未改变本机配置，Rust/helper 的历史 SAC 拦截与 P00 Office 门禁缺口分别保留。

验证与失败修复记录见 docs/evidence/P00-01/local-startup-results.json。后续开发须在普通用户进程中执行桌面验证；若确需更改本机配置，先说明理由，由用户手动修改。
