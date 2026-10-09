import { it, expect, vi } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { safeStorage } from 'electron';
vi.mock('electron', () => ({ safeStorage: {}, shell: { openExternal: vi.fn() } }));
import { VaultService } from '../../apps/desktop/src/main/vault';
import { AuthSecrets } from '../../apps/desktop/src/main/auth/secrets';
import { resolveApiConfig } from '../../packages/contracts/src';
import { accountId } from '../fixtures/P01-02.api';
const credentialId = '01990000-0000-7000-8000-000000000002';
const crypto = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(Buffer.from(value).map((byte) => byte ^ 0xa7)),
  decryptString: (value: Buffer) => Buffer.from(value.map((byte) => byte ^ 0xa7)).toString(),
} as typeof safeStorage;
it('P01-02 Host keeps encrypted API keys across restart, binds destination/protocol/model and clears exactly one file', async () => {
  const directory = await mkdtemp(resolve('.test-data', 'P01-02-vault-'));
  const vault = new VaultService(directory, crypto, async () => {});
  const config = resolveApiConfig('anthropic-compatible', {
      baseURL: 'https://trusted.example/v1',
      modelId: 'mock-model',
    }),
    input = { ...config, label: 'fixture', key: 'fixture-private-key' };
  await vault.save(credentialId, input);
  expect((await readFile(join(directory, credentialId))).toString()).not.toContain(input.key);
  const secrets = new AuthSecrets(directory, crypto, async () => {}),
    binding = { ...config, credentialId };
  expect(await secrets.invoke('api-key.read', accountId, binding)).toEqual({ key: input.key });
  const restarted = new AuthSecrets(directory, crypto, async () => {});
  await expect(
    restarted.invoke('api-key.read', '01990000-0000-7000-8000-000000000009', binding),
  ).rejects.toThrow('PERMISSION_DENIED');
  expect(await vault.save(credentialId, input)).toBe(credentialId);
  for (const changed of [
    { baseURL: 'https://other.example/v1' },
    { apiFormat: 'openai-chat' },
    { modelId: 'other' },
    { providerId: 'openai-compatible' },
  ])
    await expect(
      secrets.invoke('api-key.read', accountId, { ...binding, ...changed }),
    ).rejects.toThrow('PERMISSION_DENIED');
  await expect(vault.save(credentialId, { ...input, key: 'changed' })).rejects.toThrow('CONFLICT');
  const other = '01990000-0000-7000-8000-000000000003';
  await vault.save(other, input);
  const ciphertext = await readFile(join(directory, credentialId));
  await secrets.invoke('api-key.delete', accountId, binding);
  expect(await secrets.invoke('api-key.read', accountId, binding)).toEqual({});
  expect(
    await secrets.invoke('api-key.read', accountId, { ...binding, credentialId: other }),
  ).toEqual({ key: input.key });
  await expect(readFile(join(directory, credentialId))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(vault.save(credentialId, input)).rejects.toThrow('CONFLICT');
  expect((await readFile(join(directory, 'revoked-' + credentialId))).toString()).not.toContain(
    input.key,
  );
  // Simulate interruption after the durable tombstone but before key-file unlink.
  await writeFile(join(directory, credentialId), ciphertext);
  expect(await restarted.invoke('api-key.read', accountId, binding)).toEqual({});
  await restarted.invoke('api-key.delete', accountId, binding);
  await expect(readFile(join(directory, credentialId))).rejects.toMatchObject({ code: 'ENOENT' });
});
