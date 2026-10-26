# Windows 原生入口补验记录

2026-10-26，在独立新建的合成profile启动未注入文件对话框、未替换shell处理器的生产桌面，Core连接成功。未读取或修改原人工验收profile。

Windows工具初次截图与唯一返回的验收窗口标题不一致，因此没有按该截图点击。重新获取并激活唯一窗口后，截图确认是空白合成TapKit首页。尝试点击文件页时工具返回 `user input was detected in this window; call get_window_state before continuing`，重新观察返回 `window is minimized; call activate_window, refresh with get_window, then retry get_window_state`。为避免争用用户桌面，本轮停止原生UI补验，正常关闭仅由本轮创建的窗口。未关闭原窗口或其他应用。

以上为第一次尝试，三个JSON已保存在native-first-attempt；当轮未执行下载，downloaded=false不表示下载字节损坏。未保存或附加无关应用截图。

## 用户移除界面干扰后的补测

用户明确表示可以继续视觉测试后，另建全新合成profile（native-session.json）。重新选择唯一标题为“TapKit 自动验收1026 - 仅合成数据”的窗口，只在该窗口拥有的真实对话框内输入本轮合成路径。系统模态属于主窗，使用主窗截图及实际对话框坐标；控件索引缓存两次报不存在，均刷新观察后再操作。没有把另一原TapKit窗口当作可输入目标。

已实际完成：

1. 原生“打开”出现后取消，资料库仍空；重新选择中文原件，应用待导入框显示正确名称/94 B；开始导入，原件保存及内容读取完成。
2. 原生“另存为”出现后取消，再次下载并填写独立中文文件名保存成功。源文件与下载副本的真实SHA256均为 `315dad6b6142d0164785c98f45940fe35495bd4229be1a31e41f34ed86355935`。
3. 原生“选择文件夹”选择仅含合成资料的目录，应用待导入框发现其子目录文件；完成导入。关闭窗口后只读SQLite确认两项均status/parse_status=ready，文件夹项relative_path保留三级路径，未遗漏嵌套文件。
4. 从原件预览点击“外部打开”，Windows返回新 `document.txt - Notepad` 窗口。实际外部副本字节与源文件一致；读取记事本正文时工具返回 `Computer Use app approval timed out`，未绕过授权，也未将正文渲染计为通过。

补测的收尾public snapshot失败：`page.evaluate: Target page, context or browser has been closed`，native-session进程退出1；不将该辅助脚本记为成功。随后native-audit.mjs只读本轮独立数据库及本轮源文件/下载/外部副本，退出0，生成native-files-result.json，记录实际已保存状态与哈希。本轮没有成功public snapshot截图，不虚构该证据。实时视觉观察和独立落盘审计共同支持上述1—3，外部正文显示仍待人工。

仅将Windows资源管理器跨窗口拖入、默认应用实际正文显示列为manual-checklist的M01—M02；其余OS选择/保存不再要求人工重做。原人工profile及窗口未执行输入/删除/关闭；本轮未发送真实模型请求。
