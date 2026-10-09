# ADR 0012：Codex代理接入与注销反馈

- 日期：2026-10-04（Asia/Shanghai）；状态：采用；任务：P01-01。

用户实际检测返回HTTP200但Content-Type不是text/event-stream，另报告点击注销看不到变化。后端注销原本清除凭据并保留账户元数据；已登录但未检测、未登录和已注销均可为unconfigured，仅凭该状态无法判断按钮是否可用。

AccountView增加可选hasCredential布尔字段，由providers.list读取账户独立CredentialStore计算，不传回任何凭据内容。登录完成但尚未检测时hasCredential仍为true，不能凭unconfigured就禁用注销。

按用户最新要求，注销必须清除凭据并移除账户行；旧的无凭据记录提供“清除账户记录”按钮。两者复用providers.disconnect，取消并等待关联登录/检测、删除凭据墓碑后，在事务内更新unconfigured及账户deleted_at、关联opaque状态deleted_at，移除Core channel缓存。providers.list不再返回该账户。底层保留删除墓碑以防迟到操作复活、维持历史外键；不硬删其他账户或历史会话。UI显示进度/成功、清理旧检测/对应登录提示；无凭据时仍可清除记录，检测/模型选择禁用。live注销验收同步检查账户墓碑。

Node全局fetch不会自动使用Electron Chromium的系统代理配置。Core在首次登录或检测之前用Node公开http.setGlobalProxyFromEnv设置HTTP/HTTPS代理；显式TAPKIT_HTTP_PROXY优先，其次http_proxy/HTTP_PROXY与https_proxy/HTTPS_PROXY，尊重NO_PROXY并默认绕过本机回环。只接受HTTP/HTTPS代理URL，配置错误转换为NETWORK_ERROR，不输出原始地址或密码。live独立进程使用相同配置函数。初始化仅在请求开始前执行，进程运行期通过重启改变配置。

Node24.21锁定runtime和Electron44实际内置Node24.20均存在该API；不新增undici等依赖，不改模型endpoint/重试/SSE/凭据边界，也不把代理解析职责交给Renderer。此为P01开发入口，正式代理设置和系统代理适配仍按其后续任务实施，不推定当前配置已完成整套系统代理支持。

公开依据：[Node24 http.setGlobalProxyFromEnv文档](https://nodejs.org/download/release/latest-v24.x/docs/api/http.html#httpsetglobalproxyfromenvproxyenv)。本机用户给出的本地代理端口可达；经该代理发出的无账号POST收到401/application-json，仅证明匿名链路到达接口，不证明真实模型连接成功。

验证包含无外网目标的本机HTTP CONNECT代理路由、非法代理失败、清除目标账户不影响另一个账户、注销后列表移除/禁止继续检测，以及真实Electron注销和清除空记录按钮、DPAPI墓碑。真实订阅请求仍由用户复测，不能将匿名401或mock通过提升为live通过。
