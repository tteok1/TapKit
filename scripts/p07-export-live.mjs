// Read-only export of synthetic live acceptance artifacts; no provider or credential access.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
const round = process.argv[2];
if (process.argv.length !== 3 || !/^[a-f0-9-]{36}$/.test(round ?? ''))
  throw Error('PERMISSION_DENIED');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const parent = read('.test-data/P07-ui-live-c6cbcc3d-cfd2-4eda-821b-3065bb5fab32.json');
const directory = realpathSync(parent.directory);
if (
  dirname(directory) !== resolve('.test-data') ||
  !basename(directory).startsWith('P07-02-live-profile-')
)
  throw Error('PERMISSION_DENIED');
const report = read(join('docs/evidence/P07-02', 'ui-live-2026-10-30-' + round, 'report.json'));
if (
  !report.credentialRemoved ||
  report.activeRuns !== 0 ||
  !read(join(directory, 'P07.live-profile.json')).closed
)
  throw Error('ACTIVE_PROFILE_REFUSED');
const out = resolve('docs/evidence/P07-03', 'exports-' + round);
mkdirSync(out, { recursive: true });
const db = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
const manifest = { round, networkRequests: 0, credentialReads: 0, artifacts: [] };
const sha = (b) => createHash('sha256').update(b).digest('hex');
function save(name, bytes) {
  const path = join(out, name);
  if (existsSync(path)) {
    if (sha(readFileSync(path)) !== sha(bytes)) throw Error('EXISTING_EVIDENCE_MISMATCH');
  } else writeFileSync(path, bytes, { flag: 'wx' });
}
try {
  const tasks = [
    { kind: 'data', runId: '01a18bbf-cf2b-7579-b793-396db72da039' },
    ...report.tasks.filter((t) => t.status === 'completed'),
  ];
  for (const task of tasks) {
    const rows = db
      .prepare(
        'SELECT v.*,b.relative_key FROM file_versions v JOIN blobs b ON b.id=v.blob_id WHERE v.created_by_run_id=? AND v.deleted_at IS NULL',
      )
      .all(task.runId);
    for (const row of rows) {
      if (!['xlsx', 'pptx', 'pdf', 'json'].includes(row.extension)) continue;
      if (row.parse_status !== 'ready') throw Error('PARSE_NOT_READY');
      if (row.relative_key !== 'blobs/sha256/' + row.sha256.slice(0, 2) + '/' + row.sha256)
        throw Error('BLOB_IDENTITY_MISMATCH');
      const path = realpathSync(join(directory, row.relative_key));
      if (!path.startsWith(join(directory, 'blobs') + '\\')) throw Error('PERMISSION_DENIED');
      const bytes = readFileSync(path);
      if (sha(bytes) !== row.sha256) throw Error('HASH_MISMATCH');
      if (row.extension === 'json' && JSON.parse(bytes.toString('utf8')).kind !== 'tapkit.analysis')
        continue;
      const name = task.kind + '.' + row.extension;
      save(name, bytes);
      manifest.artifacts.push({
        name,
        fileId: row.file_id,
        versionId: row.id,
        runId: task.runId,
        sha256: row.sha256,
        bytes: bytes.length,
        parseStatus: row.parse_status,
      });
      if (row.extension === 'pptx') {
        const record = JSON.parse(
          db.prepare('SELECT spec_json FROM document_specs WHERE file_version_id=?').get(row.id)
            .spec_json,
        );
        save(task.kind + '.spec.json', Buffer.from(JSON.stringify(record, null, 2) + '\n'));
      }
    }
  }
  save('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  console.log(
    JSON.stringify({
      out,
      artifacts: manifest.artifacts.length,
      networkRequests: 0,
      credentialReads: 0,
    }),
  );
} finally {
  db.close();
}
