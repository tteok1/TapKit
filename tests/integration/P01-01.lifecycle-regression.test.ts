import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openStore, newId, type Store } from '../../packages/storage/src';
import { ProviderService, type PrivateVault } from '../../packages/core/src/provider-service';
import { CodexAdapter, AccountCredentialStore } from '../../packages/providers/src';
import { LoginViewSchema, ProviderListSchema, type Reply } from '../../packages/contracts/src';
import {
  accountId,
  credentials,
  nativeStore,
  request as modelRequest,
  token,
} from '../fixtures/P01-01.codex';

const services: ProviderService[] = [];
const stores: Store[] = [];
const releases: (() => void)[] = [];
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  for (const service of services.splice(0)) await service.stop();
  for (const store of stores.splice(0)) store.close();
  vi.unstubAllGlobals();
});
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  releases.push(release);
  return { promise, release };
}
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
async function fresh(vault: PrivateVault) {
  const store = await openStore(await mkdtemp(resolve('.test-data', 'P01-01-regression-')));
  stores.push(store);
  const service = new ProviderService(store, vault);
  services.push(service);
  return { store, service };
}
async function loginFixture(blockWrite = false) {
  const documents = new Map<string, { version: number; credential?: unknown }>();
  let authorize: URL | undefined;
  let writing = false;
  const writeGate = gate();
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
      if (blockWrite && input.credential) {
        writing = true;
        await writeGate.promise;
      }
      documents.set(id, {
        version: old.version + 1,
        ...(input.credential ? { credential: input.credential } : {}),
      });
      return {};
    }
    throw new Error('Unexpected vault operation');
  };
  const exchange = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      access_token: token(),
      refresh_token: 'mock-refresh',
      expires_in: 3600,
    }),
  );
  vi.stubGlobal('fetch', exchange);
  const { service } = await fresh(vault);
  const login = LoginViewSchema.parse(
    data(
      await service.dispatch(
        request('providers.startLogin', {
          providerId: 'codex-subscription',
          method: 'browser',
          label: 'regression',
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
  const callback = new URL('http://localhost:1455/auth/callback');
  callback.searchParams.set('code', 'mock-code');
  callback.searchParams.set('state', authorize!.searchParams.get('state')!);
  const answer = () =>
    service.dispatch(
      request('providers.answerLogin', {
        loginId: login.loginId,
        promptId: current.promptId!,
        value: callback.href,
      }),
    );
  return {
    service,
    documents,
    account,
    login,
    answer,
    exchange,
    writeGate,
    writing: () => writing,
  };
}

it('P01-01 rejects a pending OAuth callback after successful disconnect', async () => {
  const fixture = await loginFixture();
  const { service, account, login, documents, answer, exchange } = fixture;
  expect(
    await service.dispatch(
      request('providers.disconnect', { accountId: account.accountId }, account.revision),
    ),
  ).toMatchObject({ ok: true });
  expect(await answer()).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  expect(
    LoginViewSchema.parse(
      data(await service.dispatch(request('providers.loginStatus', { loginId: login.loginId }))),
    ).status,
  ).toBe('cancelled');
  expect(documents.get(account.accountId)?.credential).toBeUndefined();
  expect(
    ProviderListSchema.parse(data(await service.dispatch(request('providers.list', {})))).accounts,
  ).toEqual([]);
  expect(exchange).not.toHaveBeenCalled();
});

it('P01-01 clears an old empty account record without removing another account or making network requests', async () => {
  const other = newId();
  const writes: string[] = [];
  const vault: PrivateVault = async (operation, id) => {
    if (operation === 'credential.read')
      return id === other
        ? {
            version: 1,
            credential: {
              type: 'oauth',
              access: token(),
              refresh: 'mock-refresh',
              expires: Date.now() + 3600000,
              accountId: 'mock-account',
            },
          }
        : { version: 0 };
    if (operation === 'credential.write') {
      writes.push(id);
      return {};
    }
    throw new Error('Unexpected vault operation');
  };
  const { store, service } = await fresh(vault);
  for (const id of [accountId, other])
    store.db
      .prepare(
        "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status) VALUES (?,?,?,?,'codex-subscription','mock-clear','oauth',?,'unconfigured')",
      )
      .run(id, store.profileId, store.now(), store.now(), id);
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
  expect(await service.dispatch(request('providers.disconnect', { accountId }, 1))).toMatchObject({
    ok: true,
  });
  const listed = ProviderListSchema.parse(
    data(await service.dispatch(request('providers.list', {}))),
  );
  expect(listed.accounts).toHaveLength(1);
  expect(listed.accounts[0]).toMatchObject({ accountId: other, hasCredential: true });
  expect(writes).toEqual([accountId]);
  expect(
    store.db.prepare('SELECT deleted_at FROM provider_accounts WHERE id=?').get(accountId),
  ).toMatchObject({ deleted_at: expect.any(Number) });
  expect(await service.dispatch(request('providers.check', { accountId }, 1))).toMatchObject({
    ok: false,
    error: { code: 'NOT_FOUND' },
  });
  expect(fetcher).not.toHaveBeenCalled();
});

it('P01-01 disconnect waits for an already-started credential write then leaves a tombstone', async () => {
  const fixture = await loginFixture(true);
  const { service, account, documents, answer, writeGate, writing, login } = fixture;
  expect(await answer()).toMatchObject({ ok: true });
  await vi.waitFor(() => expect(writing()).toBe(true));
  let disconnected = false;
  const disconnect = service
    .dispatch(request('providers.disconnect', { accountId: account.accountId }, account.revision))
    .then((result) => {
      disconnected = true;
      return result;
    });
  await Promise.resolve();
  expect(disconnected).toBe(false);
  expect(
    await service.dispatch(
      request('providers.check', { accountId: account.accountId }, account.revision),
    ),
  ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  writeGate.release();
  expect(await disconnect).toMatchObject({ ok: true });
  expect(documents.get(account.accountId)).toMatchObject({ version: 3 });
  expect(documents.get(account.accountId)?.credential).toBeUndefined();
  expect(
    LoginViewSchema.parse(
      data(await service.dispatch(request('providers.loginStatus', { loginId: login.loginId }))),
    ).status,
  ).toBe('cancelled');
});

it.each([
  [401, 'invalid_grant', 'AUTH_EXPIRED', false],
  [400, 'invalid_grant', 'AUTH_EXPIRED', false],
  [403, 'forbidden', 'PERMISSION_DENIED', false],
  [429, 'rate_limited', 'RATE_LIMITED', true],
  [503, 'overloaded', 'PROVIDER_UNAVAILABLE', true],
])(
  'P01-01 preserves structured OAuth refresh failure %i/%s as %s',
  async (status, code, expected, retryable) => {
    const refresh = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ error: code, error_description: 'private-upstream-text' }, { status }),
      );
    vi.stubGlobal('fetch', refresh);
    const modelFetch = vi.fn<typeof fetch>();
    const adapter = new CodexAdapter(accountId, credentials(0), nativeStore(), modelFetch);
    const events = [];
    for await (const event of adapter.stream(modelRequest(), new AbortController().signal))
      events.push(event);
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { code: expected, httpStatus: status, upstreamCode: code, retryable },
    });
    expect(JSON.stringify(events)).not.toContain('private-upstream-text');
    expect(modelFetch).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
    if (expected === 'AUTH_EXPIRED')
      expect(
        await adapter.checkConnection(
          { accountId, modelId: 'gpt-5.5' },
          new AbortController().signal,
        ),
      ).toMatchObject({ status: 'expired', errorCode: 'AUTH_EXPIRED' });
  },
);

it('P01-01 distinguishes refresh network failure from expired credentials', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockRejectedValue(new Error('private-network-details')),
  );
  const modelFetch = vi.fn<typeof fetch>();
  const adapter = new CodexAdapter(accountId, credentials(0), nativeStore(), modelFetch);
  const events = [];
  for await (const event of adapter.stream(modelRequest(), new AbortController().signal))
    events.push(event);
  expect(events.at(-1)).toMatchObject({
    type: 'error',
    error: { code: 'NETWORK_ERROR', retryable: true },
  });
  expect(JSON.stringify(events)).not.toContain('private-network-details');
  expect(modelFetch).not.toHaveBeenCalled();
});

it.each(['malformed', 'different-account'])(
  'P01-01 rejects %s refresh output without changing the credential or exposing tokens',
  async (kind) => {
    const differentToken =
      'e30.' +
      Buffer.from(
        JSON.stringify({
          'https://api.openai.com/auth': { chatgpt_account_id: 'other-account' },
        }),
      ).toString('base64url') +
      '.private';
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          access_token: kind === 'malformed' ? 'private-invalid-token' : differentToken,
          refresh_token: 'private-rotated-refresh',
          expires_in: 3600,
        }),
      ),
    );
    const store = credentials(0);
    const before = await store.read('openai-codex');
    const modelFetch = vi.fn<typeof fetch>();
    const adapter = new CodexAdapter(accountId, store, nativeStore(), modelFetch);
    const events = [];
    for await (const event of adapter.stream(modelRequest(), new AbortController().signal))
      events.push(event);
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'PROVIDER_UNAVAILABLE', retryable: false },
    });
    expect(await store.read('openai-codex')).toEqual(before);
    expect(JSON.stringify(events)).not.toContain('private');
    expect(modelFetch).not.toHaveBeenCalled();
  },
);

it('P01-01 does not dispatch a model request if rotated credentials cannot be persisted', async () => {
  const initial = await credentials(0).read('openai-codex');
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      expect(String(url)).toBe('https://auth.openai.com/oauth/token');
      expect(init?.redirect).toBe('error');
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('client_id')).toBe('app_EMoamEEZ73f0CkXaXp7hrann');
      return Response.json({
        access_token: token(),
        refresh_token: 'private-rotated',
        expires_in: 3600,
      });
    }),
  );
  const store = new AccountCredentialStore({
    read: async () => ({ version: 1, ...(initial ? { credential: initial } : {}) }),
    write: async () => {
      throw new Error('private-disk-error');
    },
  });
  const modelFetch = vi.fn<typeof fetch>();
  const adapter = new CodexAdapter(accountId, store, nativeStore(), modelFetch);
  const events = [];
  for await (const event of adapter.stream(modelRequest(), new AbortController().signal))
    events.push(event);
  expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'PROVIDER_UNAVAILABLE' } });
  expect(await store.read('openai-codex')).toEqual(initial);
  expect(JSON.stringify(events)).not.toContain('private');
  expect(modelFetch).not.toHaveBeenCalled();
});

it('P01-01 cancels an in-flight refresh without releasing tokens or starting a model request', async () => {
  const controller = new AbortController();
  const entered = gate();
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      entered.release();
      return new Promise<Response>((_resolve, reject) =>
        init!.signal!.addEventListener('abort', () => reject(new Error('cancelled')), {
          once: true,
        }),
      );
    }),
  );
  const modelFetch = vi.fn<typeof fetch>();
  const store = credentials(0);
  const adapter = new CodexAdapter(accountId, store, nativeStore(), modelFetch);
  const done = (async () => {
    const events = [];
    for await (const event of adapter.stream(modelRequest(), controller.signal)) events.push(event);
    return events;
  })();
  await entered.promise;
  controller.abort();
  expect((await done).at(-1)).toMatchObject({ type: 'error', error: { code: 'CANCELLED' } });
  expect(await store.read('openai-codex')).toMatchObject({ expires: 0, refresh: 'mock-refresh' });
  expect(modelFetch).not.toHaveBeenCalled();
});

it('P01-01 keeps failed probe cleanup from poisoning a subsequent check', async () => {
  const { store, service } = await fresh(async () => ({}));
  store.db
    .prepare(
      "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status) VALUES (?,?,?,?,'codex-subscription','test','oauth',?,'ready')",
    )
    .run(accountId, store.profileId, store.now(), store.now(), accountId);
  const listing = gate();
  const active = gate();
  const signals: AbortSignal[] = [];
  const fake = {
    listModels: vi.fn().mockImplementation(async () => {
      await listing.promise;
      return [{ modelId: 'gpt-5.5' }];
    }),
    checkConnection: vi
      .fn()
      .mockImplementation(async (_input: { accountId: string }, signal: AbortSignal) => {
        signals.push(signal);
        await active.promise;
        return {
          accountId: _input.accountId,
          modelId: 'gpt-5.5',
          status: 'ready',
          errorCode: null,
          text: true,
          tools: true,
        };
      }),
    models: {
      getModel: () => ({ contextWindow: 1000, maxTokens: 1000 }),
      logout: vi.fn().mockResolvedValue(undefined),
    },
  };
  (service as unknown as { channels: Map<string, unknown> }).channels.set(accountId, fake);
  const a = service.dispatch(request('providers.check', { accountId, modelId: 'gpt-5.5' }, 1));
  const b = service.dispatch(request('providers.check', { accountId, modelId: 'gpt-5.5' }, 1));
  expect(await b).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  listing.release();
  await vi.waitFor(() => expect(signals).toHaveLength(1));
  const disconnect = service.dispatch(request('providers.disconnect', { accountId }, 1));
  expect(signals[0]!.aborted).toBe(true);
  expect(await service.dispatch(request('providers.check', { accountId }, 1))).toMatchObject({
    ok: false,
    error: { code: 'CONFLICT' },
  });
  active.release();
  expect(await a).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
  expect(await disconnect).toMatchObject({ ok: true });
  expect(fake.checkConnection).toHaveBeenCalledTimes(1);
  expect(await service.dispatch(request('providers.check', { accountId }, 2))).toMatchObject({
    ok: false,
    error: { code: 'NOT_FOUND' },
  });
  const nextAccount = newId();
  store.db
    .prepare(
      "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status) VALUES (?,?,?,?,'codex-subscription','test','oauth',?,'ready')",
    )
    .run(nextAccount, store.profileId, store.now(), store.now(), nextAccount);
  (service as unknown as { channels: Map<string, unknown> }).channels.set(nextAccount, fake);
  const next = await service.dispatch(
    request('providers.check', { accountId: nextAccount, modelId: 'unknown' }, 1),
  );
  expect(next).toMatchObject({ ok: false, error: { code: 'MODEL_UNSUPPORTED' } });
  expect(
    await service.dispatch(
      request('providers.check', { accountId: nextAccount, modelId: 'gpt-5.5' }, 1),
    ),
  ).toMatchObject({ ok: true });
});

it('P01-01 disconnect cancels a check still waiting for the candidate catalog', async () => {
  const { store, service } = await fresh(async () => ({}));
  store.db
    .prepare(
      "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status) VALUES (?,?,?,?,'codex-subscription','test','oauth',?,'ready')",
    )
    .run(accountId, store.profileId, store.now(), store.now(), accountId);
  const entered = gate();
  const listing = gate();
  const fake = {
    listModels: async () => {
      entered.release();
      await listing.promise;
      return [{ modelId: 'gpt-5.5' }];
    },
    checkConnection: vi.fn(),
    models: { logout: vi.fn().mockResolvedValue(undefined) },
  };
  (service as unknown as { channels: Map<string, unknown> }).channels.set(accountId, fake);
  const check = service.dispatch(request('providers.check', { accountId }, 1));
  await entered.promise;
  const disconnect = service.dispatch(request('providers.disconnect', { accountId }, 1));
  listing.release();
  expect(await check).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
  expect(await disconnect).toMatchObject({ ok: true });
  expect(fake.checkConnection).not.toHaveBeenCalled();
});
