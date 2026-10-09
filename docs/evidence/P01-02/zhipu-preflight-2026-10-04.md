# P01-02 智谱 Chat 有界诊断

- 日期：2026-10-04（Asia/Shanghai）；目录 D:/TapKit，main，HEAD 2e785316b74b3dbdb38ae68990e07652dbadbd56。
- 用户授权：仅检查已保存的智谱 Chat 测试账户；不能使用时停止，不直接改代码，先区分配置与 TapKit 问题。
- 账户位置：.test-data/P01-02-live-zhipu。SQLite 只读读取配置，没有读取或解密 Key，没有更改账户、模型 ID、代理或系统配置。

## 已观察事实

一个活动账户：provider=openai-compatible，format=openai-chat，Base URL=https://open.bigmodel.cn/api/paas/v4，model ID=GLM-4.7-Flash，status=unavailable，last_error_code=PERMISSION_DENIED。协议和基址匹配智谱官方 OpenAI 兼容接口。

本机 node:dns.lookup 对 open.bigmodel.cn 返回 198.18.1.186。当前 API 传输拒绝 198.18/15 保留地址。用未修改的 packages/providers/src/api/http.ts 在内存转换并运行，HTTPS request 替换为仅计数且拒绝执行的诊断桩；实际结果为 PERMISSION_DENIED、retryable=false、HTTP 请求数 0、keyRead=false，验证命令退出 0。这是请求前的网络策略复现，不是模型 live 通过。

源文件 SHA256：3c989c3f6cb92ee74c9d228f6ed57cf9dc349ad899ecac360106bac61c51ce5c。

## 命令与结果

- 锁定 Node + node:sqlite DatabaseSync readOnly 配置查询：退出 0，只输出非秘密配置和状态。
- 锁定 Node + node:dns/promises.lookup：DNS 检查成功；同一 PowerShell 单元的 Get-CimInstance 因权限拒绝，使该单元最终退出 1。未读取进程环境或凭据。
- 尝试载入 providers/dist/index.cjs：退出 1，产物不存在，未执行请求。
- 尝试使用 TypeScript 包的 transpileModule：退出 1，当前 TypeScript 7 包无预期 ScriptTarget API，未执行请求。
- 最终无磁盘产物、无 HTTP 的当前源文件诊断：退出 0，实际命令如下。

```powershell
& '.runtime/node/node-v24.21.0-win-x64/node.exe' --disable-warning=ExperimentalWarning -e 'const fs=require("node:fs"),path=require("node:path"),mod=require("node:module"),https=require("node:https");let requests=0;https.request=()=>{requests++;throw new Error("DIAGNOSTIC_NO_HTTP");};mod.syncBuiltinESMExports();const source=path.resolve("packages/providers/src/api/http.ts");const js=mod.stripTypeScriptTypes(fs.readFileSync(source,"utf8"),{mode:"transform",sourceUrl:source});(async()=>{const {isPublicAddress,secureApiFetch}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));const {lookup}=require("node:dns/promises");const dns=await lookup("open.bigmodel.cn",{all:true,verbatim:true});console.log(JSON.stringify({step:"dns-policy",addresses:dns.map(x=>({address:x.address,public:isPublicAddress(x.address)}))}));try{await secureApiFetch("https://open.bigmodel.cn/api/paas/v4/chat/completions",{method:"POST",body:"{}",signal:AbortSignal.timeout(5000)});console.log(JSON.stringify({unexpectedSuccess:true,requests}));process.exitCode=1;}catch(e){console.log(JSON.stringify({step:"TapKit-preflight",code:e.detail?.code??"UNKNOWN",retryable:e.detail?.retryable,httpRequests:requests,keyRead:false}));process.exitCode=(e.detail?.code==="PERMISSION_DENIED"&&requests===0)?0:1;}})().catch(()=>{console.log(JSON.stringify({setupFailed:true}));process.exitCode=1;});'
```

```json
{"step":"dns-policy","addresses":[{"address":"198.18.1.186","public":false}]}
{"step":"TapKit-preflight","code":"PERMISSION_DENIED","retryable":false,"httpRequests":0,"keyRead":false}
```

## 判定与停止点

确定存在 TapKit API 网络策略与本机 Fake-IP DNS 的兼容阻断，并能复现账户记录的同类错误。尚未到达智谱，不能判定 Key 无效、余额不足、服务端模型权限或大小写接受规则；不能把这次预检当文本/工具验收。没有继续尝试、发送 Key、执行模型请求或修改业务代码。P01-02 保持 implemented_not_live_verified，P01 gate 保持 engineering_passed_external_pending，R13 仅更新 configured（用户已保存一个 Chat 账户），R14 与原四 API 资源仍 pending。

官方发布记录使用模型编码 glm-4.7-flash；本次账户是大写 GLM-4.7-Flash，是否被服务接受待网络通路到位后验证，不擅自改配置。发布记录不替代当前账户的可用性测试。

- [智谱官方 GLM-4.7-Flash 发布及模型编码](https://www.zhipuai.cn/zh/news/148)
- [智谱官方 OpenAI 兼容接口](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction)

交接检查：锁定 Node 执行 scripts/docs-check.mjs 退出 0，37 个任务状态及证据链接检查通过；git diff --check 无错误。诊断前后 api/http.ts SHA256 相同，Git 改动仅本报告和进度/资源/需求记录。

下一步仅提供恢复路线供用户决定：在代理软件将 open.bigmodel.cn 排除 Fake-IP、返回真实公网 DNS，或另行设计保持目的地与凭据约束的代理适配。不能关闭私网检查后直接验收。网络解决后再进行一次有界真实请求；当前没有证明另一个原因不存在。
