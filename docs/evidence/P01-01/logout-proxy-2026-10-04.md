# P01-01 注销反馈及显式代理接入

- 日期：2026-10-04（Asia/Shanghai）；D:/tapkit/TapKit；codex/p01-01；3840347+working-tree，未提交/推送。
- 用户新截图：GPT-5.6 Luna的文本检测报STREAM_INTERRUPTED/unexpected_content_type/HTTP200。实际MIME值和响应正文未知，不宣称已证实HTML页面。用户另报告点击注销没反应，并提供本地HTTP代理127.0.0.1:7688。

旧注销实现清除凭据、更新unconfigured并保留原账户行，因此UI看似无变化。按用户最新要求，注销改为清除凭据并移除账户行；旧无凭据记录新增“清除账户记录”按钮。新增hasCredential脱敏布尔、进度/成功提示；取消并等待关联操作后，在事务内设账户及opaque状态删除墓碑，列表不再返回该记录，channel缓存移除。历史外键和墓碑仍保留，不硬删其他账户或历史会话。

Core和live runner在首次网络请求前通过Node24的http.setGlobalProxyFromEnv启用明确代理，TAPKIT_HTTP_PROXY优先于HTTP(S)_PROXY，支持NO_PROXY。只接受HTTP(S)地址，错误为NETWORK_ERROR；不输出原始代理地址、响应body或凭据。正式设置页和系统代理适配不扩入本任务。见ADR0012。

连通性证据：Test-NetConnection 127.0.0.1:7688为True；锁定node-v24.21.0-win-x64/node.exe执行http.setGlobalProxyFromEnv({http_proxy/https_proxy指向用户本地代理,no_proxy为回环})后，以POST {}、无Authorization、redirect=error和15秒timeout访问固定订阅responses接口，进程退出0，仅输出authenticated=false/status401/contentType=application/json。Electron运行时检查输出node24.20.0/proxyApi=function。没有读取真实凭据，未发送真人模型请求，也未刷新/注销用户测试账号。

最终：build退出0；unit37/37；相关integration63/63（原58+4代理+1清除目标隔离）；P01-01实际Electron6/6（原4+注销/空记录清除两个真实按钮/DPAPI校验）。首次代理mock未处理CONNECT导致超时，已实现本机CONNECT夹具，外部目标使用.invalid，未进行外部DNS/网络。原取消后的后续检测测试已按删除语义改为断言原账户NOT_FOUND，再在新账户验证失败probe清理与成功重试，未弱化竞争断言。check/docs:check/diff与源码SHA256见logout-proxy-results.json。

日志：logout-proxy-build.log、logout-proxy-unit.log、logout-proxy-integration.log、logout-proxy-electron.log、logout-proxy-check.log、logout-proxy-docs-check.log。注销/清除截图PRIVATE_VISUAL_ARCHIVE.md、PRIVATE_VISUAL_ARCHIVE.md已人工检查，成功提示可见、账户行移除、无布局遮挡。

交接：从托盘退出旧实例，Ctrl+C停止开发终端；同一PowerShell设置TAPKIT_HTTP_PROXY=http://127.0.0.1:7688、TAPKIT_DATA_DIR指向原独立profile，再通过powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/pnpm.ps1 dev启动，检测有凭据的账户。真实响应类型异常需复测才能闭环；R01=configured/P01-01=in_progress/P00-gate=failed，不推进下一任务。
