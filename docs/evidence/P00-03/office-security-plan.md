# P00-03 Office 安全行为补测（2026-10-01）

当前接续为CI55退出回归与CI56线程诊断；根因尚未确认，进度in_progress/门禁failed。下方run46结果按历史保留，不能覆盖当前失败。

## 历史结果：run46行为和归档全部通过（2026-10-02）

源码`b901ef7ec788bcfcec772adcfc564974ab64f32b`的[run46](private-archive:TapKit)全success：unit17/17、管理员46/46、完整P00 Electron8/8、独立标准用户22/22；宏与外链真实阻断/启用对照在两个身份均通过。原5秒线程退出检查保持，PyUNO引用先释放后销毁LOK的修复通过连续run45/run46验证。

同轮归档已保留管理员和标准用户各七份固定名合成PDF；三类中文PDF分别解析、渲染并直接查看。宏/外链PDF的归档字节SHA256与行为记录一致，原件不变。证据ci-run46.json及office-render（标准用户在standard-user子目录）。P00-03=implemented_and_verified、P00-gate=passed；下方失败和修复实验按原记录保留。

## 历史检查点（以下保留当时状态）

## run45所有行为通过，修复成功轮PDF归档

a4ddd9c的run45管理员46/46、标准用户22/22、unit17/17、P00 Electron8/8全部通过。两个身份的真实宏/外链阻断和启用对照均完成，原件不变，支持先释放PyUNO引用再销毁LOK的定位。报告/日志/产物指纹见ci-run45.json。

成功轮PDF未归档：Playwright启动时清空共用test-results，标准用户kit只收日志/JSON。现把E2E outputDir改为test-results/e2e，在现有CI finally只收七份固定名称的合成PDF并限制5MiB/份。该改动修复证据链，不修改执行路径或安全验收断言；待新CI拿到同轮PDF完成视觉核验及收口。

## run44 引用生命周期修复

check/unit17/17通过、管理员45/46，宏PDF与文件标记对照完整通过。外链实际发出updated/saved/closed/destroyed全部阶段，30秒join仍存活，否定仅延长等待的假设。唯一剩余点是函数返回时释放PyUNO引用；参考[锁定版PyUNO_del](https://github.com/LibreOffice/core/blob/libreoffice-26.2.6.3/pyuno/source/module/pyuno.cxx)（官方raw获取SHA256：2d231b438e7cb7ec960ea53c4904dad568e35be3dabe5ebd4820de8ecd464551），它实际delete持有UNO引用的members，不是纯Python清理。现component/Desktop/Context先清空再销毁kit，恢复原5秒join，并记录references_released；待新CI证明效果。不接受exit1或放弃线程检查，不改生产worker/Job/ACL。

## run43 对照生命周期修复实验

check/unit17/17通过，integration44/46。两个对照的finally均因PowerShell标量字符串索引误报身份变化；接收时用数组表达式保留整个目标，仍精确匹配后撤销。[Microsoft 数组说明](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_arrays?view=powershell-7.5)与本地纯元数据标量/数组实验支持这一定位，没有执行本机helper。

外链对照实际发出TK_LINK_UPDATED，随后5秒join到期；增加导出、关闭和销毁阶段记录，完成预算30秒，测试必须继续满足exit0/PDF真实更新/activeProcesses0。它是有界诊断实验，根因待证据确定。参考[锁定版runLoop/lo_destroy](https://github.com/LibreOffice/core/blob/libreoffice-26.2.6.3/desktop/source/lib/init.cxx)和[官方SolarMutex线程说明](https://github.com/LibreOffice/core/blob/master/vcl/README.md)，不修改生产代码和Job上限。三类正常PDF已实际渲染并查看，中文无缺字；run43还未完成宏/外链最终断言和标准用户验收，整体仍in_progress/failed。

承接 CI run40 的管理员44/44、独立标准用户20/20。本轮补齐实际文档行为，未运行前仍为 in_progress / failed。

## 已核实的配置错误与修复

锁定 LibreOffice 26.2.6.3 的 Calc schema 中 Link=0 是 Update always，Link=1 才是 Update never；Writer schema 中 Link=0 是 Always，Link=2 才是 Never。原策略和断言都使用0，仅检查配置文本而未验证行为。本轮分别改为1/2，不改变隔离权限、网络或 Job 限额。

- [Calc 锁定版 schema](https://github.com/LibreOffice/core/blob/libreoffice-26.2.6.3/officecfg/registry/schema/org/openoffice/Office/Calc.xcs)：Content/Update/Link。
- [Writer 锁定版 schema](https://github.com/LibreOffice/core/blob/libreoffice-26.2.6.3/officecfg/registry/schema/org/openoffice/Office/Writer.xcs)：Content/Update/Link，枚举不同。
- [LOK 锁定版加载实现](https://github.com/LibreOffice/core/blob/libreoffice-26.2.6.3/desktop/source/lib/init.cxx)：EnableMacrosExecution=false映射NEVER_EXECUTE；未传UpdateDocMode。
- [Calc 锁定版加载实现](https://github.com/LibreOffice/core/blob/libreoffice-26.2.6.3/sc/source/ui/docshell/docsh4.cxx)：SetInitialLinkUpdate未收到UpdateDocMode时使用NO_UPDATE。该额外限制解释了错误profile枚举可能被加载默认值掩盖，仍须修正配置本身。
- [官方 UpdateDocMode 常量](https://api.libreoffice.org/docs/idl/ref/namespacecom_1_1sun_1_1star_1_1document_1_1UpdateDocMode.html)：NO_UPDATE=0，FULL_UPDATE=3。
- [ODF脚本事件规范](https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part3-schema/OpenDocument-v1.3-part3-schema.html)：office:scripts、office:event-listeners、script:event-listener。

## 实际样本与对照

`scripts/fixtures-office-security.mjs`只生成合成数据，不使用私人文件或外部下载样本。

1. 带OnLoad Basic脚本的ODF表格，故意以允许的.xlsx名称进入LOK内容探测；脚本只将A1改为TK_MACRO_EXECUTED并写任务USERPROFILE中的macro-ran.txt。正式OfficeWorker应保留TK_MACRO_BLOCKED、无标记文件；.xlsm扩展名仍在dispatch前拒绝。启用宏的诊断对照应出现两项副作用，证明脚本有效。
2. 真实OOXML externalBook/externalLinkPath及外部公式的.xlsx；缓存TK_LINK_CACHED，已授权只读输入根中的源表值TK_LINK_UPDATED。正式OfficeWorker应保留缓存；明确FULL_UPDATE的UNO诊断对照应读到新值。目标本身可读，不能把ACL阻断误当Office禁外链。
3. 损坏OOXML经真实helper失败关闭，再转换合法DOCX证明执行器仍可用；原件哈希保持。
4. 三格式PDF通过已锁定pdfjs解析中文标题，补充仅检查PDF魔数的不足。

所有负载和正向对照均在真实独立AppContainer、零网络capability、相同最小ACL及Job中执行。测试用临时盘符映射与正式helper共用分配mutex，先记独占journal、按确切目标撤销；不扩展office.render接口或产品参数。测试代码与fixture纳入capability fingerprint，旧报告不能通过新增验收。

## 本地检查点

TypeScript与scripts ESLint退出0；unit16/16、GitBroker/capability integration5/5退出0；PowerShell映射脚本AST检查通过。首次fixture重打包被ZIP空目录条目阻断，已修正并实际生成三份样本。pnpm check再次被已有受保护`.test-data/acl-probe`的Prettier递归EPERM阻断，退出1；不修改其ACL。单独调用锁定Node启动pnpm仍可令子脚本命中系统PATH中的Node24.18，后续本地检查显式将锁定Node24.21.0目录置于PATH首位；CI本身setup-node已固定24.21.0。真实Office/标准用户结果待Windows CI；本机应用控制仍不允许运行unsigned helper。

推送首轮9e8e603后继续核实[锁定版事件表](https://github.com/LibreOffice/core/blob/libreoffice-26.2.6.3/xmloff/source/script/XMLEventExport.cxx)：OnLoad对应DOM namespace的load，样本绑定由office:load修正为dom:load并声明xml-events namespace。标记改用任务USERPROFILE，避免AppContainer TEMP重定向造成预期路径错误。本地调用Windows PowerShell 5.1的映射脚本被该edition的脚本策略拒绝，未创建映射；未更改策略，也未执行helper。控制测试改为CI已使用的PowerShell 7（pwsh），不添加ExecutionPolicy绕过参数；真实映射与Office仍由CI验证。

## CI run41及修复

[run41](private-archive:TapKit)的bootstrap/check通过、unit16/16、integration42/46；4项Office用例在新增PDF解析清理处共同失败，Build/Electron和标准用户未执行。锁定pdfjs6.3.289的PDFDocumentProxy没有destroy，PDFDocumentLoadingTask有destroy。原调用位置错误，在finally中遮住返回，宏/外链对照尚未被执行，不能从该轮推断它们已通过。现改为保留loading task并在finally销毁；新增真实最小PDF unit实际验证文本提取和清理，本地1/1通过。[官方生命周期API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentLoadingTask.html)及已安装锁定包types/src/display/api.d.ts已核对，无需升级依赖。

artifact与日志哈希、新追加原生记录见`ci-run41.json`；已减去源码提交中历史jsonl行数，不将旧Office结果算作本次运行。实际损坏输入在120秒Job期限内终止、activeProcesses0，下一份合法DOCX转换exit0；仍未通过最终PDF断言。后续将合成PDF保存在test-results/P00-03-office随CI归档，用于核验真实中文渲染。

[run42](private-archive:TapKit)的bootstrap/check通过，新增PDF unit在CI首次加载pdfjs时超出默认5000ms；unit16/17，integration/Build/Electron/标准用户未执行。修复只给该真实PDF用例30秒冷启动预算，文本提取/清理断言保留；本地定向1/1通过。没有原生重测结果可迁移。证据`ci-run42.json`。

## CI55外链对照退出回归（2026-10-02）

2026-10-02 CI55回归：压缩提交0294585的bootstrap/check通过；unit31/31、integration45/46、Electron8/8、独立标准用户22/22、三轮启动诊断通过。唯一失败为Office外链启用对照在control_destroyed之后未结束，120秒Job超时；原建库/凭据超时未复现。新增仅测试侧Python线程栈和loop/worker退出阶段诊断，根因待新CI；不改生产worker/隔离/原限时，不合并main。 已保存run/jobs/步骤/日志及artifact指纹、标准用户22项实证为ci-run55.json；check失败并非startup-diagnostics造成，因为两job按needs依次执行，后者最终success。

失败末阶段依次为control_updated（value为0）、control_saved（19246字节）、control_closed、control_references_released、control_destroyed；没有finished。PDF保存本身不足以认定启用对照有效，管理员本轮仍未完成正向标记断言；其标准用户同用例通过也不能覆盖管理员失败。Job正确按120秒终止，activeProcesses0。

已读取锁定版[lo_runLoop/lo_destroy](https://github.com/LibreOffice/core/blob/libreoffice-26.2.6.3/desktop/source/lib/init.cxx)、[PyUNO析构](https://github.com/LibreOffice/core/blob/libreoffice-26.2.6.3/pyuno/source/module/pyuno.cxx)与运行库uno.py。runLoop调用soffice_main，destroy返回不等于Python线程/主事件循环都已退出；现阶段仅能定位到销毁之后，不能宣称完整底层根因。

新增测试诊断为control_worker_complete、control_loop_returned及每20秒faulthandler线程栈；不启用硬退出、不放宽exit0/activeProcesses0/PDF实际更新断言，不延长Job或join预算，不修改native/windows-helper/src/lok_worker.py。新CI用于区分native事件循环等待与Python收尾等待。

CI56管理员集成步骤已通过但全轮尚未完成，退出故障未复现；日志本身不是修复。下一检查点在原check内增加三轮新进程外链原用例，原完整验收继续执行，每轮退出码与JSON选中用例都必须通过，任一失败使job失败；四项非目标Office用例在该定向命令中明确过滤。记录于`scripts/ci-office-shutdown-diagnostics.ps1`，没有新增job。

已核对锁定版[Calc UpdateTableLinks处理](https://github.com/LibreOffice/core/blob/libreoffice-26.2.6.3/sc/source/ui/docshell/docsh4.cxx)：NO_UPDATE分支会忽略刷新，故不能仅把PyUNO启用对照替换成LOK的UpdateTableLinks指令。LOK加载实现中的UpdateDocMode仍为注释TODO，没有采用该未经验证的替代方案。线程互锁和上下文生命周期仍属待证假设，没有据此修改生产实现。
