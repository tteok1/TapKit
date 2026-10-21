import { _electron as electron } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../../..');
const outputName = process.argv[2] ?? 'original-attachment-retry.json';
if (!/^original-attachment-retry(?:-[a-z0-9-]+)?\.json$/.test(outputName))
  throw new Error('Invalid observation filename');
const manifest = JSON.parse(
  await readFile(
    join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
    'utf8',
  ),
);
const source = JSON.parse(
  await readFile(join(directory, 'attachment-failure-diagnosis.json'), 'utf8'),
);
if (
  manifest.root !== root ||
  dirname(manifest.dataDir) !== join(root, '.test-data') ||
  !manifest.dataDir.split(/[\\/]/).at(-1).startsWith('P01-02-app-zhipu-chat-')
)
  throw new Error('Original acceptance directory mismatch');
const native = JSON.parse(
  await readFile(
    join(directory, 'native-recovery-current-user-20261019/runtime-probe.json'),
    'utf8',
  ),
);
const parser = JSON.parse(
  await readFile(join(directory, 'parser-current-user/parser-probe.json'), 'utf8'),
);
if (
  native.verification?.scope !== 'current-user' ||
  native.exitCode !== 0 ||
  native.tests?.passed !== 22 ||
  native.missingCases?.length !== 0 ||
  native.standardUser !== false ||
  parser.passed !== true ||
  parser.tests?.passed !== 3
)
  throw new Error('Scoped native/parser verification must pass first');
const result = {
  task: 'P02-03',
  purpose:
    'One authorized retry of the already saved synthetic attachment through production Host/Core APIs',
  startedAt: new Date().toISOString(),
  dataDirectoryMatches: false,
  nativeCapabilities: null,
  before: null,
  after: null,
  retryRequestId: null,
  retryCount: 0,
  modelRequests: 0,
  manualSqlWrites: 0,
  accountOrKeyConfigurationChanges: 0,
  screenshotsOrMessageBodiesExported: false,
  failure: null,
};
const newId = () => {
  const id = randomUUID();
  return id.slice(0, 14) + '7' + id.slice(15);
};
const env = { ...process.env, TAPKIT_DATA_DIR: manifest.dataDir };
for (const key of [
  'ELECTRON_RUN_AS_NODE',
  'TAPKIT_CHAT_FIXTURE',
  'TAPKIT_TEST_BUILD',
  'ELECTRON_RENDERER_URL',
  'TAPKIT_TOOL_TRACE',
  'TAPKIT_TOOL_TRACE_PROFILE',
  'TAPKIT_TOOL_TRACE_CASE',
])
  delete env[key];
let app;
try {
  app = await electron.launch({
    args: [join(root, 'apps/desktop')],
    cwd: root,
    executablePath: join(root, 'node_modules/electron/dist/electron.exe'),
    env,
    chromiumSandbox: true,
    timeout: 120000,
  });
  result.dataDirectoryMatches = await app.evaluate(
    ({ app }, expected) => app.getPath('userData') === expected,
    manifest.dataDir,
  );
  if (!result.dataDirectoryMatches)
    throw new Error('Unexpected app profile; no mutation attempted');
  const page = await app.firstWindow({ timeout: 120000 });
  await page
    .getByTestId('core-status')
    .filter({ hasText: '本地核心已连接' })
    .waitFor({ state: 'attached', timeout: 120000 });
  const bootstrap = await page.evaluate(async (requestId) => {
    const r = await window.tapkit.bootstrap({ requestId });
    if (!r.ok) throw new Error('BOOTSTRAP_' + r.error.code);
    return r.data.runtimeCapabilities;
  }, newId());
  result.nativeCapabilities = bootstrap;
  console.log('Production Core connected; current-account capabilities received.');
  if (
    !['nativeExecution', 'officeRender', 'terminal'].every(
      (key) => bootstrap?.[key]?.status === 'available',
    )
  )
    throw new Error('Production Core did not accept scoped capability evidence');
  async function metadata() {
    return page.evaluate(
      async ({ requestId, fileId, versionId }) => {
        const r = await window.tapkit.fileCommand({ requestId }, 'files.get', {
          fileId,
          versionId,
        });
        if (!r.ok) throw new Error('SYNTHETIC_FILE_' + r.error.code);
        const f = r.data.file;
        return {
          fileId: f.id,
          name: f.name,
          currentVersionId: f.currentVersionId,
          status: f.status,
          revision: f.revision,
          versionId: f.version.id,
          sha256: f.version.sha256,
          sizeBytes: f.version.sizeBytes,
          parseStatus: f.version.parseStatus,
          parserVersion: f.version.parserVersion,
          errorCode: f.version.errorCode,
          errorReason: f.version.errorReason,
        };
      },
      { requestId: newId(), fileId: source.file.fileId, versionId: source.file.versionId },
    );
  }
  const before = await metadata();
  result.before = before;
  if (
    before.name !== 'synthetic-attachment-1019.txt' ||
    before.versionId !== source.file.versionId ||
    before.currentVersionId !== source.file.versionId ||
    before.sha256 !== source.syntheticOriginal.sourceSHA256 ||
    before.sizeBytes !== 154
  )
    throw new Error('Synthetic attachment binding changed; no retry attempted');
  if (before.parseStatus !== 'ready') {
    if (before.parseStatus !== 'failed' || before.errorReason !== 'SANDBOX_UNAVAILABLE')
      throw new Error('Unexpected initial parse state; no retry attempted');
    result.retryRequestId = newId();
    await page.evaluate(
      async ({ requestId, fileVersionId }) => {
        const r = await window.tapkit.fileCommand({ requestId }, 'files.retryParse', {
          fileVersionId,
        });
        if (!r.ok) throw new Error('RETRY_' + r.error.code);
        if (r.data.changedIds?.length !== 1 || r.data.changedIds[0] !== fileVersionId)
          throw new Error('Unexpected retry receipt');
      },
      { requestId: result.retryRequestId, fileVersionId: before.versionId },
    );
    result.retryCount = 1;
    console.log('The single synthetic attachment retry was accepted.');
  }
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const current = await metadata();
    result.after = current;
    if (current.parseStatus === 'ready') break;
    if (current.parseStatus === 'failed')
      throw new Error('Synthetic parsing failed: ' + current.errorReason);
    await new Promise((resolveResult) => setTimeout(resolveResult, 500));
  }
  if (
    result.after?.parseStatus !== 'ready' ||
    result.after.sha256 !== before.sha256 ||
    result.after.versionId !== before.versionId ||
    result.after.errorCode !== null ||
    !result.after.parserVersion
  )
    throw new Error('Synthetic original did not recover unchanged');
} catch (error) {
  result.failure = String(error.message).replaceAll(root, '<repo>').slice(0, 500);
  process.exitCode = 1;
} finally {
  if (app) {
    try {
      await app.close({ timeout: 30000 });
      result.appClosed = true;
    } catch {
      result.appClosed = false;
      result.failure ??= 'Production app close requires review';
      process.exitCode = 1;
    }
  }
  result.endedAt = new Date().toISOString();
  await writeFile(join(directory, outputName), JSON.stringify(result, null, 2) + '\n', {
    flag: 'wx',
  });
  console.log(
    JSON.stringify({
      recovered: result.after?.parseStatus === 'ready' && !result.failure,
      retryCount: result.retryCount,
      appClosed: result.appClosed,
      failure: result.failure,
    }),
  );
}
