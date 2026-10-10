# 交互细则、领域DTO与补充接口

P03-03实现见[ADR0044](../adr/0044-project-scopes-and-atomic-index-links.md)：项目六个视图、独立设置/模型/只读工具，资料显示active/pending索引及准备/失败/过期，删除影响预览默认保留会话与共享文件，ZIP通过Host保存框导出。聊天资料范围明确区分全部/空列表/选中固定版本；仅依据项目资料禁用外部背景及历史工具。网页链接与用户正文在本机存为快照；联网抓取、连接应用、自动记忆与工作执行保持后续边界，不宣称ready或已执行。

P03-02增量（2026-10-10，[ADR0042](../adr/0042-fixed-version-preview-and-pdf-annotations.md)）：文件引用可在消息中读简要内容，再按原versionId/Locator展开右面板。选区引用须带Locator和selection.selectedTextHash；可选textRange为该定位材料中的UTF-16字符范围，Core从固定解析结构核验，Renderer文本不是模型材料权威。PDF框选只取相交文本块；文字选区用TextLayer项目顺序/字符偏移映射并复核，空图像区不声称有OCR文字。批注只本地保存，用户点击批注提问才将已核验引用和用户备注加入草稿。Office展示PDF版式，同时保留段落/幻灯片结构定位，不承诺像素映射。外部打开使用Host专属固定版本副本，脚本/HTML/SVG等按.txt副本交给系统应用；原件可下载，分享为用户主动保存副本，不生成在线链接。多标签阅读位置按版本保存；刷新/新版本提示保持原引用，只有用户打开新版才切换版本。

本文件补齐原始功能池中的细小操作，按表列责任任务分段读取。这里的UI和DTO是指定产品方案，不宣称参考产品内部也是如此。依赖未完成时能力为unavailable，不展示成功状态。

## 1. 视图布局和导航（P02-01/P02-03/P10-02）

P02-03实际入口：侧栏和聊天/工作页HistoryList分页，每页50、界面最多保留100行；默认列表包含全部可访问会话，重排不改变已有组归属。分组可折叠/拖动，项目可拖入分组和在组内重排；元数据与批量移动可选择项目/分组。搜索弹窗支持范围/类型/归档/排序、查询历史和目标分支消息定位，文件限名称。窗口布局记住导航顺序、侧栏滚动及路由；独立窗口草稿仍分开保存。

- 左栏默认260px，可调200—400px，折叠为64px；右栏默认440px、最小320px。主窗口最小960×640，右栏开启且剩余内容不足时使用抽屉；默认聊天列最大800px。布局值按窗口保存。
- 左栏主项：新建、搜索、聊天、工作、项目、文件、通知。智能体、插件与应用、Skills与模板、定时任务在P10以“规划中”显示，可隐藏；账户区改为本地个人资料、设置、用量，不显示产品订阅或空间切换。
- 首页按最近、置顶、运行中、待处理分组，空态提供“总结一份文档”“比较两份资料”“分析表格”三个本地固定示例；点击只填草稿。推荐区域可隐藏。尚未开发的模式不进入空白工作页。
- 会话/项目右键“在新窗口打开”，复用Core数据和当前实体，无需实现浏览器式多标签栏；前进/后退保留路由、滚动和选中项。主窗口关闭默认最小化到托盘并在第一次说明，托盘“退出”停止新派发、持久化恢复点后退出；不偷偷阻止用户退出。
- 分组删除仅移除组织关系，内容回默认列表；拖排序用稳定sort_key并在单事务重排。同一实体在一个自定义组内，置顶不改变项目归属。
- Ctrl+K全局搜索，Ctrl+N新聊天，Ctrl+Shift+N新窗口；P10增加可配置全局Ctrl+Shift+Space快速输入窗口，冲突时显示快捷键注册失败并可改键。快速窗口仅创建/打开会话，无截屏、语音或桌面读取能力。
- 搜索保留最近20个非空查询，可单删/清空，临时聊天不记查询历史。搜索结果携带EntityRef+Locator，返回原路由时保留位置；过滤归档/项目/类型和相关性/更新时间排序可组合。

## 2. 个人资料和偏好（P02-01/P01-03/P10-02）

昵称1—40字符，默认“本地用户”；头像可选本地PNG/JPEG/WebP，最大5MiB、解码后最大4096×4096，静态缩略存本地SQLite托管数据（96×96 PNG、公开值≤64KiB；见ADR0022，随设置备份，不存原图或绝对路径）。默认几何图标由SVG代码绘制。个人资料页面提供随包的使用说明/隐私说明；不开产品账号。

模型选择器支持provider分组、名称搜索、收藏、默认项和可用/未配置/需重连标识。偏好固定：回答语言auto/zh-CN/en、长度short/normal/long、语气natural/professional/friendly、格式auto/plain/markdown/json。UI首发仍全中文，回答语言允许用户选择；JSON模式必须有合法结构或返回不支持，不能声称所有模型都支持strict schema。

偏好优先级：本次显式覆盖 > 会话设置 > 项目设置 > 允许生效的个人设置 > defaults；权限不沿此优先级自动扩大，仍取当前授权交集。项目外指令/历史/记忆三个开关独立。切模型预览不支持的tools/reasoning/JSON参数，只有用户移除不兼容项或选兼容模型后才发送；不得静默漏附件。

主题light/dark/system、字号small/normal/large、Enter发送默认开、紧凑密度默认关、动效跟随Windows减少动画。统一空态、加载态、错误态、重试入口；界面文字不得出现栈追踪、原始协议名或未实现功能的假按钮。

## 3. 输入、引用与消息（P02-02/P02-03/P03-02）

P02-03实际消息操作：活动run期间禁用上下文变更；编辑/重生成创建新分支/新run，分支下拉切换回答版本。消息收藏/反馈在本机；笔记为托管Markdown文件，项目笔记只写当前项目。分享入口先预览当前分支Markdown，再由Host文件选择框导出，最多1,000节点，附件/工具过程不导出。临时聊天有清理提示，离开即清；不开放历史搜索、持久笔记、导出、分叉或后台命名。永久删除若仍有实际标题请求进行中返回冲突，结束后可重试；单节点删除展示准确影响范围，并清协议缓存与恢复墓碑。

> P02-02当前范围（2026-10-05）：聊天闭环/只读工具已接入，工作保留草稿；材料来源可用托管UTF-8文本及消息选区，项目整体/网页/智能体/插件解析等待对应阶段。当前项目间引用默认拒绝；office/媒体只保存原件不送模型。草稿加载完成前禁用输入，防止切页时旧草稿覆盖新输入；长回复/来源/工具可折叠，历史分页与80px跟随已实现。代码高亮使用Shiki JavaScript引擎，静态Mermaid在无权限sandbox iframe中渲染，CSP保持script-src self。参见[ADR0023](../adr/0023-durable-chat-and-read-loop.md)。

- 普通输入上限100,000字符；粘贴超过20,000字符时提示转UTF-8文本附件并保留可取消原稿，超过上限不能静默截断；发送时仍受模型上下文预算限制，超窗口提示转附件/选择内容。IME composing期间Enter不发送，Shift+Enter始终换行。
- HTML粘贴先转安全文本/表格Markdown，丢弃脚本和外部自动加载；代码保留缩进。Ctrl+Z/Y本地撤销；清空只影响当前草稿。
- slash快捷项仅/help、/new、/work和个人prompt_snippets纯文本插入；snippet最多100条、单条8,000字符。它不是Skills、插件或可执行模板，不进行工具导入。/work只改草稿模式，发送才建立任务。
- @菜单可选当前权限内文件、项目、会话；项目引用明确包含哪些资料及版本，发送时冻结最多20个输入refs，超出进入项目检索而非全量塞提示词；默认项目隔离开启时跨项目显式引用先显示该次范围预览，确认引用只授予本轮选中资料读取。
- 附件状态uploading/parsing/ready/failed/unsupported。未就绪可等待/移除；“仅保存原件继续”会明确不进入模型上下文。媒体原件可存，首版不发给视觉/语音模型。
- 对消息选区翻译/解释/扩写/缩写/改写，建立新的普通用户轮，附原文引用和动作；不覆盖原回答。快捷追问最多3条，仅作为可点击建议，不自动触发请求。
- 收藏写message_marks；保存笔记创建Markdown file(kind=note)，可选择项目归属。消息“转文档”新建work run并引用原消息，“转工作”继承用户目标/材料/显式验收；用户模板项显示规划中。
- Markdown渲染禁止raw HTML执行；代码高亮、KaTeX公式和本地生成图表按锁定依赖实现，KaTeX trust=false。外部图片默认点击后加载或保存托管，SVG不直接注入DOM。消息长工具结果可折叠，自动滚动仅在距底部80px内时跟随。
- 编辑问题必建新分支并复制到编辑点的可见路径，重新生成仅建立该assistant的候选版本及其独立run；旧回答版本之间切换不重新运行工具。永久删除消息前展示“本分支后续也删除”或“保留后续并以已删除标记代替上下文”的确切范围。

## 4. 文件、预览和项目（P03-01/02/03）

每项文件可在选择阶段移除，也可在保存中只取消该项；已完成项保留，失败/取消项明确重新选择原件。固定版本的内容读取提供取消与失败重试。图片/音视频、旧 Office 格式只保留原件；扫描 PDF 显示需 OCR、本版未支持、下载及文本版替换说明。详情显示具体错误原因。聊天保存笔记作为生成成果进入资料库，正文可检索，会话/项目固定原始版本，未生成预览不标预览 ready。见 ADR0039/0040；不扩展 P03-02 预览或 P07 办公生成。

资料库切换项目/会话范围后使用该范围的固定版本，格式筛选、正文搜索、大小和读取状态保持一致；库中新版不会自动替换旧引用。旧版卡片标注固定版本及原始文件名，逻辑名称可重命名。下载/另存使用当前查看版本，副本名称必须保持该版本格式；重命名、收藏和恢复后重新读取范围视图，恢复仍新增库版本而不更新固定引用。

P03-01聊天附件的物理文件走Host选择token，显示逐项原件保存进度及独立内容读取状态；取消或部分失败仍保存已完成引用和问题草稿，未完成项需重新选择。失败材料可下载原件、重试当前固定版本解析或移除；解析未就绪禁止发送。长粘贴转文本和无路径图片保留兼容入口，物理文件权限失败不能改为字节上传。项目引用下载保持当前项目授权，撤权后拒绝导出。导航取消的结果追加原会话草稿，不写新页面。

首版可结构化处理.pdf/.docx/.xlsx/.csv/.tsv/.pptx/.md/.txt/.json/.yaml/.yml/.xml/.html以及常见文本代码扩展。旧.doc/.xls/.ppt与.docm/.xlsm/.pptm只保存原件，不进入结构化分析且不执行宏，提示用户转换为支持格式。加密文件需用户另行提供未加密副本，本版不管理文档密码。扩展/MIME/文件头冲突显式报错。HTML解析去执行内容；静态图片和ZIP只有预览与文件管理。

资料库支持按类型/来源/标签/更新时间筛选、文件夹导航、搜索、多选批处理；逐项返回失败，不把批次部分成功呈现为全部完成。同hash不同名默认复用blob并创建独立file；“替换”明确新增所选file版本，不按同名自动覆盖。复制项目默认复制会话/资料关联到共享不可变版本，后续内容修改分叉版本。

PDF本地批注使用pdf_annotations，绑定fileVersion+pageIndex+归一化rect数组+选区hash。提供高亮和文本备注、修改/删除；不改PDF字节，不把批注自动送模型；导出可选单独annotations.json。正文选区进入输入需要用户点击引用。旧版批注不自动迁移到新版位置。

DOCX先只读转换预览并提供段落目录；XLSX/CSV虚拟表格支持sheet切换、冻结首行、列排序/筛选、单元格定位，操作仅改变视图；公式展示缓存值和原公式，缓存缺失标未计算，P07分析工作流才用LibreOffice重算新版本，不宣称Excel完全兼容。PPTX缩略图/翻页、备注、全屏放映；Markdown排版/源码切换，代码行号/diff；图片仅缩放/旋转视图；ZIP目录不自动执行。

项目创建即独立资料与记忆范围。删除预览默认会话detach回普通聊天、资料解除项目关联，勾选删除资料才进回收站；移入/移出项目显示新规则，等待当前run停止或完成后变更作用域，不在模型请求中途悄悄换范围。用户“仅依据项目资料”设置允许工具范围为该项目检索/文件，禁用网页/历史/其他项目召回，证据不足必须说明。

## 5. 工作任务、任务中心（P06-01/P06-03/P08-03）

工作定义保存目标、成果格式/数量/语言/受众、范围、验收、deadlineAt可空。截止时间只做当前任务逾期标记与提示，不建立未来唤醒调度。非关键缺失使用明确默认；影响产物目标/外部动作才发结构化Clarification(questionId,title,options最多5,allowFreeText=true,required,defaultValue?)。必答未答保持waiting_user；可选问题只在已有默认声明下继续独立步骤。

任务中心提供列表/看板，按project、status、更新时间、内置工作流筛选；没有自定义智能体筛选假选项。置顶/归档是用户组织字段；priority为0—9默认5，只影响未运行任务，同优先级FIFO。批量暂停/取消/归档逐项展示结果；复制任务只复制目标/材料/验收与预算默认值，不复制审批、进程或已执行状态。

计划最多12步，近期步骤优先细化；stepKey稳定，依赖决定可执行顺序，拖动只改显示顺序不能破坏依赖。删除有依赖步骤先明确受影响项；optional步骤可跳过并记录理由，必需步骤跳过则结果最多partial。子任务继承root范围/预算/授权上限，可单独steer/pause/retry；不会凭委派创建新用户权限。

关闭页面任务继续；托盘驻留继续；退出应用/Windows休眠停止新的执行，恢复后核对状态；本版不承诺机器关闭后运行。Windows通知只发完成、失败、待输入、预算停止，5秒同根合并，点击跳转；免打扰时只保留站内未读，不绕过系统通知设置。

## 6. 资源与定位DTO（P00-02定义，相关阶段实现）

~~~typescript
type ResourceRef =
 | {kind:'file'; fileId:string; versionId:string; locator?:Locator}
 | {kind:'message'; sessionId:string; messageId:string; version:number; range?:{start:number;end:number}}
 | {kind:'project'; projectId:string; selectedVersionIds?:string[]}
 | {kind:'web'; sourceId:string; revision:number; locator?:Locator};
type Locator =
 | {kind:'pdf'; pageIndex:number; rects?:Array<{x:number;y:number;width:number;height:number}>}
 | {kind:'text'; start:number;end:number;paragraphId?:string}
 | {kind:'sheet'; sheetId:string;range:string}
 | {kind:'slide'; slideIndex:number;shapeId?:string}
 | {kind:'code';path:string;lineStart:number;lineEnd:number;side?:'old'|'new'}
 | {kind:'web';blockId:string;start?:number;end?:number};
type AcceptanceRule =
 | {kind:'file_exists';format:string;minCount:number}
 | {kind:'schema';schemaId:string}
 | {kind:'citation_coverage';minRatio:number}
 | {kind:'test_exit';commandRef:string;expectedCode:0}
 | {kind:'human_review';description:string};
type PlanStepInput = {
 stepKey:string;title:string;dependencies:string[];inputRefs:ResourceRef[];
 outputContract:{kind:'text'|'files'|'code'|'research';formats:string[]};
 acceptance:AcceptanceRule[];optional:boolean;
};
~~~

坐标归一化到0—1，PDF/slide内部从0开始；文本offset统一UTF-16，与浏览器selection一致，0≤start≤end；sheet range为大写A1区域，解析后检查表格边界。ResourceRef是定位不是许可，每次读取都重新检验当前可见性。Locator必须匹配资源类型/版本，不接受任意绝对路径。引用正文按完整版本内容重新计算hash，不能信任Renderer发来的selectedText。

JSON数据库字段统一UTF-8文本并CHECK(json_valid)，所有约定数字有Zod上下限；ID/FK为TEXT；*_at INTEGER、revision/count/ordinal/epoch INTEGER；文字/枚举/路径/hash为TEXT。向量为little-endian Float32 BLOB。scope_id在profile设置中使用真实profileId，不使用NULL避免唯一约束失效；只定义一个应用profile，不新增云workspace表。临时会话使用同接口的内存repository，禁止落进events/outbox/receipt/usage正文；真实调用的脱敏用量仍可累计。

## 7. 办公成果DTO（P07）

DocumentSpec固定schemaVersion:1、title、audience、language、sections[]、citations[]、style。section有blockId、heading和blocks；block是paragraph(text)、bullets(items)、table(columns,rows)、image(fileVersionId,alt)、code(language,text)的判别联合。表格最多200×30单元格；单文档最多200section/1,000blocks。图片只能引用当前已授权静态素材；模型生成图片延期。默认A4、页边距20mm、中文Noto Sans CJK、正文11pt、标题22/16/13pt、页码和目录可配置。

SpreadsheetSpec固定schemaVersion:1、sheets[{id,name,columns[{key,label,type}],rows,formulas?,formats?}]；type=string/number/boolean/date/null，date用ISO8601显示格式；外部引用、宏和DDE拒绝。列名保留中文，公式写入白名单函数SUM/AVERAGE/COUNT/COUNTA/MIN/MAX/IF/IFERROR/ROUND/SUMIF/COUNTIF/VLOOKUP；统计脚本计算值要标说明，不冒充手工公式。导出CSV对以=、+、-、@开头的字符串防公式注入，真实number保持数值。

SlideDeckSpec固定schemaVersion:1、aspectRatio:'16:9'、theme:'light_business'|'dark_presentation'、slides[{id,layout,title,bullets?,table?,chartRef?,notes}]。layout为title/body/two_columns/table/chart；默认10页、单deck最多50页，单页标题≤60字符、普通正文≤600字符、备注≤3,000字符，超限自动拆页并校验。使用同一字体资源、正文≥18pt；不自动缩到不可读。chartRef是经过验证的静态SVG/PNG版本或JSON chart spec，不能是可执行HTML。

ChartSpec采用本项目固定JSON：schemaVersion:1、type(bar/line/scatter/area/pie)、datasetId、xField、yFields、groupField?、title、xLabel、yLabel、filters[]、showLegend。filters仅eq/in/between且值类型匹配列；禁止URL数据源和expression执行，变换只由代码白名单生成。内置React/SVG组件处理比例尺/图例/tooltip，PNG由隔离渲染导出；复杂出版图表由P07受限matplotlib生成。交互成果用应用打包模板运行于隔离view，脚本不接触IPC/文件系统；导出HTML内嵌数据，用户选择是否包含明细。所有Spec引用已知模板schemaId，模型不能用schema字段传动态代码。

## 8. 补充接口（与05组成同一v1契约）

| 命令 | payload → data | 实现任务 |
|---|---|---|
| profile.update | {displayName?,avatarSelectionToken?} → ProfileView | P02-01 |
| windows.open/navigate | {entity:{type,id},newWindow?} → {windowId} | P02-03 |
| prompts.list/upsert/delete | {} / {id?,title,body,shortcut?} / {ids} → Page/PromptView/Ack | P02-02 |
| search.history/listClear | {removeIds?,clearAll?} → {items}；clearAll仅显式写入时执行 | P02-03 |
| messages.transform/saveNote | {messageId,version,range,action} / {messageId,projectId?} → {runId}/{fileId} | P02-03 |
| annotations.list/upsert/delete | {fileVersionId} / {id?,fileVersionId,locator,body,color,expectedRevision?} / {ids} → Page/AnnotationView/Ack | P03-02 |
| tasks.update/copy/batch | {taskId,patch:{priority?,pinned?,archived?}} / {taskId} / {taskIds,action} → TaskView/{taskId}/{results} | P06-03 |
| runs.answer/skipStep | {runId,questionId,taskVersion,value} / {runId,stepKey,reason} → {status} | P06-01 |
| code.prepareWorkspace | {runId,baseRef?,includeDirty:false|true} → WorktreeView | P09-01 |
| previews.start/stop | {runId,artifactVersionId,kind:'static_site'} / {previewId} → {previewId}/Ack | P09-04 |
| settings.setQuickShortcut | {accelerator,enabled} → {registered,error?} | P10-02 |

新增task priority/pinned、session note、preview/canvas业务字段使用对应阶段追加迁移；所有复合命令在实际Zod中拆成独立schema和确切返回类型，不接受上表为理由写任意payload。文档的“/”是多个明确命令的简写，不是运行期模糊路由。

## 9. 本文件的验收补充

各责任任务增加有业务意义的验收：中文输入法不误发；多窗口草稿冲突保留；跨项目引用不扩散权限；批注绑定旧版本；无模型不能伪答；占位不调用执行器；快速窗口无屏幕权限；临时会话正文不落持久库。P11需求追踪将这些证据与相关FR条目关联。视觉验收保存1200×800与960×640的浅/深主题截图，检查中文省略、长文件名、键盘焦点、200%缩放与屏幕阅读器标签。


> 2026-10-04 P01-03：P01-03诊断入口：首页“模型与用量”。支持搜索/收藏/首选/后备顺序、默认/真实既有会话/本次偏好、文本能力预检、固定计费检测、分离尝试、token预算和用量过滤聚合。暂无会话时会话选项禁用；附件与严格JSON解释未支持，不删除输入；正式聊天UI留P02。
