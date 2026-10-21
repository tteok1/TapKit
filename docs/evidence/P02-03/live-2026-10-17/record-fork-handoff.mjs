import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)),
  root = resolve(dir, '../../../..');
const reviewName = process.argv[2];
if (!/^fork-review-\d+\.json$/.test(reviewName ?? '')) throw Error('Expected fork review');
const review = JSON.parse(readFileSync(join(dir, reviewName), 'utf8'));
const fork = JSON.parse(readFileSync(join(dir, 'fork-baseline-2026-10-17.json'), 'utf8'));
if (
  review.status !== 'passed_live_scoped_selected_message_fork' ||
  !Object.values(review.checks).every(Boolean)
)
  throw Error('Fork not verified');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const db = new DatabaseSync(join(fork.dataDir, 'db/app.sqlite'), { readOnly: true });
db.function('diagnostic_sha256', hash);
let next;
try {
  db.exec('BEGIN');
  const one = (sql, ...args) => db.prepare(sql).get(...args),
    all = (sql, ...args) => db.prepare(sql).all(...args);
  const title = 'P02验收-分叉副本-1017';
  const session = one(
    'SELECT id,mode,project_id projectId,active_branch_id branchId,revision,title_manual titleManual,diagnostic_sha256(title) titleSHA256,diagnostic_sha256(note) noteSHA256,diagnostic_sha256(tags_json) tagsSHA256,archived_at archivedAt FROM sessions WHERE id=? AND deleted_at IS NULL',
    review.copy.id,
  );
  const messages = all(
    'SELECT id,branch_id branchId,parent_message_id parentId,role,status,run_id runId,revision,source_message_id sourceMessageId,diagnostic_sha256(content_json) contentSHA256 FROM messages WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,rowid',
    session.id,
  );
  const active = one(
    "SELECT count(*) n FROM runs WHERE status NOT IN('completed','partial','failed','budget_stopped','cancelled')",
  ).n;
  const conflicts = one(
    'SELECT count(*) n FROM sessions WHERE title=? AND deleted_at IS NULL',
    title,
  ).n;
  if (
    active ||
    conflicts ||
    messages.length !== 2 ||
    session.branchId !== review.copy.branchId ||
    session.revision !== review.copy.revision
  )
    throw Error('Manual title preparation not ready');
  next = {
    task: 'P02-03',
    round: 'D-manual-title',
    status: 'prepared_waiting_one_user_manual_rename',
    checkedAt: new Date().toISOString(),
    startedAfter: Date.now(),
    dataDir: fork.dataDir,
    caseId: fork.caseId,
    session,
    messages,
    branch: one(
      'SELECT id,head_message_id headMessageId,revision FROM branches WHERE id=?',
      session.branchId,
    ),
    expectedTitle: title,
    titleConflicts: conflicts,
    sourceForkAcceptance: reviewName,
    globalCounts: review.globalCounts,
    sourceSessionBaseline: 'fork-baseline-2026-10-17.json',
    instructions:
      'On the new copy only, use the left sidebar row ellipsis to open its edit dialog (or right-click -> 重命名). Change 会话标题 to the expected synthetic title and Save once. Leave and reopen to confirm it persists, both messages remain and original conversation title is unchanged. No AI rename, message send, regeneration or restart.',
    acceptance:
      'One manual sessions.update success for this copy, exact title and title_manual1, old message hashes/branch/note/tags/project preserved; no new run/model/tool/settlement. Manual title only, not automatic-title race or full FR-08-001 live acceptance.',
    agentModelRequests: 0,
    databaseWrites: 0,
    credentialOrNativeReads: 0,
    messageBodiesExported: false,
  };
  db.exec('COMMIT');
} finally {
  db.close();
}
writeFileSync(
  join(dir, 'manual-title-baseline-2026-10-17.json'),
  JSON.stringify(next, null, 2) + '\n',
  { flag: 'wx' },
);
const marker = '## 2026-10-17 成功答复分叉路径与失败提示区别确认，C有限通过';
const section = `${marker}

用户指出原会话同时显示“编辑分支成功”和响应头超时提示，副本只有成功回复。只读核对当前副本${review.copy.id}为一次sessions.fork生成的独立会话，1主分支/2条消息；按所选最终助手消息的parent链复制本轮问题与成功答复，内容SHA与规范source_message_id映射均一致。原会话3分支/10消息及7条账本hash完整保持，全局runs25/attempts41/tools2/ledger41未增加，trace没有新增attempt，空闲/无重复或未结算。C按此成功消息分叉场景有限通过，不将其他消息类型/附件/完整备份冒称已验。

超时卡片对应原失败attempt 01a14a20-e132-7787-b8ed-e2a2b4bde639，NETWORK_ERROR/response_headers_timeout、interrupted、生成正文长度0、estimated14335仍留原账本。失败和成功助手消息共用同一user父节点，互为替代尝试；失败节点不是成功消息的祖先，所以不在成功路径副本中。UI由errorCode/diagnosticCode显示固定提示，它不是额外的模型正文。此结论来自实际ID/parent/status/hash/失败字段及既有HistoryService.path/branch与ChatService重试换父规则；并非新增“过滤所有失败消息”的策略。若选择失败节点本身分叉，源码会沿它自己的路径复制；该变体本轮未真人验收，不重复制造网络故障。用户所见差异符合当前从消息分叉的语义，原失败记录未被删除，也不因副本导航重放或重复结算。

证据[分叉核对](../evidence/P02-03/live-2026-10-17/${reviewName})、同目录fork-baseline-2026-10-17.json。没有产品改动/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写，未commit/push。P02-03仍implemented_not_live_verified，P02/P01 gate保持engineering_passed_external_pending；已过A/B及P02-02范围不重测，其他渠道/协议和其他模型重答暂缓。

下一D仅手动重命名这个副本为“${next.expectedTitle}”，保存一次，离开再打开确认标题/2条问答保留、原会话标题不变；不点AI重命名或发消息。已留manual-title-baseline-2026-10-17.json的副本revision/hash/分支/全局计数，唯一标题冲突0；本步尚未执行或通过。后续搜索/组织等继续逐项，不扩P04/P05。

`;
for (const name of ['docs/progress/P02-03.md', 'docs/progress/INDEX.md']) {
  const path = join(root, name),
    text = readFileSync(path, 'utf8');
  if (text.includes(marker)) throw Error('Checkpoint already exists');
  const split = text.indexOf('\n');
  writeFileSync(
    path,
    text.startsWith('# ')
      ? text.slice(0, split + 1) + '\n' + section + text.slice(split + 1).replace(/^\s*/, '')
      : section + text,
  );
}
writeFileSync(
  join(root, 'docs/progress/CURRENT.md'),
  `# 当前接续点

- 2026-10-17：D:/Tapkit-public，main / 3178a8b；保留既有未提交内容，无本轮commit/push授权。当前P02-03智谱普通Chat/FlashX增量验收；其他渠道/协议及其他模型重答继续暂缓。
- P02-02 A队列/B立即补充/C只读闭环有限通过保留；C强当前用户ID语义not_met仍保留。P02-03 A编辑/分支切换、B同模型重生成/版本切换已有限通过，A/B不重测；B网络自动重试的estimated14335与actual1336分列。
- C成功消息分叉有限通过：新副本${review.copy.id}，1主分支/2消息的源映射与SHA一致；原会话3分支/10消息/7账本保持，全局25runs/41attempts/2tools/41ledger未增。详见docs/evidence/P02-03/live-2026-10-17/${reviewName}。
- 原超时提示是正文0的失败替代attempt，与成功回复共用user父节点，并非成功回复祖先；沿成功parent链的副本不会包含它。失败提示/账本仍在原会话，当前不是全会话/尝试树备份，也不声称已验从失败节点分叉。
- 下一D只对这个副本手动改“会话标题”为“${next.expectedTitle}”，保存一次，离开重开确认标题/2问答保留及原会话标题不变。不用AI重命名/发送/重生成或重启；manual-title-baseline-2026-10-17.json已准备，D未验。后续搜索/组织逐项。
- 本轮无产品修改/重建/重启/Agent模型请求/Key或native读取/正文导出/业务库手写。同case ${fork.caseId}，无活动任务/队列/预留/未结算/重复；exec99040退出未核对不记exit0。详细历史见INDEX/P02-03及docs/evidence。
- P02-03/P02-02仍implemented_not_live_verified，P02/P01 gate仍engineering_passed_external_pending；P00/P03已passed；原失败编辑会话同输入复验not_performed，P04真实补验及P05未开展。
`,
);
const acceptancePath = join(dir, 'acceptance.md');
const old = readFileSync(acceptancePath, 'utf8').replace(/^## 当前C/gm, '## 历史C');
const split = old.indexOf('\n');
writeFileSync(
  acceptancePath,
  old.slice(0, split + 1) +
    `\n## 当前D：副本手动命名与重新进入保留

C已核对成功消息分叉路径通过：副本只含本轮问题和成功回复；原超时记录是同问题的另一失败尝试，未在所选成功消息的祖先链内，仍留原会话/账本。原数据hash与全局执行计数保持；不需要再次分叉或制造失败。证据${reviewName}。

1. 在新副本的左侧会话条目点“⋯”，在弹窗中找到“会话标题”；也可右键该条目选“重命名”。
2. 只将标题改成“${next.expectedTitle}”，点击“保存”一次。
3. 离开该会话再打开，确认新标题、问题和“编辑分支成功”回复保留，原会话标题保持。
4. 报告标题保存和重开结果；若异常先停，不重复保存。本步不点“AI 重命名”或发送内容。

manual-title-baseline-2026-10-17.json已固定副本ID/revision/消息hash/分支/原会话基线及全局计数。仅准备，尚未D验收；不代表自动标题竞争或完整FR-08-001验收。其他渠道暂缓。

` +
    old.slice(split + 1).replace(/^\s*/, ''),
);
const reqPath = join(root, 'docs/progress/requirements.csv');
writeFileSync(
  reqPath,
  readFileSync(reqPath, 'utf8')
    .split('\n')
    .map((line) => {
      if (!line.startsWith('FR-07-015,') && !line.startsWith('FR-08-001,')) return line;
      const cells = line.replace(/\r$/, '').split(',');
      if (cells.length !== 8) throw Error('Unexpected requirement row');
      if (cells[0] === 'FR-07-015') {
        cells[5] += ';docs/evidence/P02-03/live-2026-10-17/' + reviewName;
        cells[7] +=
          ';2026-10-17成功回复沿parent路径分叉的有限live通过；副本2条问答hash/来源一致且无新模型/工具/结算；超时失败为同父替代尝试非成功祖先因此未复制而原记录/账本保留；非整会话备份或所有消息类型验收';
      } else {
        cells[5] += ';docs/evidence/P02-03/live-2026-10-17/manual-title-baseline-2026-10-17.json';
        cells[7] +=
          ';2026-10-17仅准备对既有分叉副本手动命名与离开重开保留的live基线；不调用AI命名；本步与自动标题竞争未真人验收；其他渠道和原状态保持';
      }
      return cells.join(',');
    })
    .join('\n'),
);
console.log(
  JSON.stringify({
    status: 'C_scoped_passed_D_manual_title_prepared',
    copySessionId: review.copy.id,
    expectedTitle: next.expectedTitle,
    agentModelRequests: 0,
    productChanges: 0,
  }),
);
