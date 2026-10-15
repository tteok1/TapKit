# ADR0051：P01 自动代理、显式模型选择与标题失败恢复

- 日期：2026-10-14。
- 范围：用户授权补全P01非订阅工程；订阅真实登录、模型、刷新和注销验收暂缓，R01缺口保留。不扩到P05，不增加服务器或依赖。

## 自动代理与安全边界

保留原network.mode=environment标识和三种模式，自动模式优先使用显式环境代理，没有环境代理时通过私有Host请求`network.proxy.resolve`解析该HTTPS URL的Windows系统路由。显式TAPKIT_HTTP_PROXY为空字符串表示直连；手动与直连覆盖自动选择，环境NO_PROXY保留。CLI没有Host时仍使用环境/手动/直连，不声称自动读取系统配置。没有写入用户网络偏好或更改Windows配置。

Host使用[Electron Session.resolveProxy](https://www.electronjs.org/docs/latest/api/session#sesresolveproxyurl)，仅接收公开URL，最多等5秒，只返回无凭据HTTP/HTTPS代理地址或DIRECT；Core私有回复不进入Renderer。首个不支持的SOCKS/非法路由报固定错误，不尝试其后的DIRECT。API连接20秒包含DNS和代理解析；取消或同步初始化异常清理定时器/Agent并导出固定分类。共用订阅网络准备只在真实请求/登录路径执行，目录读取不做网络解析；服务关闭恢复原dispatcher并阻止关闭后的迟到配置。

每次API请求仍检查全部DNS结果、固定连接IP、保留原Host/SNI并强制TLS验证。代理不能绕过Fake-IP/私网拒绝。IPv6先规范化，保守拒绝IETF特殊、文档与隧道地址，包括2001::/23、2001:db8::/32、2002::/16及3fff::/20；依据[IANA IPv6特殊用途登记](https://www.iana.org/assignments/iana-ipv6-special-registry)。增加non_public_dns、proxy_resolution_failed、proxy_unsupported固定诊断，不导出地址/异常原文/代理凭据。

HTTP错误仅保留既有已知符号码及最多8位数字码；未知符号字段可能承载私人值，不能因符合字符正则就回显。错误分类、既有繁忙/额度映射与请求次数不因此改变。

2026-10-15首轮全量CI发现既有OAuth/权限错误码在白名单中遗漏，6项合成回归失败；补齐invalid_grant、invalid_token、token_expired、region_unsupported、forbidden、rate_limited，并覆盖invalid_token刷新错误。未知值仍不导出，真实订阅验收继续暂缓；证据见P01-engineering-2026-10-14/ci-fix-2026-10-15.json。

## 模型选择

用户显式指定的模型不应被API后备顺序过滤。后备顺序继续限制自动候选，显式模型仍必须通过账户ready、能力、权限范围及预算检查；不放宽付费后备授权或五账户/重试上限。

## 标题与账本

辅助标题请求继承会话项目与原root，按实际序列化输入界限在ModelService预留前验证，取消固定4096输入估算的提前排除。每次仍最多1请求/128输出，没有自动重试/后备/额外记忆调用。

使用既有title_jobs状态与assistant的chat_json.titleFailure操作元数据保存固定code/diagnosticCode，不修改正文、内容revision、DB版本或已有账本。SessionRecord新增可为空的titleStatus/titleErrorCode/titleDiagnosticCode；旧回执缺字段时默认null，公开错误码枚举保持原值并拆为叶子模块以避免聚合reply契约循环引用。状态与事件同事务，任务处理限定profile；前端按workspace事件刷新标题状态。

失败保留当前标题并提示已有“AI重命名”恢复入口。只有用户显式点击才建立新尝试，仍独立结算；重启不重放失败调用，旧错误原因没有证据时不补造。workspace事件同时刷新root进展，界面说明用量包括标题等辅助请求，估算不代表供应商扣费。

native验收预检使用实际queued/running标题状态，并拒绝等待、暂停和恢复等活跃run，避免在并发辅助任务或未结束会话中启动独立真实验收；本次增量只用合成账户验证，既有用户native报告保持原范围。

## 验证与未验收

工程证据保存于docs/evidence/P01-engineering-2026-10-14。合成fixture验证不能代替真实供应商、系统代理环境和订阅验收；R13原指定Chat/FlashX的native/live证据按当时源码范围保留。R02-R05/R14完整live和未核验价格单独记录；价格/供应商余额未知与金额限额禁用是既定行为，不编造价格或为测试耗尽账户。
