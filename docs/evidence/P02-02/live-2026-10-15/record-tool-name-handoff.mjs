import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const save = (path, value) => writeFileSync(join(root, path), value);
const prefix = 'docs/evidence/P02-02/live-2026-10-15/';
const marker = '## 2026-10-17 C3边界已定位，工具名契约修复，等待C4';
const section = `${marker}

C3用户仍回复“未执行工具”。case 01a148d5-78ba-7c16-a063-4deeacafe15f关联run 01a148d8-f09e-70ac-b585-d31b07f723a7/attempt 01a148d8-f1b8-7313-b506-4d1778969ebe：真实序列化请求带files.read/history.search，HTTP200/4个已解析SSE帧/3个文本帧/stop，没有标准工具字段或归一化tool_end；DB completed/1回合/tools0、actual4768，账本无重复/未结算/预留。C3不通过，不是界面隐藏了已执行工具，也没有标准tool_calls被解析器丢弃的证据。

核对智谱官方FunctionObject.name规则^[a-zA-Z0-9_-]+$、1—64，确认带点号的内部名称直接发送是本地接口契约错误。按ADR0053仅精确智谱普通Chat在声明/assistant历史/私有前缀中转为files_read/history_search/knowledge_query，响应仅按本次实际声明解码后沿用完整参数/网关权限校验；canonical/账本/callId不变。旧/新合成native前缀经新Adapter实例恢复均通过，幂等兼容处理保留schema/binding版本，不读取真实native或改写历史。无tool_choice/模型/预算/重试/用户设置变化；trace仅新增三个固定wire别名。此修复不证明点号是上游不调用的唯一原因或FlashX不支持工具。

两项完整Core回归先红后绿；最终unit76/integration6/check443文件/build:desktop及原目录生产UI公开读退出0，UI显示原账户1/B会话12条。用户确认退出后仍有上次精确进程残留，空闲快照确认后仅停止该main；旧启动器exit1保留，不冒称正常退出。新生产UI诊断正常关闭。8源码/619产物重新绑定，旧构建摘要保留。Agent模型请求/Key/native正文/聊天正文读取及业务库手写0。

已打开原profile修正版，case 01a148e1-f1f9-7112-af33-833873fe91e9的opened且attempts0回执已核对，启动进程95232仍等待退出。下一仅用户按acceptance.md当前C4发一次history_search，Agent检查完整提议→canonical网关→配对结果→终答及结算，不通过就停，不继续盲重发。A/B已验范围保留，其他真人渠道/协议继续暂缓；P02-02=implemented_not_live_verified，gate=engineering_passed_external_pending，未commit/push。

证据[本轮C3观察](../evidence/P02-02/live-2026-10-15/round-c3-observation-2026-10-17.json)、[工具名修复](../evidence/P02-02/live-2026-10-15/tool-name-fix-2026-10-17.json)、同目录round-c4-start-2026-10-17.json及official-tool-name-contract-2026-10-17.json。

`;
for (const path of ['docs/progress/INDEX.md', 'docs/progress/P02-02.md']) {
  const current = read(path);
  if (current.includes(marker)) throw Error('Handoff already present');
  const anchor = path.endsWith('INDEX.md') ? 0 : current.indexOf('## 2026-10-17 C2');
  if (anchor < 0) throw Error('Missing task insertion point');
  save(path, current.slice(0, anchor) + section + current.slice(anchor));
}
const oldCurrent = read('docs/progress/CURRENT.md');
const archive = prefix + 'current-before-tool-name-fix-2026-10-17.md';
if (existsSync(join(root, archive))) throw Error('Current archive already exists');
save(archive, oldCurrent);
save(
  'docs/progress/CURRENT.md',
  `# 当前接续点

- 2026-10-17：D:/Tapkit-public，main / 3178a8b，保留本轮未提交代码/脚本/记录。仅P02-02智谱普通Chat/FlashX增量补验；其他真人渠道/协议继续暂缓，无commit/push授权。
- A队列用户验收通过；B立即补充前台通过，同root/taskVersion2。既有通过内容不重测。标题原root遗漏已修，历史账本不改，旧记录见INDEX/P02-02。
- C3仍tools0/actual4768。真实trace确认发送了files.read/history.search，HTTP200仅文字/stop，无标准工具提议；不是已执行记录隐藏。官方函数名规则不允许点号，已按ADR0053仅在智谱Chat转换合法wire别名并严格解码，不扩权限或改变auto/预算/重试；不能据此断言唯一根因。
- 修复unit76/integration6/check443文件/build:desktop/原目录生产UI均退出0；原账户1/B会话12条保留。8源码/619产物绑定，Core无fixture；旧/新合成native前缀续接通过，schema/binding兼容。详见docs/evidence/P02-02/live-2026-10-15/tool-name-fix-2026-10-17.json及round-c3-observation-2026-10-17.json。
- 已打开修正版原profile，C4 case 01a148e1-f1f9-7112-af33-833873fe91e9已确认opened/attempts0。下一仅用户在原B会话按acceptance.md当前C4发送一次，Agent读脱敏trace与公开账本核对闭环；仍无调用就停。启动进程95232等待退出，不记exit0。Agent模型请求/Key/native/聊天正文读取0。
- P02-02仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending；P00/P03已passed。P02-03/P04补验及P05未开展。原空列表的dev底层原因仍未定，生产入口与数据已核对。
- 更早接续原文完整归档至docs/evidence/P02-02/live-2026-10-15/current-before-tool-name-fix-2026-10-17.md；历史与详细交接见INDEX.md及当前任务记录。
`,
);
const requirements = read('docs/progress/requirements.csv')
  .split(/\r?\n/)
  .map((line) => {
    if (!/^(FR-06-017|FR-07-006|FR-07-007),/.test(line)) return line;
    const fields = line.split(',');
    if (fields.length !== 8) throw Error('Unexpected requirement fields');
    fields[5] +=
      ';' +
      prefix +
      'round-c3-observation-2026-10-17.json;' +
      prefix +
      'tool-name-fix-2026-10-17.json;' +
      prefix +
      'round-c4-start-2026-10-17.json';
    fields[7] +=
      ';2026-10-17C3 trace确认已带工具但HTTP200只有文本无标准提议；官方工具名规则排除点号；ADR0053修复智谱Chat别名兼容且unit76/integration6/check443/build/UI通过；不能认定唯一根因或live通过；原profile修正版已开待C4一次用户核验；A/B不重测且其他渠道暂缓';
    return fields.join(',');
  })
  .join('\n');
save('docs/progress/requirements.csv', requirements);
const caseInfo = JSON.parse(read(prefix + 'tool-trace-current.json'));
const prompt = read(prefix + 'acceptance.md').match(/```text\r?\n([\s\S]*?)\r?\n\s*```/)[1];
save(
  prefix + 'round-c4-start-2026-10-17.json',
  JSON.stringify(
    {
      task: 'P02-02',
      round: 'C4',
      localDate: '2026-10-17',
      status: 'waiting_user_one_alias_repair_attempt_app_open',
      caseId: caseInfo.caseId,
      readiness: 'tool-trace-review-1792224143685.json',
      baseline: 'snapshot-1792224143778.json',
      startedAfter: 1792224143778,
      targetSessionId: '01a1442b-3b71-78b6-b3a3-f47c8df370cf',
      prompt,
      sourceReview: 'reviewed-source-tool-names-2026-10-17.json',
      verifiedBuild: 'verified-build-tool-names-2026-10-17.json',
      requestBudget:
        'One user send; existing root/time/usage caps and retry policy unchanged. No agent live requests.',
      instructions:
        'Use reopened original-profile production app and existing B session/account. No recheck/reconfiguration/A-B repeats. Stop after response even on tools0; then agent correlates trace with canonical gateway/result/answer/settlement.',
      startupProcess: {
        execSession: 95232,
        status: 'running_waiting_normal_app_exit',
        exitCode: null,
      },
      agentModelRequests: 0,
      secretOrMessageBodiesExported: false,
    },
    null,
    2,
  ) + '\n',
);
console.log('C3/fix/C4 handoff recorded; original CURRENT archived intact.');
