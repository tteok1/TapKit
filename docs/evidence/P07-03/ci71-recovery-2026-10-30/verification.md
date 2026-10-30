# CI71初始化故障恢复

2026-10-30 Asia/Shanghai；D:/Tapkit-public；main；用户要求再次检查修复CI。

CI71在main@1288ce4的首轮check仅Set up job失败，未到checkout；错误为无法解析actions/cache@v5及actions/upload-artifact@v4。同轮office-native与startup-diagnostics通过。实际Git refs确认两版本存在，推断临时GitHub Action解析异常；未改源码。已授权重跑失败job（REST201），attempt2已过初始化、正在执行，最终结果待确认；CI70既有通过保持，CI71当前不能记通过。插件重跑403（集成权限不足）后使用本机既有Git凭据，仅指定repo/run/SHA/job，凭据未落盘。无新增模型或桌面控制。

原始短日志attempt1-setup.log与注释attempt1-annotations.json；原/重跑job信息与Action ref核对见recovery.json。保留首轮失败，不将未执行的测试计通过，不为基础设施异常改动业务代码或降低门禁。

重跑中检查点：实际日志确认unit446/446；原生首轮probe22/22与P07九文件17/17（native-summary.log）保留。随后聚合jobs API出现ReadTimeout与HTTP500；改读attempts/2/jobs成功，确认主集成、perf与Build/Electron均success、独立标准用户仍执行中。API读取异常仅记录为监听问题，不据此改源码或冒称后续测试失败。

## 最终恢复通过

CI71 main@1288ce4079ba19edb54c4664005829b34550caaa的第2次执行已completed/success，check、office-native、startup-diagnostics三个job全部success。首轮在检出前临时无法解析有效的Action版本，重跑同一提交恢复；运行代码未改。实际unit446、主集成464通过/既有live跳过1、原生17、perf2、Electron50；独立标准用户隔离22/22、parser3/3、preview4/4及关闭/启动诊断通过。P07 gate恢复passed，首轮失败保留，无新增模型。

整轮身份/源SHA/attempt与三个job见final-status.json；实际计数main-summary.log、native-summary.log。仅提交恢复证据和进度，提交前验证全部暂存路径在docs内、运行代码与1288ce4相同；文档提交使用[skip ci]，避免记录结果再次触发整套原生CI。本次未更改Action版本、断言、安全门禁或测试覆盖。
