import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  realpathSync,
  lstatSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// Read only public live receipts and enumerate owned secret directories; never read secrets.
const root = resolve('docs/evidence/P08-02');
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const save = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
function attempts(task) {
  const directory = resolve('docs/evidence/' + task);
  return readdirSync(directory)
    .filter((name) => /^live-[a-f0-9-]{36}$/.test(name))
    .flatMap((name) => {
      const file = join(directory, name, 'report.json');
      return existsSync(file) ? [{ directory: name, ...read(file) }] : [];
    })
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
const prior = attempts('P08-01'),
  current = attempts('P08-02');
if (current.some((row) => row.status === 'running')) throw Error('PRIOR_LIVE_UNSETTLED');
const sum = (rows, source) =>
  rows
    .flatMap((r) => r.usage ?? [])
    .filter((r) => r.source === source)
    .reduce((n, r) => n + r.charged_tokens, 0);
const checksPriorP08 = prior.reduce((n, r) => n + r.connectionAttempts.length, 0);
const checksThisTask = current.reduce((n, r) => n + r.connectionAttempts.length, 0);
const allChecks = [...prior, ...current].flatMap((r) => r.connectionAttempts);
if (allChecks.some((c, i) => c.number !== i + 1) || allChecks.length > 50)
  throw Error('CONNECTION_CHECK_ACCOUNTING');
const profiles = readdirSync(resolve('.test-data'), { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name.startsWith('P08-02-live-profile-'))
  .map((e) => {
    const path = resolve('.test-data', e.name),
      secrets = join(path, 'secrets');
    if (lstatSync(path).isSymbolicLink() || realpathSync(path) !== path)
      throw Error('PERMISSION_DENIED');
    if (
      existsSync(secrets) &&
      (lstatSync(secrets).isSymbolicLink() || realpathSync(secrets) !== secrets)
    )
      throw Error('PERMISSION_DENIED');
    return {
      profile: e.name,
      remainingSecretFiles: existsSync(secrets) ? readdirSync(secrets).length : 0,
    };
  });
const pointer = read(resolve('.test-data/P08-02-live.json'));
const cleanup = {
  scope:
    'Only owned P08-02 isolated directories, filenames counted only; no original credential access',
  allRemoved: profiles.every((p) => p.remainingSecretFiles === 0),
  latestClosed: pointer.closed === true,
  profiles,
};
if (
  !cleanup.allRemoved ||
  !cleanup.latestClosed ||
  current.some((r) => r.credentialRemoved !== true)
)
  throw Error('CREDENTIAL_COPY_UNSETTLED');
save(join(root, 'credential-cleanup.json'), cleanup);
const aggregate = {
  task: 'P08-02',
  scope:
    'Task root usage only; connection-check usage is unknown and excluded. Estimates are not actual token counts.',
  checksThisTask,
  checksPriorP08,
  checksCumulative: checksPriorP08 + checksThisTask,
  limit: 50,
  actualTaskTokens: sum(current, 'actual'),
  estimatedTaskTokens: sum(current, 'estimated'),
  allCredentialCopiesRemoved: true,
  attempts: current.map((r) => ({
    directory: r.directory,
    startedAt: r.startedAt,
    status: r.status,
    case: r.case ?? 'legacy',
    networkMode: r.networkMode ?? 'copied configuration',
    checks: r.connectionAttempts,
    task: r.task,
    credentialRemoved: r.credentialRemoved,
    actualTaskTokens: sum([r], 'actual'),
    estimatedTaskTokens: sum([r], 'estimated'),
    ...(r.budget ? { reserved: r.budget.reserved_tokens } : {}),
    contentVerified: r.contentVerified === true,
    explicitReport: r.explicitReportCall === true,
    multiSourceVerified: r.multiSourceVerified === true,
  })),
};
save(join(root, 'live-attempts.json'), aggregate);
console.log(
  JSON.stringify({
    checks: aggregate.checksCumulative,
    limit: 50,
    remaining: 50 - aggregate.checksCumulative,
    actualTaskTokens: aggregate.actualTaskTokens,
    estimatedTaskTokens: aggregate.estimatedTaskTokens,
    profiles: profiles.length,
    allCopiesRemoved: true,
  }),
);
if (process.argv.includes('--exports')) {
  const latest = current.at(-1);
  if (latest?.case !== 'discovery' || latest.status !== 'passed' || !latest.multiSourceVerified)
    throw Error('DISCOVERY_NOT_VERIFIED');
  const directory = realpathSync(pointer.directory);
  if (!profiles.some((p) => resolve('.test-data', p.profile) === directory))
    throw Error('PERMISSION_DENIED');
  const db = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
  try {
    const state = JSON.parse(
      db.prepare('SELECT work_json FROM runs WHERE id=?').get(latest.task.runId).work_json,
    ).research;
    const outputs = [];
    for (const [index, ref] of state.report.refs.entries()) {
      if (ref.kind !== 'file' || index > 1) throw Error('UNEXPECTED_REPORT_FORMAT');
      const blob = db
        .prepare(
          'SELECT b.relative_key,b.sha256 FROM file_versions v JOIN blobs b ON b.id=v.blob_id WHERE v.id=? AND v.created_by_run_id=?',
        )
        .get(ref.versionId, latest.task.runId);
      if (!blob || !/^blobs\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/.test(blob.relative_key))
        throw Error('CONFLICT');
      const bytes = readFileSync(join(directory, blob.relative_key));
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (sha256 !== blob.sha256 || (index === 0 && sha256 !== state.report.contentHash))
        throw Error('CONFLICT');
      if (index === 1) {
        const manifest = JSON.parse(bytes.toString('utf8'));
        if (
          JSON.stringify(manifest.sources) !== JSON.stringify(state.sources) ||
          JSON.stringify(manifest.findings) !== JSON.stringify(state.findings)
        )
          throw Error('CONFLICT');
      }
      const file = index === 0 ? 'live-discovery-report.md' : 'live-discovery-sources.json';
      writeFileSync(join(root, file), bytes);
      outputs.push({ file, bytes: bytes.length, sha256 });
    }
    save(join(root, 'discovery-export-verification.json'), {
      run: latest.task.runId,
      status: 'passed',
      sourceCount: state.sources.filter((s) => s.status === 'ready').length,
      quoteCount: state.findings.flatMap((f) => [...f.supports, ...f.opposes]).length,
      files: outputs,
      scope:
        'Exact bytes copied from the actual completed live run; source JSON compared to persisted verified evidence, no regenerated report',
    });
  } finally {
    db.close();
  }
}
if (process.argv.includes('--hashes')) {
  const file = join(root, 'verification.json'),
    verification = read(file);
  const hash = (path) => ({
    path,
    sha256: createHash('sha256')
      .update(readFileSync(resolve(path)))
      .digest('hex'),
  });
  verification.fileHashes = [
    ...new Set([
      ...verification.fileHashes.map((r) => r.path),
      'apps/desktop/src/main/system-proxy.ts',
      'tests/unit/P01-02.system-proxy.test.ts',
      'tests/live/P08-02.network.ts',
      'scripts/p08-research-network.mjs',
      'scripts/p08-research-audit.mjs',
      'packages/core/src/provider-service.ts',
      'packages/core/src/tool-trace.ts',
      'tests/unit/P08-02.network-trace.test.ts',
      'tests/evals/research/archived-excerpt.json',
      'scripts/p08-research-markdown.mjs',
    ]),
  ]
    .sort()
    .map(hash);
  verification.progressHashes = verification.progressHashes.map((r) => hash(r.path));
  verification.production = {
    coreSha256: hash('packages/core/dist/index.cjs').sha256,
    mainSha256: hash('apps/desktop/out/main/index.js').sha256,
  };
  verification.connectionBudget = {
    cumulative: aggregate.checksCumulative,
    limit: 50,
    remaining: 50 - aggregate.checksCumulative,
    authorization:
      '2026-11-03 user added twenty after redesign to prior thirty; cumulative limit fifty, never reset',
    allAttempts: 'live-attempts.json',
  };
  save(file, verification);
  console.log(
    JSON.stringify({
      sourceHashes: verification.fileHashes.length,
      progressHashes: verification.progressHashes.length,
    }),
  );
}
