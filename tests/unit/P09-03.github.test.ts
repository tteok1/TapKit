import type { safeStorage } from 'electron';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import {
  GitHubConnectSchema,
  GitHubRepoSchema,
  CodePathSchema,
} from '../../packages/contracts/src';
import { NetworkPolicyService } from '../../packages/network/src';
import { AuthSecrets } from '../../apps/desktop/src/main/auth/secrets';

vi.mock('electron', () => ({ safeStorage: {}, shell: { openExternal: vi.fn() } }));
const token = 'github_pat_' + 'unit_fixture_'.repeat(5);
const profile = '01990000-0000-7000-8000-000000000001';
const runId = '01990000-0000-7000-8000-000000000002';
const crypto = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(Buffer.from(value).map((byte) => byte ^ 0xa7)),
  decryptString: (value: Buffer) => Buffer.from(value.map((byte) => byte ^ 0xa7)).toString(),
} as typeof safeStorage;

test('P09-03 PAT Vault is encrypted and scoped by profile and run across restarts', async () => {
  const dir = await mkdtemp(resolve('.test-data/P09-03-vault-'));
  const account = {
    id: '01990000-0000-7000-8000-000000000003',
    runId,
    repo: 'owner/repo',
    login: 'owner',
    repositoryId: 42,
    defaultBranch: 'main',
    contentsWrite: true,
    pullRequestsWrite: false,
  };
  const vault = new AuthSecrets(dir, crypto, async () => {});
  const otherProfile = '01990000-0000-7000-8000-000000000004';
  const path = join(dir, `github-${profile}-${runId}`);
  await vault.invoke('github.write', profile, { account, token });
  expect((await readFile(path)).includes(Buffer.from(token))).toBe(false);
  const restarted = new AuthSecrets(dir, crypto, async () => {});
  expect(await restarted.invoke('github.read', otherProfile, { runId })).toBeNull();
  expect(await restarted.invoke('github.read', profile, { runId: account.id })).toBeNull();
  expect(
    ((await restarted.invoke('github.read', profile, { runId })) as { account: unknown }).account,
  ).toEqual(account);
  await restarted.invoke('github.delete', profile, { runId });
  expect(await vault.invoke('github.read', profile, { runId })).toBeNull();
  await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('P09-03 rejects arbitrary remote URLs, credential injection and unsafe file-map keys', () => {
  for (const repo of [
    'https://github.com/owner/repo',
    'owner/../repo',
    'owner/repo?x',
    'owner/.',
    'owner/repo.git',
    'owner/repo%2fother',
  ])
    expect(GitHubRepoSchema.safeParse(repo).success).toBe(false);
  const connection = {
    runId,
    repo: 'Owner/Repo',
    token,
    contentsWrite: false,
    pullRequestsWrite: false,
  };
  expect(GitHubConnectSchema.parse(connection).repo).toBe('owner/repo');
  expect(
    GitHubConnectSchema.safeParse({ ...connection, token: `${token}\r\nX-Injected: 1` }).success,
  ).toBe(false);
  expect(
    GitHubConnectSchema.safeParse({ ...connection, proxyURL: 'http://example.invalid' }).success,
  ).toBe(false);
  for (const path of ['__proto__', 'constructor', '.git/config', '.env.local', 'keys/id_ed25519'])
    expect(CodePathSchema.safeParse(path).success).toBe(false);
});

test('P09-03 authenticated REST refuses off-origin and private DNS and never follows a redirect', async () => {
  const local = new NetworkPolicyService({
    resolve: async () => [{ address: '127.0.0.1', family: 4 }],
  });
  await expect(local.github('https://api.github.com/repos/owner/repo', token)).rejects.toThrow(
    'PERMISSION_DENIED',
  );
  await expect(
    local.github('https://api.github.com.example.invalid/repos/owner/repo', token),
  ).rejects.toThrow('PERMISSION_DENIED');
  await expect(local.github('https://api.github.com:444/repos/owner/repo', token)).rejects.toThrow(
    'PERMISSION_DENIED',
  );
  const policy = new NetworkPolicyService({
    resolve: async () => [{ address: '93.184.215.14', family: 4 }],
  });
  type Wire = {
    wire: (
      ...args: unknown[]
    ) => Promise<{ url: string; status: number; headers: Record<string, string>; bytes: Buffer }>;
  };
  const wire = vi.spyOn(policy as unknown as Wire, 'wire').mockResolvedValue({
    url: 'https://api.github.com/repos/owner/repo',
    status: 302,
    headers: { location: 'https://example.invalid/' },
    bytes: Buffer.alloc(0),
  });
  const reply = await policy.github('https://api.github.com/repos/owner/repo', token);
  expect(reply.status).toBe(302);
  expect(wire).toHaveBeenCalledTimes(1);
  const headers = wire.mock.calls[0]?.[4] as Record<string, string>;
  expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  expect(headers.Authorization === 'Bearer ' + token).toBe(true);
});
