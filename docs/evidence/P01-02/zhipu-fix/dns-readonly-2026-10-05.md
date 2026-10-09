# 智谱 Chat PERMISSION_DENIED：只读环境核对

日期：2026-10-05（Asia/Shanghai）。用户报告本机 Chat 检测 PERMISSION_DENIED，并询问其他机器为何可通过。截图中保存的 Chat 账户显示“已连接”，未展示本次失败详情；不能用该截图确定失败阶段或 HTTP 状态。

当前 checkout 为 D:/tapkit/TapKit，codex/fix-zhipu-api-probe，HEAD b92eece52e88eb6bd16931cd6ed942bb91d4d1f6。本地 origin 跟踪引用此前已核对同 SHA，本次未访问远程。原三份 P00-03 未跟踪日志保留。

## 实际只读命令及结果

- `Resolve-DnsName open.bigmodel.cn -Type A`：命令单元退出 0，返回 198.18.0.92。
- 项目锁定 Node 的 `--input-type=module -e`，仅执行 `lookup("open.bigmodel.cn", {all:true, verbatim:true})`：退出 0，返回 `[{"address":"198.18.0.92","family":4}]`。无 HTTPS 或模型请求，不运行 secureApiFetch / 检测脚本。
- `Get-Content packages/providers/src/api/http.ts` 与 `Get-FileHash ... -Algorithm SHA256`：退出 0；SHA256 为 3c989c3f6cb92ee74c9d228f6ed57cf9dc349ad899ecac360106bac61c51ce5c，与昨日 DNS 诊断源文件一致。
- 执行上下文的 Windows Internet Settings 仅读布尔摘要：ProxyEnable=0，ProxyServerConfigured=false，AutoConfigURLConfigured=false；TAPKIT_HTTP_PROXY/HTTPS_PROXY/HTTP_PROXY/NO_PROXY 未配置。未读出代理地址或凭据；此上下文不证明已运行应用继承了相同环境。
- 部分最初 rg 查询使用不存在路径或 Windows 不接受的通配路径，退出 1/2；后续直接读取实际 http.ts 完成核对，不把失败搜索当成功检查。

## 结论与限制

当前 Node DNS 返回 198.18 地址，http.ts 的 isPublicAddress 明确拒绝该地址。secureApiFetch 在选取代理和创建 HTTPS request 之前检查全部 DNS 结果，因此当前环境具备请求前 PERMISSION_DENIED 的确定触发条件。该地址符合此前 Fake-IP 现象，但本次未确认具体代理内核/TUN/缓存来源，未抓取用户失败请求，也未读取用户账户数据库。

其他机器若返回公网地址，就不会触发这一分支；其 DNS、配置、版本尚未取得，不能断言机器间只有这一个差异。不能据当前错误判 Key 无效或智谱模型权限不足。系统代理自动兼容和 Fake-IP 安全策略仍是 P01-02 技术尾项；仅设置显式代理不能绕过前置 DNS 检查。

没有发模型请求、运行测试、启动 Electron、读取 Key/vault/Codex 或修改网络/账户/产品源码。只整理本次证据与进度；不提交推送。P01-02=in_progress，P01-gate=failed 保持。后续本机测试暂停要求保持；若需要修复，应在安全设计和隔离验证后实施，不删除公网/TLS 校验。
