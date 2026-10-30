# ADR 0071：固定布局与版本化演示文稿

2026-10-30，P07-03本地交付与检查完成；复杂真实模型未通过，implemented_not_live_verified，阶段gate=failed；以progress为准。

SlideDeckSpec定义比例（默认16:9，也支持4:3）、浅色商务/深色演示、默认10页/上限50页、稳定页ID、标题/正文/双栏/表格/图表五布局及备注。复用锁定PptxGenJS和Noto Sans CJK SC；文本、表格和图表保留原生可编辑对象，已有授权PNG可作静态配图，不接收URL或任意HTML/SVG。内容超过布局容量时分拆续页，保留数字和备注，不把字号缩到18pt以下。

版本元数据复用现有schema18的document_specs（私有、固定fileVersion、JSON schemaVersion1），由PPTX专用仓储按SlideDeckSpec校验；DOCX/MD仍使用原DocumentSpec。无需SQL迁移或第二套任务状态。新增与编辑PPTX的blob、固定版本规范、task链接和工具收据原子提交；编辑检查baseVersion/revision与同根任务归属，旧页语义hash保持。

工作工具目录p07-tools-3，保留p06-tools-1/p07-tools-1/p07-tools-2范围。新增slides.create/slides.revise，局部替换、插入、删除、复制和重排都对固定版本生效；模型只获与目标格式相关的工具。界面逐页查看和结构化修改入口复用工作任务/审批与成果预览，不创建拖拽式Office编辑器。

图表复用除检查分析JSON归属及成功data.analyze收据，也复验原始CSV/XLSX固定版本、选择范围和有效owner链接；原始来源撤权后拒绝继续生成。每次生成前后重复核验素材，提交阶段以同一数据库事务保护版本与收据。

PDF与缩略图使用现有受限Office/解析链，核对页数、标题、关键数字和页面边界；原始可编辑PPTX与转换失败状态分别保留，不能用空PDF或整页图片假成功。三份十页代表集、局部修改及旧页hash、文档/表格/演示组合质量检查作为阶段收口依据。R13复杂数据工具live未通过，不能把其根因未知冒称为缺账号。

桌面组合首轮发现既有解析器把原生图表携带的内部XLSX缓存当作通用嵌入对象拒绝。新增可选IngestInput.inspectSlideCharts，仅由受管PPTX的已验证SlideRecord开启。只允许ppt/embeddings/_.xlsx与ppt/charts/\_rels/_.xml.rels内的内部package关系；每份缓存都在原生Parser内以有界ZIP/完整XLSX结构验证，嵌套嵌入、公式、定义名称、宏、外链、连接/查询及OLE全部拒绝，累计单元格受既有限额。普通上传文件默认仍拒绝真实嵌入，不开放任意package；沿用p03-1的默认行为，新增请求标志必须和原生/恶意代表集一起复验。
