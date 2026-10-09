# 智谱修复版单次检测：当前 DNS 前置阻断

日期：2026-10-04，Asia/Shanghai。用户反馈小写glm-4.7-flash账户截图：连接未通过PERMISSION_DENIED，无检测阶段、HTTP状态或业务码。只读SQLite确认该账户最近检测时间为11:08:21，同一错误；另一大小写账户也保存PERMISSION_DENIED。没有改源码或用户配置。

11:08:34对应的本机Node lookup返回open.bigmodel.cn→198.18.0.99，公网判定false。执行当前packages/providers/src/api/http.ts的secureApiFetch，无Key、HTTPS request替换为只计数并拒绝执行的桩，返回PERMISSION_DENIED/retryable=false/HTTP请求数0，命令退出0。源文件SHA256仍为3c989c3f6cb92ee74c9d228f6ed57cf9dc349ad899ecac360106bac61c51ce5c，未修改。

实际命令使用锁定Node的--disable-warning=ExperimentalWarning --input-type=module -e；脚本通过stripTypeScriptTypes内存加载当前源文件、lookup读取DNS、DatabaseSync(readOnly:true)只查公开账户配置/状态，再用无凭据body={}执行预检。完整结构化结果见permission-denied-2026-10-04.json。没有读取/解密Key，没有真实HTTP或模型请求。PowerShell Resolve-DnsName也返回198.18.0.99；同一只读工具单元Get-CimInstance被权限拒绝导致退出1，未升级权限读取进程。

当前传输在使用代理前先检查目的域名全部DNS地址并固定IP。198.18/15被拒绝时直接返回公共PERMISSION_DENIED，没有upstream_error诊断，故UI没有HTTP/业务码。若来自智谱的HTTP权限错误，新适配代码会附upstream_error及安全HTTP/业务码。截图特征、持久错误与当前无HTTP预检一致，确认现环境存在请求前DNS阻断；该预检不是对用户当时应用进程的网络抓包，不能排除同时存在其他未观测问题。

判定：当前应先处理本机Fake-IP DNS与TapKit公网目的地策略的兼容，不据此判定Key失效、模型权限不足或非思考参数失败。用户此前独立非流式文本成功仍有效，但不代表此刻TapKit解析路径可用。不自动改变代理/DNS或放宽公网校验。

用户随后确认TUN关闭、系统代理开启。当前用户上下文只读Windows网络状态：Meta虚拟接口(index42)仍Up/Connected，配置DNS198.18.0.2；WLAN为Up/Connected、DNS192.168.0.1。查询缓存时目标域名无匹配记录；仅读状态，未清缓存。受限上下文读取DNS缓存被拒绝，当前用户读取退出0。指定192.168.0.1的无Hosts/只DNS查询超时退出1，不能据此判定路由器故障。该证据显示界面开关与虚拟接口状态需要进一步核对，不能断言系统代理本身产生Fake-IP、TUN已实际退出或缓存是唯一原因。

下一步由用户重启代理内核并确认TUN关闭，保留系统代理，再手动清理DNS缓存、检查域名解析；先反馈DNS结果，不重复模型检测。若仍有Fake-IP，再核对内核实际TUN/DNS状态和残留实例，为该域名返回真实公网地址后才做单次连接检测。Mihomo官方文档说明fake-ip-filter在默认blacklist模式可排除Fake-IP；whitelist/rule语义不同，不能盲目覆盖现有DNS配置。[官方DNS配置](https://wiki.metacubex.one/config/dns/#fake-ip-filter)。

R13仍configured；P01-02 implemented_not_live_verified、P01-gate engineering_passed_external_pending及P00门禁保持。不升级真人流式/工具验收，不启动P02，不提交或push。原Electron启动异常诊断记录保留。

交接检查：相关进度文件格式化退出0；pnpm docs:check退出0（37项状态/证据路径，permission-diagnostic-docs-check.log）；git diff --check退出0；按results.json逐一核对10个源码/测试SHA256均未变。没有重跑或新启动Electron，未重跑无源码变动的模型fixture测试。
