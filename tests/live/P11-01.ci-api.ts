import { randomUUID } from 'node:crypto';
import { resolveApiConfig, type NativeBinding } from '../../packages/contracts/src';
import { ApiKeyAdapter, API_ADAPTER_VERSION } from '../../packages/providers/src/api/adapter';
import { runApiAcceptance } from './P01-02.acceptance';

async function main() {
  const provider = process.argv[2];
  const resources = { deepseek: 'R02', hunyuan: 'R03', xai: 'R04', doubao: 'R05' } as const;
  const key = process.env.TAPKIT_P11_API_KEY;
  delete process.env.TAPKIT_P11_API_KEY;
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.GITHUB_SHA !== process.env.TAPKIT_P11_CHECKED_OUT_SHA ||
    !provider ||
    !Object.hasOwn(resources, provider) ||
    !key ||
    key.length > 8192 ||
    /[\r\n]/.test(key)
  ) {
    console.error('P11-01 API live requires an approved main dispatch and a configured secret.');
    process.exitCode = 2;
    return;
  }
  const selected = provider as keyof typeof resources;
  const modelId = process.env.TAPKIT_P11_MODEL_ID?.trim();
  const config = resolveApiConfig(selected, modelId ? { modelId } : {});
  if (!config.modelId) {
    console.error('P11-01 API live requires an enabled model ID for this provider.');
    process.exitCode = 2;
    return;
  }
  const accountId = randomUUID();
  const values = new Map<string, { binding: string; value: unknown }>();
  const adapter = new ApiKeyAdapter(accountId, config, async () => key, {
    async save(binding: NativeBinding, value: unknown) {
      const ref = randomUUID();
      values.set(ref, { binding: JSON.stringify(binding), value });
      return ref;
    },
    async load(ref: string, binding: NativeBinding) {
      const value = values.get(ref);
      if (!value || value.binding !== JSON.stringify(binding)) throw Error('PERMISSION_DENIED');
      return value.value;
    },
  });
  try {
    const report = await runApiAcceptance(adapter, { accountId, label: 'ci-live', config });
    console.log(
      JSON.stringify({
        task: 'P11-01',
        resource: resources[selected],
        commit: process.env.GITHUB_SHA,
        model: config.modelId,
        adapter: API_ADAPTER_VERSION,
        os: process.platform + '/' + process.arch,
        usageSource: 'provider-reported-or-null',
        ...{
          status: report.status,
          requests: report.requests,
          checks: report.checks,
          limits: report.limits,
        },
      }),
    );
    process.exitCode = report.status === 'passed' ? 0 : 1;
  } finally {
    values.clear();
  }
}
main().catch(() => {
  console.error('P11-01 live failed before producing a safe report.');
  process.exitCode = 2;
});
