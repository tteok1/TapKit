# P08-01 验收记录

2026-10-31，D:/Tapkit-public，分支codex/p08-01-browser。fetch origin main成功后，HEAD/origin/main/FETCH_HEAD均为ee06f746d380bc47e99c8cec30534e6b425cf15d，再创建分支。验收时尚未提交/推送；随后用户授权发布，源码提交8607c30已推送，见publication.json；未合main。原工作区改动保留，原进度全文在preflight-2026-10-31。

## 工程检查

实际工具链为仓库Node24.21.0及pnpm12.4.1；pnpm由scripts/lib.mjs的pnpm函数调用，避免主机旧版本。静态检查和构建由锁定node运行scripts/check.mjs、scripts/build.mjs；测试在正常本地权限下执行，不降低应用隔离。

| 实际检查 | 退出码/结果 | 证据 |
| --- | --- | --- |
| pnpm check | 0；699文件格式、边界、214项临时目录约束、125项桌面收集 | final-check.log；接续修正后continuation-check.log |
| pnpm build | 0；原生helper及生产desktop/Core | final-build.log；build-result.json |
| pnpm test:unit | 0；470/470 | review-unit-integration.log |
| pnpm test:integration -- P08-01 | 0；18/18 | continuation-integration.log |
| pnpm test:e2e -- --grep P08-01 | 0；2/2，修正后49.1秒；之后恢复生产构建 | continuation-electron.log；前轮acceptance-electron.log |
| 共享工作驱动修正后办公驱动回归 | 0；6/6 | continuation-driver-regression.log |
| 相关integration：P01/P02/P03/P04迁移与账本，P05网络，P06工作/恢复/隔离，P07办公驱动/网关/迁移 | 首轮1（153/154）；修复P07旧降级fixture后定向0（2/2）；共154个不同用例分轮覆盖 | related-integration.log；kernel-and-migration.log |

完整应用fixture模型6 calls/5 tools完成MD成果，业务提交一次，未授权写入0；选区材料保存、审批过期后实际重新观察通过。原生Chromium另覆盖iframe、按钮移动/同名歧义、新标签、恶意popup、下载候选、私网/重定向、一次表单许可、响应丢失只写一次、关闭清理。Node下载路径另验DNS混合/私网/重绑定与真实导入检查。schema18→19及既有17升级幂等/FK/数据保全已验。

## 界面证据

- desktop/work.json、browser-kernel.json为真实Host/Core/Chromium行为摘要，模型/公开源站响应是合成fixture。
- desktop/approval.png、stale.png、completed.png、compact.png、modal.png为真实父窗口截图；原生child另见current-web-page.png、actual-web-page.png，父窗口截图不能证明child可见。
- desktop/geometry.json三项true：滚动区裁切隐藏原生网页、应用弹窗隐藏原生网页、关闭弹窗恢复。
- design-review.md保留首轮四项发现与最后四项全部resolved的pass，范围仅这四项；design-documentation.md确认普通扩展保留incumbent并记录既有设计文档滞后。DESIGN.md及sidecar未改。Windows检测器cache_directory_failed未算通过。

## 真实模型与成果复核

使用既有智谱Chat/glm-4.7-flashx密文副本、独立ACL目录和无fixture生产TapKit；每轮均先在应用内点击检测连接，成功后才创建只读https://example.com/任务。跨轮累计连接检测不超过20次。明文Key和原生推理未进入证据。

首轮live-61433076-5c35-4078-af2e-bb7be5bf5120：连接1/20成功后，2模型/2工具，真实browser.open及artifact.write成功，actual7293 tokens、根预算预留0。标题与正文事实正确，但模型额外生成无依据的旧访问时间，内容审核拒绝；原初步通过报告保留report-before-content-audit.json，最新report.json为not_verified。未把这份成果算最终通过。

初次清理因opaque-UUID加密文件命名退出1；已修正为验证目录及已知文件名后删除，单独--cleanup退出0，无新API请求，剩余密文文件0，原账户不动。随后收紧为逐字引用标题和第一段、禁止附加日期，再做一轮应用内先测连接的真实验收。最终结果见同目录verification.json及后续live轮次报告。

第二轮live-9c7634f2-b20c-46c9-81e0-83d268aa59d0：累计第2次连接检测通过；4模型/4工具、actual15057 tokens、预留0。反复browser.open并跟随IANA说明链接一次，未按目标交付，4次调用预算正确停止，status=budget_stopped/not_verified；continuation-audit.json保留真实URL与工具摘要。无外站写入，密文副本清理完成。随后给模型附真实observedAt、最多8条已成功浏览动作及明确接续约束；回归18集成、6办公驱动、2桌面全部通过后恢复生产包，再做真实验收。

最终live-f9182cd0-9409-495c-a467-5ec22c235990：累计第3次应用内连接检测通过后才创建任务，3模型/3工具（browser.open→browser.observe→artifact.write）completed，actual11424 tokens、预留0。content-verification.json独立读取实际MD blob，标题和正文第一段逐字匹配真实DOM，无额外日期；SHA256 d506277e63f1a4bfe7ba78d7709917e5295c954748b636a328ec51595966b25a；browser-audit.json确认最终轮仅example.com。三轮密文副本已清理，剩余文件0；模型工作共9次调用/9次工具、actual33774 tokens（不含连接检测）。

P08-01最终implemented_and_verified，FR-21-001—009按任务限定范围通过。只提升本任务；P08阶段仍in_progress，无P08-gate通过结论。最终源码逐文件SHA256见source-manifest.json；docs:check及diff检查见verification.json和docs-final.log。

## 失败保留与边界

受限环境symlink/Vite临时缓存错误、一次机器停顿后的原15秒超时、旧选择框label、一次分离native截图挂起、P07降级fixture遗漏新表等失败均保留日志，修复后按原门槛通过。未为过测试放宽策略或限时。相关回归在P06-02/native-cases.jsonl新增两条本轮真实隔离python/office证据。

真实站点只读，写入/提交/丢响应只在合成fixture验证。结论限本任务及该智谱模型/目标；不推广其他供应商、任意网站或模型事实正确率。P08-02/03未开始，P08不收口；原较早阶段live暂缓范围保持。

## 本地复查

在锁定开发环境启动TapKit，新建工作时启用匿名浏览器；打开页面可查看原生网页、切换标签和选择材料。点击“手动接管”后工作暂停；交回后重新观察，再继续任务。表单提交先显示目标和字段审批，修改字段后旧审批失效。自动复查用上述P08单元/集成/桌面命令；真实模型验收需使用授权脚本并遵守先应用内连接、最多20次的约束，不将fixture当live。

## CI74/75回归修复及CI76通过

旧P00-01严格桥清单漏同步P08-01的browserCommand，导致CI74/75各49项桌面过、1项失败。修复ae078aa补齐明确清单，并新增真实桥接script参数拒绝校验；原沙箱、Node不可见及子进程关闭断言保持。本地两项Electron及check通过后推送，CI76三个job全success：单元470、主集成482过/1既有skip、性能2、桌面50通过，独立Office及启动诊断通过；原失败用例远程1.4秒通过。官方运行与步骤/日志摘要见ci-fix-2026-10-31/diagnosis.json。无真实模型请求，不改产品或工作流，不推进阶段。
