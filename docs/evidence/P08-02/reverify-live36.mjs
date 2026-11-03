import { readFileSync, writeFileSync, readdirSync, realpathSync, lstatSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { researchQuoteBlock } from '../../../scripts/p08-research-markdown.mjs';

// Read-only revalidation of one frozen public research run; no native state, keys or API.
const round = '71ed833f-3670-453e-97a8-2549e120b8db';
const out = resolve('docs/evidence/P08-02');
const receiptFile = join(out, 'live-' + round, 'report.json');
const receiptBytes = readFileSync(receiptFile);
const receipt = JSON.parse(receiptBytes);
const pointer = JSON.parse(readFileSync(resolve('.test-data/P08-02-live-profile-' + round + '.json'), 'utf8'));
const directory = realpathSync(pointer.directory);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (value, name) => { if (!value) throw Error(name); };
check(dirname(directory) === resolve('.test-data') && basename(directory).startsWith('P08-02-live-profile-') && !lstatSync(directory).isSymbolicLink(), 'PROFILE_SCOPE');
check(receipt.status === 'not_verified' && receipt.task.runId === '01a1a143-6663-7198-9942-2ee7ad8eb355', 'FROZEN_RECEIPT');
check(receipt.connectionSucceededBeforeTasks && receipt.connectionAttempts.some(c => c.number === 36 && c.status === 'passed'), 'CONNECTION_ORDER');
check(receipt.credentialRemoved && readdirSync(join(directory, 'secrets')).length === 0, 'CREDENTIAL_CLEANUP');
const db = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
try {
  const run = db.prepare('SELECT * FROM runs WHERE id=?').get(receipt.task.runId);
  const work = JSON.parse(run.work_json), state = work.research, spec = work.definition.research;
  check(run.status === 'partial' && run.status_reason === null && state.report.ready, 'REPORT_READY');
  check(spec.seedUrls.length === 0 && spec.dates.from === null && spec.dates.to === null, 'DISCOVERY_SCOPE');
  check(state.searches > 0 && state.searches <= 8 && state.reads > 0 && state.reads <= 40 && state.queries.some(q => q.status === 'ready' && q.candidates.length), 'ACTUAL_DISCOVERY');
  const readBlob = row => {
    check(row && /^blobs\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/.test(row.relative_key), 'BLOB_SCOPE');
    const bytes = readFileSync(join(directory, row.relative_key));
    check(sha(bytes) === row.sha256, 'BLOB_HASH');
    return bytes;
  };
  const materials = new Map();
  for (const source of state.sources.filter(s => s.status === 'ready')) {
    check(source.kind === 'web' && !source.excluded && !spec.excludedSources.includes(source.id), 'SOURCE_SCOPE');
    const row = db.prepare('SELECT b.relative_key,b.sha256 FROM web_sources w JOIN blobs b ON b.id=w.snapshot_blob_id WHERE w.id=? AND w.run_id=? AND w.source_revision=?').get(source.ref.sourceId, run.id, source.ref.revision);
    const snapshot = JSON.parse(readBlob(row));
    check(sha(snapshot.text) === source.contentHash, 'SNAPSHOT_HASH');
    materials.set(source.id, { source, text: snapshot.text });
  }
  const groups = new Set(), quotes = [];
  for (const finding of state.findings) {
    check(finding.kind === 'fact' && finding.supports.length && !finding.opposes.length, 'LITERAL_FACT');
    for (const quote of finding.supports) {
      const item = materials.get(quote.sourceId);
      check(item && item.source.questionKeys.includes(finding.questionKey), 'QUESTION_BINDING');
      check(item.text.slice(quote.start, quote.end) === quote.quote && sha(quote.quote) === quote.quoteHash && finding.text === quote.quote, 'EXACT_QUOTE');
      groups.add(new URL(item.source.url).hostname.split('.').slice(-2).join('.'));
      quotes.push(quote);
    }
  }
  check(groups.size >= 2 && quotes.length === 10, 'MULTI_SOURCE_FACTS');
  check(db.prepare("SELECT 1 FROM tool_calls WHERE run_id=? AND tool_name='research.report' AND status='succeeded'").get(run.id), 'REPORT_LEDGER');
  check(!db.prepare("SELECT 1 FROM tool_calls WHERE run_id=? AND status IN('proposed','dispatched','pending','unknown')").get(run.id), 'NO_UNRESOLVED_CALLS');
  const budget = db.prepare("SELECT used_tokens,reserved_tokens FROM budgets WHERE owner_kind='root' AND owner_id=?").get(run.root_run_id);
  check(budget.reserved_tokens === 0 && budget.used_tokens <= work.definition.budgetOverrides.tokens, 'SETTLED_BUDGET');
  const files = [];
  for (const [index, ref] of state.report.refs.entries()) {
    check(ref.kind === 'file' && index <= 1, 'EXPORT_FORMAT');
    const bytes = readBlob(db.prepare('SELECT b.relative_key,b.sha256 FROM file_versions v JOIN blobs b ON b.id=v.blob_id WHERE v.id=? AND v.created_by_run_id=?').get(ref.versionId, run.id));
    if (index === 0) {
      check(sha(bytes) === state.report.contentHash && quotes.every(q => bytes.toString('utf8').includes(researchQuoteBlock(q.quote))), 'EXACT_MARKDOWN_QUOTE_BLOCKS');
    } else {
      const manifest = JSON.parse(bytes);
      check(JSON.stringify(manifest.sources) === JSON.stringify(state.sources) && JSON.stringify(manifest.findings) === JSON.stringify(state.findings), 'SOURCE_MANIFEST');
    }
    const file = index === 0 ? 'archived-live36-report.md' : 'archived-live36-sources.json';
    writeFileSync(join(out, file), bytes);
    files.push({ file, bytes: bytes.length, sha256: sha(bytes) });
  }
  check(receiptBytes.equals(readFileSync(receiptFile)), 'ORIGINAL_RECEIPT_UNCHANGED');
  const result = { status: 'passed', runId: run.id, originalReceiptStatus: receipt.status, originalReceiptSha256: sha(receiptBytes), originalReceiptUnchanged: true, connection: 36, sourceGroups: groups.size, quoteCount: quotes.length, quality: state.report.quality, reportLedgerVerified: true, sourceManifestVerified: true, reservedTokens: 0, credentialRemoved: true, files, verifiedBuild: receipt.build, scope: 'Frozen real model run reverified with correct literal Markdown entity/blockquote matching. Original not_verified receipt retained. No new API/model request. Later twelve-ID API ceiling verified separately by local regression.' };
  writeFileSync(join(out, 'archived-live36-reverification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ status: result.status, quoteCount: result.quoteCount, sourceGroups: result.sourceGroups, originalReceiptUnchanged: true, additionalModelCalls: 0 }));
} finally { db.close(); }
