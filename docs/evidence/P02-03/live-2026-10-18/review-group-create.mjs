import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const b = read(join(dir, 'group-baseline-2026-10-18.json'));
const original = read(
  join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
);
if (
  b.sourceSessionBaseline !== 'docs/evidence/P02-03/live-2026-10-17/fork-baseline-2026-10-17.json'
)
  throw Error('Unexpected source baseline');
const sourceBaseline = read(join(root, b.sourceSessionBaseline));
const snapshotName = process.argv.find((a) => /^snapshot-\d+\.json$/.test(a));
const traceName = process.argv.find((a) => /^tool-trace-review-\d+\.json$/.test(a));
if (!snapshotName || !traceName) throw Error('Expected metadata report names');
const support = join(root, 'docs/evidence/P02-02/live-2026-10-15');
const snapshot = read(join(support, snapshotName));
const trace = read(join(support, traceName));
if (
  original.root !== root ||
  realpathSync(original.dataDir) !== realpathSync(b.dataDir) ||
  snapshot.dataDir !== b.dataDir ||
  snapshot.capturedAt <= b.startedAfter ||
  !trace.opened ||
  trace.caseId !== b.caseId
)
  throw Error('Unexpected profile/case/time binding');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const equal = (a, v) => JSON.stringify(a) === JSON.stringify(v);
const db = new DatabaseSync(join(b.dataDir, 'db/app.sqlite'), { readOnly: true });
db.function('diagnostic_sha256', hash);
try {
  db.exec('BEGIN');
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const id = b.session.id;
  const profileId = one('SELECT profile_id profileId FROM sessions WHERE id=?', id)?.profileId;
  if (profileId !== b.profileId || profileId !== '01a13376-d6a6-7ca5-90dd-a27bf8a7bf10')
    throw Error('Unexpected target profile');
  const session = one(
    'SELECT id,mode,project_id projectId,active_branch_id branchId,revision,title_manual titleManual,diagnostic_sha256(title) titleSHA256,diagnostic_sha256(note) noteSHA256,diagnostic_sha256(tags_json) tagsSHA256,archived_at archivedAt,deleted_at deletedAt,title=? titleMatchesExpected FROM sessions WHERE id=?',
    b.titleQuery,
    id,
  );
  const messages = all(
    'SELECT id,branch_id branchId,parent_message_id parentId,role,status,run_id runId,revision,source_message_id sourceMessageId,diagnostic_sha256(content_json) contentSHA256 FROM messages WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,rowid',
    id,
  );
  const branch = one(
    'SELECT id,head_message_id headMessageId,revision FROM branches WHERE id=? AND deleted_at IS NULL',
    session.branchId,
  );
  const sections = all(
    'SELECT id,revision,collapsed,sort_key sortKey,diagnostic_sha256(name) nameSHA256 FROM sidebar_sections WHERE profile_id=? ORDER BY id',
    profileId,
  );
  const groups = all(
    'SELECT id,revision,collapsed,sort_key sortKey,diagnostic_sha256(name) nameSHA256 FROM sidebar_sections WHERE profile_id=? AND name=?',
    profileId,
    b.groupName,
  );
  const group = groups[0];
  const sidebarItem = all(
    "SELECT entity_type type,entity_id entityId,section_id sectionId,sort_key sortKey FROM sidebar_items WHERE profile_id=? AND entity_type='session' AND entity_id=?",
    profileId,
    id,
  );
  const otherItems = all(
    "SELECT entity_type type,entity_id entityId,section_id sectionId,sort_key sortKey FROM sidebar_items WHERE profile_id=? AND NOT(entity_type='session' AND entity_id=?) ORDER BY entity_type,entity_id",
    profileId,
    id,
  );
  const groupMembers = group
    ? all(
        'SELECT entity_type type,entity_id entityId FROM sidebar_items WHERE profile_id=? AND section_id=? ORDER BY entity_type,entity_id',
        profileId,
        group.id,
      )
    : [];
  const receipts = all(
    `SELECT rowid sequence,request_id requestId,command,owner_session_id ownerSessionId,state,expires_at-86400000 recordedAt,json_extract(reply_json,'$.reply.ok') ok,json_extract(reply_json,'$.reply.data.entityId') entityId,json_extract(reply_json,'$.reply.data.updatedIds') updatedIdsJSON,json_array_length(reply_json,'$.reply.data.failed') failedCount FROM request_receipts WHERE profile_id=? AND rowid>? AND (command LIKE 'sidebar.%' OR (owner_session_id=? AND command IN('sessions.update','sessions.read'))) ORDER BY rowid`,
    profileId,
    b.receiptSequenceBaseline,
    id,
  );
  const creates = receipts.filter((r) => r.command === 'sidebar.create');
  const moves = receipts.filter((r) => r.command === 'sidebar.move');
  const updates = receipts.filter((r) => r.command === 'sessions.update');
  const succeeded = (r) => r?.state === 'completed' && r.ok === 1 && r.recordedAt > b.startedAfter;
  const projection = all(
    'SELECT entity_type type,count(*) n FROM history_search_documents WHERE session_id=? GROUP BY entity_type ORDER BY entity_type',
    id,
  );
  const messageHits = all(
    `SELECT d.entity_id id,d.entity_type type,d.session_id sessionId,d.branch_id branchId FROM history_fts f JOIN history_search_documents d ON d.rowid=f.rowid JOIN sessions s ON s.id=d.session_id WHERE history_fts MATCH ? AND d.profile_id=? AND d.session_id=? AND d.entity_type='message' AND s.deleted_at IS NULL ORDER BY d.entity_id`,
    '"' + b.messageQuery.replaceAll('"', '""') + '"',
    profileId,
    id,
  );
  const sourceLedger = all(
    'SELECT a.id attemptId,a.run_id runId,a.status,a.error_code errorCode,u.source,u.charged_tokens chargedTokens FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.run_id IN(SELECT id FROM runs WHERE session_id=?) ORDER BY a.created_at,a.id',
    sourceBaseline.sourceSession.id,
  );
  const sourceState = one(
    'SELECT diagnostic_sha256(title) titleSHA256,archived_at archivedAt,deleted_at deletedAt FROM sessions WHERE id=?',
    sourceBaseline.sourceSession.id,
  );
  const resourceState = {
    linkedResources: one(
      "SELECT count(*) n FROM resource_links WHERE owner_type='session' AND owner_id=? AND deleted_at IS NULL",
      id,
    ).n,
    attachmentRefs: one(
      "SELECT coalesce(sum(coalesce(json_array_length(chat_json,'$.attachments'),0)),0) n FROM messages WHERE session_id=? AND deleted_at IS NULL",
      id,
    ).n,
    memorySourceRefs: one(
      `SELECT count(DISTINCT m.id) n FROM memories m,json_each(m.source_ids_json) x WHERE m.profile_id=? AND m.deleted_at IS NULL AND CASE WHEN x.type='object' THEN json_extract(x.value,'$.messageId') ELSE x.value END IN(SELECT id FROM messages WHERE session_id=?)`,
      profileId,
      id,
    ).n,
  };
  const globalCounts = {
    runs: one('SELECT count(*) n FROM runs').n,
    attempts: one('SELECT count(*) n FROM provider_attempts').n,
    tools: one('SELECT count(*) n FROM tool_calls').n,
    ledger: one('SELECT count(*) n FROM usage_ledger').n,
  };
  const checks = {
    oneNamedGroupCreated:
      b.nameConflictCount === 0 &&
      groups.length === 1 &&
      sections.length === b.sections.length + 1 &&
      group.revision === 1 &&
      group.collapsed === 0,
    oneSuccessfulCreateReceipt:
      creates.length === 1 && succeeded(creates[0]) && creates[0].entityId === group?.id,
    oneSuccessfulTargetMoveReceipt:
      moves.length === 1 &&
      succeeded(moves[0]) &&
      equal(JSON.parse(moves[0].updatedIdsJSON ?? 'null'), [id]) &&
      moves[0].failedCount === 0,
    expectedSessionSaveAndReceiptOrder:
      updates.length === 1 &&
      succeeded(updates[0]) &&
      creates[0]?.sequence < updates[0].sequence &&
      updates[0].sequence < moves[0]?.sequence &&
      session.revision === b.session.revision + 1,
    singleTargetMembership:
      sidebarItem.length === 1 &&
      sidebarItem[0].sectionId === group?.id &&
      equal(groupMembers, [{ type: 'session', entityId: id }]),
    unrelatedGroupsAndMembersPreserved:
      equal(
        sections.filter((s) => s.id !== group?.id),
        b.sections,
      ) &&
      otherItems.length === b.otherSidebarItemCount &&
      hash(JSON.stringify(otherItems)) === b.otherSidebarItemsSHA256,
    noOtherGroupMutation:
      receipts.filter(
        (r) =>
          r.command.startsWith('sidebar.') &&
          !['sidebar.create', 'sidebar.move'].includes(r.command),
      ).length === 0,
    sessionMetadataPreserved: Object.keys(b.session)
      .filter((key) => key !== 'revision')
      .every((key) => session[key] === b.session[key]),
    bothMessageHashesAndBranchPreserved: equal(messages, b.messages) && equal(branch, b.branch),
    searchProjectionAndMessageIdPreserved:
      equal(projection, b.projection) &&
      messageHits.length === 1 &&
      messageHits[0].id === messages.find((m) => m.role === 'user')?.id &&
      messageHits[0].sessionId === id &&
      messageHits[0].branchId === session.branchId,
    reopenedAfterMove: receipts.some(
      (r) => r.command === 'sessions.read' && succeeded(r) && r.sequence > moves[0]?.sequence,
    ),
    resourcesPreserved: equal(resourceState, b.resourcePreflight),
    originalSourceAndLedgerPreserved:
      sourceState.titleSHA256 === sourceBaseline.sourceSession.titleSHA256 &&
      sourceState.archivedAt === null &&
      sourceState.deletedAt === null &&
      hash(JSON.stringify(sourceLedger)) === sourceBaseline.oldLedgerSHA256,
    noExecutionOrUsageChange:
      equal(globalCounts, b.globalCounts) &&
      equal(snapshot.ledgerTotals, b.ledgerTotals) &&
      trace.attempts.every((t) =>
        sourceBaseline.oldLedger.some((a) => a.attemptId === t.attemptId),
      ),
    idleNoUnsettledOrDuplicate:
      Object.values(snapshot.workload).every((n) => n === 0) &&
      snapshot.duplicateSettlements.length === 0,
    userConfirmsGroupListingAndContent: true,
  };
  const reportName = 'group-create-review-' + Date.now() + '.json';
  const report = {
    task: 'P02-03',
    round: 'H-group-create-and-move',
    localDate: '2026-10-18',
    checkedAt: new Date().toISOString(),
    status: Object.values(checks).every(Boolean)
      ? 'passed_live_scoped_group_create_and_move_rename_delete_pending'
      : 'observed_requires_review',
    checks,
    group,
    sections,
    sidebarItem,
    groupMembers,
    receipts,
    session,
    messages,
    branch,
    projection,
    messageHits,
    resourceState,
    globalCounts,
    ledgerTotals: snapshot.ledgerTotals,
    humanConfirmation: '符合预期',
    evidenceBoundary:
      'User confirms the new-group list, opening the target copy and intact title/two messages. Durable receipts, single membership and unchanged hashes corroborate this checkpoint; no complete group-filter or clicked-route telemetry is claimed.',
    limits:
      'One synthetic ordinary chat copied into one custom group via edit/save; not drag/drop, bulk move, project move, pin/reorder, group rename or deletion acceptance.',
    baseline: 'group-baseline-2026-10-18.json',
    source: 'docs/evidence/P02-02/live-2026-10-15/' + snapshotName,
    trace: 'docs/evidence/P02-02/live-2026-10-15/' + traceName,
    agentModelRequests: 0,
    databaseWrites: 0,
    credentialOrNativeReads: 0,
    messageBodiesExported: false,
  };
  if (process.argv.includes('--prepare-rename')) {
    if (!Object.values(checks).every(Boolean)) throw Error('Group creation review incomplete');
    const renamedGroupName = 'P02验收分组-1018-改名';
    const nameConflictCount = one(
      'SELECT count(*) n FROM sidebar_sections WHERE profile_id=? AND name=?',
      profileId,
      renamedGroupName,
    ).n;
    if (nameConflictCount !== 0) throw Error('Rename conflicts with existing group');
    const next = {
      task: 'P02-03',
      round: 'H-group-rename',
      localDate: '2026-10-18',
      status: 'prepared_waiting_one_user_group_rename',
      checkedAt: new Date().toISOString(),
      startedAfter: Date.now(),
      dataDir: b.dataDir,
      caseId: b.caseId,
      profileId,
      group,
      originalGroupName: b.groupName,
      renamedGroupName,
      nameConflictCount,
      session,
      messages,
      branch,
      sidebarItem,
      sections,
      otherSidebarItemCount: otherItems.length,
      otherSidebarItemsSHA256: hash(JSON.stringify(otherItems)),
      groupMembers,
      resourcePreflight: resourceState,
      globalCounts,
      ledgerTotals: snapshot.ledgerTotals,
      projection,
      titleQuery: b.titleQuery,
      messageQuery: b.messageQuery,
      receiptSequenceBaseline: one('SELECT coalesce(max(rowid),0) n FROM request_receipts').n,
      sourceSessionBaseline: b.sourceSessionBaseline,
      priorAcceptance: reportName,
      instructions:
        'Open 聊天; click the ⋯ beside the group P02验收分组-1018, change 分组名称 to P02验收分组-1018-改名 and 保存 once. Click the renamed group, open P02验收-分叉副本-1017 and confirm title/two messages. Leave the group in place and report; do not delete, move, send or regenerate yet.',
      expected:
        'Same group ID, name SHA matches prescribed new name and revision1→2, one successful sidebar.update targeting group; member identity and session revision8/metadata/messages/branch remain unchanged; zero new execution/usage. Group deletion/content return remains pending.',
      agentModelRequests: 0,
      databaseWrites: 0,
      credentialOrNativeReads: 0,
      messageBodiesExported: false,
    };
    writeFileSync(
      join(dir, 'group-rename-baseline-2026-10-18.json'),
      JSON.stringify(next, null, 2) + '\n',
      { flag: 'wx' },
    );
  }
  db.exec('COMMIT');
  writeFileSync(join(dir, reportName), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(
    JSON.stringify({
      reportPath: join(dir, reportName),
      status: report.status,
      checks,
      group,
      sidebarItem,
      receipts,
      globalCounts,
    }),
  );
} finally {
  db.close();
}
