# ADR0042 固定版本预览、窗口资产授权与本地PDF批注

- 日期：2026-10-10
- 状态：accepted（实现与验收状态见P03-02，本文不代表测试通过）
- 任务：P03-02

## 决策

复用FileRepository的profile/owner/固定版本检查。公共artifacts/annotations命令仅接收ID、owner、Locator和有限视图参数；原件/只读PDF资产通过私有Host→Core artifacts.read读取。Host为每个应用窗口使用独立Chromium session，mint随机资产URL并仅在该session注册tapkit-artifact协议。每次访问由Core重新检查版本/可见性和blob摘要；I/O后再次检查，关闭窗口撤销全部URL。协议只允许GET、PDF/静态图片，使用no-store/nosniff和禁止脚本/外部资源的响应CSP，不接受磁盘路径或任意URL。

DOCX/PPTX预览必须复用现有OfficeWorker（AppContainer、Job、零网络、固定受信LibreOffice runtime）。Core仅复制不可变原件到自身新建暂存目录，转换返回PDF后校验摘要并按固定版本发布blob。缺本机有效native/officeRender能力不启动executor，不用宿主转换作为后备。转换最多并发2，多个窗口共享同版本转换；最后观察窗口关闭时取消，退出等待停止。缓存绑定fileVersion和P03-02-office-1渲染版本，旧缓存不能冒充新渲染器结果。转换临时输出清理失败、重启暂存恢复和真实标准用户回归必须单列验收。

schema10新增reading_positions（profile+fileVersion）、pdf_annotations及preview_renderer_version。阅读位置包含Locator、滚动、缩放和视图模式；PDF批注绑定不可变版本、pageIndex、归一化rects、选区范围/hash，修改有expectedRevision，新增/修改/删除与request receipt原子提交。批注不改PDF字节、不自动迁移新版、不自动发送模型；永久删除/旧备份墓碑回放同步清理批注和阅读位置。

选区在Core基于该版本完整解析结构重新计算正文/hash，拒绝伪造范围、错误资源类型和过期hash；ResourceRef增加可选selection（selectedTextHash/textRange），聊天材料读取再次检查，不把Renderer传入的文字作为授权或事实。PDF/slide页码内部0起，界面1起；文本UTF-16，sheet大写A1。DOCX转换页坐标无精确映射时只标段落定位。

表格分页最多100行/200列，排序/过滤仅改变视图，展示公式及缓存值，缺缓存明确未计算。受限OOXML解析增加合并区域，解析版本升级为p03-2；历史p03-1结构保留可读且mergedRanges可缺省，重新解析使用新版本job键，不覆写旧引用。PDF阅读使用已经锁定的PDF.js6.3.289；后续UI增加同版本浏览器依赖及受信worker/字体/CMap资源，不引入服务器。

## 边界与验证

网格columnTypes由全表原缓存值推断为空/文本/数值/布尔/混合，排序/过滤与类型标签均不求值或改原件。SVG经浏览器静态image资源解码后绘制到canvas，不插入活动SVG DOM；脚本/外部资源回归必须通过。选区离开资料库时返回此前的聊天路由，等待其草稿加载后追加引用及批注。Office视觉合成样本明确列宽，页面截图先在滚动视口内缩放，另检查DOCX表格文字实际存在。

Office解析仅放行大小为0且以斜杠结尾的embeddings目录记录；实际嵌入文件/嵌入关系仍拒绝。DOCX段落定位校验结构中的paragraphId，块id不等同段落id。资产读取也核对渲染策略版本，不能跳过open直接读取旧策略缓存。复制使用受信Sender检查的Host copyText（最多100,000字符、仅写），保留默认拒绝浏览器权限，不开放剪贴板读取权限。

实现补充：自有资产scheme声明corsEnabled，并只为应用来源返回CORS头；Script/HTML/SVG外部副本以.txt扩展名打开，未知可执行格式拒绝。版本diff同时鉴权两端、返回分页100行，有界计算不回写源文件。PDF矩形相交块才进入定位材料，文字选择以TextLayer项目序号/字符偏移定位而非只搜索文字，从而支持同页重复文字。合并区域拒绝重叠，跨页只额外返回最多200个anchor。专属.tmp/preview树由严格profile/version/UUID标记恢复；清理失败保留并可重试，不覆盖已提交预览的成功状态。

16项FR-15需求保持；静态图片/ZIP只预览，不扩展模型媒体能力。音视频/旧宏格式仅原件恢复入口，分享为本地不可变副本，不伪造公网链接。任务完成需定向unit/integration、真实Electron界面、隔离Office/标准用户安全回归、DOCX/PPTX/PDF各3样本视觉核对及同源码分支CI。用户禁止创建PR或合入main，验收后等待人工确认。
