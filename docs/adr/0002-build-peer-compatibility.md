# ADR 0002：构建依赖 peer 冲突

- 状态：接受；2026-09-15。
- pnpm 严格安装实测失败：electron-vite 5.0.0 只接受 Vite 5/6/7，当日无同主版本补丁支持 Vite 8。
- 将唯一冲突主栈 Vite 从 8.3.0 调整为 7.3.6（7 系最高正式补丁），保持 electron-vite 5.0.0、Electron 44.3.0、TypeScript 7.0.2、React 19.3.0。Vitest/Tailwind 均声明兼容 Vite 7。未关闭 strictPeerDependencies。
- 首次选配 typescript-eslint 8.70.0 不支持指定 TS 7；移除该未在规格指定的选配包。TS 由 strict/noUnused/noFallthrough 检查，JS 脚本使用 ESLint。
- 初始失败：docs/evidence/P00-01/install-initial.log。回归结果在 P00-01 兼容报告更新，不用 peer 元数据冒充实测。
