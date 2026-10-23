# 原生复制与紧凑附件验证

日期：2026-10-23；ui_fix / 394418f + 保留既有工作区改动。对应 ADR0061，P02-02 关联 P03-01。

## 变更

- 消息、选区、代码、表格共用既有原生 copyText，成功/失败图标反馈；Host/preload 同一 2,000,000 UTF-16 长度校验，无 trim/截断。Web 权限仍拒绝。
- 消息复制原正文；代码空白保留且高亮末行不额外加换行；表格 TSV 保留空列、转义多行和制表符，公式只取一份 TeX；KaTeX 正常显示。
- 输入中性边框加柔和灰绿外阴影。图片/文件统一圆角图标卡片，名称下动态状态，hover/聚焦关闭，更多菜单保留预览/下载/失败重试；删除底部说明段落。小窗口附件横向可滚动且发送区可达。
- 单卡关闭只取消对应 token，无路径上传及已提交迟到回执不重新加入。等待解析时移除也排除最终发送引用。原件保留；整页导航仍将已完成项留在原会话，权限和就绪门槛不变。

## 验证记录

- 相关 unit：62/62，unit-second.log；对应命令/退出码见 service-checks.json。
- 相关 integration：正常本地权限下 111/111，integration-native.json/log。最初沙箱内 99 passed / 6 failed / 6 skipped 与未处理系统权限错误如实保留在 integration-second.log；不将其写为通过。
- 早期静态检查的测试环境类型错误与文档格式问题保留在 check-initial/second/fourth.log，后续最终检查以 checks.json 为准。
- 早期 Electron：initial 5/7、supplement 2/4、final 8/10；失败包含超长键盘填入/模型预算、选区测试长度少算句号、200%侧栏测试准备与真实附件布局越界。相应日志/回执保留，不覆盖或冒充同轮全绿。后续当前源码回归 verified 为9/10，专项 confirmed 为2/4（两项新核心用例过、侧栏自动关闭/自动滚动测试准备失败），最终 accepted 补验2/2；10个不同用例分轮通过，不称单轮全绿。悬停诊断与释放焦点/真实鼠标的补验记录均保留。当前产物以 results.json 为准。
- 测试通过正式原生通道读取系统剪贴板并实际粘贴，保护进程只在内存保留用户原剪贴板全部可获取格式并在 afterAll 恢复。选区另用真实拖选原用例；解析窗口测试只延迟只读就绪投影，真实导入/权限/最终消息仍经过 Core，不称其为真实慢解析验收。

## 最终结果

10个不同桌面用例分轮通过；原生完整复制验证65,004字符提问、Unicode/空白代码/含公式TSV实际粘贴、选区与键盘复制、2,000,000字符边界及超限拒绝。最小窗口实际961×641（Windows取整）200%深色输入区底部可达，附件横向滚动后每项可操作。界面功能确认后不继续视觉润色；当前卡片截图 cards-latest-light.png/cards-latest-dark-200.png，几何 card-geometry-latest.json。

## 保持与启动

原窗口/profile、现有工作区、翻译 selection-v3 和 Provider/Core 源码保持；无真实模型调用、commit/push或任务/gate提升。生产 Core 恢复后核验 fixture 不存在、全产物与测试前生产快照一致，并更新本地启动指针；最终完成情况以 results.json 为准。启动器仍是 docs/evidence/P02-03/session-load-2026-10-21/run-app.ps1。

最终 check / docs:check / diff 检查退出0；108份产品源码和626份生产产物校验匹配，Core测试fixture移除且selection-v3保留；原启动器CheckOnly退出0，只校验未启动原窗口。集成测试追加的旧native-parser证据已复制进本轮related-integrations，并按原字节前缀恢复，旧证据Git差异为空。详情见results.json、checks.json、launcher-check.json。需从托盘退出旧Host后重开，才能加载新的原生复制长度校验与界面。
