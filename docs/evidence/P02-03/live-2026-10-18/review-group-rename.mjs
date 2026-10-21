import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const b = read(join(dir, 'group-rename-baseline-2026-10-18.json'));
if (
  b.sourceSessionBaseline !== 'docs/evidence/P02-03/live-2026-10-17/fork-baseline-2026-10-17.json'
)
  throw Error('Unexpected source baseline');
const sourceBaseline = read(join(root, b.sourceSessionBaseline));
const original = read(
  join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
);
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
// Match only the prescribed synthetic rename and boolean group controls, using
// the same canonical request hash as packages/storage/src/foundation.ts:receipt.
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [c]) => a.localeCompare(c))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;
const requestHash = (payload, expectedRevision) =>
  hash(JSON.stringify(canonical({ command: 'sidebar.update', payload, expectedRevision })));
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
  const group = sections.find((s) => s.id === b.group.id);
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
  const groupMembers = all(
    'SELECT entity_type type,entity_id entityId FROM sidebar_items WHERE profile_id=? AND section_id=? ORDER BY entity_type,entity_id',
    profileId,
    b.group.id,
  );
  const rawReceipts = all(
    `SELECT rowid sequence,request_id requestId,command,payload_hash payloadHash,owner_session_id ownerSessionId,state,expires_at-86400000 recordedAt,json_extract(reply_json,'$.reply.ok') ok,json_extract(reply_json,'$.reply.data.updatedIds') updatedIdsJSON,json_array_length(reply_json,'$.reply.data.failed') failedCount FROM request_receipts WHERE profile_id=? AND rowid>? AND (command LIKE 'sidebar.%' OR (owner_session_id=? AND command IN('sessions.update','sessions.read','sessions.trash','sessions.archive'))) ORDER BY rowid`,
    profileId,
    b.receiptSequenceBaseline,
    id,
  );
  const groupUpdates = rawReceipts
    .filter((r) => r.command === 'sidebar.update')
    .map((r, i) => {
      const expectedRevision = b.group.revision + i;
      const matches = [
        ['prescribed_rename', { sectionId: b.group.id, name: b.renamedGroupName }],
        ['collapse', { sectionId: b.group.id, collapsed: true }],
        ['expand', { sectionId: b.group.id, collapsed: false }],
      ]
        .filter(([, payload]) => requestHash(payload, expectedRevision) === r.payloadHash)
        .map(([kind]) => kind);
      const { payloadHash: _, ...safe } = r;
      return { ...safe, expectedRevision, fingerprintMatches: matches };
    });
  const receipts = rawReceipts.map(({ payloadHash: _, ...safe }) => safe);
  const succeeded = (r) => r?.state === 'completed' && r.ok === 1 && r.recordedAt > b.startedAfter;
  const projection = all(
    'SELECT entity_type type,count(*) n FROM history_search_documents WHERE session_id=? GROUP BY entity_type ORDER BY entity_type',
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
    sameGroupWithPrescribedNewName:
      !!group &&
      group.nameSHA256 === hash(b.renamedGroupName) &&
      group.sortKey === b.group.sortKey &&
      sections.length === b.sections.length,
    oneRenameAndExplainedCollapseExpand:
      equal(
        groupUpdates.map((r) => r.fingerprintMatches),
        [['prescribed_rename'], ['collapse'], ['expand']],
      ) &&
      group?.revision === b.group.revision + groupUpdates.length &&
      group.collapsed === b.group.collapsed,
    allThreeTargetUpdatesSuccessful:
      groupUpdates.length === 3 &&
      groupUpdates.every(
        (r) =>
          succeeded(r) &&
          equal(JSON.parse(r.updatedIdsJSON ?? 'null'), [b.group.id]) &&
          r.failedCount === 0,
      ),
    noOtherGroupOrSessionMutation:
      receipts.filter((r) => r.command !== 'sidebar.update' && r.command !== 'sessions.read')
        .length === 0,
    targetAndUnrelatedMembershipPreserved:
      equal(sidebarItem, b.sidebarItem) &&
      equal(groupMembers, b.groupMembers) &&
      equal(
        sections.filter((s) => s.id !== b.group.id),
        b.sections.filter((s) => s.id !== b.group.id),
      ) &&
      otherItems.length === b.otherSidebarItemCount &&
      hash(JSON.stringify(otherItems)) === b.otherSidebarItemsSHA256,
    sessionRevisionAndMetadataPreserved: equal(session, b.session),
    bothMessageHashesAndBranchPreserved: equal(messages, b.messages) && equal(branch, b.branch),
    projectionPreserved: equal(projection, b.projection),
    reopenedAfterRenameAndControls: receipts.some(
      (r) =>
        r.command === 'sessions.read' && succeeded(r) && r.sequence > groupUpdates.at(-1)?.sequence,
    ),
    resourceReferencesPreserved: equal(resourceState, b.resourcePreflight),
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
    userConfirmsRenamedListingAndContent: true,
  };
  const reportName = 'group-rename-review-' + Date.now() + '.json';
  const report = {
    task: 'P02-03',
    round: 'H-group-rename',
    localDate: '2026-10-18',
    checkedAt: new Date().toISOString(),
    status: Object.values(checks).every(Boolean)
      ? 'passed_live_scoped_group_rename_delete_pending'
      : 'observed_requires_review',
    checks,
    group,
    sections,
    sidebarItem,
    groupMembers,
    groupUpdates,
    receipts,
    session,
    messages,
    branch,
    projection,
    resourceState,
    globalCounts,
    ledgerTotals: snapshot.ledgerTotals,
    humanConfirmation: '符合预期',
    evidenceBoundary:
      'User confirms renamed group listing, opening the same copy and intact title/two messages. Canonical receipt hashes exactly match the prescribed synthetic rename at revision1, collapse(true) at revision2 and expand(false) at revision3. Only match labels, IDs and public metadata are exported; no complete UI route telemetry is claimed.',
    limits:
      'One custom group and one synthetic ordinary chat. Final group revision4 is explained by one rename and collapse/expand controls; not three renames. Group deletion/content return is still pending; no batch/project/drag/reorder acceptance.',
    baseline: 'group-rename-baseline-2026-10-18.json',
    source: 'docs/evidence/P02-02/live-2026-10-15/' + snapshotName,
    trace: 'docs/evidence/P02-02/live-2026-10-15/' + traceName,
    agentModelRequests: 0,
    databaseWrites: 0,
    credentialOrNativeReads: 0,
    messageBodiesExported: false,
  };
  if (process.argv.includes('--prepare-delete')) {
    if (!Object.values(checks).every(Boolean)) throw Error('Group rename review incomplete');
    const next = {
      task: 'P02-03',
      round: 'H-group-delete-preserve-chat',
      localDate: '2026-10-18',
      status: 'prepared_waiting_one_user_group_delete_and_default_list_open',
      checkedAt: new Date().toISOString(),
      startedAfter: Date.now(),
      dataDir: b.dataDir,
      caseId: b.caseId,
      profileId,
      group,
      groupName: b.renamedGroupName,
      session,
      messages,
      branch,
      sidebarItem,
      sections,
      groupMembers,
      otherSidebarItemCount: otherItems.length,
      otherSidebarItemsSHA256: hash(JSON.stringify(otherItems)),
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
        'Open 聊天, click the ⋯ beside group P02验收分组-1018-改名, then 删除分组，内容回到默认列表 once. Verify the group disappears; select 默认列表 and open P02验收-分叉副本-1017, confirming its unchanged title/two messages. Report; no session deletion, trash action, send/regeneration or restart.',
      expected:
        'One sidebar.remove receipt for the same group ID/revision4; group row removed, sidebar_items.section_id NULL via ON DELETE SET NULL, copy remains active/unarchived/not deleted at session revision8; title/messages/branch/index/resource refs/source ledger/global executions and usage unchanged. This preparation is not deletion acceptance.',
      agentModelRequests: 0,
      databaseWrites: 0,
      credentialOrNativeReads: 0,
      messageBodiesExported: false,
    };
    writeFileSync(
      join(dir, 'group-delete-baseline-2026-10-18.json'),
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
      groupUpdates,
      globalCounts,
    }),
  );
} finally {
  db.close();
}
