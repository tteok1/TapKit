# P09-02 验收证据

2026-11-06，D:/Tapkit-public，codex/p09-02-terminal-runtime；baseline fe2653ff163cf77f633d495fb1d14774d67608d9。验收时为未提交工作树；实现现已按新增授权以dcdfbd2提交并推送同名开发分支，原维护内容保留。功能/安全验收通过；独立UI复核的裁切和黑色底条两项评分均resolved，ui-review-verdict-2.md disposition=ship（仅该评分范围）。设计系统比对已完成，既有设计文档漂移保留，最终链接校验见docs-delivery.log。

## 需求与实际链

- FR-22-003/T17：运行真实Node/Python失败测试，hash补丁修正a-b→a+b后原测试通过；原目录不变。Core工作网关接入同一原生执行器；失败不当成功，补丁后的相同步骤允许重新验证，完成检查绑定源码与锁/环境，旧catalog不获得exec权限。
- FR-22-007：RuntimeProfile/schema23、argv/cwd/exitCode/start/end/logRef与实际helper身份落既有账本；幂等回执防重复，非零/超时/资源超限/未知结果不通过；修改/停止/修订在已核对旧Job后交接。
- FR-22-008：真实ConPTY/xterm中文输入、resize、停止和历史；Electron中Python实际求值UI_RESULT:42；270001字节输出按64KiB回看，明暗两宽度无溢出；两帧26.6ms。
- T19：AppContainer零网络capability；owned loopback无连接；恶意npm postinstall读合成secret拒绝；取消进程树activeProcesses=0且后续无写入；真实大小、短进程ADS、时间/输出边界；恢复不按PID复用环境。

## 命令与结果

pnpm由scripts/lib.mjs锁到Node24.21.0/pnpm12.4.1，外层系统Node只启动脚本。记录实际执行，不把收集/默认跳过当运行通过。

| 实际入口 | 结果/退出码 | 日志 |
| --- | --- | --- |
| node scripts/check.mjs | 0；类型/脚本lint/格式/依赖边界/临时目录/manifest；129项E2E仅收集 | check-delivery.log |
| locked pnpm test:unit | 0；509通过/77文件 | unit-final.log |
| locked pnpm test:integration P09-02 | 0；13通过，1个显式live跳过并另行执行 | runtime-scope-final.log |
| locked pnpm test:integration P06-01 P06-02.approvals P06-03.recovery P08-01.migration P08-02.migration P08-03.delegation P09-01 | 0；69通过/8文件 | regression-final.log |
| node scripts/runtime-probe.mjs --scope=current-user | 0；22/22、无缺失或跳过、三能力available | runtime-probe-final.log；native-probe-final/runtime-probe.json |
| node scripts/live.mjs P09-02 --registry | 0；1项显式真实服务通过 | registry-live-final.log；registry-live.json |
| node scripts/desktop-build.mjs；locked electron-vite build | 0；完整生产构建及UI确认构建 | build-desktop.log；build-ui-confirm.log |
| locked pnpm test:e2e -- --grep 'P00-01 sandbox|P09-02' | 0；桥回归+真实桌面链两项 | e2e-first.log |
| locked pnpm test:e2e -- --grep P09-02 | 0；UI修订后完整链一项 | e2e-focused-final.log；desktop/metrics.json |

## 失败保留与修正

初轮工具文件沙箱的租约/junction/temp失败未计通过；以真实Windows测试权限复跑。Node模块盘根/默认测试IPC、npm cmd与compile cache、ReplySchema多余字段、任务修订清理等问题已修复并由最终用例覆盖。shared ExecutionLimits维持旧120秒上限，600秒只给代码流式入口。

native-probe首轮19/22：3个Office用例被新增工作区扫描误终止。扫描改为仅代码/显式quota入口，native-probe-final随后22/22；两轮原始追加日志保存在native-cases.delta.jsonl。historical-evidence-preservation.json证明P00-03历史journal原字节恢复，未覆盖原证据。

首轮长元素截图裁切和记录按钮样式覆盖已修复；first-*.png仅历史。最终desktop目录的terminal-*为上部视口，window-*为下部输出视口，failed-*为真实失败状态；都来自生产Electron，未拼接或修图。

## 范围

公开live使用固定is-number7.0.0/colorama0.4.6，真实下载核对后AppContainer离线安装；新环境缓存重装时网络方法设为调用即失败。测试为固定公开registry直连策略，不代表用户默认代理已验。

新增模型调用0、供应商连接检测0，R13原范围与2/10余8保持。本轮未验证真实模型驱动P09-02全链；本地执行与工作网关由真实原生进程+合成模型边界分别核对。没有Key、原生推理或私人正文进入证据。

隔离范围为current-user，standardUser=false，指纹ecfcf4a766671adb23c817ad4841811916ef6824954b817e095551dfeb7c5aaa；未跑独立标准用户，不替代R09旧CI或P11安装验收。文件/条目扫描与Job I/O预算有采样窗口，未声称硬文件系统quota。新目标机必须重新probe。

仅P09-02；实现dcdfbd2已推送、无新远程CI通过结论，不开始P09-03/04，不收口P09 gate。独立UI结论见ui-review-verdict-2.md，系统比对见design-comparison.md，最终检查见docs-delivery.log。

末轮UI补充：独立复核要求实际网格拟合，原裁切已resolved；随后暴露默认黑色viewport底条，已按code-surface补齐。e2e-review-final.log两帧1.97s失败保留，当时未记录焦点，原因未定；e2e-focused-final.log在实际前台visible且hasFocus状态以相同1s阈值复验26.6ms、完整链退出0。没有修改应用后台策略，未扩大为后台性能保证。新网格843×293≤849×306、558×293≤565×306；viewport与surface在两主题计算色相同。最终二轮review两项均resolved、disposition=ship，范围仅该评分表。

最终源码静态检查check-delivery.log退出0；源码与当前生产构建哈希见source-manifest.json（48个源文件、7个产物，验收时的工作树快照）。最终桌面使用e2e-focused-final.log，之前各轮保留；最终复核见ui-review-verdict-2.md，设计系统比对另附。

发布回执见publication.json；发布后只改进度/回执元数据。main与既有维护改动保持，源码与验收时哈希一致，新CI单独待验。
