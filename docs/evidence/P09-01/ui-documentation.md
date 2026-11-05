# P09-01 UI documentation verification

2026-11-05 · `codex/p09-01-code-review` · Windows Electron · Operate。

本次是既有工作详情中的代码审阅扩展。视觉依据为 [DESIGN.md](../../../DESIGN.md) 及其指向的 [design-system.css](../../../apps/desktop/src/renderer/src/design-system.css)；产品范围依据为 [P09-01](../../plan/tasks/P09-01.md) 与 [02-decisions.md 的 ADR0078 记录](../../plan/02-decisions.md)。核对后保留现有设计系统：没有新视觉世界、已批准的系统变更或新增品牌令牌；未修改 DESIGN.md、`.impeccable` 或创建 PRODUCT.md。

## 与既有系统的对应

| 项目 | 继承与本次局部选择 |
| --- | --- |
| 外壳与层级 | 保留完整侧栏、顶栏和工作详情容器；代码区以细分隔线接入，不增加浮起卡片或装饰性标题。普通文件动作继承现有胶囊轮廓、换行、悬停、禁用与焦点行为。 |
| 主题与语义色 | 沿用 light / dark / system 的 surface、ink、muted、border、focus 等角色。代码滚动面使用 muted-surface；左侧差异使用 danger-surface，右侧差异使用 accent-surface。差异底色不成为新品牌色。 |
| 文字 | 标题、说明、字段和小字继承 Windows 中文系统字体栈及已有层级；未加载字体。代码局部明确使用 12px Consolas / monospace、1.8 行高，行号为 12px / 24px；这些是审阅密度的局部值，不替换 DESIGN.md 的通用 code 记录或偏好字号规则。 |
| 字段与表单 | 使用既有主题字段、可见 label、选择框、数字输入和 textarea；反馈框局部最小高72px、可纵向调整。保存受 busy / 空白内容限制，提交成功后清空反馈正文；错误通过 alert、读取与复制结果通过 status 呈现。冲突、权限、撤权及过期反馈保留具体中文说明。 |
| 选中与焦点 | 文件使用 aria-current 与选中面，其状态小字改用 ink。反馈目标以 aria-pressed、反色行号及独立行轮廓表示，保持差异颜色可见。行号专用24px目标及4px圆角是局部例外，未改变全局按钮的尺寸或胶囊契约。 |

## 扩展行为记录

已核对 [code-ui.tsx](../../../apps/desktop/src/renderer/src/code-ui.tsx)、[code.css](../../../apps/desktop/src/renderer/src/code.css)、[code-diff.ts](../../../apps/desktop/src/renderer/src/code-diff.ts) 和 [中文文案](../../../apps/desktop/src/renderer/locales/code.zh-CN.json)：

- 文件目录与双侧代码在宽窗口并排；窗口不超过1000px时目录移到代码上方，不超过700px时两侧代码改为单列。路径允许换行，代码保持原始空白并在最高420px的区域内横向、纵向滚动。长内容以每组300行有界浏览；这些阈值仅用于本面板。
- 差异行模型识别插入、删除与未改行，两侧分别保留真实源行号；缺侧仅留对齐占位，不提供虚构行号按钮。普通未改文件与自身比较，不铺新增底色。
- 行号选择同步反馈位置与行号；反馈、行引用分别携带路径、侧别及版本hash。文件接受、撤销、恢复沿用真实命令及可用条件，修订入口创建后续工作并继承反馈。此处记录界面接线，不重新认证 Core 的隔离或写入安全性。

## 已核对的最终证据

- 已打开 [浅色主截图](desktop/code-light.png)（2534×1798，对应1280px窗口）和 [深色主截图](desktop/code-dark.png)（1934×1678，对应980px窗口）。两图均为稳定主题的代码审阅视口，展示插入、删除、未改行、紧凑行号及独立反馈目标；深色图显示目录在代码上方的重排。下方表单可随页面继续滚动，截图不单独证明全部状态。
- SHA256 与 [ui-review.md 最新 verdict pass](ui-review.md) 一致：浅色 `E6CBBEEB5169AD5B2BA2648E6AE591F1E52C5B6A479172D4227FD89CE2528D53`；深色 `3330F208539CF47E80C079404C3A1763F4533A31FEB12CAEF935FC4FFB20AFAE`。
- [interaction-metrics.json](desktop/interaction-metrics.json) 记录行高、最高行高、按钮高均24px，50个真实行号按钮，横向滚动与纵向溢出均为true，实测焦点轮廓3px。该3px是运行记录，不定义新的焦点令牌。
- [ui-fix-validation.log](ui-fix-validation.log) 记录 P09-01 unit 共2文件、5用例通过；[e2e-review-confirm.log](e2e-review-confirm.log) 记录桌面流程1 passed。已核对 E2E 中左右改动/未改行的 pressed 状态、焦点与滚动断言；本次文档核对未重跑应用或测试。
- 独立评审对 F1–F4 均判定 resolved；选中文件状态小字的既有 ink / accent-surface 对比为浅色12.55:1、深色9.35:1。未新增全局色值。

## 结论与边界

本范围内未发现需要修订根 DESIGN.md 的文档差异；已将代码行密度、等宽文字、差异选中态和局部响应布局记录为扩展选择，不推广为全局规则。DESIGN.md 核对前后 SHA256 均为 `14DB315180F2C0DD31A4C32C36A1A734B9FDBBD07627E5A09939603970C52144`。

评审的 **ship 仅覆盖 F1–F4 四项修正**，不表示全应用、额外状态、Core、连接检测或整个功能重新通过独立认证。P09-01 的功能与真实服务验收继续以 [任务进度](../../progress/P09-01.md) 及其证据为准；本记录不改变任务或阶段状态。未开展新的缺陷扫描，未读取私人测试资料、调用模型或修改代码。
