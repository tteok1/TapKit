# 2026-10-02 main CI 诊断与修复摘要

## 最终结果

用户授权从main创建分支、提交推送并修复CI；分支为`codex/diagnose-main-ci`，基线`1dff02455069cd33224f2bd0890e0d2bb737a9fc`。代码验收提交`7214ae0c5ca54ec87e0b6b14729424f84f9ac9f2`的[CI54](private-archive:TapKit)完整通过。CI54全success：bootstrap/check/build退出0，unit31/31（原17项加下载14项）、管理员integration46/46、完整P00 Electron8/8、独立medium/non-admin标准用户22/22，failed/pending/missing均0、三项能力available；新runner三轮首次建库/真实凭据用例全部通过。 本次没有合并main或启动P01。

最终元数据、步骤、日志/产物SHA256、22项标准用户结果、运行库/源码指纹及三轮阶段耗时集中保留于[main-ci54.json](main-ci54.json)。历史过程在下表概括，不用旧通过结果替代最终提交验收。

## 为什么合并后会失败

合并提交与功能分支的文件树一致；此前通过CI46的核心实现到main也没有应用、native、原测试、构建配置或依赖锁变化。无冲突仅说明文件合并没有歧义，CI还依赖新runner的运行时性能、网络及外部分发服务；相同源码并不保证每次环境完全相同。

main CI49第一次：unit17/17、integration46/46通过，Electron凭据保存约73.198秒超过原45秒预算；INTERNAL_ERROR在超时开始退出后才返回，不能据此认定DPAPI故障。第二次：unit17/17、integration45/46，首次建库/重开25.916秒超过原15秒预算；另外18项存储及P00-03沙箱/Office通过，Electron和标准用户未执行。两次失败位置不同。

CI49的25/73秒超时未复现、底层原因仍未确认；保留脱敏阶段诊断，未按猜测修改SQLite/DPAPI/隔离业务逻辑或扩大原15/45秒预算。 CI51在与旧失败相同的westus2地区完整通过，不能把地区当作根因。正常样本的最慢阶段也不能证明旧失败发生在该阶段。

## 本次怎样处理

1. **先增加定位能力。** 存储/Vault只有显式`TAPKIT_STARTUP_DIAGNOSTICS=1`时输出固定scope/stage、PID和单调阶段耗时；默认关闭，不输出目录、密钥、账户、payload或错误stack，日志失败不改变业务返回。CI准备成功后独立收集集成、Electron和标准用户结果，任何原失败仍使workflow失败。
2. **验证旧超时是否复现。** 新runner执行三轮新进程、新数据的原首次建库/真实凭据测试，原断言与15/45秒预算保留。没有将失败测试重跑转绿。三轮同处一台VM，系统缓存会变热，不声称三台冷机器；每轮定向storage选择1项、另外18项filter跳过，完整46项另行验收。
3. **修复实际发现的下载故障。** 后续runner下载锁定LibreOffice遇持续HTTP504，测试尚未开始。仅对暂态HTTP和明确连接错误最多尝试三次，共享原十分钟预算，退避并遵从Retry-After，失败清理.part；永久HTTP、证书/未知错误、文件错误或hash不符立即失败。
4. **处理冷缓存与持续源站失败。** 保留原TDF URL/version/hash，加入显式HTTPS OSU备用来源，只在暂态错误后有限切换。实际完整读取373252096字节，SHA256 `f9877032fd908beb9c0ddf06df4af5c2e85f419c42e14876c4cce5aae5fb2660`与原锁相同。核验只流式读取/hash，没有在本机安装、执行或保存大型副本。26.2.6.2归档hash不同，未采用；另一个归档侧文件请求超时，未冒充核验成功。
5. **复用已校验的下载字节。** 官方actions/cache@v5仅缓存.cache/downloads和.cache/wheels，精确key取三个锁文件hash，成功bootstrap立即保存；独立新runner随后恢复，仍重新digest、解压、ABI probe、构建和测试。缓存不含已解压运行库、应用数据、凭据、报告或能力状态；坏hash仍失败关闭。决策及规格同步见[ADR0008](../../adr/0008-verified-runtime-download-resilience.md)。

## CI轮次与因果边界

| 轮次 / 提交                                                                    | 实际结果                                                       | 对应判断                                                      |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------- |
| [CI49](private-archive:TapKit) / 1dff024 | 两次分别凭据保存与首次建库超时                                 | 旧底层等待原因未确认，不能因无合并冲突认定每次运行必过        |
| [CI50](private-archive:TapKit) / d31829d | unit17、integration46、Electron8、标准用户22及三轮诊断全部通过 | 加标记后旧超时未复现，未做推测性业务修复                      |
| [CI51](private-archive:TapKit) / 461c6af | 完整check通过；独立诊断准备时HTTP504失败                       | 新网络下载故障，不能解释CI49已完成bootstrap后的超时           |
| [CI52](private-archive:TapKit) / a67cad8 | 完整check通过，unit29含12项下载回归；另一runner三次504后失败   | 有限重试保持失败门禁，不能解决持续源站不可用                  |
| [CI53](private-archive:TapKit) / 0d4965e | 两个新runner均冷缓存，三次504后准备失败                        | 缓存无法替代首次可用且字节可信的下载来源                      |
| [CI54](private-archive:TapKit) / 7214ae0 | 完整check和新runner诊断全部success                             | 实测冷缓存源站504后备用成功、保存缓存、新runner命中并完整复验 |

CI54实际源站重试记录在11:57:20Z：HTTP_504、sourceHost=download.documentfoundation.org。随后完成bootstrap、保存精确key；诊断runner在12:17:05Z命中同key并于12:20:28Z完成bootstrap。最初缓存不存在，因此不是已有成功缓存掩盖冷准备问题。

CI54三轮首次openStore分别512.74、61.79、54.36毫秒；首次vault.save分别2083.66、308.29、423.30毫秒。诊断中首轮ACL PowerShell约2027毫秒，全部原测试预算内。完整check的ACL阶段约6.33秒也通过；这些是正常采样，不证明旧73秒等待的原因。

## 核心代码保护与检查

AppContainer、ACL、Job、零网络、GitBroker、LOKit宏/外链策略、Core/Host/IPC契约、SQLite WAL/FK/FULL和DPAPI原执行语义保留；native、tools、contracts、core、原P00-03/存储/Electron用例及原超时配置没有改动。两份业务源码去除新增固定阶段标记后的Babel AST与origin/main完全相同；业务未增加重试或降级。

14项新增下载单元回归覆盖504/429恢复、连接重置、响应体中断、401/403/404、三次耗尽、错误hash、好/坏缓存、过长Retry-After、SHA512/base64、备用选择和坏备用立即拒绝；CI54全部通过。本地另用锁定Node对实际download函数执行七项真实文件落盘smoke退出0。

本地两组TypeScript与脚本ESLint、定向Prettier、PowerShell AST、dependency boundaries、manifest、docs:check和git diff --check退出0。全量本地check在Prettier遍历既有protected acl-probe时EPERM；Rollup native模块被Windows应用控制阻止，本地Vitest未进入用例。未调整ACL或系统策略、未重新执行被阻止模块；正式完整应用/native测试来自本轮干净Windows CI。不能复制CI报告来启用本机能力。

本轮结果证明当前提交完整验收通过、已证实的504下载路径具备有限容错；不承诺旧偶发超时已被根治。若再次超时，应先读取保留的脱敏阶段日志和原Electron trace，再按具体等待阶段研究修复。

## 过程整理与交付

最终证据统一为本摘要和main-ci54.json；中间CI50重复JSON归档已并入本摘要，临时API/AST/下载核验脚本、下载日志和压缩包副本在收口时清理，原任务历史证据与正式回归测试保留。本轮已清理29个临时文件（3398542字节）及1个空测试目录；另删除1份重复的中间CI50 JSON。保留最终CI54证据、正式回归测试、运行库缓存与受保护acl-probe。

CI49原两次日志SHA256：`29eccdba6073a6e46609069c96a28b5ccdd65e24f72fbbe1a7d3e31731ed76c8`、`0347900a48a7b734a69ccb9b9d0c3af719bfb3a519605a7e2417853d0e4bcf4c`；第二次artifact为`9329352fbe0368555b48b380a4d66bfb832811db005b13b7fc057d6f0cd16647`。

中间诊断失败日志SHA256：CI51 `fa7919540cd4ccf9d583bbab64ee8052f2cefe665981ec60f27193493ad77c69`；CI52 `c27aaccb09667e9ea430b3a349b76d783f43941e630e78c51d45a1884c8442da`；CI53两份 `19ad19ba6551e8227f169a93d65c8d7b341db1d72eb0685845ee2a2c6629bdb8`、`f85f76d6b65fd0d743ead5e1d8e4294588b3dc97db1c6a92898f9a80398bf074`。最终CI54两份日志与artifact指纹以main-ci54.json为准。

## 权威参考

- [better-sqlite3 13.0.3构造](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/lib/database.js)、[binding加载](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/lib/binding.js)：仅帮助识别首次构造阶段，未证明旧超时根因。
- [Node execFile](https://nodejs.org/api/child_process.html#child_processexecfilefile-args-options-callback)、[Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)：支持子进程等待/DPAPI边界排查，不据最新版文档升级运行库或降级凭据。
- [GitHub step条件](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsif)、[cache官方说明](https://github.com/actions/cache/blob/v5/README.md)：独立采集仍保留失败结论，缓存不代替校验。
- [Microsoft暂态故障处理](https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults)、[HTTP状态与Retry-After](https://learn.microsoft.com/en-us/power-query/handling-status-codes)：按错误分类、有上限的退避。
- [TDF镜像网络记录](https://listarchives.libreoffice.org/global/website/2013/msg02031.html)、[OSU实际目录](https://ftp.osuosl.org/pub/tdf/libreoffice/stable/26.2.6/win/x86_64/)、[OSU镜像服务说明](https://osuosl.org/services/hosting/policy/)：登记/目录不代替本轮完整原hash核验。

## CI55后续回归（2026-10-02）

2026-10-02 CI55回归：压缩提交0294585的bootstrap/check通过；unit31/31、integration45/46、Electron8/8、独立标准用户22/22、三轮启动诊断通过。唯一失败为Office外链启用对照在control_destroyed之后未结束，120秒Job超时；原建库/凭据超时未复现。新增仅测试侧Python线程栈和loop/worker退出阶段诊断，根因待新CI；不改生产worker/隔离/原限时，不合并main。 这次新增Office退出问题与原两处启动超时、源站504分别记录。当前任务门禁重新打开，历史CI54验收保持为历史证据；本轮实证见../P00-03/ci-run55.json。
