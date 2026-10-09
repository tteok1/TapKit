# ADR 0003：指定新版本的原生接口

- 状态：接受；2026-09-15。
- better-sqlite3 13.0.3 已使用 node-addon-api，npm 正式包随附 prebuilds/win32-x64.node，gypfile=false。该 Node-API 产物无需按 Electron V8 ABI 重新编译。
- 初次强制 electron-rebuild 失败（本机无 Visual Studio C++ 工具），日志保留。最终改为核验 npm integrity 及 native-lock.json 中官方预构建文件 SHA256，再构建并在真实 Electron utilityProcess 中执行 SQLite/FTS5 探测；不从开发 Node 复制原生产物。实际 Electron 测试通过前不能声明兼容。
- TypeScript 7 的根模块不再提供旧 createSourceFile API。编译仍固定 TS 7.0.2；依赖方向扫描改用首次精确锁定 @babel/parser，解析 TS/TSX 的静态及动态导入。
- pnpm 12 使用原生分发，额外锁定官方 @pnpm/exe.win32-x64@12.4.1 及 integrity。
- P00-03 编译 Windows helper 仍需要 MSVC/SDK；本任务不以 Node-API 预构建代替该阶段验证。

- 幂等 bootstrap 不覆盖正在运行的 pnpm.exe；首次锁定额外记录该可执行文件 SHA256，已存在时验证后复用。系统 pnpm 11 与指定版本冲突时，使用 scripts/pnpm.ps1 调用项目的 pnpm 12.4.1，不降低 engines 或改全局安装。
