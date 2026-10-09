# ADR0027：有界只读 OOXML 结构解析

日期：2026-10-06；状态：采纳，P03-01实施中，原生验收待CI。

在ADR0026的固定受限Node适配器中直接读取DOCX/XLSX/PPTX的OOXML结构，复用既有锁定fast-xml-parser5.11.1和yauzl3.4.0。此导入路线不调用Office、不计算公式、不调用Mammoth/ExcelJS的整包导入；既有依赖版本及OfficeWorker预览转换路线保持。ExcelJS仅在合成测试中生成真实导出工作簿作交叉验证，后续成果写入仍按对应任务决策。

原因：导入需要稳定的原始段落/表格、sheet/cell/公式缓存、slide/notes定位，且必须在消费内容前验证整个ZIP中央目录及全部XML/relationship。整包导入后再判断超限或外部关系会过晚；直接读取已有XML契约可先执行安全边界并保留未计算公式，不把展示转换当解析结果。

ZIP沿用100MiB压缩、500MiB展开、2000条目和100倍展开比例。读取校验CRC，不提取文件。XML拒绝DTD/实体声明，验证语法、100层深度及有界节点数量；命名空间、主part relationship和ContentType必须匹配目标格式。全部XML（包括未消费part）先检查；VBA、ActiveX、嵌入可执行包拒绝解析并保留原件。外部relationship只记录EXTERNAL_RELATIONSHIP_IGNORED，不加载其目标；内部目标规范化后禁止越出包、ADS/URI/别名。不会加载图片、字体、脚本或远程数据。

DOCX保留run文字、标题等级、段落字符区间及paragraphId、表格行列文字；不索引删除文字/字段指令，不执行字段。XLSX按workbook关系保留sheet ID/名称、稀疏A1坐标、共享/内联/富文本值和原始公式；有缓存则保留缓存，缺缓存则value=null/calculated=false及FORMULA_CACHE_MISSING。共享公式保留原始文本和缓存，标记SHARED_FORMULA_NOT_EXPANDED，不伪造展开或重新计算。表格限制包含稀疏dimension和各sheet累计单元格。PPTX按presentation关系顺序读取，不按文件名排序；保留shape、表格、标题和演讲备注，排除备注占位页码/页眉/页脚。

空文本的有效文档标记NO_TEXT_CONTENT；加密Office容器、伪装格式、坏XML、路径/压缩/表格超限明确失败。源字节不修改；解析结构仍由有效租约发布，原件可下载。PDF及image适配、Host token/资料库UI仍待交付。

验证分层：结构/恶意fixture unit、纯合成便携bundle进程、真实AppContainer/Job/无网络流水线和独立标准用户报告。新增原生用例覆盖格式、损坏/实体、取消、helper强杀后原件与单版本重试；当前本地应用控制拒绝，原生用例仅等待授权Windows CI，不用便携测试或模拟事件替代。标准用户P03报告单独生成和归档，不修改P00能力报告。

格式依据：[Spreadsheet cell/value/formula](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.cell)、[shared string table](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-the-shared-string-table)、[presentation/slide关系](https://learn.microsoft.com/en-us/office/open-xml/presentation/how-to-get-all-the-text-in-a-slide-in-a-presentation)。
