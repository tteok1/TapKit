import { readReview, reviewedSource, rendererFingerprint } from './build-review.mjs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, realpathSync, existsSync } from 'node:fs';
import { dirname, basename, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accountPreflight } from './account-preflight.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../../..');
const mode = process.argv[2];
if (!['prepare', 'check', 'snapshot'].includes(mode))
  throw Error('Expected prepare/check/snapshot');
const manifest = JSON.parse(
  readFileSync(
    join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
    'utf8',
  ),
);
const dataDir = realpathSync(manifest.dataDir);
if (
  manifest.root !== root ||
  dirname(dataDir) !== join(root, '.test-data') ||
  !basename(dataDir).startsWith('P01-02-app-zhipu-chat-')
)
  throw Error('Unexpected isolated profile');
const database = realpathSync(join(dataDir, 'db/app.sqlite'));
const child = relative(dataDir, database);
if (!child || child.startsWith('..') || isAbsolute(child)) throw Error('Unexpected database path');
const baselinePath = join(directory, 'baseline.json');
const baseline = mode === 'prepare' ? null : JSON.parse(readFileSync(baselinePath, 'utf8'));
if (mode === 'prepare' && existsSync(baselinePath))
  throw Error('Baseline already exists; use check');
if (baseline && baseline.dataDir !== dataDir) throw Error('Baseline profile mismatch');
const capturedAt = Date.now();
const since = baseline?.capturedAt ?? capturedAt;
const targetSessionId = '01a135b3-5464-79db-ab29-b23ef4a5f450';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const db = new DatabaseSync(database, { readOnly: true });
let state;
try {
  db.exec('BEGIN');
  const all = (sql, ...params) => db.prepare(sql).all(...params);
  const one = (sql, ...params) => db.prepare(sql).get(...params);
  const count = (sql) => one(sql).n;
  const accounts = all(`SELECT id,revision,status,provider_id providerId,api_format apiFormat,
    base_url baseURL,model_id modelId,last_error_code lastErrorCode,last_check_at lastCheckAt
    FROM provider_accounts WHERE deleted_at IS NULL`);
  const account = accounts[0];
  const accountGate = accountPreflight(accounts, {
    id: '01a13377-f964-786b-bb32-bf916b568ddc',
    providerId: 'openai-compatible',
    apiFormat: 'openai-chat',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    modelId: 'glm-4.7-flashx',
  });
  const preferences = one(`SELECT revision,
    json_extract(value_json,'$.values.selection.accountId') accountId,
    json_extract(value_json,'$.values.selection.modelId') modelId,
    json_extract(value_json,'$.values.onlyThisModel') onlyThisModel,
    json_extract(value_json,'$.values.mode') mode,
    json_extract(value_json,'$.values.reasoning') reasoning,
    json_extract(value_json,'$.values.allowPaidFallback') allowPaidFallback,
    json_extract(value_json,'$.values.dailyTokenLimit') dailyTokenLimit
    FROM settings WHERE key='modelPreferences' AND scope_type='profile' AND deleted_at IS NULL`);
  if (
    preferences?.accountId !== account.id ||
    preferences.modelId !== account.modelId ||
    preferences.onlyThisModel !== 1 ||
    preferences.allowPaidFallback !== 0 ||
    preferences.reasoning !== 'off'
  )
    throw Error('Expected existing single-model, no-fallback, reasoning-off preferences');
  const targetSession = one(
    `SELECT id,mode,active_branch_id branchId,project_id projectId,
    title='OK' titleIsOK FROM sessions WHERE id=? AND deleted_at IS NULL`,
    targetSessionId,
  );
  if (!targetSession || targetSession.mode !== 'chat' || targetSession.projectId)
    throw Error('Expected existing standalone OK test chat');
  const workload = {
    activeRuns: count(`SELECT count(*) n FROM runs WHERE deleted_at IS NULL AND status NOT IN
      ('completed','partial','failed','budget_stopped','cancelled')`),
    pendingInputs: count("SELECT count(*) n FROM pending_inputs WHERE status='queued'"),
    activeTitles: count("SELECT count(*) n FROM title_jobs WHERE status IN('queued','running')"),
    activeMemoryJobs: count(
      "SELECT count(*) n FROM jobs WHERE kind='memory.extract' AND status IN('queued','running')",
    ),
    reservedBudgets: count(
      'SELECT count(*) n FROM budgets WHERE reserved_tokens<>0 AND deleted_at IS NULL',
    ),
    unsettledAttempts: count(
      'SELECT count(*) n FROM provider_attempts WHERE id NOT IN(SELECT provider_attempt_id FROM usage_ledger)',
    ),
  };
  if (mode !== 'snapshot' && Object.values(workload).some((n) => n !== 0))
    throw Error('Profile is busy or has unsettled reservations; no application started');
  const ledgerColumns = `SELECT provider_attempt_id,source,input_tokens,output_tokens,
    charged_tokens,amount_micros FROM usage_ledger WHERE created_at<? ORDER BY provider_attempt_id`;
  const eventSeq = count('SELECT coalesce(max(seq),0) n FROM events');
  state = {
    task: 'P02-02',
    capturedAt,
    checkedAt: new Date(capturedAt).toISOString(),
    status:
      mode === 'snapshot'
        ? 'observations_only_requires_review'
        : accountGate.accountReady
          ? 'prepared_not_live_verified'
          : 'connection_recovery_required',
    dataDir,
    readOnlyDatabase: true,
    credentialReads: 0,
    nativeContentReads: 0,
    messageBodiesExported: false,
    modelRequests: 0,
    account,
    ...accountGate,
    preferences,
    targetSession,
    workload,
    eventSeq,
    ledgerTotals: one(`SELECT count(*) entries,coalesce(sum(charged_tokens),0) tokens,
      coalesce(sum(CASE WHEN source='actual' THEN charged_tokens ELSE 0 END),0) actualTokens,
      coalesce(sum(CASE WHEN source='estimated' THEN charged_tokens ELSE 0 END),0) estimatedTokens
      FROM usage_ledger`),
    priorLedgerHash: hash(JSON.stringify(all(ledgerColumns, since))),
    duplicateSettlements: all(`SELECT provider_attempt_id attemptId,count(*) n FROM usage_ledger
      GROUP BY provider_attempt_id HAVING count(*)>1`),
    newRuns: all(
      `SELECT id,session_id sessionId,root_run_id rootRunId,task_version taskVersion,
      status,status_reason statusReason,created_at createdAt,started_at startedAt,ended_at endedAt,
      calls,tools FROM runs WHERE created_at>=? ORDER BY created_at,id`,
      since,
    ),
    newInputs: all(
      `SELECT id,session_id sessionId,kind,status,revision,target_run_id targetRunId,
      target_task_version targetTaskVersion,user_message_id userMessageId,length(text) characterCount,
      created_at createdAt,updated_at updatedAt FROM pending_inputs WHERE created_at>=? ORDER BY created_at,id`,
      since,
    ),
    newMessages: all(
      `SELECT id,session_id sessionId,run_id runId,role,status,
      client_message_id clientMessageId,provider_attempt_id attemptId,length(content_json) contentJsonLength,
      created_at createdAt FROM messages WHERE created_at>=? ORDER BY created_at,rowid`,
      since,
    ),
    newTools: all(
      `SELECT id,run_id runId,tool_name toolName,status,side_effect sideEffect,
      created_at createdAt,updated_at updatedAt FROM tool_calls WHERE created_at>=? ORDER BY created_at,id`,
      since,
    ),
    newAttempts: all(
      `SELECT a.id,a.run_id runId,a.root_run_id rootRunId,a.logical_call_id logicalCallId,
      a.attempt_no attemptNo,a.status,a.error_code errorCode,a.model_ref modelRef,a.created_at createdAt,
      u.source,u.input_tokens inputTokens,u.output_tokens outputTokens,u.charged_tokens chargedTokens
      FROM provider_attempts a LEFT JOIN usage_ledger u ON u.provider_attempt_id=a.id
      WHERE a.created_at>=? ORDER BY a.created_at,a.id`,
      since,
    ),
    eventCounts: all(
      'SELECT event_type type,count(*) n FROM events WHERE seq>? GROUP BY event_type',
      baseline?.eventSeq ?? eventSeq,
    ),
  };
  if (baseline) state.priorLedgerUnchanged = state.priorLedgerHash === baseline.priorLedgerHash;
  db.exec('ROLLBACK');
} finally {
  db.close();
}
state.sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
state.productChanges = execFileSync(
  'git',
  ['status', '--porcelain', '--', 'apps', 'packages', 'resources'],
  {
    cwd: root,
    encoding: 'utf8',
  },
).trim();
if (mode !== 'snapshot') {
  if (baseline && state.sourceCommit !== baseline.sourceCommit)
    throw Error('Product commit changed; review the baseline before starting live acceptance');
  if (state.productChanges) {
    const { reviewName, reviewed } = readReview();
    const sourcePath = 'packages/core/src/chat-service.ts';
    if (
      reviewed.sourceCommit !== state.sourceCommit ||
      reviewed.productChanges !== state.productChanges ||
      reviewed.sourcePath !== sourcePath ||
      reviewed.sourceSHA256 !== hash(readFileSync(join(root, sourcePath)))
    )
      throw Error(
        'Source snapshot changed. For UI-only edits, exit TapKit and rerun run-app.ps1 -RefreshUiBuild.',
      );
    if (reviewed.sources) {
      const changedPaths = state.productChanges
        .split('\n')
        .map((line) => line.trim().replace(/^[A-Z?]{1,2}\s+/, ''))
        .sort();
      if (
        JSON.stringify(changedPaths) !==
        JSON.stringify(reviewed.sources.map((source) => source.path).sort())
      )
        throw Error('Reviewed source list does not cover exact product changes');
      for (const source of reviewed.sources) {
        if (
          !reviewedSource(source.path) ||
          source.path.split('/').includes('..') ||
          hash(readFileSync(join(root, source.path))) !== source.sha256
        )
          throw Error('Product source differs from reviewed tool trace');
      }
      for (const source of reviewed.runtimeSources ?? []) {
        if (
          !/^scripts\/(execution-verification|runtime-inventory|runtime-probe|p03-parser-probe)\.mjs$/.test(
            source.path,
          ) ||
          hash(readFileSync(join(root, source.path))) !== source.sha256
        )
          throw Error('Runtime verification source differs from the reviewed scope');
      }
    } else if (state.productChanges !== 'M packages/core/src/chat-service.ts')
      throw Error('Unexpected product source changes');
    if (reviewed.rendererFingerprint && reviewed.rendererFingerprint !== rendererFingerprint())
      throw Error('UI source changed. Exit TapKit and rerun run-app.ps1 -RefreshUiBuild.');
    state.sourceReview = reviewName;
  }
}
const core = readFileSync(join(root, 'packages/core/dist/index.cjs'));
if (core.includes(Buffer.from('installChatFixture'))) throw Error('Fixture build must not be used');
state.coreBuildSHA256 = hash(core);
state.mainBuildSHA256 = hash(readFileSync(join(root, 'apps/desktop/out/main/index.js')));
const reportPath =
  mode === 'prepare' ? baselinePath : join(directory, `${mode}-${capturedAt}.json`);
writeFileSync(reportPath, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
console.log(
  JSON.stringify({
    status: state.status,
    launchMode: state.launchMode,
    lastErrorCode: state.account.lastErrorCode,
    reportPath,
    workload: state.workload,
    newRuns: state.newRuns.length,
    newTools: state.newTools.length,
    modelRequests: 0,
  }),
);
