import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, symlink, writeFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import {
  encodeNativePreviewProfile,
  restoreNativePreviewProfile,
  publishNativePreviewHandoff,
  readNativePreviewHandoff,
  nativePreviewMarker,
  nativePreviewMarkerText,
} from '../fixtures/P03-native-preview-handoff';

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const node = resolve('.runtime/node/node-v24.21.0-win-x64/node.exe');
const helperUrl = pathToFileURL(resolve('scripts/test-temp.mjs')).href;
const handoffUrl = pathToFileURL(resolve('tests/fixtures/P03-native-preview-handoff.ts')).href;
async function fixture() {
  const root = await mkdtemp(resolve('.test-data/P00-01 preview handoff-'));
  const profile = join(root, 'profile');
  await mkdir(join(profile, 'db'), { recursive: true });
  await mkdir(join(profile, 'blobs/sha256'), { recursive: true });
  await writeFile(join(profile, 'db/app.sqlite'), 'synthetic closed database');
  await writeFile(join(profile, nativePreviewMarker), nativePreviewMarkerText);
  return { root, profile };
}

test('P00-01 preview handoff survives producer cleanup and is restored by a separate consumer process', async () => {
  const driver = await fixture();
  const producer = JSON.parse(
    execFileSync(
      node,
      [
        '--input-type=module',
        '-e',
        `
    import {mkdir, writeFile} from 'node:fs/promises';
    import {existsSync} from 'node:fs';
    import {join, resolve} from 'node:path';
    import {createHash} from 'node:crypto';
    import {mkdtemp, cleanupTestDirectories} from ${JSON.stringify(helperUrl)};
    import {encodeNativePreviewProfile, nativePreviewMarker, nativePreviewMarkerText} from ${JSON.stringify(handoffUrl)};
    const root = await mkdtemp(resolve('.test-data/P00-01 handoff producer-'));
    const profile = join(root, 'profile');
    await mkdir(join(profile, 'db'), {recursive:true});
    await mkdir(join(profile, 'blobs/sha256'), {recursive:true});
    await mkdir(join(profile, 'backups/migrations'), {recursive:true});
    await writeFile(join(profile, 'db/app.sqlite'), 'synthetic database across processes');
    await writeFile(join(profile, 'backups/migrations/old.sqlite'), 'unneeded migration copy');
    await writeFile(join(profile, nativePreviewMarker), nativePreviewMarkerText);
    const bytes = await encodeNativePreviewProfile(profile);
    await cleanupTestDirectories();
    if(existsSync(root)) throw Error('Producer data retained');
    console.log(JSON.stringify({archive:bytes.toString('base64'),sha:createHash('sha256').update(bytes).digest('hex'),root}));
  `,
      ],
      { encoding: 'utf8', timeout: 20_000 },
    ),
  ) as { archive: string; sha: string; root: string };
  await expect(access(producer.root)).rejects.toMatchObject({ code: 'ENOENT' });
  const artifact = join(driver.root, 'handoff.json');
  await writeFile(artifact, JSON.stringify(producer));
  const output = execFileSync(
    node,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import {existsSync, readFileSync} from 'node:fs';
    import {join, resolve} from 'node:path';
    import {mkdtemp, cleanupTestDirectories} from ${JSON.stringify(helperUrl)};
    import {restoreNativePreviewProfile} from ${JSON.stringify(handoffUrl)};
    const frame=JSON.parse(readFileSync(process.argv[1], 'utf8'));
    const root=await mkdtemp(resolve('.test-data/P00-01 handoff consumer-'));
    const profile=join(root,'profile');
    await restoreNativePreviewProfile(Buffer.from(frame.archive,'base64'),frame.sha,profile);
    assert.equal(readFileSync(join(profile,'db/app.sqlite'),'utf8'),'synthetic database across processes');
    assert.equal(existsSync(join(profile,'backups')),false);
    await cleanupTestDirectories();
    assert.equal(existsSync(root),false);
    console.log('CONSUMER_AND_CLEANUP_OK');
  `,
      artifact,
    ],
    { encoding: 'utf8', timeout: 20_000 },
  );
  expect(output).toContain('CONSUMER_AND_CLEANUP_OK');
});

test('P00-01 preview handoff overwrites one bounded artifact and leaves no partial file', async () => {
  const { root, profile } = await fixture();
  const path = join(root, 'handoff.json');
  const metadata = {
    source: 'real NativeSandboxExecutor/OfficeWorker' as const,
    peakConcurrentOfficeRenders: 2,
    samples: [],
  };
  await publishNativePreviewHandoff(profile, metadata, path);
  const first = await readNativePreviewHandoff(path);
  await writeFile(join(profile, 'db/app.sqlite'), 'second synthetic database');
  await publishNativePreviewHandoff(profile, metadata, path);
  const second = await readNativePreviewHandoff(path);
  expect(second.profileArchiveSha256).not.toBe(first.profileArchiveSha256);
  expect((await readdir(root)).filter((name) => name.startsWith('handoff'))).toEqual([
    'handoff.json',
  ]);
});

test('P00-01 preview handoff rejects unowned profiles and all credential directories', async () => {
  const { root, profile } = await fixture();
  const unowned = join(root, 'unowned');
  await mkdir(unowned);
  await expect(encodeNativePreviewProfile(join(unowned, 'profile'))).rejects.toThrow(
    'Not an owned',
  );
  await mkdir(join(profile, 'secrets'));
  await writeFile(join(profile, 'secrets/opaque'), 'synthetic protected ciphertext');
  await expect(encodeNativePreviewProfile(profile)).rejects.toThrow('credential-free');
  expect(await readFile(join(profile, 'secrets/opaque'), 'utf8')).toBe(
    'synthetic protected ciphertext',
  );
});

test('P00-01 preview handoff rejects corruption and unsafe entries before creating a destination', async () => {
  const { root, profile } = await fixture();
  const archive = await encodeNativePreviewProfile(profile);
  const target = join(root, 'restored');
  await expect(restoreNativePreviewProfile(archive, '0'.repeat(64), target)).rejects.toThrow(
    'integrity',
  );
  const original = JSON.parse(gunzipSync(archive).toString('utf8'));
  for (const frame of [
    { ...original, files: [{ ...original.files[0], path: '../outside' }] },
    { ...original, files: [original.files[0], original.files[0]] },
    { ...original, files: [{ ...original.files[0], sha256: '0'.repeat(64) }] },
    { ...original, files: [] },
    { ...original, files: Array(257).fill(original.files[0]) },
  ]) {
    const bytes = gzipSync(Buffer.from(JSON.stringify(frame)));
    await expect(restoreNativePreviewProfile(bytes, sha(bytes), target)).rejects.toThrow();
    await expect(access(target)).rejects.toMatchObject({ code: 'ENOENT' });
  }
});

test('P00-01 preview handoff never overwrites an existing destination or follows a source junction', async () => {
  const { root, profile } = await fixture();
  const archive = await encodeNativePreviewProfile(profile);
  await expect(restoreNativePreviewProfile(archive, sha(archive), profile)).rejects.toMatchObject({
    code: 'EEXIST',
  });
  expect(await readFile(join(profile, 'db/app.sqlite'), 'utf8')).toBe('synthetic closed database');
  const retained = join(root, 'retained');
  await mkdir(retained);
  await writeFile(join(retained, 'app.sqlite'), 'retained database');
  await rename(join(profile, 'db'), join(profile, 'db-original'));
  await symlink(retained, join(profile, 'db'), 'junction');
  await expect(encodeNativePreviewProfile(profile)).rejects.toThrow('Linked');
  expect(await readFile(join(retained, 'app.sqlite'), 'utf8')).toBe('retained database');
});
