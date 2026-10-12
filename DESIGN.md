---
name: TapKit
description: 本地智能体客户端的轻量对话与可展开工作台
colors:
  accent: '#3c6650'
  accent-surface: '#e8f1ea'
  bubble: '#edf5ee'
  focus: '#47765b'
  surface: '#ffffff'
  background: '#eef5f0'
  muted-surface: '#f5f8f5'
  ink: '#242b27'
  muted: '#66736b'
  border: '#e1e9e3'
  hover: '#f0f5f1'
  subtle: '#fafbfa'
  code-surface: '#f6f8f6'
  danger: '#a43c3c'
  danger-surface: '#fff1f0'
  warning-surface: '#fff8e8'
  dark-accent: '#a7ceb1'
  dark-accent-surface: '#2c4031'
  dark-bubble: '#26382b'
  dark-focus: '#a7ceb1'
  dark-surface: '#191e1b'
  dark-background: '#101713'
  dark-muted-surface: '#151d18'
  dark-ink: '#e6ede7'
  dark-muted: '#a3b2a7'
  dark-border: '#303c33'
  dark-hover: '#243128'
  dark-subtle: '#1e2721'
  dark-code-surface: '#151b17'
  dark-danger: '#f0aaa4'
  dark-danger-surface: '#402725'
  dark-warning-surface: '#3a3322'
typography:
  headline:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
    fontSize: '1.65em'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '-0.025em'
  title:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
    fontSize: '1.08em'
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
    fontSize: 'var(--ui-font)'
    fontWeight: 400
    lineHeight: 1.6
  conversation:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
    fontSize: '1.04em'
    fontWeight: 400
    lineHeight: 1.8
  label:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
    fontSize: '0.93em'
    fontWeight: 500
  navigation:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
    fontSize: '0.93em'
    fontWeight: 400
    lineHeight: 1.6
  metadata:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
    fontSize: 'max(11px, 0.82em)'
    fontWeight: 400
    lineHeight: 1.6
  code:
    fontSize: '12px'
    lineHeight: 1.6
rounded:
  inline-code: '4px'
  control: '8px'
  compact-card: '9px'
  small-surface: '10px'
  surface: '12px'
  frame: '14px'
  composer: '16px'
spacing:
  '4': '4px'
  '8': '8px'
  '12': '12px'
  '16': '16px'
  '20': '20px'
  '24': '24px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.surface}'
    rounded: '{rounded.compact-card}'
    padding: '7px 13px'
  button-primary-hover:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.surface}'
  button-primary-active:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.surface}'
  button-save:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.surface}'
    rounded: '{rounded.control}'
    padding: '7px 10px'
  button-save-hover:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.surface}'
  button-save-active:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.surface}'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '7px 10px'
  button-secondary-hover:
    backgroundColor: '{colors.hover}'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '6px'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '8px 11px'
  navigation-item:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    typography: '{typography.navigation}'
    rounded: '{rounded.control}'
    padding: '7px 10px'
  navigation-item-selected:
    backgroundColor: '{colors.accent-surface}'
    textColor: '{colors.ink}'
  planned-tag:
    backgroundColor: '{colors.subtle}'
    textColor: '{colors.muted}'
    rounded: '{rounded.control}'
    padding: '3px 8px'
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.surface}'
    padding: '22px'
  composer:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.composer}'
    padding: '12px 14px'
  user-bubble:
    backgroundColor: '{colors.bubble}'
    textColor: '{colors.ink}'
    typography: '{typography.conversation}'
    rounded: '16px 16px 4px 16px'
    padding: '13px 18px'
  dialog:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.frame}'
    padding: '26px'
    width: 'min(700px, calc(100% - 32px))'
---

# Design System: TapKit

## Overview

**Creative North Star: "轻量对话与工作台"**

白色内容面、低饱和浅绿外缘和侧栏构成安静的本地工作空间。完整项目与会话导航支持 Operate；开放的回答正文、清晰输入区和按需展开的右侧工作台支持 Read。深色与跟随系统主题沿用同一组语义角色，不另建一套视觉语言。

这是现有开发版本的视觉契约。产品与交互依据来自 [范围决策](docs/plan/02-decisions.md)、[交互细则](docs/plan/12-interaction-details.md) 和已确认的 [方向契约](docs/evidence/UI-redesign/direction.md)；实际样式以 [design-system.css](apps/desktop/src/renderer/src/design-system.css) 为准，由 [styles.css](apps/desktop/src/renderer/src/styles.css) 提供结构。该文件不改变功能、数据权限或联调状态，状态以 [CURRENT.md](docs/progress/CURRENT.md) 为准。所有预览片段仅供开发展示，不承载客户数据；局部视觉修正的 ship verdict 不等于整个产品的独立认证。

**Key Characteristics:**

- 白色阅读面，浅绿侧栏、选中态与用户气泡。
- Windows 中文系统字体、可调字号与缩放、可见键盘焦点。
- 完整项目/会话侧栏，按需展开的文件与结果工作台。
- 普通列表使用细分隔线，功能表单与浮层保留明确边界。

## Colors

一组克制的绿色强调与中性表面贯穿聊天、设置、资料库和工作台；frontmatter 为实际复用色值。

### Primary

- **克制绿（accent / dark-accent）**：链接、发送按钮、可用状态和原生选择控件的强调。
- **浅绿选中面（accent-surface / dark-accent-surface）**：当前导航、按下状态、选中文本、定位消息与新增入口。
- **浅绿气泡（bubble / dark-bubble）**：用户消息的独立表面。
- **焦点绿（focus / dark-focus）**：键盘焦点与选中表格单元格轮廓。

**The Semantic Green Rule.** 按语义复用绿色：选中态、可操作强调与用户气泡各用既有角色；不要把整块回答正文铺成强调色。

### Neutral

- **白色内容面（surface）**与**深色内容面（dark-surface）**：主区、表单、原生弹窗和工作台。
- **浅绿外缘（background）**、**柔和侧栏（muted-surface）**及对应深色角色：分隔应用边缘、导航和内容。
- **正文墨色（ink）**与**辅助灰绿（muted）**及对应深色角色：标题/正文与上下文/说明/占位文本；输入占位文本使用 muted，保持不透明（opacity: 1）。
- **轻分隔线（border）**、**悬停面（hover）**、**极浅分组面（subtle）**、**代码面（code-surface）**及对应深色角色：组织列表、轻量状态与技术内容。
- **错误色与错误面（danger / danger-surface）**及对应深色角色：错误文本和 alert；**警示面（warning-surface）**用于文件版本变化提示。它们是状态语义，不是第二品牌色。

主题通过 light / dark / system 控制 color-scheme。Shiki 使用 github-light/github-dark 的 light-dark() 语法色；文档与 PDF 的原始内容、批注色和图表内容色不升格为应用品牌令牌。sidecar 的八级色条仅为展示派生值，不是新应用色阶。

## Typography

**Body Font:** Windows 系统文字栈；正文、标题、标签共享 frontmatter 中的字体族，不下载新字体。
**Code:** 代码沿用打包基础样式的等宽回退；只记录已明确实现的字号与行高。

中文优先，标题靠字重和适度缩放建立层级。普通段落使用舒展行高（1.75）；回答正文使用更宽松行高（1.8），控件和应用基础行高为（1.6）。

### Hierarchy

- **Headline**：页面主标题；权重、字号和字距由 headline 令牌定义。
- **Title**：设置与内容组标题；使用 title 令牌。
- **Body**：基础字号由偏好提供，小/标准/大对应（12 / 14 / 16px）。
- **Conversation**：用户文字与回答相对基础字号放大；回答遵循 conversation 行高，用户气泡沿用普通段落行高。
- **Label / Navigation / Metadata**：字段使用 label，导航链接使用同尺寸的常规字重；说明文字使用 metadata。局部工具操作、时间和计数已有（11 / 12px）尺寸，不作为新的大标题样式。

首页欢迎标题是既有局部例外（2em），窄容器缩为（1.6em）；会话标题为（1.18em）。这些值不扩展成营销展示字体系统。上下文事实置于标题之后，不添加标题上方的装饰眉题。

**The Preference Scale Rule.** 保留字号、缩放和紧凑密度设置；不要用固定截图尺寸替代实际缩放布局。

## Layout

应用采用左侧导航、中央内容、可选右侧工作台的 flex 结构。主窗口最低尺寸（960 × 640px）；外缘内边距（8px）。侧栏默认（260px），可调（200–400px），折叠后为（64px）；右侧工作台默认（440px），可调（320–600px）。每窗口保存布局，项目和会话列表在正常宽度保持完整。

实际最大内容宽度为：普通页面（920px）、会话（820px）、首页欢迎/输入（740px）。这些是已实现值；历史规格中的聊天列（800px）不覆盖当前代码。常规主区内边距为（28px 32px），窄容器为（20px）。输入区和消息流在会话页分配可用高度，工作台独立滚动。

容器宽度不超过（1180px）时，工作台从并排列转为右侧覆盖面，宽度为 min(panelWidth, 100% - 16px)。容器宽度不超过（760px）时，侧栏成为折叠导航或可打开的抽屉，设置标签横向换行，设置/账户表单改为单列，用户气泡最大宽度从（85%）改为（95%）。阈值按缩放后的逻辑宽度计算；现有（75 / 100 / 125 / 150 / 200%）缩放继续可用。

间距以 frontmatter 中已复用的步长为基础，不强行归一所有局部尺寸。紧凑模式已缩小侧栏间隔（7px）与消息纵向留白（12px）；不要把未生效的 --space 变量视为全局密度系统。

按既有内容容器阅读；打开工作台或放大界面时，让列缩放、表单重排、浮层滚动，保留输入与操作入口。

## Elevation & Depth

主体依靠表面色与细边框分层，不给普通列表或卡片增加阴影。软阴影用于弹窗、连接状态浮层、会话菜单和输入操作菜单；覆盖式工作台和侧栏抽屉以侧向阴影区分层级。

### Shadow Vocabulary

- **浮层**：浅色（0 12px 36px #192d211a），深色（0 12px 36px #0005）。
- **覆盖式工作台**：（-12px 0 36px #14241a22）。
- **侧栏抽屉**：（8px 0 24px #0002）。

原生弹窗 backdrop 为（#14241a66）。PDF 页面的白纸与页影属于文件预览内容，不定义普通应用卡片的材质。

**The Floating Surface Rule.** 应用卡片保持平面；菜单、弹窗和覆盖式面板才使用各自已实现的软阴影。

## Shapes

字段与一般按钮采用温和圆角；小型容器、表单、应用框与输入区使用逐步增大的圆角，具体值由 rounded 令牌定义。用户消息使用不对称尾角，助手回答保持开放正文。普通文件、项目和历史管理列表使用横向细分隔线，文件网格和表单容器保留边框。

边框通常为（1px），键盘焦点通常为（2px）加外偏移（3px）；工作台已有部分控件保留（3px）轮廓宽度。不要把焦点轮廓当成装饰性边框。UI 图标为内联描边 SVG，常规尺寸（18px），小操作尺寸（15px）；既有产品窗口图标尺寸（30px）。

## Components

### Buttons

安静、明确，主操作只在有实际动作的地方突出。发送和保存设置按钮使用绿色背景与内容面文字，enabled hover / active 均使用墨色背景以保持对比；发送使用 compact-card 圆角，保存使用 control 圆角。普通 secondary 使用内容面、细边框和正文色；topbar ghost 使用透明背景与无边框。默认按钮最小高度（32px），发送与输入条按钮已有局部最小高度（30px）。

按钮、链接和 summary 使用背景/边框/文字颜色过渡（160ms ease-out）；普通按钮 enabled active 使用选中面，主操作沿用上述墨色状态。disabled 保持不可用语义和淡化（opacity: 0.48）。focus-visible 显示焦点绿轮廓。跟随系统减少动画设置时取消过渡、动画与平滑滚动。

### Inputs / Fields

内容面、轻边框、control 圆角；默认最小高度（36px）。hover 仅加强边框，焦点使用既有轮廓。输入占位文本与帮助文案共用 muted；错误与拒绝说明保留原有文本和 alert，不通过颜色替代原因。复选框/单选框为（16px），使用 accent-color；标签继续可点击关联原输入。

### Navigation

完整侧栏包括项目、会话与既有导航入口；导航行最小高度（34px），当前页使用选中面。保持省略与可访问名称，展开状态提供文字，折叠状态保留 SVG 图标及原有 title/标签。设置导航使用相同选中语言，窄容器横向换行。标题下的本地范围或模式事实属于上下文说明。

### Chips / Tags

“规划中”标签是静态提示，使用 subtle 面、muted 文字和 control 圆角。不要把这些标签做成成功状态或可调用入口。选中按钮/标签页沿用既有 aria-pressed / aria-selected 语义与选中面。

### Cards / Containers

表单与账户/模型卡片使用内容面、surface 圆角和轻边框；通用 card 内边距见 frontmatter。说明组、进度、引用和小文件卡片使用 subtle 面及更小圆角。普通管理列表继续使用细分隔线，不将每一行包成浮起的卡片。

### Conversation / Composer

助手回答为开放 Markdown 正文，用户气泡靠右；消息工具以小号文字置于消息之后，保留现有编辑、分支、引用、笔记与删除入口。代码块使用 code-surface、轻边框和 small-surface 圆角，工具栏位于顶部；表格通过横线组织。

输入区保持 composer 圆角与细边框，focus-within 强调边框。草稿 textarea 最小高度（76px），保留标签、计数、模式/模型/附件/引用/更多操作以及常用提示词。更多操作可以折叠，但其原有字段、处理函数与条件仍在；未连接模型时保留明确引导和禁用状态。

### Dialogs / Workbench

原生弹窗居中，使用 frame 圆角、浮层阴影与现有 backdrop；通过逻辑视口上限保留边缘（32px 总余量），200% 缩放时内容可滚动。可见标题、字段、关闭和确认操作继续保留，关闭后遵循已有焦点恢复逻辑。

工作台使用内容面、轻分隔线和固定版本标签；所有已有预览、批注、版本提示、复制/下载/引用操作保留。文档内容和图片不重着色成应用主题；Shiki 的双主题语法色随 color-scheme 改变。

### Identity Asset

侧栏使用用户确认的当前 Electron 原子窗口图标，保持原图不改色、不重绘。来源是锁定 Electron（44.3.0）分发包；[来源说明](apps/desktop/src/renderer/assets/README.md) 与 [MIT 许可](apps/desktop/src/renderer/assets/electron-icon.LICENSE) 随素材保留。这是当前复用图标，不表示新创作的 TapKit 独占标志；没有新增生成素材。

## Do's and Don'ts

### Do:

- **Do** 从 design-system.css 的语义角色继承 light / dark / system，使用真实设置控制字号、缩放和密度。
- **Do** 在正常宽度保留完整项目/会话侧栏，按需打开右侧工作台，依照现有容器阈值重排。
- **Do** 保留可见标签、键盘焦点、可读占位文本，以及错误、空态、加载、重试和确认分支。
- **Do** 保留每个既有页面、表单字段、列表动作与处理函数；布局和视觉变化继续受原有权限及可用条件控制。
- **Do** 为当前复用窗口图标保留出处和许可，开发预览仅使用合成示例。

### Don't:

- **Don't** 为新页面发明另一组品牌色、下载字体或装饰性标题眉题。
- **Don't** 把文档批注、PDF 白纸、图表/语法色或已被覆盖的旧 CSS 色值推广为应用令牌。
- **Don't** 通过视觉“可用”状态提前开放浏览器操作、工作执行、媒体、桌面控制、插件/Skills/定时等仍未完成或延期的能力。
- **Don't** 用重设计替代后端授权、固定版本验证或真实账号联调证据；既有 implemented_not_live_verified 与 unavailable 状态继续保持。
- **Don't** 把孤立控件的残留样式或未生效变量写成所有后续页面必须继承的规则。
