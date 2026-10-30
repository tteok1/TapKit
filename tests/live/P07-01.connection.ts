import { app } from 'electron';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  realpathSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  unlinkSync,
  constants,
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { openStore, newId, type Store, StorageError } from '../../packages/storage/src';
import { AuthSecrets } from '../../apps/desktop/src/main/auth/secrets';
import { restrictToCurrentUser } from '../../apps/desktop/src/main/vault';
import { resolveSystemProxy } from '../../apps/desktop/src/main/system-proxy';
import { ProviderService } from '../../packages/core/src/provider-service';
import { apiFetchForNetwork } from '../../packages/providers/src';

const root = process.cwd(),
  task = process.env.TAPKIT_P07_TASK ?? 'P07-01',
  [phase, requested] = process.argv.slice(2),
  accountId = '01a13377-f964-786b-bb32-bf916b568ddc';
const safeCode = (e: unknown) =>
  e instanceof StorageError
    ? e.code
    : e instanceof Error && /^[A-Z_]{3,50}$/.test(e.message)
      ? e.message
      : 'INTERNAL_ERROR';
const hash = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
async function main() {
  let store: Store | undefined, providers: ProviderService | undefined;
  let reportDir = '',
    stage = 'preflight',
    isolatedSecretPath = '',
    isolatedMarker = '';
  const report: Record<string, unknown> = {
    phase,
    task,
    status: 'failed',
    limits: { checks: 1, wireRequests: 2, maxOutputTokens: 128 },
    realProvider: true,
    otherModulesCalled: false,
    automaticRetries: 0,
    fallbacks: 0,
    checks: [],
    keyReadsInsideHost: 0,
  };
  const checks = report.checks as string[];
  const assert = (condition: unknown, name: string) => {
    if (!condition) throw Error('VALIDATION_ERROR');
    checks.push(name);
  };
  try {
    if (
      process.env.TAPKIT_P07_LIVE !== '1' ||
      !['P07-01', 'P07-02', 'P07-03'].includes(task) ||
      !requested ||
      !['create', 'resume', 'network'].includes(phase ?? '')
    )
      throw Error('PERMISSION_DENIED');
    const directory = realpathSync(requested);
    if (
      dirname(directory) !== join(root, '.test-data') ||
      !basename(directory).startsWith('P07-connection-zhipu-')
    )
      throw Error('PERMISSION_DENIED');
    const marker = JSON.parse(readFileSync(join(directory, 'P07.connection.json'), 'utf8'));
    if (marker.task && marker.task !== task) throw Error('PERMISSION_DENIED');
    isolatedMarker = join(directory, 'P07.connection.json');
    if (marker.closed) throw Error('PERMISSION_DENIED');
    reportDir = realpathSync(marker.reportDir);
    if (
      dirname(reportDir) !== join(root, 'docs/evidence', task) ||
      !/^connection-\d{4}-\d{2}-\d{2}(?:-\d{2})?$/.test(basename(reportDir))
    )
      throw Error('PERMISSION_DENIED');
    const source = realpathSync(
      JSON.parse(readFileSync(join(root, '.test-data/P06-connection-debug.json'), 'utf8'))
        .directory,
    );
    if (
      dirname(source) !== join(root, '.test-data') ||
      !basename(source).startsWith('P06-connection-debug-')
    )
      throw Error('PERMISSION_DENIED');
    const sourceDb = new DatabaseSync(join(source, 'db/app.sqlite'), { readOnly: true });
    let account: {
        id: string;
        revision: number;
        status: string;
        provider_id: string;
        api_format: string;
        base_url: string;
        model_id: string;
        credential_id: string;
      },
      settings: { network: unknown };
    try {
      const rows = sourceDb
        .prepare(
          'SELECT id,revision,status,provider_id,api_format,base_url,model_id,credential_id FROM provider_accounts WHERE deleted_at IS NULL',
        )
        .all();
      if (rows.length !== 1) throw Error('CONFLICT');
      account = rows[0] as typeof account;
      if (
        account.id !== accountId ||
        !['ready', 'unavailable'].includes(account.status) ||
        account.provider_id !== 'openai-compatible' ||
        account.api_format !== 'openai-chat' ||
        account.base_url !== 'https://open.bigmodel.cn/api/paas/v4' ||
        account.model_id !== 'glm-4.7-flashx'
      )
        throw Error('PERMISSION_DENIED');
      settings = JSON.parse(
        (
          sourceDb
            .prepare(
              "SELECT value_json FROM settings WHERE key='preferences' AND scope_type='profile' AND deleted_at IS NULL",
            )
            .get() as { value_json: string }
        ).value_json,
      ).values;
    } finally {
      sourceDb.close();
    }
    const cipher = join(source, 'secrets', account.credential_id),
      cipherHash = hash(readFileSync(cipher));
    const publicBindingHash = hash(JSON.stringify(account));
    app.setName('TapKit');
    app.setPath('userData', directory);
    if (!app.requestSingleInstanceLock()) throw Error('CONFLICT');
    await app.whenReady();
    if (phase === 'network') {
      stage = 'unauthenticated-network-diagnostic';
      for (const [name, network] of [
        ['configured', settings.network],
        ['direct', { mode: 'direct', proxyURL: '' }],
      ] as const) {
        try {
          const response = await apiFetchForNetwork(
            network as Parameters<typeof apiFetchForNetwork>[0],
            async (url) => (await resolveSystemProxy({ url })).proxyURL,
          )('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
            method: 'HEAD',
            signal: AbortSignal.timeout(15000),
          });
          report[name] = { httpStatus: response.status };
          await response.body?.cancel();
        } catch (error) {
          const detail = (error as { detail?: { code?: string; diagnosticCode?: string } }).detail;
          report[name] = {
            code: detail?.code ?? safeCode(error),
            diagnosticCode: detail?.diagnosticCode ?? null,
          };
        }
      }
      report.status = 'passed';
      report.modelRequests = 0;
      return;
    }
    stage = 'isolated-store';
    store = await openStore(directory);
    const isolatedSecretDir = join(directory, 'secrets');
    mkdirSync(isolatedSecretDir, { recursive: true });
    await restrictToCurrentUser(isolatedSecretDir);
    const isolatedCipher = join(isolatedSecretDir, account.credential_id);
    if (!existsSync(isolatedCipher)) copyFileSync(cipher, isolatedCipher, constants.COPYFILE_EXCL);
    isolatedSecretPath = isolatedCipher;
    const isolatedSecrets = new AuthSecrets(isolatedSecretDir);
    if (phase === 'create' && !existsSync(join(directory, 'source-binding.json'))) {
      const now = store.now();
      store.db
        .prepare(
          "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status,model_id,api_format,base_url,revision) VALUES(?,?,?,?,?,'P07 connection existing Zhipu','api_key',?,'ready',?,?,?,?)",
        )
        .run(
          account.id,
          store.profileId,
          now,
          now,
          account.provider_id,
          account.credential_id,
          account.model_id,
          account.api_format,
          account.base_url,
          account.revision,
        );
      const values = {
        ...store.settings.values,
        network: { mode: 'direct', proxyURL: '' },
        memoryEnabled: false,
      };
      store.db
        .prepare(
          "UPDATE settings SET value_json=? WHERE key='preferences' AND scope_type='profile'",
        )
        .run(JSON.stringify({ schemaVersion: 1, values }));
      writeFileSync(
        join(directory, 'source-binding.json'),
        JSON.stringify({ publicBindingHash, cipherHash }),
        { flag: 'wx' },
      );
    } else {
      const baseline = JSON.parse(readFileSync(join(directory, 'source-binding.json'), 'utf8'));
      assert(
        baseline.publicBindingHash === publicBindingHash && baseline.cipherHash === cipherHash,
        'original account and encrypted credential unchanged across restart',
      );
    }
    stage = 'provider-construction';
    providers = new ProviderService(
      store,
      async (operation, id, payload) => {
        if (id !== accountId) throw Error('PERMISSION_DENIED');
        if (operation === 'api-key.read') {
          report.keyReadsInsideHost = Number(report.keyReadsInsideHost) + 1;
          try {
            return await isolatedSecrets.invoke(operation, id, payload);
          } catch (error) {
            report.credentialReadError = safeCode(error);
            report.credentialReadErrorType = error instanceof Error ? error.name : 'unknown';
            throw error;
          }
        }
        if (['native.save', 'native.load', 'native.purge'].includes(operation))
          return isolatedSecrets.invoke(operation, id, payload);
        throw Error('PERMISSION_DENIED');
      },
      async (url, signal) => {
        signal?.throwIfAborted();
        return (await resolveSystemProxy({ url })).proxyURL;
      },
    );
    const adapter = providers.adapter(accountId) as unknown as { fetcher: typeof fetch };
    const stages: { request: number; event: string; elapsedMs: number }[] = [];
    let wireRequests = 0;
    const realFetch = adapter.fetcher;
    adapter.fetcher = async (input, init) => {
      if (
        String(input) !== 'https://open.bigmodel.cn/api/paas/v4/chat/completions' ||
        init?.method !== 'POST' ||
        typeof init.body !== 'string'
      )
        throw Error('PERMISSION_DENIED');
      const body = JSON.parse(init.body);
      if (body.model !== account.model_id || body.max_tokens > 128 || wireRequests >= 2)
        throw Error('BUDGET_EXCEEDED');
      wireRequests++;
      report.wireRequests = wireRequests;
      const started = performance.now();
      try {
        const response = await realFetch(input, init);
        stages.push({
          request: wireRequests,
          event: 'response_headers',
          elapsedMs: Math.round(performance.now() - started),
        });
        return response;
      } catch (error) {
        stages.push({
          request: wireRequests,
          event: 'request_error',
          elapsedMs: Math.round(performance.now() - started),
        });
        throw error;
      }
    };
    stage = 'tapkit-connection-check';
    const current = store.db
      .prepare('SELECT revision FROM provider_accounts WHERE id=?')
      .get(accountId) as { revision: number };
    const reply = await providers.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: 'providers.check',
      payload: { accountId, modelId: account.model_id },
      expectedRevision: current.revision,
    });
    const value = reply.ok
      ? (reply.data as {
          status?: string;
          text?: boolean;
          tools?: boolean;
          errorCode?: string;
          diagnostic?: { reason?: string };
        })
      : undefined;
    report.probe = {
      status: value?.status ?? 'error',
      text: value?.text ?? false,
      tools: value?.tools ?? false,
      errorCode: value?.errorCode ?? (!reply.ok ? reply.error.code : null),
      diagnosticCode: value?.diagnostic?.reason ?? null,
    };
    report.stages = stages;
    report.status = value?.status === 'ready' && value.text && value.tools ? 'passed' : 'failed';
  } catch (error) {
    report.errorCode = safeCode(error);
    report.errorType = error instanceof Error ? error.name : 'unknown';
  } finally {
    await providers?.stop().catch(() => {});
    store?.close();
    try {
      if (isolatedSecretPath && existsSync(isolatedSecretPath)) unlinkSync(isolatedSecretPath);
      if (isolatedMarker)
        writeFileSync(isolatedMarker, JSON.stringify({ reportDir, closed: true }));
      report.isolatedCredentialRemoved = true;
    } catch {
      report.isolatedCredentialRemoved = false;
    }
    report.stage = stage;
    report.checkedAt = new Date().toISOString();
    if (reportDir)
      writeFileSync(join(reportDir, 'probe-report.json'), JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(JSON.stringify(report) + '\n');
    app.exit(report.status === 'passed' ? 0 : 1);
  }
}
void main();
