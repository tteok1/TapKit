import { mkdtemp } from '../../scripts/test-temp.mjs';
import { beforeAll, it, expect, vi } from 'vitest';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { openStore, newId } from '../../packages/storage/src';
import { resolveApiConfig } from '../../packages/contracts/src';
import { nativeSelectionHash, NATIVE_FIXTURE_MARKER } from '../live/P01-02.native-profile';
import { runNativeProcesses } from '../../scripts/api-native-live.mjs';
import { lockedEnv, pnpm } from '../../scripts/lib.mjs';
const require = createRequire(import.meta.url);

// A clean checkout has no ignored live-runner bundle. Build the fixture's own
// entry point before spawning Electron instead of relying on a prior manual run.
beforeAll(() => {
  pnpm(['exec', 'vite', 'build', '--config', 'tests/live/native.vite.config.ts']);
}, 60_000);

async function fixture(setting = {}) {
  vi.useRealTimers();
  await mkdir('.test-data', { recursive: true });
  const directory = await mkdtemp(resolve('.test-data', 'P01-02-native-fixture-中文-'));
  await writeFile(join(directory, 'P01-02.native.fixture'), NATIVE_FIXTURE_MARKER);
  await writeFile(join(directory, 'response-fixture.json'), JSON.stringify(setting));
  const store = await openStore(directory);
  const accountId = newId();
  const config = resolveApiConfig('openai-compatible', {
    apiFormat: 'openai-chat',
    baseURL: 'https://fixture.invalid/v1',
    modelId: 'native-fixture',
  });
  store.db
    .prepare(
      `INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,
    provider_id,label,auth_type,credential_id,status,model_id,api_format,base_url)
    VALUES (?,?,?,?,?,?,'api_key',?,'ready',?,?,?)`,
    )
    .run(
      accountId,
      store.profileId,
      store.now(),
      store.now(),
      config.providerId,
      'native fixture',
      newId(),
      config.modelId,
      config.apiFormat,
      config.baseURL,
    );
  const selection = { accountId, profileId: store.profileId, accountRevision: 1, config };
  store.close();
  return {
    directory,
    provider: config.providerId,
    account: accountId,
    selectionHash: nativeSelectionHash(selection),
  };
}

it('P01-02 real Electron DPAPI native save/restart/reuse uses formal ProviderService and settles exactly two attempts', async () => {
  const input = await fixture();
  const result = runNativeProcesses({ ...input, fixture: true });
  expect(result.exitCode).toBe(0);
  const reports = result.summary.phases.map((p) => p.report!);
  expect(reports.map((r) => r.pid)[0]).not.toBe(reports[1]!.pid);
  expect(reports[1]).toMatchObject({
    actualProcessRestart: true,
    encryptedCanonicalRestored: true,
    nativeLoadsDuringAdapter: 1,
    nativeSaves: 1,
    resultMarkerMatched: true,
    ledgerVerified: true,
    reservationsReleased: true,
    duplicateSettlements: 0,
    settingsChanged: false,
    automaticTitleOrMemoryRequests: 0,
  });
  for (const report of reports)
    expect(report).toMatchObject({
      status: 'passed',
      attempts: 1,
      retries: 0,
      encryptedFileExists: true,
      plaintextMarkerAbsent: true,
      usage: { source: 'actual', chargedTokens: 15 },
    });
  const store = await openStore(input.directory);
  try {
    expect(
      store.db.prepare('SELECT count(*) n,sum(charged_tokens) tokens FROM usage_ledger').get(),
    ).toEqual({ n: 2, tokens: 30 });
    expect(
      store.db.prepare('SELECT count(DISTINCT root_run_id) n FROM provider_attempts').get(),
    ).toEqual({ n: 1 });
    expect(
      store.db.prepare('SELECT count(*) n FROM opaque_states WHERE deleted_at IS NULL').get(),
    ).toEqual({ n: 2 });
  } finally {
    store.close();
  }
  const serialized = JSON.stringify(result.summary);
  expect(serialized).not.toContain('P01-02-synthetic-key');
  expect(serialized).not.toContain('TAPKIT_NATIVE_OK');
  expect(serialized).not.toContain('nativeRef"');
}, 90_000);

it('P01-02 missing usage conservatively settles each restarted attempt, without changing settings', async () => {
  const input = await fixture({ missingUsage: true });
  const result = runNativeProcesses({ ...input, fixture: true });
  expect(result.exitCode).toBe(0);
  for (const phase of result.summary.phases) {
    expect(phase.report!.usage).toMatchObject({
      source: 'estimated',
      inputTokens: null,
      outputTokens: null,
    });
    expect(phase.report!.usage!.chargedTokens).toBeGreaterThan(128);
    expect(phase.report!.reservationsReleased).toBe(true);
  }
}, 90_000);

it('P01-02 first failure stops before restart and does not make a second request', async () => {
  const input = await fixture({ fail: true });
  const result = runNativeProcesses({ ...input, fixture: true });
  expect(result.exitCode).toBe(1);
  expect(result.summary.phases).toHaveLength(1);
  expect(result.summary.phases[0]!.report).toMatchObject({
    status: 'failed',
    attempts: 1,
    nativeLoadsDuringAdapter: 0,
    reservationsReleased: true,
    ledgerVerified: true,
  });
}, 90_000);

it('P01-02 deleted/missing/tampered native state and replayed resume are rejected without a second provider request', async () => {
  for (const fault of [
    'deleted',
    'missing',
    'tampered',
    'binding-account',
    'binding-model',
    'binding-version',
    'binding-branch',
    'revoked-account',
    'replayed',
  ]) {
    const input = await fixture();
    const caseId = randomUUID();
    const reportDir = resolve('test-results/P01-02-native', caseId);
    await mkdir(reportDir, { recursive: true });
    const env: NodeJS.ProcessEnv = lockedEnv();
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    const run = (phase: string) =>
      spawnSync(
        require('electron'),
        [
          resolve('.test-data/P01-02-native-runner/runner.cjs'),
          phase,
          input.directory,
          input.provider,
          input.account,
          input.selectionHash,
          caseId,
          'fixture',
        ],
        { env, windowsHide: true, timeout: 120_000, encoding: 'utf8' },
      );
    expect(run('save').status).toBe(0);
    const checkpointPath = join(reportDir, 'checkpoint.json');
    const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
    const store = await openStore(input.directory);
    try {
      if (fault === 'deleted')
        store.db
          .prepare('UPDATE opaque_states SET deleted_at=? WHERE id=?')
          .run(store.now(), checkpoint.nativeRef);
      if (fault.startsWith('binding-')) {
        const column = {
          'binding-account': 'account_id',
          'binding-model': 'model_ref',
          'binding-version': 'adapter_version',
          'binding-branch': 'branch_id',
        }[fault as 'binding-account' | 'binding-model' | 'binding-version' | 'binding-branch'];
        const replacement = newId();
        if (fault === 'binding-account')
          store.db
            .prepare(
              `INSERT INTO provider_accounts
          (id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status,deleted_at)
          VALUES (?,?,?,?,?,?,'api_key',?,'unconfigured',?)`,
            )
            .run(
              replacement,
              store.profileId,
              store.now(),
              store.now(),
              'openai-compatible',
              'deleted synthetic account',
              newId(),
              store.now(),
            );
        store.db
          .prepare('UPDATE opaque_states SET ' + column + '=? WHERE id=?')
          .run(replacement, checkpoint.nativeRef);
      }
      if (fault === 'revoked-account')
        store.db
          .prepare('UPDATE provider_accounts SET deleted_at=? WHERE id=?')
          .run(store.now(), input.account);
    } finally {
      store.close();
    }
    const cipherPath = join(input.directory, 'secrets', 'opaque-' + checkpoint.nativeRef);
    if (fault === 'missing') await unlink(cipherPath);
    if (fault === 'tampered')
      await writeFile(cipherPath, Buffer.from('invalid-ciphertext-fixture'));
    if (fault === 'replayed')
      await writeFile(checkpointPath, JSON.stringify({ ...checkpoint, state: 'resuming' }));
    expect(run('resume').status).toBe(fault === 'revoked-account' ? 2 : 1);
    if (fault !== 'revoked-account') {
      const report = JSON.parse(await readFile(join(reportDir, 'resume-report.json'), 'utf8'));
      expect(report).toMatchObject({ status: 'failed', attempts: 0, privateKeyReadsInsideHost: 0 });
    }
    const reopened = await openStore(input.directory);
    try {
      expect(reopened.db.prepare('SELECT count(*) n FROM provider_attempts').get()).toEqual({
        n: 1,
      });
    } finally {
      reopened.close();
    }
  }
}, 180_000);
