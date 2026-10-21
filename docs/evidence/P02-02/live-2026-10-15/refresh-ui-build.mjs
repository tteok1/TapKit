import { readFileSync, writeFileSync, readdirSync, lstatSync, renameSync } from 'node:fs';
import { join, relative, dirname, delimiter } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  directory,
  root,
  hash,
  readReview,
  productChanges,
  changedPaths,
  validateUiRefresh,
  rendererFingerprint,
} from './build-review.mjs';

const { reviewed } = readReview();
const commit = () =>
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const head = commit();
if (head !== reviewed.sourceCommit)
  throw Error('HEAD changed; review the acceptance baseline before refreshing UI');
const changes = productChanges();
validateUiRefresh(reviewed, changes);
const before = rendererFingerprint();
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
env.Path = dirname(process.execPath) + delimiter + (process.env.Path ?? process.env.PATH ?? '');
for (const key of [
  'TAPKIT_TEST_BUILD',
  'TAPKIT_CHAT_FIXTURE',
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_RENDERER_URL',
])
  delete env[key];
const pnpm = join(root, '.cache/tools/pnpm/package/bin/pnpm.mjs');
for (const command of ['check', 'build:desktop']) {
  console.log('UI refresh: pnpm ' + command);
  const result = spawnSync(process.execPath, [pnpm, command], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
validateUiRefresh(reviewed, productChanges());
if (changes !== productChanges() || head !== commit() || before !== rendererFingerprint())
  throw Error('Source changed during build; no new snapshot activated');
if (
  hash('packages/core/dist/index.cjs') !== reviewed.coreBuildSHA256 ||
  hash('apps/desktop/out/main/index.js') !== reviewed.mainBuildSHA256
)
  throw Error('Core or Host build differs; UI-only refresh refused');
if (
  readFileSync(join(root, 'packages/core/dist/index.cjs')).includes(
    Buffer.from('installChatFixture'),
  )
)
  throw Error('Fixture build is not permitted');
const id = Date.now() + '-' + randomUUID().slice(0, 8);
const reviewName = 'reviewed-source-ui-' + id + '.json';
const manifestName = 'verified-build-ui-' + id + '.json';
const review = {
  ...reviewed,
  checkedAt: new Date().toISOString(),
  productChanges: changes,
  sources: changedPaths(changes).map((path) => ({ path, sha256: hash(path) })),
  rendererFingerprint: before,
  previousValidation: reviewed.tests ?? reviewed.previousValidation,
  tests: { checkExitCode: 0, buildDesktopExitCode: 0 },
  reviewedScope:
    'UI-only refresh; frozen backend/runtime sources and Core/Host binaries unchanged. Manual UI outcomes remain in progress records.',
  validation:
    'pnpm check and build:desktop exit 0; existing backend/runtime source and Core/Host hashes unchanged',
  uiEvidence: 'Current UI build prepared; manual acceptance outcomes remain in progress records',
};
const files = [{ path: 'packages/core/dist/index.cjs', sha256: review.coreBuildSHA256 }];
function walk(file) {
  const info = lstatSync(file);
  if (info.isSymbolicLink()) throw Error('Build artifact links are not supported');
  if (info.isDirectory()) for (const name of readdirSync(file).sort()) walk(join(file, name));
  else if (info.isFile()) {
    const path = relative(root, file).replaceAll('\\', '/');
    files.push({ path, sha256: hash(path) });
  }
}
walk(join(root, 'apps/desktop/out'));
writeFileSync(join(directory, reviewName), JSON.stringify(review, null, 2) + '\n', { flag: 'wx' });
writeFileSync(
  join(directory, manifestName),
  JSON.stringify(
    {
      sourceCommit: head,
      sourceSHA256: review.sourceSHA256,
      sourceReview: reviewName,
      createdAt: review.checkedAt,
      files,
      uiEvidence: review.uiEvidence,
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
const pointer = { schemaVersion: 1, buildManifest: manifestName };
const temporary = join(directory, 'active-build-' + id + '.tmp');
writeFileSync(temporary, JSON.stringify(pointer, null, 2) + '\n', { flag: 'wx' });
renameSync(temporary, join(directory, 'active-build.json'));
console.log(
  JSON.stringify({
    status: 'ui_build_refreshed',
    sourceReview: reviewName,
    buildManifest: manifestName,
    files: files.length,
    originalProfileChanges: 0,
    modelRequests: 0,
  }),
);
