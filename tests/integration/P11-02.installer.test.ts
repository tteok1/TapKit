import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { mkdtemp, testRoot } from '../../scripts/test-temp.mjs';
import {
  checkInstallerRelease,
  downloadInstaller,
  selectInstallerRelease,
} from '../../apps/desktop/src/main/installer-updates';
import { inspectPayload, inventoryFile, verifyPayload } from '../../scripts/installer/payload.mjs';
import { openStore, SCHEMA_VERSION } from '../../packages/storage/src';

const owner = 'tteok1/TapKit';
const installer = Buffer.from('P11-02 synthetic installer bytes');
const sha256 = createHash('sha256').update(installer).digest('hex');
function release(version: string, digest = 'sha256:' + sha256) {
  const name = 'TapKit-' + version + '-windows-x64-development.exe';
  return {
    draft: false,
    tag_name: 'v' + version,
    assets: [
      {
        name,
        digest,
        state: 'uploaded',
        size: installer.length,
        browser_download_url:
          'https://github.com/' + owner + '/releases/download/v' + version + '/' + name,
      },
    ],
  };
}

test('P11-02 only selects a newer development installer with the expected release URL and SHA-256', () => {
  const redirected = release('2.0.0');
  redirected.assets[0]!.browser_download_url = 'https://example.com/setup.exe';
  expect(
    selectInstallerRelease(
      [release('1.2.0'), release('1.10.0'), redirected, release('2.1.0', '')],
      owner,
      '1.1.0',
    ),
  ).toMatchObject({ version: '1.10.0', sha256, bytes: installer.length });
  expect(selectInstallerRelease([release('1.0.0')], owner, '1.0.0')).toBeUndefined();
});

test('P11-02 update check is opt-in and reports an unavailable feed on failure', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
  await expect(checkInstallerRelease(fetch, owner, '1.0.0')).rejects.toThrow('UPDATE_UNAVAILABLE');
  expect(fetch).toHaveBeenCalledWith(
    'https://api.github.com/repos/tteok1/TapKit/releases?per_page=15',
    expect.objectContaining({ redirect: 'error', credentials: 'omit' }),
  );
});

test('P11-02 publishes only verified bytes and never overwrites an existing installer', async () => {
  const dir = await mkdtemp(join(testRoot, 'P11-02-update-'));
  const target = join(dir, 'setup.exe');
  const selected = selectInstallerRelease([release('1.1.0')], owner, '1.0.0')!;
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(installer)));
  await expect(
    downloadInstaller(fetch, { ...selected, sha256: '0'.repeat(64) }, target),
  ).rejects.toThrow('UPDATE_HASH');
  expect(await readdir(dir)).toEqual([]);
  await downloadInstaller(fetch, selected, target);
  expect(await readFile(target)).toEqual(installer);
  await expect(downloadInstaller(fetch, selected, target)).rejects.toMatchObject({
    code: 'EEXIST',
  });
  expect(await readdir(dir)).toEqual(['setup.exe']);
});

test('P11-02 rejects untrusted download redirects before contacting the target', async () => {
  const dir = await mkdtemp(join(testRoot, 'P11-02-redirect-'));
  const selected = selectInstallerRelease([release('1.1.0')], owner, '1.0.0')!;
  const fetch = vi.fn().mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { Location: 'https://example.com/unknown.exe' },
    }),
  );
  await expect(downloadInstaller(fetch, selected, join(dir, 'setup.exe'))).rejects.toThrow(
    'UPDATE_REDIRECT',
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await readdir(dir)).toEqual([]);
});

test('P11-02 validates extracted files and rejects mutation or unexpected files', async () => {
  const dir = await mkdtemp(join(testRoot, 'P11-02-integrity-'));
  const inventory = join(dir, inventoryFile);
  const app = join(dir, 'TapKit.exe');
  await mkdir(dirname(inventory), { recursive: true });
  await writeFile(app, installer);
  await writeFile(
    inventory,
    JSON.stringify({ schemaVersion: 1, files: await inspectPayload(dir) }),
  );
  await expect(verifyPayload(dir)).resolves.toBeUndefined();
  await writeFile(join(dir, 'extra.dll'), 'unexpected library');
  await expect(verifyPayload(dir)).rejects.toThrow('INSTALLATION_FILE_MISMATCH: extra.dll');
  await writeFile(app, 'tampered executable');
  await expect(verifyPayload(dir)).rejects.toThrow('INSTALLATION_FILE_MISMATCH: TapKit.exe');
});

test('P11-02 leaves a newer database and pending restore untouched on older startup', async () => {
  const dir = await mkdtemp(join(testRoot, 'P11-02-future-schema-'));
  const live = join(dir, 'db/app.sqlite');
  const pending = join(dir, 'db/pending-restore.json');
  const store = await openStore(dir);
  store.db.pragma('user_version = ' + (SCHEMA_VERSION + 1));
  store.close();
  const bytes = await readFile(live);
  await writeFile(pending, '{}');
  await expect(openStore(dir)).rejects.toThrow('DATABASE_RECOVERY_REQUIRED');
  expect(await readFile(live)).toEqual(bytes);
  expect(await readFile(pending, 'utf8')).toBe('{}');
});
