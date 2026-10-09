# 外部资源待办与阻塞处理

产品决策已经足够编写和实施手册。以下不是尚未决定的架构，也不是要求现在提供秘密；coding agent在对应阶段接入本机测试资源，不将它们提交Git。

| ID | 资源 | 何时需要 | 没有时的行为 | 通过证据 |
|---|---|---|---|---|
| R01 | 有效Codex/ChatGPT订阅测试账号及可用GPT型号 | P01-01联调，P11-01最终验收 | 完成adapter/mock；标未live；其余功能继续 | OAuth首次/刷新/退出、流式、tool echo、实际model日志 |
| R02 | DeepSeek API Key | P01-02 | 同上；禁止默认使用环境中的未知私人key | connection report |
| R03 | 混元兼容API Key与已开通modelId | P01-02 | 预填endpoint；账号配置待接入 | 同上 |
| R04 | Grok xAI API Key与模型权限 | P01-02 | 同上 | 同上 |
| R05 | 豆包Ark API Key及modelId/ep-id | P01-02 | 空modelId保持未配置；不编造接入点 | 同上 |
| R06 | Tavily搜索API Key | P05-01 | 明确“搜索未配置”，URL读取可用；不把无搜索结果当搜索成功 | 搜索→访问原文→引用E2E |
| R07 | GitHub测试仓库和最小权限token | P09-03 | 本地Git可开发；PR功能标未live | draft PR读取核验和删除测试资源记录 |
| R08 | 脱敏Office/PDF/代码/检索真实材料 | P03起 | 使用仓库自建fixture；正式质量评测需代表性材料 | fixture manifest、人工评分 |
| R09 | 目标Windows标准用户/干净虚拟机 | P00-03、P11-02 | 开发机验证不冒充干净安装通过 | OS/硬件、无运行时预装、安装记录 |
| R10 | Logo、GitHub仓库owner/repo | P11-03公开分发前 | 产品名已确定为TapKit；Logo与仓库配置待提供；不创建他人命名空间 | release metadata检查 |
| R11 | Windows签名身份/证书/托管签名服务 | 正式公网安装包 | 可做明确标识的未签名开发包；不称已签名正式包 | 签名校验输出 |
| R12 | 官网域名与公开下载地址 | P11-03 | 提交静态官网源码，链接未配置禁用；不假造可下载URL | 真实链接/下载hash验证 |
| R13 | OpenAI或OpenAI兼容服务API Key及已开通modelId | P01-02用户新增 | 允许HTTPS Base URL与Chat/Responses格式；本地mock不代表真实开通 | 两轮、echo及取消connection report |
| R14 | Anthropic或Messages兼容服务API Key及已开通modelId | P01-02用户新增 | 使用Messages/x-api-key；不根据Key前缀猜协议 | 同上 |

用户说明有足够真实资源，但目前账号细节未提供。资源状态初始是pending，不是failed。凭据在本机设置页/测试secret store填写；配置文件只写引用。测试用费用采用测试账户自身预算和本手册token限制。

阻塞只作用相关验收：P01真实OAuth未完成不阻止P02界面、P03本地文件或mock回归；P00沙箱不通过不能验收任意代码执行；R10/R11/R12缺失不能称正式公开发布完成。遇到协议改变，coding agent应先对照官方/上游实际返回修复适配并写ADR，而不是反复询问用户选择API字段。

所有发布到GitHub、创建公开仓库、官网部署、真实PR测试写入，需在用户已经授权的具体资源内执行。手册本身不是对未来任意账号或仓库操作的无限授权；普通本地开发、修复、测试不需反复询问。
