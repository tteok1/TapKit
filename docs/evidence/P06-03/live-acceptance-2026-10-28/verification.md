# P06 剩余真实验收：连接检测未通过

2026-10-28 Asia/Shanghai。用户授权继续P06剩余验收，要求首次启动先在TapKit内检测连接，通过后才执行真实工作、控制token；沿用用户此前的连接检测上限5次。隔离工作目录复用现有账号/网络配置，调用与TapKit设置相同的 providers.check 命令；未改原配置。

- prepare-only退出0。正常Windows权限下正式执行退出1：5次连接检测均未完整通过，均最终为NETWORK_ERROR/response_headers_timeout；第3次文本通过、工具检测超时，其余文本检测超时。5次检测共6个HTTP请求；全部检测输出限制为文本32/工具128，实际tokens未知，不能视为零。probes.json和create-report.json为脱敏回执。
- 连接未完整通过，因此真实工作请求为0，工作预算保守预留0，没有运行本轮真实审批/重启/暂停。P06历史单步真实生成成功及本地工程验收记录保持；P06-01仍implemented_not_live_verified，P06-02/03仍implemented_and_verified，gate=engineering_passed_external_pending。
- 同进程配置与直连的无密钥HEAD诊断均收到401，证明检查时两条路径可到达端点，但不证明携密钥POST正常；另查得Electron系统代理解析为PROXY、非环回，未输出地址或凭据，未修改系统设置。不能确定系统代理导致超时，也不能推断密钥无效。network-report.json记录诊断，0个模型请求。
- 入口已关闭、隔离密钥密文副本移除，用户排查资料保持。P06真实审批、重启恢复和暂停等待网络允许且连接通过后再测；不擅自扩大连接检测上限，不进入P07，不提交推送。runner-source.txt、budget-source.txt、launcher-source.txt保存本次测试逻辑。
