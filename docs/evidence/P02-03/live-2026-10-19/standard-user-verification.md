# 本机附件前置的标准用户验证

**用户最新决定：本项暂缓，不运行下述脚本。** 当前先完成管理员账户批测；源码已按ADR0055更新，旧seed不再证明当前目录。以下保留为当时准备记录。

用户已确认有现成非管理员 Windows 账户。当前只准备独立副本，尚未执行或通过该账户的验证；原附件仍为解析失败，原工程验收状态不变。

使用既有 `scripts/standard-user-kit.mjs` 复制当前源码、固定 helper 和锁定运行时，不复制原验收 profile、聊天、API Key/vault、原业务库、Git、旧测试数据或 node_modules。运行时及固定探测源码用原 `executionFingerprint` 校验原目录复制前后和副本一致。准备记录为本目录 `standard-user-seed-preparation.json`。

## 用户操作

1. 切换并登录现有的非管理员 Windows 账户，正常打开 PowerShell。
2. 执行一次：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\TapKit\.test-data\P02-standard-user-20261019-4f9e\run-standard-user.ps1"
   ```

3. 等待末尾 `RESULT=PASS` 或 `RESULT=FAIL`。首次需联网下载锁定 npm 依赖；保留窗口和全部验证文件，切回原 Windows 账户后回报末尾结果。失败也只回报一次，不反复重跑。

这份副本不需要打开 TapKit 或配置模型账户。脚本不请求 Windows 密码，不创建系统账户，不修改系统策略或手工放宽原目录 ACL。固定原生测试仍会按既定设计创建/回收临时 AppContainer 和限定 ACL 租约。

## 实际运行范围和回执

入口只接受不属于 Administrators 组且 medium integrity 的登录账户；管理员组的普通 UAC 窗口也会被拒绝。以该账户在 LOCALAPPDATA 创建新副本并拥有其文件，依赖使用独立 store、冻结锁文件和 ignore-scripts 安装，然后依次执行既有 native 模块校验、固定解析器构建、原 `runtime-probe.mjs`（22 项）和原 `p03-parser-probe.mjs`（3 项）。未运行 P03-02 预览或模型调用；未重跑已通过的 P02 人工功能。

要求原生 22/22、解析 3/3、失败/待执行/缺项均零、standardUser=true、三能力 available、复制及结束 fingerprint 保持。脚本只汇总真实探测产物，不改写可用标记或放宽门禁；失败即停止依赖步骤。结果汇总和探测日志返回到 seed 下 `returns/<本次ID>/`，该目录由普通继承权限访问，不额外授予权限；日志中的验证副本和账户主目录路径脱敏，原/导出 SHA 和是否脱敏均记录。

`PASS` 只表示该标准用户验证副本的隔离/解析前置通过。Agent 仍需核对回传报告、原目录当前运行时指纹及解析器 hash/适用边界，再决定原应用的恢复动作；脚本不自动安装原目录 capabilities、不改原业务库、不启动原应用。附件验收须在原应用恢复后对已保存原件执行一次“重试内容读取”并检查结果，当前不提前标通过。
