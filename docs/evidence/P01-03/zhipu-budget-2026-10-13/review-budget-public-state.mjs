import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../../..');
const baseline = JSON.parse(readFileSync(join(directory, 'preparation.json'), 'utf8'));
const dataDir = resolve(baseline.dataDir);
if (
  dirname(dataDir) !== join(root, '.test-data') ||
  !basename(dataDir).startsWith('P01-02-app-zhipu-chat-')
)
  throw new Error('Unexpected isolated profile');
const db = new DatabaseSync(join(dataDir, 'db/app.sqlite'), { readOnly: true });
let report;
try {
  db.exec('BEGIN');
  const row = db
    .prepare(
      "SELECT revision,json_extract(value_json,'$.values.dailyTokenLimit') dailyTokenLimit FROM settings WHERE key='modelPreferences' AND scope_type='profile' AND scope_id=? AND deleted_at IS NULL",
    )
    .get(baseline.scope.id);
  const totals = db
    .prepare('SELECT count(*) attempts,sum(charged_tokens) tokens FROM usage_ledger')
    .get();
  const newRuns = db
    .prepare(
      'SELECT id,status,status_reason statusReason,calls,tools FROM runs WHERE created_at>=? AND deleted_at IS NULL ORDER BY created_at',
    )
    .all(Date.parse(baseline.preparedAt));
  const newAttempts = db
    .prepare(
      'SELECT id,run_id runId,status,error_code errorCode FROM provider_attempts WHERE created_at>=? ORDER BY created_at',
    )
    .all(Date.parse(baseline.preparedAt));
  const budgets = db
    .prepare(
      'SELECT owner_kind ownerKind,owner_id ownerId,used_tokens usedTokens,reserved_tokens reservedTokens FROM budgets WHERE deleted_at IS NULL',
    )
    .all();
  const blockedRunSeen = newRuns.some(
    (r) => r.status === 'budget_stopped' && r.statusReason === 'BUDGET_EXCEEDED',
  );
  const ledgerUnchanged =
    totals.attempts === baseline.ledgerBaseline.attempts &&
    totals.tokens === baseline.ledgerBaseline.tokens;
  const restored = row?.dailyTokenLimit === baseline.originalPreferences.dailyTokenLimit;
  const preferenceSavesObserved = row?.revision >= baseline.scope.revision + 2;
  const reservationsReleased = budgets.every((b) => b.reservedTokens === 0);
  report = {
    checkedAt: new Date().toISOString(),
    task: 'P01-03',
    readOnly: true,
    credentialRead: false,
    messageContentRead: false,
    nativeContentRead: false,
    modelRequests: 0,
    preferences: row,
    totals,
    newRuns,
    newAttempts,
    budgets,
    observed: {
      blockedRunSeen,
      ledgerUnchanged,
      restored,
      preferenceSavesObserved,
      reservationsReleased,
    },
    assessment:
      blockedRunSeen &&
      newRuns.length === 1 &&
      ledgerUnchanged &&
      restored &&
      preferenceSavesObserved &&
      reservationsReleased &&
      !newAttempts.length
        ? 'scoped_budget_acceptance_passed'
        : 'pending_or_requires_review',
  };
  db.exec('ROLLBACK');
} finally {
  db.close();
}
const reportPath = join(directory, 'public-state-' + Date.now() + '.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ reportPath, assessment: report.assessment }));
