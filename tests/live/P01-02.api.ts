import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiKeyAdapter, API_ADAPTER_VERSION } from '../../packages/providers/src/api/adapter';
import type { NativeBinding } from '../../packages/contracts/src';
import type { NativeStateStore } from '../../packages/providers/src/codex/adapter';
import { runApiAcceptance } from './P01-02.acceptance';
import { selectApiLiveAccount } from './P01-02.profile';
import { auditedApiFetch, type ApiRequestAudit } from './P01-02.audit';

async function main() {
  const [mode, root, directory, provider, account, expectedBinding, runMode] =
    process.argv.slice(2);
  if (
    !['--describe', '--run'].includes(mode ?? '') ||
    !root ||
    !directory ||
    !provider ||
    !account ||
    (runMode !== undefined && !['full', 'text-only'].includes(runMode)) ||
    process.argv.length !== (mode === '--run' ? (runMode ? 9 : 8) : 7)
  )
    throw new Error('VALIDATION_ERROR');
  const selection = selectApiLiveAccount(root, directory, provider, account);
  const bindingHash = createHash('sha256').update(JSON.stringify(selection)).digest('hex');
  if (mode === '--describe') {
    process.stdout.write(
      JSON.stringify({ ...selection, bindingHash, requests: 6, maxOutputTokens: 768 }) + '\n',
    );
    return;
  }
  if (process.env.TAPKIT_API_LIVE !== '1') throw new Error('PERMISSION_DENIED');
  if (bindingHash !== expectedBinding) throw new Error('CONFLICT');
  // The user enters the Key in a local secure prompt. No command-line/environment Key.
  let key = '';
  for await (const bytes of process.stdin) {
    key += bytes.toString('utf8');
    if (key.length > 8192) throw new Error('VALIDATION_ERROR');
  }
  key = key.trim();
  if (!key || /[\r\n]/.test(key)) throw new Error('AUTH_REQUIRED');
  const values = new Map<string, { binding: NativeBinding; value: unknown }>();
  const native: NativeStateStore = {
    save: async (binding, value) => {
      const ref = randomUUID();
      values.set(ref, { binding: structuredClone(binding), value: structuredClone(value) });
      return ref;
    },
    load: async (ref, binding) => {
      const entry = values.get(ref);
      if (!entry || JSON.stringify(entry.binding) !== JSON.stringify(binding))
        throw new Error('PERMISSION_DENIED');
      return structuredClone(entry.value);
    },
  };
  try {
    const requestAudit: ApiRequestAudit[] = [];
    const adapter = new ApiKeyAdapter(
      selection.accountId,
      selection.config,
      async () => key,
      native,
      auditedApiFetch(selection.config, requestAudit),
    );
    const result = await runApiAcceptance(adapter, selection, new AbortController().signal, {
      textOnly: runMode === 'text-only',
    });
    const report = {
      ...result,
      ...selection,
      runMode: runMode ?? 'full',
      fullAcceptancePassed: runMode !== 'text-only' && result.status === 'passed',
      requestAudit,
      adapterVersion: API_ADAPTER_VERSION,
      checkedAt: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      network: 'production-secure-api-fetch',
      proxySetting:
        process.env.TAPKIT_HTTP_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY
          ? 'process-env'
          : 'direct-default',
      nativeStorage: 'memory-only',
      credentialSource: 'user-secure-prompt',
      profileModified: false,
      retries: 0,
    };
    const output = join(root, 'test-results', 'P01-02-live', randomUUID());
    mkdirSync(output, { recursive: true });
    const path = join(output, 'connection-report.json');
    writeFileSync(path, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(JSON.stringify({ ...report, reportPath: path }, null, 2) + '\n');
    process.exitCode = result.status === 'passed' ? 0 : 1;
  } finally {
    key = '';
    values.clear();
  }
}
main().catch(() => {
  // Never print untrusted exception text or stack frames containing provider data.
  process.stderr.write(
    'P01-02 live NOT COMPLETED: profile, opt-in or input validation failed. No automatic retry.\n',
  );
  process.exitCode = 2;
});
