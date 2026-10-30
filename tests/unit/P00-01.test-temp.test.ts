import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { checkTestTemporaries } from '../../scripts/check-test-temporaries.mjs';

const node = resolve('.runtime/node/node-v24.21.0-win-x64/node.exe');
const helper = pathToFileURL(resolve('scripts/test-temp.mjs')).href;
async function run(body: string) {
  const directory = await mkdtemp(resolve('.test-data/P00-01 temp cleanup regression-'));
  const output = execFileSync(
    node,
    [
      '--input-type=module',
      '-e',
      `import assert from 'node:assert/strict';
       import * as fs from 'node:fs';
       import { join } from 'node:path';
       import { mkdtemp, mkdtempSync, cleanupTestDirectories } from ${JSON.stringify(helper)};
       const root = process.argv[1];
       ${body}
       console.log('CLEANUP_REGRESSION_OK');`,
      directory,
    ],
    { encoding: 'utf8', timeout: 20_000 },
  );
  expect(output).toContain('CLEANUP_REGRESSION_OK');
}

test('P00-01 cleanup removes only directories created by this process and preserves account bytes', async () => {
  await run(`
    const account = join(root, 'existing-account');
    for (const folder of ['db', 'secrets', 'blobs', 'settings']) fs.mkdirSync(join(account, folder), {recursive:true});
    const retained = ['db/app.sqlite', 'secrets/encrypted-key', 'blobs/library-file', 'settings/preferences.json'];
    for (const name of retained) fs.writeFileSync(join(account, name), 'existing-' + name);
    const owned = await mkdtemp(join(root, 'owned-'));
    fs.writeFileSync(join(owned, 'synthetic.sqlite'), 'disposable');
    assert.equal((await cleanupTestDirectories()).removed, 1);
    assert.equal(fs.existsSync(owned), false);
    for (const name of retained) assert.equal(fs.readFileSync(join(account, name), 'utf8'), 'existing-' + name);
  `);
});

test('P00-01 cleanup supports synchronous, nested directories and already deleted fixtures', async () => {
  await run(`
    const parent = mkdtempSync(join(root, 'parent-'));
    await mkdtemp(join(parent, 'child-'));
    const gone = mkdtempSync(join(root, 'gone-')); fs.rmSync(gone, {recursive:true});
    await cleanupTestDirectories();
    assert.equal(fs.existsSync(parent), false);
    assert.equal((await cleanupTestDirectories()).removed, 0);
  `);
});

test('P00-01 cleanup rejects escaped prefixes and linked parents, without traversing child junctions', async () => {
  await run(`
    await assert.rejects(mkdtemp(join(root, '../../outside-')), /inside .test-data/);
    const target = join(root, 'retained'); fs.mkdirSync(target); fs.writeFileSync(join(target, 'important'), 'keep');
    const link = join(root, 'linked'); fs.symlinkSync(target, link, 'junction');
    await assert.rejects(mkdtemp(join(link, 'bad-')), /Linked/);
    const owned = await mkdtemp(join(root, 'owned-'));
    fs.symlinkSync(target, join(owned, 'link'), 'junction');
    await cleanupTestDirectories();
    assert.equal(fs.readFileSync(join(target, 'important'), 'utf8'), 'keep');
  `);
});

test('P00-01 cleanup refuses to remove a directory replaced after creation', async () => {
  await run(`
    const owned = await mkdtemp(join(root, 'owned-'));
    fs.renameSync(owned, owned + '-original'); fs.mkdirSync(owned);
    fs.writeFileSync(join(owned, 'important'), 'replacement');
    await assert.rejects(cleanupTestDirectories(), /cleanup failed/);
    assert.equal(fs.readFileSync(join(owned, 'important'), 'utf8'), 'replacement');
  `);
});

test('P00-01 cleanup keeps failed-run data only through an explicit debugging opt-in', async () => {
  await run(`
    const owned = await mkdtemp(join(root, 'owned-'));
    process.env.TAPKIT_KEEP_TEST_DATA = '1';
    assert.deepEqual(await cleanupTestDirectories(), {removed:0, kept:1});
    assert.equal(fs.existsSync(owned), true);
    delete process.env.TAPKIT_KEEP_TEST_DATA;
    assert.equal((await cleanupTestDirectories()).removed, 1);
  `);
});

test('P00-01 automated tests ignore an inherited account profile', async () => {
  // setup.ts replaces the inherited path with a newly owned directory on every test file.
  const root = process.env.TAPKIT_DATA_DIR!;
  expect(root).toContain(resolve('.test-data'));
  await mkdir(join(root, 'tmp'), { recursive: true });
  await writeFile(join(root, 'tmp/lifecycle-probe'), 'synthetic');
});

test('P00-01 checks reject unmanaged test allocation, including aliased native imports', () => {
  expect(() =>
    checkTestTemporaries(
      "import { mkdtemp as allocate } from 'node:fs/promises';",
      'tests/unit/example.test.ts',
    ),
  ).toThrow('owned test directories');
  expect(() =>
    checkTestTemporaries(
      "import { mkdtemp } from '../../scripts/test-temp.mjs';",
      'tests/unit/example.test.ts',
    ),
  ).not.toThrow();
});

test('P00-01 checks reject Electron tests that bypass the cleanup fixture', () => {
  expect(() =>
    checkTestTemporaries("import { test } from '@playwright/test';", 'tests/e2e/example.spec.ts'),
  ).toThrow('worker cleanup');
  expect(() =>
    checkTestTemporaries("import { test } from './test';", 'tests/e2e/example.spec.ts'),
  ).not.toThrow();
});
