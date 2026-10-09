import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { safeStorage } from 'electron';
vi.mock('electron', () => ({ safeStorage: {}, shell: { openExternal: vi.fn() } }));
import { AuthSecrets } from '../../apps/desktop/src/main/auth/secrets';
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
const accountId = '01990000-0000-7000-8000-000000000001';
const ref = '01990000-0000-7000-8000-000000000002';
const credential = {
  type: 'oauth',
  access: 'mock-secret-access',
  refresh: 'mock-secret-refresh',
  expires: 100,
  accountId: 'mock-account',
};
const crypto = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(Buffer.from(value).map((byte) => byte ^ 0xa7)),
  decryptString: (value: Buffer) => Buffer.from(value.map((byte) => byte ^ 0xa7)).toString(),
} as typeof safeStorage;
async function fresh() {
  const directory = await mkdtemp(resolve('.test-data', 'P01-01-vault-'));
  directories.push(directory);
  return { directory, secrets: new AuthSecrets(directory, crypto, async () => {}) };
}
describe('P01-01 Host-private credential and native persistence', () => {
  it('P02-03 native purge validates account and branch for every item before deletion', async () => {
    const { directory, secrets } = await fresh();
    const branchId = '01990000-0000-7000-8000-000000000003';
    const binding = { accountId, branchId, modelId: 'mock', adapterVersion: 'mock/1' };
    await secrets.invoke('native.save', accountId, {
      ref,
      binding,
      value: { text: 'private fixture' },
    });
    await expect(
      secrets.invoke('native.purge', accountId, { refs: [{ ref, branchId: accountId }] }),
    ).rejects.toThrow('PERMISSION_DENIED');
    await expect(
      secrets.invoke('native.purge', ref, { refs: [{ ref, branchId }] }),
    ).rejects.toThrow('PERMISSION_DENIED');
    expect(await readdir(directory)).toContain('opaque-' + ref);
    await secrets.invoke('native.purge', accountId, { refs: [{ ref, branchId }] });
    await secrets.invoke('native.purge', accountId, { refs: [{ ref, branchId }] });
    expect(await readdir(directory)).not.toContain('opaque-' + ref);
  });
  it('persists ciphertext, restarts, rejects stale CAS, and retains logout tombstone', async () => {
    const { directory, secrets } = await fresh();
    await secrets.invoke('credential.write', accountId, { expectedVersion: 0, credential });
    const bytes = await readFile(join(directory, 'codex-' + accountId));
    expect(bytes.toString()).not.toContain('mock-secret');
    const restarted = new AuthSecrets(directory, crypto, async () => {});
    expect(await restarted.invoke('credential.read', accountId, {})).toEqual({
      version: 1,
      credential,
    });
    await restarted.invoke('credential.write', accountId, { expectedVersion: 1 });
    await expect(
      secrets.invoke('credential.write', accountId, { expectedVersion: 1, credential }),
    ).rejects.toThrow('CONFLICT');
    expect(await restarted.invoke('credential.read', accountId, {})).toEqual({ version: 2 });
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
  it('never replaces old ciphertext on encryption or ACL failure', async () => {
    const { directory, secrets } = await fresh();
    await secrets.invoke('credential.write', accountId, { expectedVersion: 0, credential });
    const denied = new AuthSecrets(directory, crypto, async () => {
      throw new Error('DENIED');
    });
    await expect(
      denied.invoke('credential.write', accountId, {
        expectedVersion: 1,
        credential: { ...credential, refresh: 'rotated' },
      }),
    ).rejects.toThrow();
    expect(await secrets.invoke('credential.read', accountId, {})).toEqual({
      version: 1,
      credential,
    });
  });
  it('binds native state to account/model/adapter/branch and hides private reasoning', async () => {
    const { directory, secrets } = await fresh();
    const binding = {
      accountId,
      modelId: 'gpt-5.5',
      adapterVersion: 'mock/1',
      branchId: 'branch-1',
    };
    const value = { thinkingSignature: 'private-native-signature' };
    const { contentHash } = (await secrets.invoke('native.save', accountId, {
      ref,
      binding,
      value,
    })) as { contentHash: string };
    expect((await readFile(join(directory, 'opaque-' + ref))).toString()).not.toContain(
      'private-native-signature',
    );
    expect(await secrets.invoke('native.load', accountId, { ref, binding, contentHash })).toEqual(
      value,
    );
    await expect(
      secrets.invoke('native.load', accountId, { ref, binding, contentHash: '0'.repeat(64) }),
    ).rejects.toThrow('CONFLICT');
    await expect(
      secrets.invoke('native.load', accountId, {
        ref,
        contentHash,
        binding: { ...binding, branchId: 'branch-2' },
      }),
    ).rejects.toThrow('PERMISSION_DENIED');
    await expect(secrets.invoke('native.load', ref, { ref, binding, contentHash })).rejects.toThrow(
      'PERMISSION_DENIED',
    );
  });
  it('only opens upstream OAuth pages and rejects untrusted hosts and paths', async () => {
    const { directory } = await fresh();
    const browser = vi.fn().mockResolvedValue(undefined);
    const secrets = new AuthSecrets(directory, crypto, async () => {}, browser);
    for (const url of [
      'https://evil.example/oauth/authorize',
      'file:///C:/private',
      'https://auth.openai.com/other',
    ])
      await expect(secrets.invoke('browser.open', accountId, { url })).rejects.toThrow();
    await secrets.invoke('browser.open', accountId, {
      url: 'https://auth.openai.com/codex/device',
    });
    expect(browser).toHaveBeenCalledTimes(1);
  });
});
