import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';
import { openStore, newId, type Store } from '../../packages/storage/src';
import { ProviderService, type PrivateVault } from '../../packages/core/src/provider-service';
import {
  ProviderListSchema,
  LoginViewSchema,
  ProbeViewSchema,
  type Request,
  type Reply,
} from '../../packages/contracts/src';
import { token, sse, textEvents, toolEvents } from '../fixtures/P01-01.codex';
const stores: Store[] = [];
const services: ProviderService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.stop();
  for (const store of stores.splice(0)) store.close();
  vi.unstubAllGlobals();
});
const request = (command: string, payload: unknown, expectedRevision?: number): Request => ({
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
describe('P01-01 Core provider account lifecycle', () => {
  it('runs real upstream manual PKCE login, probes text/tools, restarts metadata and disconnects', async () => {
    const store = await openStore(await mkdtemp(resolve('.test-data', 'P01-01-core-')));
    stores.push(store);
    const credentials = new Map<string, { version: number; credential?: unknown }>();
    const native = new Map<string, unknown>();
    let authorize: URL | undefined;
    let verifiedPkce = false;
    const vault: PrivateVault = async (operation, accountId, payload) => {
      if (operation === 'browser.open') {
        authorize = new URL((payload as { url: string }).url);
        return {};
      }
      if (operation === 'credential.read')
        return structuredClone(credentials.get(accountId) ?? { version: 0 });
      if (operation === 'credential.write') {
        const input = payload as { expectedVersion: number; credential?: unknown };
        const old = credentials.get(accountId) ?? { version: 0 };
        if (old.version !== input.expectedVersion) throw new Error('CONFLICT');
        credentials.set(accountId, {
          version: old.version + 1,
          ...(input.credential ? { credential: input.credential } : {}),
        });
        return {};
      }
      if (operation === 'native.save') {
        const input = payload as { ref: string; value: unknown };
        native.set(input.ref, structuredClone(input.value));
        return { contentHash: createHash('sha256').update(JSON.stringify(input)).digest('hex') };
      }
      return native.get((payload as { ref: string }).ref);
    };
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
        if (String(url).startsWith('https://auth.openai.com/')) {
          const params = new URLSearchParams(String(init?.body));
          verifiedPkce =
            createHash('sha256').update(params.get('code_verifier')!).digest('base64url') ===
            authorize?.searchParams.get('code_challenge');
          return Response.json({
            access_token: token(),
            refresh_token: 'mock-rotated',
            expires_in: 3600,
          });
        }
        const body = JSON.parse(
          new Headers(init?.headers).get('content-encoding') === 'zstd'
            ? zstdDecompressSync(Buffer.from(init?.body as Uint8Array)).toString()
            : String(init?.body),
        );
        return sse(body.tools?.length ? toolEvents('{"text":"OK"}') : textEvents('OK'));
      }),
    );
    const service = new ProviderService(store, vault);
    services.push(service);
    const empty = ProviderListSchema.parse(
      data(await service.dispatch(request('providers.list', {}))),
    );
    expect(empty.accounts).toEqual([]);
    expect(empty.models.length).toBeGreaterThan(0);
    expect(empty.models.every((model) => model.verification === 'documented')).toBe(true);
    const start = request('providers.startLogin', {
      providerId: 'codex-subscription',
      method: 'browser',
      label: 'mock-account',
    });
    const login = LoginViewSchema.parse(data(await service.dispatch(start)));
    expect(await service.dispatch(start)).toMatchObject({
      ok: true,
      data: { loginId: login.loginId },
    });
    let status = login;
    await vi.waitFor(async () => {
      status = LoginViewSchema.parse(
        data(await service.dispatch(request('providers.loginStatus', { loginId: login.loginId }))),
      );
      expect(status.promptId).toBeDefined();
    });
    expect(
      await service.dispatch(
        request('providers.answerLogin', {
          loginId: login.loginId,
          promptId: status.promptId!,
          value: 'http://localhost:1455/auth/callback?code=x&state=wrong',
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    const callback = new URL('http://localhost:1455/auth/callback');
    callback.searchParams.set('code', 'mock-code');
    callback.searchParams.set('state', authorize!.searchParams.get('state')!);
    await service.dispatch(
      request('providers.answerLogin', {
        loginId: login.loginId,
        promptId: status.promptId!,
        value: callback.href,
      }),
    );
    await vi.waitFor(async () => {
      status = LoginViewSchema.parse(
        data(await service.dispatch(request('providers.loginStatus', { loginId: login.loginId }))),
      );
      expect(status.status).toBe('completed');
    });
    expect(verifiedPkce).toBe(true);
    let listed = ProviderListSchema.parse(
      data(await service.dispatch(request('providers.list', {}))),
    );
    expect(listed.accounts[0]?.status).toBe('unconfigured');
    const account = listed.accounts[0]!;
    expect(account.hasCredential).toBe(true);
    const probe = ProbeViewSchema.parse(
      data(
        await service.dispatch(
          request(
            'providers.check',
            { accountId: account.accountId, modelId: 'gpt-5.5' },
            account.revision,
          ),
        ),
      ),
    );
    expect(probe).toMatchObject({ status: 'ready', text: true, tools: true });
    listed = ProviderListSchema.parse(data(await service.dispatch(request('providers.list', {}))));
    expect(listed.models.find((model) => model.modelId === 'gpt-5.5')?.verification).toBe('probed');
    const restarted = new ProviderService(store, vault);
    services.push(restarted);
    expect(
      ProviderListSchema.parse(data(await restarted.dispatch(request('providers.list', {}))))
        .accounts[0]?.status,
    ).toBe('ready');
    expect(JSON.stringify(store.db.prepare('SELECT * FROM provider_accounts').all())).not.toContain(
      token(),
    );
    expect(JSON.stringify(store.db.prepare('SELECT * FROM opaque_states').all())).not.toContain(
      'mock-rotated',
    );
    const current = listed.accounts[0]!;
    expect(
      await service.dispatch(
        request('providers.disconnect', { accountId: current.accountId }, account.revision),
      ),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(
      await service.dispatch(
        request('providers.disconnect', { accountId: current.accountId }, current.revision),
      ),
    ).toMatchObject({ ok: true, data: { status: 'unconfigured' } });
    expect(credentials.get(current.accountId)?.credential).toBeUndefined();
    expect(
      ProviderListSchema.parse(data(await service.dispatch(request('providers.list', {}))))
        .accounts,
    ).toEqual([]);
    expect(
      store.db
        .prepare('SELECT deleted_at FROM provider_accounts WHERE id=?')
        .get(current.accountId),
    ).toMatchObject({ deleted_at: expect.any(Number) });
  });
});
