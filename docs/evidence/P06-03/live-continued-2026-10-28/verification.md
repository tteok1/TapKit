# P06 连接检测通过后的限定真实联调

2026-10-28 Asia/Shanghai。用户截图确认 test1 / glm-4.7-flashx 文本及工具连接检测通过，并授权继续 P06 真实测试，要求控制 token；用户确认未修改网络配置，仅重新检测。

- 沿用此前总上限，本轮最多2次、输出256/次、预留20000；无自动重试或后备。使用独立 live 目录，从用户连接排查资料只读复制加密元数据与密文；原账号配置、密文及排查资料未更改。
- 先构建 runner，prepare-only 退出0，没有发请求。受限环境 Electron 启动退出 2147483651，未进入 runner、无请求；随后在正常 Windows 权限运行。
- 计划先审阅阶段通过且未发送请求；实际第一步发出1次POST后失败，create-report.json 记录 NETWORK_ERROR / response_headers_timeout，未生成成果，未进入审批/重启。没有再尝试第二次；无后台 Electron。
- 本轮持久预算 requests=1、wireRequests=1、reservedTokens=4812；usage_ledger 为 estimated，实际 input/output usage 与费用未知。连同此前应用尝试4次及保守预留24627，累计5次、29439保守预留；不可视为实际用量。用户手动连接检测消耗未计入此测试账本。
- 两份资料的账号密文、加密元数据与 network 配置一致；当前进程代理环境变量未设置。环境模式仍可能解析 Windows 系统代理；不能由此确认用户界面与测试进程的最终网络路径相同。连接检测采用32输出的简短文本和128输出的单工具请求，P06工作请求更复杂；仅据此不能判断故障根因。
- P06 live marker 已关闭，隔离密文副本已移除；排查资料保留。阶段状态保持 P06-01 implemented_not_live_verified、P06-02/03 implemented_and_verified、gate engineering_passed_external_pending。未进入P07、未提交推送。
- 本轮过程快照 runner-source.txt、budget-source.txt、launcher-source.txt 和 create-report.json；本次仅验证此次真实链路，不声称重跑既有工程全套测试。
