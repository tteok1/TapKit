# 2026-10-19 当前UI启动接续

旧脚本使用先前验收源码与构建快照，两处新CSS会触发拒绝。已增加显式UI刷新入口，保留原始验收数据目录及账户。首轮刷新后又发现Core完整运行时哈希超过Host原15秒等待，被提前结束；冷读67.215秒、热读14.597秒且指纹均匹配。现在仅完整当前策略且含available能力报告使用120秒有界等待，其余仍15秒。Core逐字节与账户验证保持；此修复不代表性能门禁通过。

## 以后修改UI后的启动方式

本次已成功打开，可直接继续原批测。以后再次修改UI，先从托盘完全退出TapKit并结束旧启动终端，然后执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Tapkit-public\docs\evidence\P02-02\live-2026-10-15\run-app.ps1" -RefreshUiBuild
```

只需正常重开且源码/产物没变化时，使用同一命令并去掉 `-RefreshUiBuild`。只核对不启动可加 `-CheckOnly`。刷新会运行工程检查和生产构建，随后完整启动校验可能需要等待一段时间；运行中拒绝刷新。普通入口仍核对原profile和Chat/FlashX账户，不需要重填Key。

刷新仅接受renderer变化；HEAD变化、新的非UI变更、既有后台或runtime源码变化、Core/Host产物漂移会拒绝，需另行审查。新快照写入独立文件，再切换active-build指针；不按日期静默跳过校验。用户现有CSS及先前布局测试证据保持。

## 实际核对

- 脚本语法/PowerShell AST退出0；UI允许及后台、未知后台、runtime变化拒绝检查通过。
- `-RefreshUiBuild -CheckOnly`退出0，check451文件及build:desktop通过；应用运行中同命令按预期退出1并在构建前拒绝。
- Host依赖修复新增unit3/3、最终check453文件和build:desktop均退出0，Core产物字节保持；最终预检退出0。
- 首轮正常重开失败保留：session98224最终exit1，未收到Core opened。修复后原profile20.733秒收到opened，Main/Core服务各1，12条公开sessions.list/sidebar.list回执全部成功；session55667仍运行，退出码未观测，不记exit0。新trace attempt0，无Agent模型请求。
- 既有布局10/10和24份几何/截图证据沿用，不重复已过真人功能或原生/解析测试。管理员优先，非管理员验收按用户要求暂缓；P02-03批测结果、任务及gate状态不提升。

完整命令/实际结果见[results.json](results.json)，首次失败、冷热指纹计时、最终重开及公开IPC回执均保留在本目录。未导出Key/native或私人正文，未手工写原业务库，无commit/push。
