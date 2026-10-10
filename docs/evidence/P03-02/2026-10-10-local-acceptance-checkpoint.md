# P03-02 本地验收检查点（仍待同源码CI）

分支codex/p03-02-preview，基线main9fb7f355bdf4eda56862df517e31ebbd8ab592f7。本文记录真实工作树检查，不能代替独立标准用户和分支CI；禁止PR/main合并。

## 命令与结果

均用锁定Node24.21.0与pnpm12.4.1执行。

| 检查 | 结果与证据 |
| --- | --- |
| pnpm exec vitest run --config vitest.config.ts --project unit P03-02 P03-01.office --reporter=json --outputFile=test-results/P03-02-unit.json | 20/20，退出0，包含新增预览11项与既有Office解析9项 |
| pnpm exec vitest run --config vitest.config.ts --project integration P03-02.artifacts --reporter=json --outputFile=test-results/P03-02-artifacts.json | 11/11，退出0；范围/版本/hash、真实段落标识、旧缓存拒绝、diff/网格与持久化/清理 |
| 相关integration P03-02.artifacts P03-01.migration P03-01.material | 13/13，退出0（新增段落检查之后、列类型补充之前）；test-results/P03-02-related.json |
| integration P03-02.native-preview | 3/3，退出0；test-results/P03-02-local-native-preview.json、native-preview-cases.jsonl。最新横向样本尺寸修正后正在重验，结果待更新 |
| pnpm exec playwright test --grep P03-02 | 5/5，退出0，32.9秒；版本/位置/材料、选区/批注、网格/图片/ZIP/200%、六Office、失败恢复。最新横向DOCX尺寸修正后Office流程待复验 |
| pnpm check | 退出0，352文件格式零失败、依赖边界与锁定清单通过 |
| node scripts/docs-check.mjs / git diff --check | 退出0；37任务状态及已有完成需求证据检查通过 |

## 实际视觉观察

PDF样本1/2/3：完整纵向/横向页面、标题、正文、表格边界可见，无活动PDF脚本；页1/末页目录与控件边界通过。DOCX样本1/2/3：中文/英文、表格三列与数字可读，样本2静态图、样本3长段落与末页可到达。PPTX样本1/2/3：标题/正文/表格、4:3与宽屏比例、静态图可见，备注与放映/结构视图通过。截图清单见renderer-visual-samples.json，源为实际Electron/PDF.js canvas，Office缓存来自真实NativeSandboxExecutor。

早期截图被祖先滚动裁剪，已经将页面缩放到视口内重新截图；早期DOCX表格默认网格宽仅100 twips，修正为明确列宽并增加“文件预览”文字断言，实际新页面包含表格。样本2的横向尺寸后续发现重复旋转，已修正生成参数，须重新观察最终样本，不能把早期纵向图当横向验收。

## 保留的失败与修复

首次Electron资产CORS失败，声明scheme跨源能力且只允许应用来源；首次Office样本生成布局标识大小写错误，修正为受支持标识；PPTX无害空embeddings目录被误判宏，仅允许零字节目录，真实嵌入内容仍拒绝。实际界面发现全屏无法滚动备注、DOCX段落ID误与块ID比较、快速切换位置保存时序、默认浏览器权限拒绝复制等，均已修复并通过定向回归。测试本身曾使用UUIDv4、隐藏引用卡片入口和过早剪贴板读取，保留失败轮且修正等待/入口，没有降低原生隔离断言。

## 需求对应

| 需求 | 当前实现和本地验证 |
| --- | --- |
| FR-15-001 | 消息InlineFileCard只读摘录/右侧展开，旧PDF引用实际Electron |
| FR-15-002 | 拖动/键盘调整已有分栏、全屏滚动、标签关闭；Electron200%流程 |
| FR-15-003 | 固定file/version/owner多标签，聊天并排、切换/草稿返回；Electron |
| FR-15-004 | 名称/扩展名/版本/字节/实际PDF页数；Electron/native |
| FR-15-005 | 搜索/选区复制、固定原件下载/本地分享副本、Host外部副本；unit/integration/Electron |
| FR-15-006 | 页/结构段落/A1/代码行Locator严格核验，失效不跳同名；媒体时间点按延期范围不内置理解 |
| FR-15-007 | PDF文字/框选、批注→Core核验hash固定Ref→原聊天草稿，输入材料再验；Electron/integration |
| FR-15-008 | 按版本位置、分页/滚动/缩放模式、快速切换与重启；Electron/integration |
| FR-15-009 | 保持旧版并提示新版本，需对应owner授权才打开新版本；Electron/integration |
| FR-15-010 | 损坏PDF真实重试、下载/分享/外部打开、原件不改；Electron/native/Host unit |
| FR-15-T01 | PDF.js页码/3缩略图窗口/目录/搜索/选区/本地批注；Electron及3PDF视觉 |
| FR-15-T02 | 真实隔离DOCX只读PDF、结构目录/段落定位、文本分页；native/Electron/3DOCX视觉 |
| FR-15-T03 | 100行/200列分页、sheet/筛选/排序/A1、合并anchor/公式缓存和未计算/列类型；integration200k行与Electron |
| FR-15-T04 | 真实PPTX只读PDF/缩略图/翻页/放映/备注、幻灯片结构定位；native/Electron/3PPTX视觉 |
| FR-15-T05 | 安全Markdown排版/源码、1万行代码分页/搜索、双端鉴权diff；Electron/integration |
| FR-15-T06 | PNG/SVG静态canvas缩放旋转与ZIP安全目录；无SVG脚本/外部加载，Electron/parser unit |

最后补验：横向DOCX生成仅指定orientation，避免库再次旋转手工宽高；真实native3退出0，实际Office Electron1退出0（5.1秒），word-2截图已确认横向、表格和静态图完整。最新源码格式/type/边界check退出0。Git经用户已有本机代理的仅命令覆盖fetch退出0，远程main仍9fb7f35。

所有需求状态仍in_progress，独立标准用户真实Office/撤权/取消与完整同源码CI待验，本检查点不冒充完成。P03-03/gate不开始；生产能力须本机自己的有效probe，测试未转植报告启用能力。
