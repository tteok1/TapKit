# ADR0028：PDF文本worker与固定资源

日期：2026-10-06；状态：采纳，P03-01实施中，真实原生验收待CI。

PDF使用已锁定pdfjs-dist6.3.289的legacy API及worker读取文本/页信息。在ADR0026/0027固定Node适配器中动态加载自带pdf/pdf.mjs；不回退Host解析，不加载上传文件指定的模块。Vite构建复制同一包的pdf.worker.mjs、CMap和标准字体，并生成schema1资源清单（相对路径、大小、SHA256）。Core仅在PDF任务暂存这些固定资源，校验版本、普通文件/真实路径、路径白名单、大小和摘要；总资源不超过既有100MiB。上传字节仍固定original，无执行参数控制权。

此路线只调用getDocument/getPage/getTextContent，不调用render、动作、附件或XFA入口。不增加native canvas、DOM伪实现、系统字体或网络依赖；6.3.289的文本路径可在无canvas包的独立目录运行，便携bundle实际验证。API启动对可选canvas的探测不能获得AppContainer输入/runtime以外的读取权限，也不是宿主回退。CMap/标准字体路径只指向验证过的本地资源，useWorkerFetch/useWasm/useSystemFonts/enableXfa关闭，disableFontFace/stopAtErrors开启；输入仅传字节，未提供文档URL。

保留页宽高和文本块；将PDF文本transform与viewport transform组合，计算经过旋转的文本矩形，再规范化至页内[0,1]坐标。块使用pdf/pageIndex/rects定位，源文件不修改。最多500页、每块100万字/结构最多20万块、单输出100MiB以及既有120秒/Job/无网络限制保持。超限、损坏、magic不符、PasswordException分别失败；缺少/被替换的受信资源拒绝启动worker。无文本PDF标needsOcr及OCR_UNSUPPORTED，不调用OCR或图像模型；部分空文本页记录PAGES_WITHOUT_TEXT。

测试包含真实PDF.js文本坐标、坏文件/页数、惰性JavaScript动作、真正加密的合成PDF及原件不变。加密fixture采用公开测试密码和PDF历史R2算法，仅测试用；已用相同PDF.js加正确公开密码实际读取正文，不能把一份损坏加密头当真实密码验收。独立bundle测试实际501页拒绝、加密拒绝及源hash。模拟资源替换检查证明摘要不符时executor不被调用；它不算原生通过。

P03专用真实native格式用例及独立标准用户报告追加PDF，拒绝用例追加真实加密PDF，仍必须由新源码Windows CI验证。本机unsigned helper应用控制拒绝保持。PDF预览/批注属于P03-02；本次只交付P03-01读取流水线，图像支持、Host/资料库UI仍待完成。
