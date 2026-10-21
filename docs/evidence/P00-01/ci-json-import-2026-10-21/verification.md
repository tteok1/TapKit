# CI JSON 导入回归修复

失败运行：[39554896228](https://github.com/tteok1/TapKit/actions/runs/39554896228)，main / 1b60d455。check及startup-diagnostics均在bootstrap失败；不是依赖下载或原生编译失败。Playwright即便指定ABI过滤也会导入所有测试模块，Node24对四处contracts的defaults.json静态导入要求显式JSON属性。原本定向文件验证未覆盖全量收集。

修复四处JSON导入，并把`playwright test --list`加入`pnpm check`，直接验证所有E2E模块能被锁定Node加载；不启动Electron。基础Electron测试另将启动等待对齐既有Host的120秒指纹校验预算，保留Chromium沙箱、白名单、非法参数及Core退出断言。

所有pnpm命令均通过项目锁定Node和`.cache/tools/pnpm/package/bin/pnpm.mjs`执行。完整命令、退出码和日志见[results.json](results.json)。初始全量发现先红后绿（0→81用例）；unit352、P00-01 integration5、真实Electron2项通过，生产桌面构建通过。工具沙箱构建EPERM/SSR缓存ENOENT与旧15秒测试失败原样保存；最终成功验证使用独立项目TEMP/TMP和工具沙箱外进程，Chromium沙箱始终开启。

历史截图已按原字节恢复；本轮截图另存本目录。未调用真实供应商、读取凭据或修改运行时安全策略；原真人验收和任务/gate状态保持。远程修复运行待提交推送后复验。
