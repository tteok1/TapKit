# ADR0037：聊天物理文件复用 Host token 导入

状态：2026-10-09 已采纳；P03-01仍在实施，原生解析验收待R15恢复。

聊天原先对所有 File 调用 arrayBuffer，再将 base64 送到 inputs.attach，无法使用受控物理文件导入的固定句柄、逐项状态和取消。新增有限 preload 方法 selectChatFiles：Electron webUtils 验证每个真实 File，物理路径仅留在 preload/Main 私有选择通道；renderer 只收到 FileSelection 和无路径文件的索引。Host拒绝不可回退字节上传，伪造对象不能获得选择授权。

物理文件调用既有 files.import，以当前会话为 destination、duplicate=keep，复用窗口绑定只读 token、不可变版本、幂等收据、解析队列和状态/取消接口。进度显示原件保存与内容读取分别完成；已成功项在部分失败或取消后进入草稿，失败项明确显示原因。导航取消当前批次；晚到结果只以CAS追加原会话草稿，不写新会话。创建会话的晚到响应也不能覆盖已切换的页面。

只有无路径的粘贴图片、转文本附件和浏览器虚拟文件保留 inputs.attach；虚拟项逐项失败不会丢掉其他成功引用，取消不移除粘贴原稿。物理文件在renderer不读取字节，不传路径给公共命令。解析中的材料有串行有界间隔刷新；内容未就绪时保持发送门禁，不冒充已读取或运行原生解析。

聊天下载使用固定 file/version ID：当前会话授权优先；普通聊天可选择本profile文件，项目聊天保留当前项目授权交给Host导出前后再检查。撤回项目引用后不能从旧界面导出。失败材料有原件下载和指定版本解析重试入口；不改变原生组件门禁。

测试覆盖真实Electron File、preload/Main/Core/SQLite导入与下载、禁止renderer读取物理字节、固定草稿版本、源hash不变、项目授权和撤权拒绝，以及取消/部分失败/选择拒绝的控制器分支。系统保存框仅返回合成目标，未调用真实模型或本机受阻helper。证据见 docs/evidence/P03-01/chat-host-checkpoint-2026-10-09.json；导航生命周期补验见 docs/evidence/P03-01/scoped-library-checkpoint-2026-10-09.json：真实Main执行后只延迟回复，验证已提交原件晚到只入原草稿、导航实际发送取消、晚到创建不导入及选择晚到释放实际token。该回复延迟测试不冒充取消半导入；实际传输取消/进程中断另由FileService/恢复用例覆盖，native取消仍待真实门禁验收。
