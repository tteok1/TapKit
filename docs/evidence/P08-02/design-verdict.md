## verdict

1. **resolved — 深色原文高亮对比度。** `quote.png`、`quote-dark.png`、`quote-system.png` 中同一段“公开价格 42 元。”均可读，字符定位仍清楚；`research.css:127–130` 已使用既有 `--warning-surface` / `--ink` 配对。E2E 对深色和 system-dark 均核对实际计算色值为前景 `rgb(230, 237, 231)`、背景 `rgb(58, 51, 34)`。证据为真实 Electron 渲染，测试通过 Playwright `colorScheme=dark`、Electron `nativeTheme.themeSource='dark'` 及 DOM `data-theme` 切换主题；不代表 Windows 系统设置切换流程已验收。
2. **resolved — 读取失败、恢复及错误指引。** `progress-error.png` 明确显示“研究数据未通过校验”的中文原因、保留任务/查看诊断的后续建议及“重新读取进度”按钮，没有残留加载文案；`progress-recovered.png` 恢复搜索 1/8、来源读取 2/40，旧告警已消失。`research-ui.tsx` 将 loading/readError 分开，在成功回读时清除 readError，并按版本、权限、来源等代码提供不同中文恢复建议。`P08-02.research.spec.ts` 通过真实 SQLite 无效研究元数据、面板重新挂载、恢复数据并点击界面重试覆盖首次失败与恢复；其他错误映射本轮仅有源码证据。

## remaining

clear。未发现本批两项修复引入的可见回归。

本次已打开并检查 `.impeccable/review/desktop.png`、`compact.png` 及 `docs/evidence/P08-02/desktop/` 下的 `quote.png`、`quote-dark.png`、`quote-system.png`、`progress-error.png`、`progress-recovered.png`、`pdf.png`，均为有效视口截图。桌面 CSS 1267×899、紧凑 CSS 947×839，DPR 2；既有 Windows 最小窗口限制了请求的 760 宽度，不作 760 宽度声明。`pdf.png` 仅支持已显示的文件工作台区域，不作为完整 PDF 文档检查证据。

`resumed-p08-verified.log` 记录三个 P08 E2E 通过及 `COMMAND_EXIT=0`，其中包含上述主题与故障恢复断言。既有 `DESIGN.md` / `.impeccable/design.json` 仍为设计依据；PRODUCT.md 缺失沿用原审查的范围披露。本轮没有重跑检测器；先前 `cache_directory_failed` 仍不算检测通过。

本次 ship 仅覆盖上述两项已评分修复，不代表整个界面或 P08-02 全任务验收通过。

disposition: ship
