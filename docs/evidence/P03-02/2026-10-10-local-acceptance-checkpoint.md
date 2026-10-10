# P03-02 验收对应与检查点

分支codex/p03-02-preview，基线main9fb7f355bdf4eda56862df517e31ebbd8ab592f7。最终实现源码7012e456869a12916dec3e14843133a5b18abe4d，CI38031922547两job全部success；16项已验收。禁止PR/main合并，等待人工确认。

## 最终验收

最新源码本地完整integration253/253及Electron5/5均退出0；九个已人工观察的PDF/DOCX/PPTX截图与最终重跑输出字节完全一致。pnpm check353文件、helper构建、docs-check与diff-check均退出0。完整CI为unit274/274、integration253/253、perf1/1、Electron30/30，check/build和startup-diagnostics全部success。独立标准用户P00为22/22、parser3/3、preview4/4，零pending/缺案例，11份预览源码摘要逐一匹配该Git提交；最近18个原生事件身份一致、零网络、回收后零进程。fresh Office宏3/外链3均成功。

[CI证据](public-ci-2026-10-10.json)、[标准用户核验](standard-user-acceptance-2026-10-10.json)、[原生修复及本地命令](native-concurrency-repair-2026-10-10.json)。下面的旧失败及待验文字属于保留的开发历史，不是最终状态；实际状态以上段和progress为准。

## 命令与结果（历史与定向检查）

均用锁定Node24.21.0与pnpm12.4.1执行。

| 检查 | 结果与证据 |
| --- | --- |
| pnpm exec vitest run --config vitest.config.ts --project unit P03-02 P03-01.office --reporter=json --outputFile=test-results/P03-02-unit.json | 20/20，退出0，包含新增预览11项与既有Office解析9项 |
| pnpm exec vitest run --config vitest.config.ts --project integration P03-02.artifacts --reporter=json --outputFile=test-results/P03-02-artifacts.json | 11/11，退出0；范围/版本/hash、真实段落标识、旧缓存拒绝、diff/网格与持久化/清理 |
| 相关integration P03-02.artifacts P03-01.migration P03-01.material | 13/13，退出0（新增段落检查之后、列类型补充之前）；test-results/P03-02-related.json |
| integration P03-02.native-preview | 3/3，退出0；test-results/P03-02-local-native-preview.json、native-preview-cases.jsonl。最终横向样本尺寸修正后3项重验全部通过 |
| pnpm exec playwright test --grep P03-02 | 5/5，退出0，32.9秒；版本/位置/材料、选区/批注、网格/图片/ZIP/200%、六Office、失败恢复。最终横向DOCX对应Office流程1项补验退出0（5.1秒）；分享反馈和独立副本字节流程1项补验退出0（6.0秒） |
| pnpm check | 退出0，352文件格式零失败、依赖边界与锁定清单通过 |
| node scripts/docs-check.mjs / git diff --check | 退出0；37任务状态及已有完成需求证据检查通过 |

## 实际视觉观察

PDF样本1/2/3：完整纵向/横向页面、标题、正文、表格边界可见，无活动PDF脚本；页1/末页目录与控件边界通过。DOCX样本1/2/3：中文/英文、表格三列与数字可读，样本2静态图、样本3长段落与末页可到达。PPTX样本1/2/3：标题/正文/表格、4:3与宽屏比例、静态图可见，备注与放映/结构视图通过。截图清单见renderer-visual-samples.json，源为实际Electron/PDF.js canvas，Office缓存来自真实NativeSandboxExecutor。

早期截图被祖先滚动裁剪，已经将页面缩放到视口内重新截图；早期DOCX表格默认网格宽仅100 twips，修正为明确列宽并增加“文件预览”文字断言，实际新页面包含表格。样本2的横向尺寸后续发现重复旋转，修正生成参数后已重新观察最终横向样本，最新截图及宽高断言通过。

## 保留的失败与修复

完整CI后的复现与修复：TAPKIT_STARTUP_DIAGNOSTIC=1执行（该单数变量不启用CI诊断，早先同环境说法撤回）pnpm test:integration --reporter=json --outputFile=test-results/P03-02-full-integration.json，退出1，252项247过/5失败/零pending；P03-02 native3在Office转换准备失败，P00内存耗尽及P03-01原生解析分别15秒/30秒超时。定向临时spy得到office.mapping.driveExhausted，诊断轮native0/3退出1，spy已移除。原循环.zip(roots)只查看前三盘符且占用会错误消费根，修正后锁定Rustrelease构建/部署均退出0；六样本改为两项并发、峰值2/回收0，suite限制2worker但保留全部隔离/时限断言。完整复验test-results/P03-02-full-integration-repaired.json为252/252、零pending、退出0。更深目录六Office样本定向诊断通过（1选中/2未选中，不记全套验收）。全30项Electron首轮29过，窄窗口剩余引用入口关闭抽屉后P03-02五流程5/5、退出0、39.4秒。旧CI标准预览超时原因未证实，需新CI；旧撤权假阳性已补成功转换前提。原生事件增加有界stage及脱敏stderr，无私人原件数据。

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

分享额外补验：提示只在副本写入成功后出现，实际下载与分享分别保存到独立路径，两份字节均与固定原件一致；定向Electron1退出0（6.0秒）。

所有需求状态仍in_progress，独立标准用户真实Office/撤权/取消与完整同源码CI待验，本检查点不冒充完成。P03-03/gate不开始；生产能力须本机自己的有效probe，测试未转植报告启用能力。


诊断环境记录更正：早先本地命令设置单数TAPKIT_STARTUP_DIAGNOSTIC，实际CI要求TAPKIT_STARTUP_DIAGNOSTICS。已有通过/失败结果仍有效，但不作为相同诊断环境验证；现按CI变量重跑完整252项，结果待完成。
