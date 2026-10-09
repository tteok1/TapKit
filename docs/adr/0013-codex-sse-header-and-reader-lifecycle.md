# ADR 0013：Codex缺失响应类型与读流结束竞争

- 日期：2026-10-04（Asia/Shanghai）；状态：采用；任务：P01-01。
- 用户在显式代理配置后仍报HTTP200/unexpected_content_type。对用户独立TapKit测试profile的固定文本请求确认：响应没有Content-Type，正文为SSE。未确认响应头由服务还是代理省略，不再把该错误推定为HTML页面。

受控fetch继续限定固定Codex HTTPS endpoint及禁止重定向。明确声明其他Content-Type的成功响应仍拒绝；仅缺失/空响应类型时允许验证SSE。首个有效事件前最多容纳64Ki字符，检查SSE字段语法、JSON及Codex response.* / error类型；通过后使用原严格UTF-8、JSON、工具参数、帧大小及终结事件检查。HTML、普通JSON、无终结事件和不完整帧仍失败，不将未知页面当模型响应。规范化响应给pi声明text/event-stream。

实测同时确认：完整终结事件已读取、尾部为空，但pi在终结后取消reader时，先前等待的read返回done，规范化流再close已取消controller，异常被误报unterminated_sse。规范化流记录consumer取消，在等待read结束后及异常捕获时停止操作已取消controller。用户主动中断及真实断流保留原分类；不增加重试，不改变凭据或原生状态绑定。

诊断仅使用用户一直调试的.test-data/P01-01-live-* TapKit账户，不读取其他产品账户。原SQLite只读，凭据只读且到期前拒绝测试，不做刷新。Electron解密需要该profile的Chromium密钥：仅将DPAPI封装的encrypted_key复制到当前用户专属临时Host，原Local State及账户不写入；进程退出后删除该临时Host。诊断输出固定响应类型/结构枚举、帧数量、成功布尔值，不输出正文、token、headers、账户ID、原生状态或错误文本。

真实Luna文本与同一个checkConnection的文本/echo提议通过，ready/text=true/tools=true。没有执行工具，也没有强制刷新或注销用户正在调试的账户；两轮原生连续性、真实重启刷新/注销完整live仍待单独验收。回归及源文件指纹见missing-mime-results.json与missing-mime-2026-10-04.md；P01-01保持in_progress，P00门禁和后续任务不变。
