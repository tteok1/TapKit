# P02-02 实施与验收证据

日期：2026-10-05（Asia/Shanghai）。目录D:/TapKit，分支codex/p02-01，基线HEAD aebd8982b361b906acae626f6b13dfe19d287fe4，实现验收时为working-tree。随后按用户授权提交744819b并推送远程，SHA核对一致，见[Git交付记录](git-delivery-2026-10-05.json)；下方测试证据对应验收快照。既有P01/P02复核改动保留；原CURRENT与INDEX记录另存本目录，避免历史日志覆盖当前状态。

## 交付

- 迁移0006与共享chat契约：消息/run/队列/事件/receipt同事务；永久clientMessageId载荷去重；窗口草稿CAS；schemaVersion=6，旧库/备份升级与未来版本拒绝回归通过。
- ChatService使用真实ModelRouter/UsageLedger，安全只读循环、实际模型/用量、根共享预算、租约、停止/补充/排队/启动恢复。工具只读取明确文件选区及当前会话；半JSON不执行，取消/未知工具不重放。
- Electron输入与ChatMarkdown：IME/回车偏好、超限草稿保留、20k长粘贴候选、托管文本材料及预览、纯文本提示词、折叠/分页/80px跟随；HTML禁用、Shiki JavaScript引擎、KaTeX trust=false、无脚本权限的静态Mermaid。
- 生产中不会包含聊天测试适配器。test:e2e显式构建隔离fixture，finally恢复生产构建；不与重建产物的测试并发。设计见[ADR0023](../../adr/0023-durable-chat-and-read-loop.md)。

## 规定检查

命令均经锁定入口`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\pnpm.ps1`执行。各最终退出码、测试数量和产物检查见[结果JSON](results-2026-10-05.json)。

| 检查 | 实际结果 |
|---|---|
| check | 类型、格式、依赖边界及运行时manifest通过 |
| build:desktop | 生产构建通过，测试fixture入口/chunk移除 |
| test:unit | 18文件，224/224通过；P02-02定向4/4 |
| test:integration P00-02 P01-01 P01-02 P01-03 P02-01 P02-02 | 11文件，112/112通过；P02-02定向12/12 |
| test:e2e -- --grep P02-02 | 5/5通过，Electron/真实Core/SQLite/Router/Ledger，提供方为本地fixture |
| test:e2e -- --grep P02-(01\|02) | 中间轮6/8；其中P02-01三项全部通过，P02-02两项失败后来修复并在最终5项验证 |
| test:e2e -- --grep P02-02 T02 malicious | 图表标签修复后1/1通过；SVG文字/尺寸、Shiki/KaTeX、HTML/恶意链接和零外部自动加载断言 |
| docs:check / git diff --check | 需求/任务/证据及差异完整性核对 |

P00-03权限套件未运行；不宣称全integration或安全gate通过。真实模型请求0，原用户Key/vault/profile读取0；隔离fixture不替代真实供应商验收。

## 异常与修复记录

1. 初轮草稿新记录revision=0不能通过写请求revision约束；改初始1，重复receipt与跨窗口CAS验证通过。
2. Playwright测试运行时导入整个contracts/storage导致Node JSON导入属性错误；测试使用type-only契约与本地UUIDv7生成，不改生产依赖。
3. Windows沙箱内Electron Target crashed；当前用户运行保留chromiumSandbox=true后能启动。测试构建曾被并发unit中的生产重建覆盖，修正test:e2e为显式测试构建/生产恢复流程。
4. 首轮界面2/4，发现会话导航时输入框过早可用，草稿加载覆盖刚输入内容；使用路由实体ID及加载完成禁用输入。历史分页也改为保留已读页，确认工具终止状态不残留dispatched。
5. 回归中间轮6/8：超限草稿测试的侧栏/列表链接选择器不唯一，改侧栏范围；Shiki默认WASM被既有CSP拒绝，改JavaScript引擎，保持script-src self。
6. 单元渲染试验无法从仓库根导入React（严格工作区依赖），改为纯URL/图表授权边界单元测试；实际HTML/流式渲染仍由Electron验证。
7. check沙箱扫描旧.test-data/acl-probe遇EPERM，当前用户检查不改ACL；两文件格式及新增回车偏好测试的设置patch契约失败已修复。patch必须完整desktop组，不更改P02-01既定接口。
8. 图片核对发现Mermaid节点文字被HTML白名单清除；全局与flowchart同时htmlLabels=false，补实际SVG标签断言，随后1/1通过。图表按iframe尺寸适配，保留无权限sandbox/CSP。最终仅修正模型显示和静态原件文案，不新增执行能力。

失败从未计为通过；日志仅隔离资料、合成请求和构建输出。P02-01回归自动覆盖的旧截图已复制为regression-*，原4张基线证据恢复；开始时的既有未提交内容未覆盖。

## 需求覆盖与边界

| 需求 | 当前实现/边界 |
|---|---|
| FR-06-001—004 | 多行增高/展开；Enter/Ctrl+Enter/Shift+Enter/IME；安全纯文本/表格粘贴；20k转附件候选 |
| FR-06-005—008 | 会话/窗口草稿CAS与加载保护；100k上限保留；撤销/重做/清空；四类slash/个人纯文本snippet |
| FR-06-009 | 选择/拖拽/粘贴附件，20项/100MiB；托管UTF-8文本直接ready，办公/媒体原件unsupported |
| FR-06-012—013 | @托管文件/已有会话，消息和文本文件选区定位；项目整体/网页/智能体/插件解析等待对应阶段，跨项目默认拒绝 |
| FR-06-014—016 | 来源/状态/预览/移除；替换通过移除后添加；仅保存原件继续不进入上下文；未就绪拒绝发送 |
| FR-06-017—019 | 本轮模式/模型/只读范围、真实回答模型；发送ack/失败保留；未知重试clientMessageId不重复；失败可重新填写 |
| FR-06-020—022 | followup/steer；排队编辑/取消CAS；停止保留确认正文interrupted，根预算不重置 |
| FR-07-001—003 | SQLite确认的流式正文、GFM/表格、Shiki/KaTeX/静态Mermaid；不执行HTML/图表脚本 |
| FR-07-004—005 | 静态外部媒体/原件来源卡及文件/消息材料定位；媒体生成/播放、网页来源和交互能力延期 |
| FR-07-006—008 | 正文/工具/来源折叠，真实run摘要/耗时/用量状态，回答模型和时间 |
| FR-07-009—010 | 历史分页不覆盖已读页；80px跟随；未读提示/回到最新，110条历史场景实测 |
| FR-33-010 | 断线保留草稿、稳定clientMessageId重试、启动重读确认正文；无云同步或自动重放原请求 |

## 截图检查与后续

已查看two-turns/safe-markdown/narrow-composer/static-diagram；中文代码/公式可见，窄窗口超限输入可滚动且无页面横向溢出，图表修复后“输入→输出”文字完整。regression-*为P02-01原有三项在本轮的副本。截图仅合成数据，系统DPI会使PNG大于窗口CSS尺寸。

当前P02-02可作为P02-03的本地接口前置，状态implemented_not_live_verified。R01/R13/R14及P01真实缺口仍需另行有界验收；R02—R05 pending。P00/P01-gate保持failed，原生执行关闭；P02-03未启动，无P02-gate。
