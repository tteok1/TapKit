import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { safeStorage } from 'electron';
vi.mock('electron', () => ({ safeStorage: {}, shell: {} }));
import { AuthSecrets } from '../../apps/desktop/src/main/auth/secrets';
test('P05-01 legacy search credentials cannot be saved or read, but explicit removal remains possible', async () => {
  await mkdir('.test-data', { recursive: true });
  const directory = await mkdtemp(resolve('.test-data', 'P05-01 vault '));
  const crypto = {
    isEncryptionAvailable: () => true,
    decryptString: vi.fn(),
    encryptString: vi.fn(),
  } as unknown as typeof safeStorage;
  const secrets = new AuthSecrets(directory, crypto, async () => {});
  await writeFile(join(directory, 'tavily-key'), 'synthetic-legacy-encrypted-bytes');
  await expect(
    secrets.invoke('web.key', '01990000-0000-7000-8000-000000000001', {}),
  ).rejects.toThrow('FEATURE_NOT_AVAILABLE');
  expect(() => secrets.saveSearchKey('unwanted-new-secret')).toThrow();
  expect(crypto.decryptString).not.toHaveBeenCalled();
  expect(crypto.encryptString).not.toHaveBeenCalled();
  expect(await secrets.saveSearchKey('')).toBe(true);
  await expect(readFile(join(directory, 'tavily-key'))).rejects.toMatchObject({ code: 'ENOENT' });
});
