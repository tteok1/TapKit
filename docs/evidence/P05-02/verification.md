# P05-02 工程验收

2026-10-27；codex/p05-chat-m1，基点ad85bc467c921f4c44ad26fc0c1bba25269153cb，工作树未提交。锁定Node24.21.0/pnpm12.4.1；独立合成profile，不含真实账号或用户数据。

- check真实退出0：类型、格式533文件、依赖/边界/E2E收集，check-05.log。
- P05 unit9/9、integration17/17退出0；P05-02自身3/9，含脱敏/静态HTML/任意路径拒绝/固定附件字节、窗口与hash绑定、源revision变化、已有目标拒绝、取消/重启、schema15→16幂等迁移/外键、写入中取消清理和junction父目录拒绝。
- P05-02三个Electron用例均通过：T22浅深/960/应用200%缩放；T20真实Host私有保存授权及MD/TXT/HTML/PDF/ZIP五格式/进度100/历史；T07/T20真实无Node/无preload/禁JS的沙箱PDF及独立干净Edge打开内嵌字体HTML，无TapKit桥接、无远程请求。组合批次的P05-03项目导航测试准备失败，整体退出1，不能称该批全绿；最终整批回归另见P05-03。
- 格式文件及hash在exported；verify-pdf.py核验11页规范化正文、末段、80行表格、100行代码及无PDF主动动作。Poppler视觉检查首页、跨页表格/重复表头、长代码末段；PDF的Han兼容字符复制差异公开记录，未声称原始Unicode逐码等同。
- 默认附件为空；ZIP仅显式选入固定原字节，不转换Office。外部文件用wx且不覆盖，原会话删除不影响副本。网页/文件来源仅使用Core已核验材料，无内部scheme或任意链接。

最初类型/未使用导入/marked直接依赖基线遗漏，以及无JS页面不能用executeJavaScript等待字体等失败已保留，修正后实际重跑。当前源码/构建与最终命令退出码以P05-03冻结manifest为准；本任务收口不等于真实搜索或模型联调通过。
