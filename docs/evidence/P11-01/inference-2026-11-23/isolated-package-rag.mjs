// Reproducible P11-01 package acceptance driver. Run from the repository root
// with TAPKIT_P11_DEV_PACKAGE pointing at the verified development directory.
import assert from 'node:assert/strict';
import { access, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { join, relative, resolve, sep } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, cleanupTestDirectories } from '../../../../scripts/test-temp.mjs';
import lock from '../../../../embedding-model-lock.json' with { type: 'json' };

const root = process.cwd();
const bundle = resolve(process.env.TAPKIT_P11_DEV_PACKAGE ?? '');
assert(bundle.startsWith(resolve('release') + sep));
assert.equal(await realpath(bundle), bundle);
const native = JSON.parse(await readFile(join(bundle, 'docs/evidence/P00-03/runtime-probe.json'), 'utf8'));
assert.equal(native.exitCode, 0);
assert.equal(native.tests.passed, 22);
assert(!(await readFile(join(bundle, 'packages/core/dist/index.cjs'), 'utf8')).includes('installChatFixture'));
await mkdir('.test-data', { recursive: true });
const dir = await mkdtemp(resolve('.test-data/P11-01 joint '));
let app;
try {
  await promisify(execFile)(process.execPath, [
    resolve('.cache/tools/pnpm/package/bin/pnpm.mjs'), 'exec', 'vitest', 'run', '--project', 'joint-fixture',
  ], { cwd: root, env: { ...process.env, TAPKIT_JOINT_FIXTURE_DIR: dir }, windowsHide: true, timeout: 550_000 });
  const { indexWork } = JSON.parse(await readFile(join(dir, 'joint-fixture.json'), 'utf8'));
  const cwd = join(dir, 'empty-cwd', 'nested');
  await mkdir(cwd, { recursive: true });
  const unavailableModelCandidates = [
    resolve(cwd, 'resources/models', lock.directory),
    resolve(cwd, '../../resources/models', lock.directory),
  ];
  for (const path of unavailableModelCandidates) {
    try { await access(join(path, 'config.json')); assert.fail('A non-bundle model candidate exists'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const env = { ...process.env, TAPKIT_DATA_DIR: dir };
  for (const key of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'TAPKIT_CHAT_FIXTURE', 'TAPKIT_WEB_FIXTURE', 'TAPKIT_P11_RENDERER_PROFILE']) delete env[key];
  app = await electron.launch({ executablePath: join(bundle, 'electron/electron.exe'),
    args: [join(bundle, 'apps/desktop')], cwd, env, chromiumSandbox: true });
  assert.equal(await app.evaluate(() => process.cwd()), cwd);
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  const deadline = Date.now() + 125_000;
  for (;;) {
    const capabilities = await page.evaluate(async () => {
      const id = crypto.randomUUID();
      const reply = await window.tapkit.bootstrap({ requestId: id.slice(0,14) + '7' + id.slice(15) });
      if (!reply.ok) throw Error(reply.error.code);
      return reply.data.runtimeCapabilities;
    });
    if (capabilities.nativeExecution.status === 'available') break;
    assert(Date.now() < deadline, 'Packaged native verification did not become available');
    assert.equal(capabilities.nativeExecution.reason, 'PROBE_IN_PROGRESS');
    await pause(250);
  }
  const started = performance.now();
  const result = await page.evaluate(async (scope) => {
    const id = crypto.randomUUID();
    const reply = await window.tapkit.projectCommand({ requestId: id.slice(0,14) + '7' + id.slice(15) },
      'knowledge.query', { ...scope, query: '联合索引基准', limit: 4 });
    if (!reply.ok) throw Error(reply.error.code);
    if (!('hits' in reply.data)) throw Error('KNOWLEDGE_REPLY');
    return { hits: reply.data.hits.length, scoped: reply.data.hits.every(hit =>
      hit.ref?.kind === 'file' && scope.selectedVersionIds.includes(hit.ref.versionId)) };
  }, indexWork);
  assert(result.hits > 0 && result.scoped);
  const report = { checkedAt: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse','HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
    runtime: 'development directory', directory: relative(root, bundle).replaceAll('\\','/'),
    scope: 'Actual packaged Core, worker and model; both CWD model fallbacks are absent. 16 cold scoped sources and standard history; no upstream or chat fixture.',
    isolatedCwd: true, nonBundleModelCandidatesAbsent: true, selectedSources: indexWork.selectedVersionIds.length,
    ...result, queryMs: performance.now() - started, passed: true };
  await mkdir('test-results/P11-01', { recursive: true });
  await writeFile('test-results/P11-01/package-rag.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await app?.close();
  await cleanupTestDirectories();
}
