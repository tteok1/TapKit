// Review-only reproductions: assertions describe current defects, not acceptance.
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openStore, newId, type Store } from '../../../packages/storage/src';
import { ProviderService, type PrivateVault } from '../../../packages/core/src/provider-service';
import { CodexAdapter } from '../../../packages/providers/src';
import { LoginViewSchema, ProviderListSchema, type Reply } from '../../../packages/contracts/src';
import {
  accountId,
  credentials,
  nativeStore,
  request as modelRequest,
  token,
} from '../../../tests/fixtures/P01-01.codex';

const services: ProviderService[] = [];
const stores: Store[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.stop();
  for (const store of stores.splice(0)) store.close();
  vi.unstubAllGlobals();
});
const request = (command: string, payload: unknown, expectedRevision?: number) => ({
  protocolVersion: 1,
  requestId: newId(),
  command,
  payload,
  ...(expectedRevision ? { expectedRevision } : {}),
});
function data(reply: Reply) {
  if (!reply.ok) throw new Error(reply.error.code);
  return reply.data;
}

it('P01-01 review: disconnect during pending OAuth can be undone by its callback', async () => {
  const store = await openStore(await mkdtemp(resolve('.test-data', 'P01-01-review-')));
  stores.push(store);
  const documents = new Map<string, { version: number; credential?: unknown }>();
  let authorize: URL | undefined;
  const vault: PrivateVault = async (operation, id, payload) => {
    if (operation === 'browser.open') {
      authorize = new URL((payload as { url: string }).url);
      return {};
    }
    if (operation === 'credential.read')
      return structuredClone(documents.get(id) ?? { version: 0 });
    if (operation === 'credential.write') {
      const input = payload as { expectedVersion: number; credential?: unknown };
      const old = documents.get(id) ?? { version: 0 };
      if (old.version !== input.expectedVersion) throw new Error('CONFLICT');
      documents.set(id, {
        version: old.version + 1,
        ...(input.credential ? { credential: input.credential } : {}),
      });
      return {};
    }
    throw new Error('Unexpected vault operation');
  };
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        access_token: token(),
        refresh_token: 'mock-refresh',
        expires_in: 3600,
      }),
    ),
  );
  const service = new ProviderService(store, vault);
  services.push(service);
  const login = LoginViewSchema.parse(
    data(
      await service.dispatch(
        request('providers.startLogin', {
          providerId: 'codex-subscription',
          method: 'browser',
          label: 'review',
        }),
      ),
    ),
  );
  let current = login;
  await vi.waitFor(async () => {
    current = LoginViewSchema.parse(
      data(await service.dispatch(request('providers.loginStatus', { loginId: login.loginId }))),
    );
    expect(current.promptId).toBeDefined();
  });
  const account = ProviderListSchema.parse(
    data(await service.dispatch(request('providers.list', {}))),
  ).accounts[0]!;
  expect(
    await service.dispatch(
      request('providers.disconnect', { accountId: account.accountId }, account.revision),
    ),
  ).toMatchObject({ ok: true });
  expect(documents.get(account.accountId)?.credential).toBeUndefined();
  const callback = new URL('http://localhost:1455/auth/callback');
  callback.searchParams.set('code', 'mock-code');
  callback.searchParams.set('state', authorize!.searchParams.get('state')!);
  expect(
    await service.dispatch(
      request('providers.answerLogin', {
        loginId: login.loginId,
        promptId: current.promptId!,
        value: callback.href,
      }),
    ),
  ).toMatchObject({ ok: true });
  await vi.waitFor(async () => {
    expect(
      LoginViewSchema.parse(
        data(await service.dispatch(request('providers.loginStatus', { loginId: login.loginId }))),
      ).status,
    ).toBe('completed');
  });
  expect(documents.get(account.accountId)?.credential).toBeDefined();
});

it('P01-01 review: rejected OAuth refresh is reported as interrupted stream', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: { code: 'invalid_grant' } }, { status: 401 })),
  );
  const modelFetch = vi.fn<typeof fetch>();
  const adapter = new CodexAdapter(accountId, credentials(0), nativeStore(), modelFetch);
  const events = [];
  for await (const event of adapter.stream(modelRequest(), new AbortController().signal))
    events.push(event);
  expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'STREAM_INTERRUPTED' } });
  expect(modelFetch).not.toHaveBeenCalled();
  expect(
    await adapter.checkConnection({ accountId, modelId: 'gpt-5.5' }, new AbortController().signal),
  ).toMatchObject({ status: 'unavailable', errorCode: 'STREAM_INTERRUPTED' });
});

it('P01-01 review: simultaneous probes bypass the guard and leave the first untracked', async () => {
  const store = await openStore(await mkdtemp(resolve('.test-data', 'P01-01-review-')));
  stores.push(store);
  store.db
    .prepare(
      "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status) VALUES (?,?,?,?,'codex-subscription','review','oauth',?,'ready')",
    )
    .run(accountId, store.profileId, store.now(), store.now(), accountId);
  const service = new ProviderService(store, async () => ({}));
  services.push(service);
  const signals: AbortSignal[] = [];
  const releases: (() => void)[] = [];
  const fake = {
    listModels: async () => [{ modelId: 'gpt-5.5' }],
    checkConnection: async (_: unknown, signal: AbortSignal) => {
      signals.push(signal);
      await new Promise<void>((resolve) => releases.push(resolve));
      return {
        accountId,
        modelId: 'gpt-5.5',
        status: 'ready',
        errorCode: null,
        text: true,
        tools: true,
      };
    },
    models: { getModel: () => ({ contextWindow: 1000, maxTokens: 1000 }), logout: async () => {} },
  };
  (service as unknown as { channels: Map<string, unknown> }).channels.set(accountId, fake);
  const a = service.dispatch(request('providers.check', { accountId, modelId: 'gpt-5.5' }, 1));
  const b = service.dispatch(request('providers.check', { accountId, modelId: 'gpt-5.5' }, 1));
  await vi.waitFor(() => expect(signals).toHaveLength(2));
  releases[0]!();
  expect(await a).toMatchObject({ ok: true });
  expect((service as unknown as { probes: Map<string, unknown> }).probes.size).toBe(0);
  expect(await service.dispatch(request('providers.disconnect', { accountId }, 2))).toMatchObject({
    ok: true,
  });
  expect(signals[1]!.aborted).toBe(false);
  releases[1]!();
  expect(await b).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
});
