import { DatabaseSync } from 'node:sqlite';
import { readFileSync, realpathSync, writeFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../../..');
const manifest = JSON.parse(
  readFileSync(
    join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
    'utf8',
  ),
);
const data = realpathSync(manifest.dataDir);
if (
  manifest.root !== root ||
  dirname(data) !== join(root, '.test-data') ||
  !data.split(/[\\/]/).at(-1).startsWith('P01-02-app-zhipu-chat-')
)
  throw new Error('Original profile binding mismatch');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hash = (value) => sha(JSON.stringify(value));
const db = new DatabaseSync(join(data, 'db/app.sqlite'), { readOnly: true });
let result;
try {
  db.exec('BEGIN');
  const queries = {
    sessions:
      'SELECT id,revision,title,note,active_branch_id,project_id,archived_at,deleted_at FROM sessions ORDER BY id',
    messages:
      'SELECT id,revision,branch_id,role,status,content_json,deleted_at FROM messages ORDER BY id',
    accounts:
      'SELECT id,revision,status,provider_id,api_format,base_url,model_id,last_error_code,last_check_at,deleted_at FROM provider_accounts ORDER BY id',
    modelPreferences:
      "SELECT revision,value_json FROM settings WHERE key='modelPreferences' AND scope_type='profile' AND deleted_at IS NULL ORDER BY id",
    ledger:
      'SELECT provider_attempt_id,source,input_tokens,output_tokens,charged_tokens,amount_micros FROM usage_ledger ORDER BY provider_attempt_id',
    runs: 'SELECT id,status FROM runs ORDER BY id',
    attempts: 'SELECT id,status,error_code FROM provider_attempts ORDER BY id',
    tools: 'SELECT id,run_id,tool_name,status,side_effect FROM tool_calls ORDER BY id',
  };
  const protectedState = {};
  for (const [key, sql] of Object.entries(queries)) {
    const rows = db.prepare(sql).all();
    protectedState[key] = { rows: rows.length, sha256: hash(rows) };
  }
  const fileVersionId = '01a15360-64b0-7d54-b3c6-1b88974c3987';
  const parsed = db
    .prepare(
      'SELECT p.parser_version parserVersion,p.status,b.sha256,b.size_bytes sizeBytes FROM parsed_documents p JOIN blobs b ON b.id=p.structure_blob_id WHERE p.file_version_id=? AND p.deleted_at IS NULL',
    )
    .get(fileVersionId);
  let syntheticParsed = null;
  if (parsed?.status === 'ready') {
    if (!/^[a-f0-9]{64}$/.test(parsed.sha256) || parsed.sizeBytes > 1000000)
      throw new Error('Unexpected synthetic parsed blob');
    const base = realpathSync(join(data, 'blobs/sha256'));
    const candidate = join(base, parsed.sha256.slice(0, 2), parsed.sha256);
    if (lstatSync(candidate).isSymbolicLink()) throw new Error('Synthetic parsed blob is a link');
    const bound = realpathSync(candidate),
      child = relative(base, bound);
    if (!child || child.startsWith('..') || isAbsolute(child))
      throw new Error('Synthetic parsed blob escaped');
    const bytes = readFileSync(bound);
    if (sha(bytes) !== parsed.sha256) throw new Error('Synthetic parsed blob hash mismatch');
    const doc = JSON.parse(bytes.toString('utf8'));
    syntheticParsed = {
      parserVersion: parsed.parserVersion,
      format: doc.format,
      blocks: doc.blocks.length,
      hasExpectedSyntheticMarker: doc.blocks.some((block) =>
        block.text.includes('ATTACH1019-ORANGE'),
      ),
      blobSha256: parsed.sha256,
    };
  }
  db.exec('ROLLBACK');
  result = {
    capturedAt: new Date().toISOString(),
    readOnly: true,
    rawBodyOrCredentialExported: false,
    protectedState,
    syntheticParsed,
  };
} finally {
  db.close();
}
const mode = process.argv[2];
if (!['before', 'after'].includes(mode)) throw new Error('Expected before/after');
if (mode === 'after') {
  const before = JSON.parse(
    readFileSync(join(directory, 'profile-protection-before.json'), 'utf8'),
  );
  result.protectedStateUnchanged =
    JSON.stringify(before.protectedState) === JSON.stringify(result.protectedState);
  if (!result.protectedStateUnchanged || !result.syntheticParsed?.hasExpectedSyntheticMarker)
    process.exitCode = 1;
}
writeFileSync(
  join(directory, 'profile-protection-' + mode + '.json'),
  JSON.stringify(result, null, 2) + '\n',
  { flag: 'wx' },
);
console.log(
  JSON.stringify({
    mode,
    counts: Object.fromEntries(
      Object.entries(result.protectedState).map(([key, value]) => [key, value.rows]),
    ),
    protectedStateUnchanged: result.protectedStateUnchanged ?? null,
    syntheticParsed: result.syntheticParsed,
  }),
);
