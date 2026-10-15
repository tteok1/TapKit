import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const evidence = dirname(fileURLToPath(import.meta.url));
const root = resolve(evidence, '../../../..');
const manifest = JSON.parse(readFileSync(join(evidence, 'app-preparation.json'), 'utf8'));
const dataDir = resolve(manifest.dataDir);
if (
  dirname(dataDir) !== join(root, '.test-data') ||
  !basename(dataDir).startsWith('P01-02-app-zhipu-chat-')
)
  throw new Error('Unexpected application profile');

// Only public columns, derived text statistics, and file existence are inspected.
// No credential columns, encrypted bytes, message bodies, or native bodies are exported.
const db = new DatabaseSync(join(dataDir, 'db/app.sqlite'), { readOnly: true });
const all = (sql) => db.prepare(sql).all();
let report;
try {
  db.exec('BEGIN');
  report = {
    checkedAt: new Date().toISOString(),
    task: 'P01-02',
    dataDir,
    readOnly: true,
    credentialRead: false,
    nativeContentRead: false,
    modelRequests: 0,
    accounts: all(`SELECT id accountId,provider_id providerId,api_format apiFormat,
      base_url baseURL,model_id modelId,status,last_check_at lastCheckAt,
      last_error_code lastErrorCode FROM provider_accounts WHERE deleted_at IS NULL`),
    ledger: all(`SELECT u.provider_attempt_id attemptId,a.run_id runId,
      a.root_run_id rootRunId,a.logical_call_id logicalCallId,a.attempt_no attemptNo,
      a.status,a.error_code errorCode,a.model_ref modelRef,a.created_at attemptCreatedAt,
      u.created_at settledAt,u.input_tokens inputTokens,u.output_tokens outputTokens,
      u.cached_input_tokens cachedSubset,u.reasoning_tokens reasoningSubset,
      u.charged_tokens chargedTokens,u.source,u.amount_micros amountMicros,
      a.native_state_ref IS NOT NULL hasNativeRef,
      EXISTS(SELECT 1 FROM messages m WHERE m.provider_attempt_id=a.id
        AND m.role='assistant' AND m.deleted_at IS NULL) hasAssistantMessage
      FROM usage_ledger u JOIN provider_attempts a ON a.id=u.provider_attempt_id
      ORDER BY u.created_at`),
    runs: all(`SELECT id,session_id sessionId,status,status_reason statusReason,
      cancel_requested_at cancelRequestedAt,created_at createdAt,started_at startedAt,
      ended_at endedAt,calls,tools FROM runs WHERE deleted_at IS NULL ORDER BY created_at`),
    titleJobs: all(`SELECT session_id sessionId,run_id runId,status FROM title_jobs`),
    assistantFormatting: all(`SELECT m.id,m.run_id runId,m.status,
      m.provider_attempt_id attemptId,
      length(group_concat(json_extract(j.value,'$.text'),char(10))) characterCount,
      length(group_concat(json_extract(j.value,'$.text'),char(10)))-
        length(replace(group_concat(json_extract(j.value,'$.text'),char(10)),char(10),'')) newlineCount,
      length(group_concat(json_extract(j.value,'$.text'),char(10)))-
        length(replace(group_concat(json_extract(j.value,'$.text'),char(10)),',','')) commaCount,
      group_concat(json_extract(j.value,'$.text'),char(10))=a.public_text matchesAttemptText
      FROM messages m JOIN json_each(m.content_json,'$.blocks') j
      LEFT JOIN provider_attempts a ON a.id=m.provider_attempt_id
      WHERE m.role='assistant' AND m.deleted_at IS NULL
      GROUP BY m.id ORDER BY m.created_at`),
    budgets: all(`SELECT owner_kind ownerKind,owner_id ownerId,used_tokens usedTokens,
      reserved_tokens reservedTokens FROM budgets WHERE deleted_at IS NULL
      ORDER BY owner_kind,owner_id`),
    opaqueBindings: all(`SELECT id,account_id accountId,model_ref modelRef,
      adapter_version adapterVersion,branch_id branchId,cipher_blob_ref blobRef,
      created_at createdAt,length(content_hash)=64 hashPresent
      FROM opaque_states WHERE deleted_at IS NULL`).map((row) => ({
      ...row,
      expectedEncryptedFileExists: existsSync(join(dataDir, 'secrets', 'opaque-' + row.blobRef)),
    })),
    runDeltaCounts: all(`SELECT json_extract(payload_json,'$.payload.runId') runId,count(*) count
      FROM events WHERE event_type='message.delta'
      GROUP BY json_extract(payload_json,'$.payload.runId')`),
    ledgerTotals: all(`SELECT count(*) entries,sum(charged_tokens) chargedTokens,
      sum(CASE source WHEN 'actual' THEN 1 ELSE 0 END) actualEntries,
      sum(CASE source WHEN 'estimated' THEN 1 ELSE 0 END) estimatedEntries FROM usage_ledger`),
    unsettledAttempts: all(`SELECT status,count(*) count FROM provider_attempts
      WHERE id NOT IN (SELECT provider_attempt_id FROM usage_ledger) GROUP BY status`),
    duplicateSettlements: all(`SELECT provider_attempt_id attemptId,count(*) count
      FROM usage_ledger GROUP BY provider_attempt_id HAVING count(*)>1`),
  };
  db.exec('ROLLBACK');
} finally {
  db.close();
}
const output = join(evidence, 'app-public-state-' + Date.now() + '.json');
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(
  JSON.stringify({
    reportPath: output,
    ledgerTotals: report.ledgerTotals,
    titleJobs: report.titleJobs,
  }),
);
