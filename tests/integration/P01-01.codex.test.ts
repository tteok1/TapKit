import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexAdapter, AccountCredentialStore, CodexLogin } from '../../packages/providers/src';
import {
  accountId,
  credentials,
  nativeStore,
  request,
  sse,
  textEvents,
  toolEvents,
  token,
} from '../fixtures/P01-01.codex';
import type { ModelEvent, ModelRequest } from '../../packages/contracts/src';
import { zstdDecompressSync } from 'node:zlib';
import { createServer } from 'node:http';
afterEach(() => vi.unstubAllGlobals());
async function collect(
  adapter: CodexAdapter,
  input: ModelRequest = request(),
  signal = new AbortController().signal,
) {
  const events: ModelEvent[] = [];
  for await (const event of adapter.stream(input, signal)) events.push(structuredClone(event));
  return events;
}
describe('P01-01 pinned pi Codex integration', () => {
  it.each(['text', 'tools'])(
    'completes %s decoding when the live route omits Content-Type',
    async (phase) => {
      const fixture = phase === 'text' ? textEvents() : toolEvents();
      const adapter = new CodexAdapter(accountId, credentials(), nativeStore(), async () => {
        const headers = new Headers();
        const original = sse(fixture);
        return new Response(original.body, { headers });
      });
      const events = await collect(adapter);
      expect(events.at(-1)?.type).toBe('finish');
      expect(events.some((event) => event.type === 'error')).toBe(false);
      expect(
        events.some((event) => event.type === (phase === 'text' ? 'text_delta' : 'tool_end')),
      ).toBe(true);
    },
  );
  it('keeps missing upstream usage unknown rather than reporting actual zero', async () => {
    const fixture = textEvents();
    const completed = fixture.at(-1) as { response: { usage?: unknown } };
    delete completed.response.usage;
    const adapter = new CodexAdapter(accountId, credentials(), nativeStore(), async () =>
      sse(fixture),
    );
    const events = await collect(adapter);
    expect(events.find((event) => event.type === 'usage')).toMatchObject({
      usage: {
        inputTotal: null,
        outputTotal: null,
        inputCachedSubset: null,
        reasoningSubset: null,
        source: 'estimated',
      },
    });
    expect(events.at(-1)?.type).toBe('finish');
  });
  it('completes upstream device-code login without a callback listener', async () => {
    const store = credentials();
    await store.delete('openai-codex');
    const adapter = new CodexAdapter(accountId, store, nativeStore());
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/usercode'))
        return Response.json({
          device_auth_id: 'mock-device',
          user_code: 'MOCK-CODE',
          interval: 1,
        });
      if (path.endsWith('/deviceauth/token'))
        return Response.json({ authorization_code: 'mock-code', code_verifier: 'mock-verifier' });
      return Response.json({
        access_token: token(),
        refresh_token: 'mock-refresh',
        expires_in: 3600,
      });
    });
    vi.stubGlobal('fetch', fetcher);
    const browser = vi.fn().mockResolvedValue(undefined);
    const login = new CodexLogin(
      accountId,
      { providerId: 'codex-subscription', method: 'device_code', label: 'mock' },
      adapter.models,
      () => accountId,
      browser,
      async () => {},
    );
    await login.completed;
    expect(login.view.status).toBe('completed');
    expect(browser).toHaveBeenCalledWith('https://auth.openai.com/codex/device');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(await store.read('openai-codex')).toMatchObject({ refresh: 'mock-refresh' });
  });
  it('supports a validated manual callback while the fixed loopback port is occupied', async () => {
    const server = createServer((_request, response) => response.end('occupied'));
    const owned = await new Promise<boolean>((resolve, reject) => {
      server.once('error', (error) =>
        (error as NodeJS.ErrnoException).code === 'EADDRINUSE' ? resolve(false) : reject(error),
      );
      server.listen(1455, '127.0.0.1', () => resolve(true));
    });
    const store = credentials();
    await store.delete('openai-codex');
    const adapter = new CodexAdapter(accountId, store, nativeStore());
    let authorize: URL | undefined;
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ access_token: token(), refresh_token: 'mock-refresh', expires_in: 3600 }),
        ),
    );
    const login = new CodexLogin(
      accountId,
      { providerId: 'codex-subscription', method: 'browser', label: 'mock' },
      adapter.models,
      () => accountId,
      async (url) => {
        authorize = new URL(url);
      },
      async () => {},
    );
    try {
      await vi.waitFor(() => expect(login.view.promptId).toBeDefined());
      login.answer(
        login.view.promptId!,
        'http://localhost:1455/auth/callback?code=mock&state=' +
          authorize!.searchParams.get('state'),
      );
      await login.completed;
      expect(login.view.status).toBe('completed');
      expect(await store.read('openai-codex')).toMatchObject({ refresh: 'mock-refresh' });
    } finally {
      login.cancel();
      await login.completed;
      if (owned) await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('cancels an in-flight partial stream without a finish or released tool', async () => {
    const adapter = new CodexAdapter(accountId, credentials(), nativeStore(), async () =>
      sse(toolEvents()),
    );
    const controller = new AbortController();
    const events: ModelEvent[] = [];
    for await (const event of adapter.stream(request(), controller.signal)) {
      events.push(event);
      if (event.type === 'tool_delta') controller.abort();
    }
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'CANCELLED' },
      partial: true,
    });
    expect(events.some((event) => event.type === 'tool_end' || event.type === 'finish')).toBe(
      false,
    );
  });
  it('decodes Chinese bytes/CRLF and preserves native continuity without exposing reasoning', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => sse(textEvents()));
    const adapter = new CodexAdapter(accountId, credentials(), nativeStore(), fetcher);
    const events = await collect(adapter);
    expect(events.map((event) => event.type)).toEqual(['start', 'text_delta', 'usage', 'finish']);
    expect(events[1]).toMatchObject({ text: '你好' });
    expect(events[2]).toMatchObject({
      usage: { inputTotal: 12, inputCachedSubset: 3, outputTotal: 7, reasoningSubset: 2 },
    });
    const finished = events.at(-1)!;
    if (finished.type !== 'finish') throw new Error('No finish');
    const next = request();
    next.nativeStateRef = finished.nativeStateRef;
    next.messages.push(
      { role: 'assistant', text: '你好', calls: [] },
      { role: 'user', text: '第二轮' },
    );
    expect((await collect(adapter, next)).at(-1)?.type).toBe('finish');
    const init = fetcher.mock.calls[1]![1]!;
    const body = JSON.parse(
      new Headers(init.headers).get('content-encoding') === 'zstd'
        ? zstdDecompressSync(Buffer.from(init.body as Uint8Array)).toString()
        : String(init.body),
    );
    expect(body.instructions).toBe('TapKit system prompt.');
    expect(body.input).toHaveLength(3);
    expect(body.store).toBe(false);
    next.branchId = 'edited-branch';
    expect((await collect(adapter, next)).at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'CONFLICT' },
    });
  });
  it('only emits paired tool_end after complete assistant and snapshots mutable arguments', async () => {
    const adapter = new CodexAdapter(accountId, credentials(), nativeStore(), async () =>
      sse(toolEvents()),
    );
    const events = await collect(adapter);
    expect(events.filter((event) => event.type === 'tool_delta')).toHaveLength(2);
    expect(events.find((event) => event.type === 'tool_end')).toMatchObject({
      name: 'echo',
      arguments: { text: '中文' },
    });
    expect(events.at(-1)).toMatchObject({ type: 'finish', reason: 'tool_calls' });
    expect(
      events
        .filter((event) => event.type === 'tool_delta')
        .map((event) => event.argumentsDelta)
        .join(''),
    ).toBe('{"text":"中文"}');
  });
  it.each([
    ['EOF without completion', toolEvents().slice(0, -1)],
    ['invalid completed JSON', toolEvents('{"text":')],
  ])('%s never releases tools', async (_name, fixture) => {
    const adapter = new CodexAdapter(accountId, credentials(), nativeStore(), async () =>
      sse(fixture),
    );
    const events = await collect(adapter);
    expect(events.some((event) => event.type === 'tool_end' || event.type === 'finish')).toBe(
      false,
    );
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'STREAM_INTERRUPTED' } });
  });
  it('rejects invalid UTF-8, aborted requests and mismatched accounts', async () => {
    const adapter = new CodexAdapter(
      accountId,
      credentials(),
      nativeStore(),
      async () =>
        new Response(new Uint8Array([0xff, 0xfe]), {
          headers: { 'content-type': 'text/event-stream' },
        }),
    );
    expect((await collect(adapter)).at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'STREAM_INTERRUPTED' },
    });
    const controller = new AbortController();
    controller.abort();
    expect((await collect(adapter, request(), controller.signal)).at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'CANCELLED' },
    });
    expect((await collect(adapter, { ...request(), accountId: 'other' })).at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'AUTH_REQUIRED' },
    });
  });
  it.each([
    [429, 'rate_limit_exceeded', 'RATE_LIMITED'],
    [429, 'usage_limit_reached', 'QUOTA_EXHAUSTED'],
    [403, 'region_unsupported', 'PERMISSION_DENIED'],
    [401, 'token_expired', 'AUTH_EXPIRED'],
  ])('preserves HTTP %s/%s with no pi retries', async (status, code, expected) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { code, message: 'private token and user data' } }), {
        status,
      }),
    );
    const adapter = new CodexAdapter(accountId, credentials(), nativeStore(), fetcher);
    const events = await collect(adapter);
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { code: expected, httpStatus: status, upstreamCode: code },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(events)).not.toContain('private token');
  });
  it.each([
    [
      'gateway HTML',
      () =>
        new Response('<html>private token</html>', { headers: { 'content-type': 'text/html' } }),
      'unexpected_content_type',
    ],
    [
      'invalid UTF-8',
      () =>
        new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'text/event-stream' } }),
      'invalid_utf8',
    ],
    [
      'invalid JSON',
      () =>
        new Response('data: private-token\n\n', {
          headers: { 'content-type': 'text/event-stream' },
        }),
      'invalid_json',
    ],
    ['missing completion', () => sse(textEvents().slice(0, -1)), 'unterminated_sse'],
    [
      'read failure',
      () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.error(new Error('private token'));
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
      'read_failed',
    ],
  ])('reports a safe probe diagnostic for %s', async (_name, response, expected) => {
    const adapter = new CodexAdapter(accountId, credentials(), nativeStore(), async () =>
      response(),
    );
    const probe = await adapter.checkConnection(
      { accountId, modelId: 'gpt-5.5' },
      new AbortController().signal,
    );
    expect(probe).toMatchObject({
      status: 'unavailable',
      errorCode: 'STREAM_INTERRUPTED',
      diagnostic: { phase: 'text', reason: expected, httpStatus: 200 },
    });
    expect(JSON.stringify(probe)).not.toMatch(/private.token|<html>/);
  });
  it('reports network failure without retaining exception text', async () => {
    const adapter = new CodexAdapter(accountId, credentials(), nativeStore(), async () => {
      throw new Error('private token');
    });
    expect(
      await adapter.checkConnection(
        { accountId, modelId: 'gpt-5.5' },
        new AbortController().signal,
      ),
    ).toMatchObject({
      errorCode: 'NETWORK_ERROR',
      diagnostic: { reason: 'request_failed', phase: 'text' },
    });
  });
  it('distinguishes a provider setup failure before any request is dispatched', async () => {
    const store = new AccountCredentialStore({
      read: async () => ({
        version: 1,
        credential: {
          type: 'oauth',
          access: 'mock-invalid-token',
          refresh: 'mock-refresh',
          expires: Date.now() + 3600000,
          accountId: 'mock-account',
        },
      }),
      write: async () => {},
    });
    const fetcher = vi.fn<typeof fetch>();
    const adapter = new CodexAdapter(accountId, store, nativeStore(), fetcher);
    const probe = await adapter.checkConnection(
      { accountId, modelId: 'gpt-5.5' },
      new AbortController().signal,
    );
    expect(probe).toMatchObject({
      errorCode: 'STREAM_INTERRUPTED',
      diagnostic: { phase: 'text', reason: 'provider_setup' },
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.stringify(probe)).not.toMatch(/mock-invalid-token|mock-refresh/);
  });
  it('retains an upstream error when its stream subsequently fails', async () => {
    let pulled = false;
    const adapter = new CodexAdapter(
      accountId,
      credentials(),
      nativeStore(),
      async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              if (pulled) {
                controller.error(new Error('private token'));
                return;
              }
              pulled = true;
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"type":"error","code":"usage_limit_reached","message":"private token"}\n\n',
                ),
              );
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    const probe = await adapter.checkConnection(
      { accountId, modelId: 'gpt-5.5' },
      new AbortController().signal,
    );
    expect(probe).toMatchObject({
      errorCode: 'QUOTA_EXHAUSTED',
      diagnostic: {
        reason: 'upstream_error',
        upstreamCode: 'usage_limit_reached',
        httpStatus: 200,
      },
    });
    expect(JSON.stringify(probe)).not.toContain('private token');
  });
  it('serializes actual upstream refresh and saves rotation before releasing concurrent requests', async () => {
    let releases = 0;
    const globalFetch = vi.fn<typeof fetch>().mockImplementation(async () => {
      releases++;
      return Response.json({
        access_token: token(),
        refresh_token: 'mock-rotated',
        expires_in: 3600,
      });
    });
    vi.stubGlobal('fetch', globalFetch);
    const store = credentials(0);
    const adapter = new CodexAdapter(accountId, store, nativeStore());
    const [a, b] = await Promise.all([
      adapter.models.getAuth('openai-codex'),
      adapter.models.getAuth('openai-codex'),
    ]);
    expect(a?.auth.apiKey).toBe(token());
    expect(b?.auth.apiKey).toBe(token());
    expect(releases).toBe(1);
    expect(await store.read('openai-codex')).toMatchObject({ refresh: 'mock-rotated' });
    await adapter.models.logout('openai-codex');
    expect(await adapter.models.checkAuth('openai-codex')).toBeUndefined();
  });
  it('rejects token release when the rotated credential fails to persist', async () => {
    const initial = {
      type: 'oauth' as const,
      access: token(),
      refresh: 'mock-refresh',
      expires: 0,
      accountId: 'mock-account',
    };
    const store = new AccountCredentialStore({
      read: async () => ({ version: 1, credential: initial }),
      write: async () => {
        throw new Error('DISK_FULL');
      },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ access_token: token(), refresh_token: 'mock-rotated', expires_in: 3600 }),
        ),
    );
    const adapter = new CodexAdapter(accountId, store, nativeStore());
    await expect(adapter.models.getAuth('openai-codex')).rejects.toThrow();
    expect(await store.read('openai-codex')).toEqual(initial);
  });
  it('uses upstream PKCE/state login; rejects wrong or absent state; cancel clears prompts', async () => {
    const empty = new AccountCredentialStore({
      read: async () => ({ version: 0 }),
      write: async () => {},
    });
    const adapter = new CodexAdapter(accountId, empty, nativeStore());
    let authorize: URL | undefined;
    const exchange = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ access_token: token(), refresh_token: 'mock-refresh', expires_in: 3600 }),
      );
    vi.stubGlobal('fetch', exchange);
    let sequence = 2;
    const login = new CodexLogin(
      accountId,
      { providerId: 'codex-subscription', method: 'browser', label: 'mock' },
      adapter.models,
      () => '01990000-0000-7000-8000-' + String(sequence++).padStart(12, '0'),
      async (url) => {
        authorize = new URL(url);
      },
      async () => {},
    );
    await vi.waitFor(() => expect(login.view.promptId).toBeDefined());
    expect(authorize?.searchParams.get('code_challenge_method')).toBe('S256');
    expect(() =>
      login.answer(login.view.promptId!, 'http://localhost:1455/auth/callback?code=x&state=wrong'),
    ).toThrow();
    expect(() =>
      login.answer(login.view.promptId!, 'http://localhost:1455/auth/callback?code=x'),
    ).toThrow();
    expect(exchange).not.toHaveBeenCalled();
    login.cancel();
    await login.completed;
    expect(login.snapshot()).toMatchObject({ status: 'cancelled' });
    expect(login.view.promptId).toBeUndefined();
  });
});
