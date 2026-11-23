import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron } from './test';
import { waitCoreReady, waitRuntimeCapabilities } from './core-ready';

test('P11-01 production retrieval: BGE worker indexes scoped local material', async () => {
  test.setTimeout(900_000);
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data/P11-01 joint '));
  await promisify(execFile)(
    process.execPath,
    [
      resolve('.cache/tools/pnpm/package/bin/pnpm.mjs'),
      'exec',
      'vitest',
      'run',
      '--project',
      'joint-fixture',
    ],
    { env: { ...process.env, TAPKIT_JOINT_FIXTURE_DIR: dir }, windowsHide: true, timeout: 550_000 },
  );
  const { indexWork } = JSON.parse(await readFile(join(dir, 'joint-fixture.json'), 'utf8')) as {
    indexWork: { projectId: string; selectedVersionIds: string[] };
  };
  const bundle = process.env.TAPKIT_P11_DEV_PACKAGE
    ? resolve(process.env.TAPKIT_P11_DEV_PACKAGE)
    : undefined;
  if (bundle)
    expect(await readFile(join(bundle, 'packages/core/dist/index.cjs'), 'utf8')).not.toContain(
      'installChatFixture',
    );
  // No chat fixture marker or upstream provider is configured for this profile.
  const env: NodeJS.ProcessEnv = { ...process.env, TAPKIT_DATA_DIR: dir };
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'ELECTRON_RENDERER_URL',
    'TAPKIT_CHAT_FIXTURE',
    'TAPKIT_WEB_FIXTURE',
  ])
    delete env[key];
  const app = await electron.launch({
    ...(bundle ? { executablePath: join(bundle, 'electron/electron.exe') } : {}),
    args: [bundle ? join(bundle, 'apps/desktop') : resolve('apps/desktop')],
    env: Object.fromEntries(
      Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
    chromiumSandbox: true,
  });
  let result: { hits: number; scoped: boolean } | undefined;
  let queryMs = 0;
  try {
    const page = await app.firstWindow();
    await waitCoreReady(page);
    const capabilities = await waitRuntimeCapabilities(page);
    expect(capabilities.nativeExecution).toEqual({ status: 'available' });
    const started = performance.now();
    result = await page.evaluate(async (scope) => {
      const value = crypto.randomUUID();
      const reply = await window.tapkit.projectCommand(
        { requestId: value.slice(0, 14) + '7' + value.slice(15) },
        'knowledge.query',
        { ...scope, query: '联合索引基准', limit: 4 },
      );
      if (!reply.ok) throw Error(reply.error.code);
      if (!('hits' in reply.data)) throw Error('KNOWLEDGE_REPLY');
      return {
        hits: reply.data.hits.length,
        scoped: reply.data.hits.every(
          (hit) =>
            'ref' in hit &&
            hit.ref.kind === 'file' &&
            scope.selectedVersionIds.includes(hit.ref.versionId),
        ),
      };
    }, indexWork);
    queryMs = performance.now() - started;
    expect(result.hits).toBeGreaterThan(0);
    expect(result.scoped).toBe(true);
  } finally {
    await app.close();
  }
  await mkdir('test-results/P11-01', { recursive: true });
  await writeFile(
    'test-results/P11-01/package-rag.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        commit: execFileSync('git', ['rev-parse', 'HEAD'], {
          encoding: 'utf8',
          windowsHide: true,
        }).trim(),
        runtime: bundle ? 'development directory' : 'source build',
        directory: bundle ? relative(process.cwd(), bundle).replaceAll('\\', '/') : null,
        scope:
          'Actual Core IPC and real BGE worker; 16 cold selected sources alongside the standard fixture; no upstream requests and no chat fixture marker.',
        selectedSources: indexWork.selectedVersionIds.length,
        ...result,
        queryMs,
        passed: true,
      },
      null,
      2,
    ) + '\n',
  );
});
