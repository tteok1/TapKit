import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const read = (path) => JSON.parse(readFileSync(join(dir, path), 'utf8'));
const save = (path, value) => writeFileSync(join(dir, path), JSON.stringify(value, null, 2) + '\n');
const snapshot = read('snapshot-1792229622816.json');
const trace = read('tool-trace-review-1792229622722.json');
const start = read('round-c4-start-2026-10-17.json');
const runs = snapshot.newRuns.filter((r) => r.createdAt > start.startedAfter);
const attempts = snapshot.newAttempts.filter((a) => runs.some((r) => r.id === a.runId));
if (
  runs.length !== 2 ||
  attempts.length !== 3 ||
  runs.some((r) => r.tools || r.status !== 'completed')
)
  throw Error('Unexpected C4 runs');
save('round-c4-observation-2026-10-17.json', {
  task: 'P02-02',
  round: 'C4',
  localDate: '2026-10-17',
  status: 'not_accepted_alias_fix_confirmed_but_no_upstream_tool_proposal',
  userReply: '未执行工具',
  caseId: trace.caseId,
  traceReview: 'tool-trace-review-1792229622722.json',
  snapshot: 'snapshot-1792229622816.json',
  runs,
  attempts,
  traceAttempts: trace.attempts,
  actualTokens: attempts
    .filter((a) => a.source === 'actual')
    .reduce((n, a) => n + a.chargedTokens, 0),
  estimatedTokens: attempts
    .filter((a) => a.source === 'estimated')
    .reduce((n, a) => n + a.chargedTokens, 0),
  accounting:
    'First run had one NETWORK_ERROR attempt and one automatic retry. Second run is a separate logical request. Missing-usage estimated29408 is not actual consumption or money; actual totals9680. No duplicate settlements.',
  workload: snapshot.workload,
  priorLedgerUnchanged: snapshot.priorLedgerUnchanged,
  duplicateSettlements: snapshot.duplicateSettlements,
  contextAudit: 'context-audit-1792229898556.json',
  localRegression: {
    command:
      'test:integration tests/integration/P02-02.zhipu-tools.test.ts --no-cache --fsModuleCache=false',
    exitCode: 0,
    passed: 3,
    log: 'tool-context-integration-2026-10-17.log',
    meaning:
      'Latest user content reaches serialized fetch after three prior no-tool replies; complete alias proposal still crosses real Core/router/adapter/read-gateway and settles once. This uses synthetic transport and does not explain model selection.',
  },
  check: { command: 'check', exitCode: 0, files: 444, log: 'tool-context-check-2026-10-17.log' },
  conclusions: [
    'Wire alias repair is loaded: every attempt supplies files_read/history_search.',
    'Both HTTP200 completed responses contain text/stop and zero standard tool fields; no discarded standard proposal or hidden execution evidenced.',
    'Canonical dotted names were a verified defect, but fixing them did not resolve this case. Do not claim sole causality or unsupported FlashX.',
    'Current user source references are present; SQL booleans confirm wire tool name/test query in saved inputs and no custom personal instructions. No original wire message archive exists, so exact original outgoing text is not retroactively proven.',
    'Old-session context may influence automatic tool selection; not yet established. Next control uses a newly created empty ordinary chat with exact new-session scope and unique synthetic marker, same account/model/build. No random tool_choice/thinking changes or repeated B request.',
  ],
  productChangesThisReview: false,
  buildOrRestartThisReview: false,
  agentModelRequests: 0,
  keyOrNativeBodiesRead: 0,
  messageBodiesExported: false,
  manualBusinessDatabaseWrites: 0,
  taskStatus: 'implemented_not_live_verified',
  stageStatus: 'engineering_passed_external_pending',
  next: 'waiting_user_create_empty_regular_chat_then_prepare_one_control',
});
start.status = 'not_accepted_alias_fix_confirmed_but_no_upstream_tool_proposal';
start.observation = 'round-c4-observation-2026-10-17.json';
save('round-c4-start-2026-10-17.json', start);
const section = `## 2026-10-17 C4别名已生效但仍无提议，待空白会话对照

C4同case两个独立run均completed/tools0；首run一次NETWORK_ERROR后有界重试成功，另一run独立完成。脱敏trace确认全部发送files_read/history_search，两个HTTP200响应均4帧/3文本帧/stop，没有标准工具字段或交付事件。actual合计9680，失败attempt的estimated29408不当实际消耗/费用；无活跃任务/队列/预留/重复/未结算，旧账本保持。点号错误确实存在且已修，但不是本现象的充分解释，不把当前问题说成已解决或FlashX不支持工具。

只读上下文来源指针均含本轮用户，SQL布尔确认输入含wire工具名/测试查询，无自定义个人指令；不导出正文。新增全链合成回归覆盖三次旧拒绝后最新用户原文仍完整交给fetch并执行配对工具，integration3/check444文件均退出0。它不证明真实模型为何选择不调用，也不追溯证明原wire消息原文。本轮无产品改动/重建/重启/Agent模型请求或真实Key/native正文读取/业务库手写。

下一用同账户/模型/生产构建的空白普通聊天隔离旧会话影响；仅假设、待验证。已请用户点击“新建聊天”后先不发送，待读取新session ID/零消息/无项目/唯一合成marker预检，再给一条严格新会话范围的对照请求；不在B继续重发，不猜改auto/推理或切其他渠道。新会话创建是必要用户操作，不是live通过。A/B不重测，任务implemented_not_live_verified/gate engineering_passed_external_pending保持，未commit/push。证据[本轮C4](../evidence/P02-02/live-2026-10-15/round-c4-observation-2026-10-17.json)、同目录context-audit-1792229898556.json及tool-context-integration-2026-10-17.log。

`;
for (const path of ['docs/progress/INDEX.md', 'docs/progress/P02-02.md']) {
  const file = join(root, path);
  const body = readFileSync(file, 'utf8');
  const pos = path.endsWith('INDEX.md') ? 0 : body.indexOf('## 2026-10-17 C3');
  if (pos < 0 || body.includes('## 2026-10-17 C4别名已生效'))
    throw Error('Unexpected handoff state');
  writeFileSync(file, body.slice(0, pos) + section + body.slice(pos));
}
const currentFile = join(root, 'docs/progress/CURRENT.md');
let current = readFileSync(currentFile, 'utf8');
current = current.replace(
  /^- 已打开修正版原profile，C4.*$/m,
  '- C4未通过：别名已生效，两个HTTP200仍只有文本/stop、无工具提议。actual9680，另有一次网络失败estimated29408，不能当实际消费。最新输入来源指针存在；新增旧拒绝历史后的完整发送回归integration3/check444文件通过。本轮无产品改动/重建/重启，详见同目录round-c4-observation-2026-10-17.json。',
);
current = current.replace(
  /^- P02-02仍/m,
  '- 下一：等待用户新建空白普通聊天（不发消息），只读核对新session ID/零消息/唯一marker后做一次新上下文对照；旧会话影响仅假设。沿用当前原profile/模型/构建与诊断case，不改auto/推理或继续在B盲重发。Agent模型请求/Key/native/正文导出0。\n- P02-02仍',
);
writeFileSync(currentFile, current);
const requirements = join(root, 'docs/progress/requirements.csv');
writeFileSync(
  requirements,
  readFileSync(requirements, 'utf8')
    .split(/\r?\n/)
    .map((line) => {
      if (!/^(FR-06-017|FR-07-006|FR-07-007),/.test(line)) return line;
      const fields = line.split(',');
      if (fields.length !== 8) throw Error('Unexpected CSV');
      fields[5] += ';docs/evidence/P02-02/live-2026-10-15/round-c4-observation-2026-10-17.json';
      fields[7] +=
        ';2026-10-17C4实际wire别名正确但两次HTTP200均无工具提议；点号修复非充分解释；最新输入来源指针及旧拒绝历史发送回归integration3/check444通过；本轮无产品改动或Agent模型请求；待空白普通会话对照不提升状态';
      return fields.join(',');
    })
    .join('\n'),
);
console.log('C4 observations/accounting/context limits and pending clean control recorded.');
