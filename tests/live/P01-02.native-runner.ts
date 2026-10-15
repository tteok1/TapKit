import { app } from 'electron';
import { createRequire } from 'node:module';
import { realpathSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { AuthSecrets } from '../../apps/desktop/src/main/auth/secrets';
import { VaultService } from '../../apps/desktop/src/main/vault';
import { ApiKeyAdapter } from '../../packages/providers/src';
import {
  selectNativeAccount,
  nativeProfilePath,
  nativeSelectionHash,
  containedPath,
} from './P01-02.native-profile';
import { runNativePhase } from './P01-02.native-acceptance';
import type { Store } from '../../packages/storage/src';

const root = resolve(__dirname, '../..');
const [phase, requested, provider, account, expectedHash, caseId, mode] = process.argv.slice(2);
async function main() {
  let store: Store | undefined;
  try {
    if (
      process.argv.length !== 9 ||
      !['save', 'resume'].includes(phase ?? '') ||
      !requested ||
      !provider ||
      !account ||
      !/^[a-f0-9]{64}$/.test(expectedHash ?? '') ||
      !/^[a-f0-9-]{36}$/.test(caseId ?? '') ||
      !['fixture', 'live'].includes(mode ?? '')
    )
      throw new Error('VALIDATION_ERROR');
    const fixture = mode === 'fixture';
    if (!fixture && process.env.TAPKIT_API_NATIVE_LIVE !== '1')
      throw new Error('PERMISSION_DENIED');
    const directory = nativeProfilePath(root, requested, fixture);
    const selection = selectNativeAccount(root, directory, provider, account, fixture);
    if (nativeSelectionHash(selection) !== expectedHash) throw new Error('CONFLICT');
    const reportDir = realpathSync(join(root, 'test-results/P01-02-native', caseId!));
    containedPath(realpathSync(join(root, 'test-results/P01-02-native')), reportDir);
    if (
      reportDir.toLowerCase() !== resolve(root, 'test-results/P01-02-native', caseId!).toLowerCase()
    )
      throw new Error('PERMISSION_DENIED');
    app.setName('TapKit');
    app.setPath('userData', directory);
    if (!app.requestSingleInstanceLock()) throw new Error('CONFLICT');
    await app.whenReady();
    const { openStore } = createRequire(__filename)(
      '../../packages/storage/dist/index.cjs',
    ) as typeof import('../../packages/storage/src');
    store = await openStore(directory);
    const secrets = new AuthSecrets(join(directory, 'secrets'));
    if (fixture && phase === 'save') {
      // Only marked fixture profiles can seed this known synthetic Key. No real credential is read or copied.
      const row = store.db
        .prepare('SELECT credential_id FROM provider_accounts WHERE id=?')
        .get(account) as { credential_id: string };
      await new VaultService(join(directory, 'secrets')).save(row.credential_id, {
        ...selection.config,
        label: 'native fixture',
        key: 'P01-02-synthetic-key',
      });
    }
    const report = await runNativePhase({
      store,
      selection,
      caseId: caseId!,
      phase: phase as 'save' | 'resume',
      reportDir,
      vault: (operation, id, payload) => secrets.invoke(operation, id, payload),
      ...(fixture
        ? {
            configure: (providers) => {
              const adapter = providers.adapter(account!);
              if (!(adapter instanceof ApiKeyAdapter)) throw new Error('PERMISSION_DENIED');
              const fixturePath = join(directory, 'response-fixture.json');
              const setting = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
                response?: string;
                missingUsage?: boolean;
                fail?: boolean;
              };
              (adapter as unknown as { fetcher: typeof fetch }).fetcher = async () => {
                if (setting.fail) throw new Error('NETWORK_ERROR');
                const text = setting.response ?? 'TAPKIT_NATIVE_OK';
                const frames = [
                  { choices: [{ index: 0, delta: { content: text }, finish_reason: null }] },
                  { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
                  ...(!setting.missingUsage
                    ? [{ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } }]
                    : []),
                ];
                return new Response(
                  frames.map((f) => 'data: ' + JSON.stringify(f) + '\n\n').join('') +
                    'data: [DONE]\n\n',
                  {
                    headers: { 'content-type': 'text/event-stream' },
                  },
                );
              };
            },
          }
        : {}),
    });
    await secrets.settled;
    store.close();
    store = undefined;
    // The only output is a path and fixed outcome. Native/Key/answer data never goes to stdout.
    process.stdout.write(
      JSON.stringify({
        phase,
        status: report.status,
        reportPath: join(reportDir, phase + '-report.json'),
      }) + '\n',
    );
    app.exit(report.status === 'passed' ? 0 : 1);
  } catch {
    store?.close();
    process.stderr.write(
      'P01-02 native phase NOT COMPLETED: isolated profile, lock, opt-in or phase validation failed. No retry.\n',
    );
    app.exit(2);
  }
}
void main();
