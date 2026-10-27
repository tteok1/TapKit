# P05-03 聊天版本端到端验收

- status：in_progress
- updated_at：2026-10-27 Asia/Shanghai
- 目录/分支/基点：D:/Tapkit-public；codex/p05-chat-m1；ad85bc467c921f4c44ad26fc0c1bba25269153cb + P05工作树。
- 前置：P05-01工程完成/R06待验，P05-02本地实现及三项Electron/格式验收通过。用户授权P05开发验收，无push/merge授权，不进入P06。

## 交付与检查点

FR-37-001：正在完成未配置→合成连接→聊天/编辑分支→文件导入/项目限定RAG→自动记忆提示→三次压缩/纠正→网页核查→导出→退出重进的连续截图/日志；首轮在读取项目导航attribute前未等待页面就绪导致测试选择project:null，已修为显式等待实际项目ID，不放宽产品权限或检查。

已实现pack:dir目录快照脚本、Windows启动与模型/数据/格式/限制说明（docs/chat-milestone.md），包含锁定运行时/依赖/模型/字体；每个新目录重新执行完整当前用户隔离探测，不复制已有available报告。打包及启动仍待真实执行。

## 验收计划与证据

最终冻结源码批次由docs/evidence/P05-03/run-acceptance.mjs记录源码hash、命令/退出码，备份恢复历史任务证据并另存本轮生成文件。依次check/build/unit/integration/perf/E2E、pack:dir、目录内启动/文件解析/导出；安全/版本/取消/断流/Core重启/记忆删除使用既有和新增用例真实回归，不借用旧报告替代。

2026-10-27检查点：P05-02/03组合4/4 Electron通过（.test-data/p05-e2e-06.log），完整连续路径已到同一会话重启/草稿/网页快照恢复。最终安全复核增加web.read精确URL授权与附加背景query拒绝；新P05集成17/17通过。修复预览刷新名额/消费与窗口关闭清理，增加到期授权/窗口关闭/迟到PDF取消等边界测试；项目范围CAS冲突通过正式重新加载恢复，不跳过版本校验。当前冻结all-run-01已启动，check已通过，后续结果待命令真实完成。

## 资源与边界

03:55检查点：final-run-02已经停止/恢复生产构建，后续完成导出未知副作用恢复、包编译环境清理、联网控件全场景收进composer按钮的外置dialog；已建会话也不再占额外工具条。ui-run-01的check/unit370/P05集成19退出0，证据runner日志文件名含Windows非法字符导致E2E未启动，原失败回执保留；uiOnly-run-01正在冻结复验98项受影响及剩余Electron路径。Core kill/DPAPI账户两项已通过，完整结果待实际结束。

03:23检查点：all-run-03的check/build/unit370、八个集成批次合计373及perf2均exit0，源码未变；E2E在旧启动等待/合成Host代理响应失败后主动停止，仅终止该测试runner的8个子进程，生产构建恢复、历史证据复原。后置局部修正已在final-run-02冻结：check/unit370/P05集成19通过，完整114项Electron执行中。已恢复IPC拒绝、DPAPI/注销和utility协议路径；P00-02 Core kill后的poll仍旧15s，需该批结束后只调整这一测试准备预算并补验。应用Core watchdog/权限门槛未放宽。

包内probe临时profile清理已实现，尚待pack真实执行；打包前再强制清理编译期测试环境变量，并在pack-smoke核对正式Core不存在installChatFixture入口，确认physical .test-data/test-results均不存在。

03:34待补验清单（当前final-run-02仍冻结运行，结束前不改源码）：①P00-02 Core重启poll按125s握手预算等待并单独设置该案例准备时间；②P01-02旧“Codex连接诊断”定位更新为现有“Codex订阅账户”；③P01-03通过设置→模型连接进入“模型与用量”；④真实P05首页布局回归：新web-controls使推荐末行到composer间距70px，原8—24px门槛保持。决定仅首页把联网控制放入composer-bar按钮打开的独立dialog（dialog在composer form外，避免嵌套form）；已建会话保持来源工具条。须补首次发送前选off的真实UI用例，并回归shell-details/unified-start/P05；不通过放宽间距断言解决。

R01—R05真实模型沿用用户既有暂缓，R06搜索key pending；只做合成渠道/公开页面协议路径，不能宣称五渠道live或Tavily真实搜索已通过。标准用户/干净安装及签名安装包属于后续门禁，当前用户原生验证范围另列。原profile/窗口及历史证据保持。

## 下一步

11:35检查点：首包pack-run-01 exit1且sourcesUnchanged=true，Vitest五个原生suite未收集（0测试）：平铺node_modules/@tapkit源码的../../../resources落在node_modules/resources，不能视为隔离验证通过。失败native JSON/能力拒绝和log已复制pack-run-01/package-failure。修复仅pack脚本：包内探测保留vitest.source.config.ts原始配置并映射canonical packages源码（各project原断言/预算不变），canonical目录同时安装精确直接依赖，manifest记录别名；新probe失败立即停止，不生成成功指针。pack-fix-check exit0；pack-run-02（session47250）正在全新目录生成验证，产品源码/已验Electron保持。

04:50检查点：最后模型设置生产构建1/1及check退出0，model-run-01/results.json；e2e-coverage.json已核对114个唯一名称全部分轮通过，missing=[]。开始pack-run-01（session11105），生产build完成、复制锁定运行时中；待包内全新隔离probe和无fixture独立profile smoke后收口。

04:45检查点：uiOnly-run-01完整98项91过/7失败，连续P05路径54.8s通过；repairs-run-01五项通过（文件预览、dialog精确按钮边界+四侧hit+Enter、记忆三次重启、浏览器空正文等待异步探测、五格式保存等待后台标题稳定）。two-run-01确认960/200悬停真实pointerover命中复制SVG且tooltip open，全部后续几何断言通过；最后模型测试需显式从重启首页导航并限定.model-settings标题，model-run-01执行中。现113/114不同用例分轮通过，不能称最终全绿。final-input-audit.json确认产品源码自ui-run-01无后置变化。最终PDF正文/无主动动作及1/5/11页Poppler视觉核验退出0，pdf-final-check.log；待最后模型、pack和包内smoke。

uiOnly-run-01仍冻结执行：首页间距、附件、紧凑聊天前三种尺寸、历史/文件等实际通过。已定位四个测试准备/几何问题，批末再改：P01-03模型与用量应限定设置导航避免两链接歧义；UI-redesign末尾保存zoom后等待全局zoom=2与“展开侧栏”可见再打开文件；chat-simplify末项先等待生成停止和滚动稳定，再真实hover复制按钮（不能用focus替代hover）；dialogs最后尺寸IntersectionObserver比例0.9984而新分组截图按钮完整，补按钮精确viewport边界/原生截图与键盘Enter关闭验证，保留原dialog居中/边界断言。四份error-context待批末归档；未宣称整轮通过。

打包前最后检查：pack脚本须在包内probe成功后清理仅由本次probe新建的.test-data/test-results（核对绝对路径且不跟随junction），再生成包清单，保证实际目录中没有测试profile；该收尾只影响打包脚本，须在当前冻结应用回归结束后实施并用check/真实pack/启动证明，不能在冻结批次中途修改源码。

恢复边界复核待办：导出在progress>=85进入写盘后若Core/应用异常退出，应恢复为SIDE_EFFECT_UNKNOWN并先检查原位置，不能与尚未写盘的STREAM_INTERRUPTED同样提示重试；保留路径只在Host内存，重启历史需明确不确定状态。当前all-run-03结束后补这一出口的局部实现/集成测试，连同P05定向Electron与最终源清单收口；不重跑未受影响的原生/其他模块。

02:00—02:06空间故障恢复：all-run-01的check/build/unit370退出0，完整integration因D盘ENOSPC及Vitest崩溃退出3221226505；finally归档亦受ENOSPC中断，不计通过。备份2504个历史证据文件已核对恢复（10个本轮变更保留），sourcesUnchanged=true；results-recovered.json及原日志保留。用户清理后已读到27.6GiB，再清理本次新建的可再生测试副本，原目录/profile保持。后续矩阵按P00/P01/P02/P03-01/P03-02/P03-03/P04/P05分批，批末仅清理该批新增、已核验位于.test-data的合成目录，低于8GiB不启动新批。最后追加公开过程摘要的固定中文工具名/状态及脱敏，导出记录回显用户实际选择的文件名，待新冻结批次验收。

完成连续路径，修复本轮实际失败，执行冻结全回归、目录包及独立profile启动验收，更新需求追踪和P05-gate。不扩P06。
