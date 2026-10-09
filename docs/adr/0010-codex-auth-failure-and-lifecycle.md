# ADR 0010：Codex认证错误与账户操作生命周期

- 日期：2026-10-04（Asia/Shanghai）；状态：采用；任务：P01-01。
- 延续ADR0009的pi-ai 0.85.1、凭据CAS、加密native、SSE与maxRetries=0；不升级依赖、不增加provider或Agent运行时。

## 问题与决定

复核确认pending login能覆盖logout墓碑，两个并发probe能覆盖账户操作记录，OAuth刷新失败经上游lazy stream丢失结构化错误。见docs/evidence/P01-01/review-2026-10-04.md。

Core关联accountId与loginId。disconnect先同步占用账户注销槽，取消关联login与probe，等待登录/落盘清理及probe停止，最后删除凭据并更新账户。占槽期间拒绝新probe/重复disconnect。probe在首次await之前登记，完成时仅清理自身操作；候选目录阶段也传递取消signal，并在请求前复核revision和modelId。

登录、device code、state与PKCE仍使用上游公开models.login。公开OAuthAuth.refresh扩展点替换为TapKit受控刷新：固定auth.openai.com/oauth/token、POST form、redirect=error，使用锁定包内相同公开client_id。该ID是协议参数，不是新注册应用或秘密；不构造其他client_id，也不导入未导出的私有模块。

新增编译后进程回归发现：pi默认OAuth变量动态import在扁平CJS产物中查找不存在的相对文件，使真实凭据首次toAuth/login失败。调用公开./bun-oauth的registerBunOAuthFlows静态加载注册入口；该入口提供Node兼容OAuth实现，没有Bun专属执行要求。它只注册包内flow loader，TapKit的Models仍仅注册openaiCodexProvider，不展示或运行额外供应商。编译后真实Electron mock进程测试覆盖该路径；不复制私有源码到产物，也不依赖开发机node_modules相对布局。

刷新HTTP状态和JSON error字段在可信适配层转换为CodexFailure：401/invalid_grant/invalid_token→AUTH_EXPIRED，普通429→RATE_LIMITED，403→PERMISSION_DENIED，网络失败→NETWORK_ERROR，服务错误保留状态/code。忽略error_description和未知响应文本，不把token或原生数据写入事件/日志。返回token必须完整、有效期为正、JWT账户claim与当前账户一致；验证或落盘失败不得派发模型请求。Claim仅核对上游返回的账户标识，不当作独立JWT签名认证。

使用公开Models.getAuth解析/刷新并经CredentialStore.modify+Host CAS保存轮换，捕捉ModelsError的类型化cause。成功后直接调用公开provider.stream传入该次resolved auth，使认证失败在进入pi的lazy stream前完成脱敏，避免重复认证及文本错误还原。请求期token只存在可信进程内存，模型endpoint仍由codexFetch锁定；既有消息/native格式与adapterVersion保持一致。

锁定来源：发行包gitHead d981de1229ef899957bbe968bc8dcda02a21f477；dist/auth/oauth/openai-codex.js SHA256 41432753ef2ec7ef21c577fdc8f83b731c78be90c10ed8e7e1df7010f84d198f。客户端/endpoint来源一并进入resources/catalogs/codex-adapter.json；不以目录或包代码推定真实订阅权限。

## 验证与限制

正式回归覆盖迟到回调、已开始凭据写入时注销、目录等待及模型检测期间注销、并发检测、失败操作后的重试、401/400/403/429/503/断网、刷新中取消、非法或跨账户token、轮换落盘失败。旧复现源码保留为历史证据，不作为修复后验收断言。

live脚本分两次启动独立Electron进程。第一进程执行文本/两轮/echo/生成中取消并保存强制过期凭据与非secret检查点；退出关闭profile/SQLite后，第二进程核验不同PID和凭据版本，再刷新、文本请求、注销。检查点只存账户ID/modelId/version/PID/通过项，不存token、native或会话文本。

R01仍pending，真实联调未执行；本次本地证据见docs/evidence/P01-01/repair-2026-10-04.md。不提升P00安全门禁，不推进后续编号任务。
