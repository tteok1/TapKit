import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const evidence = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(evidence, '../../../..');
const previous = JSON.parse(readFileSync(join(root, 'docs/evidence/P02-03/forms-theme-2026-10-23/results.json'), 'utf8'));
const sources = [...new Set([...Object.keys(previous.productSourceSha256), 'apps/desktop/src/renderer/src/bookmarks.tsx'])].sort();
const tests = ['tests/unit/P02-03.contracts.test.ts', 'tests/integration/P02-03.history.test.ts', 'tests/e2e/P02-03.feedback-bookmarks.spec.ts', 'tests/e2e/P02-01.navigation.spec.ts'];
const hash = (path) => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
const hashes = (paths) => Object.fromEntries(paths.map((path) => [path, hash(path)]));
const productSourceSha256 = hashes(sources);
const testSourceSha256 = hashes(tests);
if (process.argv[2] === 'freeze') {
  writeFileSync(join(evidence, 'source-frozen.json'), JSON.stringify({ productSourceSha256, testSourceSha256 }, null, 2) + '\n');
  console.log(`Frozen ${sources.length} product sources and ${tests.length} test sources`);
} else {
  const frozen = JSON.parse(readFileSync(join(evidence, 'source-frozen.json'), 'utf8'));
  if (JSON.stringify(frozen) !== JSON.stringify({ productSourceSha256, testSourceSha256 })) throw new Error('Source changed during verification');
  function files(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [relative(root, join(dir, entry.name)).replaceAll('\\', '/')]);
  }
  const artifactSha256 = hashes([...files(join(root, 'apps/desktop/out')), ...files(join(root, 'packages/core/dist'))].sort());
  if (readFileSync(join(root, 'packages/core/dist/index.cjs'), 'utf8').includes('installChatFixture')) throw new Error('Test fixture remains in production Core');
  writeFileSync(join(evidence, 'production-snapshot.json'), JSON.stringify({ productSourceSha256, testSourceSha256, production: { artifactSha256, fixtureAbsent: true } }, null, 2) + '\n');
  console.log(`Verified unchanged sources and ${Object.keys(artifactSha256).length} production artifacts; fixture absent`);
}
