# CI JSON 导入回归修复

最终代码提交为04d5bf9、46e4e81，均已推送main。[CI39560228079](https://github.com/tteok1/TapKit/actions/runs/39560228079)的check与startup-diagnostics全部success：unit352、integration342、perf2、Electron47、独立标准用户、Office六轮及三轮storage/vault复测通过。[最终记录](final-verification.json)与源码SHA绑定实际接受验证的46e4；两个旧UI定位已同步到保留的topbar实际自动标题与引用来源标签，其余行为断言保持。

失败运行：[39554896228](https://github.com/tteok1/TapKit/actions/runs/39554896228)，main / 1b60d455。check及startup-diagnostics均在bootstrap失败；不是依赖下载或原生编译失败。Playwright即便指定ABI过滤也会导入所有测试模块，Node24对四处contracts的defaults.json静态导入要求显式JSON属性。原本定向文件验证未覆盖全量收集。

修复四处JSON导入，并把`playwright test --list`加入`pnpm check`，直接验证所有E2E模块能被锁定Node加载；不启动Electron。基础Electron测试另将启动等待对齐既有Host的120秒指纹校验预算，保留Chromium沙箱、白名单、非法参数及Core退出断言。

所有pnpm命令均通过项目锁定Node和`.cache/tools/pnpm/package/bin/pnpm.mjs`执行。完整命令、退出码和日志见[results.json](results.json)。初始全量发现先红后绿（0→81用例）；unit352、P00-01 integration5、真实Electron2项通过，生产桌面构建通过。工具沙箱构建EPERM/SSR缓存ENOENT与旧15秒测试失败原样保存；最终成功验证使用独立项目TEMP/TMP和工具沙箱外进程，Chromium沙箱始终开启。

额外本机同CI过滤整轮实际exit1：33通过/14失败，13处旧15秒core-status等待、1处全用例45秒预算；[失败记录](local-full-result.json)保留，不能记本机全绿。这与远端最终47项全部通过分别记录。

历史截图已按原字节恢复，生产finally构建成功；本轮新截图另存，只有原用户Electron进程组在。未调用真实供应商、提取凭据或修改运行时安全策略；原真人验收和任务/gate状态保持。接受验证后只更新docs中的证据与交接，源码和测试保持46e4；文档提交使用`[skip ci]`，避免重复执行同一源码的整条流水线。
