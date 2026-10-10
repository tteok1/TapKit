import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { openStore, migrate, migrations, newId, type Store } from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
import { ProviderService, type PrivateVault } from '../../packages/core/src/provider-service';
import {
  ProviderListSchema,
  type CanonicalMessage,
  type Reply,
  type Request,
} from '../../packages/contracts/src';
import { adapter, modelRequest, events, sseFrames, collect, tool } from '../fixtures/P01-02.api';
const Database = createRequire(import.meta.url)(
  '../../packages/storage/node_modules/better-sqlite3',
) as typeof import('better-sqlite3');
const stores: Store[] = [],
  servers: Server[] = [],
  services: ProviderService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.stop();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const store of stores.splice(0)) store.close();
});
const request = (command: string, payload: unknown, revision?: number): Request => ({
  protocolVersion: 1,
  requestId: newId(),
  command,
  payload,
  ...(revision ? { expectedRevision: revision } : {}),
});
function data(reply: Reply) {
  if (!reply.ok) throw new Error(reply.error.code);
  return reply.data;
}
describe('P01-02 real HTTP, history and SQLite', () => {
  for (const provider of [
    'deepseek',
    'hunyuan',
    'xai',
    'doubao',
    'openai-compatible',
    'anthropic-compatible',
  ] as const)
    it(
      provider + ' replays two-turn tool pairing and private native state over mock HTTP',
      async () => {
        const bodies: Record<string, any>[] = [],
          headers: string[] = [];
        let turn = 0;
        const server = createServer((req, res) => {
          let raw = '';
          req.on('data', (chunk) => (raw += chunk));
          req.on('end', () => {
            bodies.push(JSON.parse(raw));
            headers.push(String(req.headers.authorization ?? req.headers['x-api-key']));
            res.writeHead(200, { 'content-type': 'text/event-stream' });
            for (const event of events(config.apiFormat, turn++ === 0, true))
              res.write(
                'data: ' + (typeof event === 'string' ? event : JSON.stringify(event)) + '\n\n',
              );
            res.end();
          });
        });
        servers.push(server);
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        // Only this test's injected fetch maps a logical HTTPS endpoint to its mock.
        const fetcher: typeof fetch = async (_url, init) =>
          fetch('http://127.0.0.1:' + (server.address() as AddressInfo).port, init);
        const { config, channel, native } = adapter(provider, fetcher);
        const input = modelRequest(config);
        input.tools = [tool];
        if (provider === 'deepseek') input.reasoning = 'high';
        const first = await collect(channel, input),
          completed = first.find((event) => event.type === 'finish');
        if (!completed) throw new Error('Mock did not finish');
        const calls = first.filter((event) => event.type === 'tool_end');
        expect(calls).toHaveLength(2);
        const assistant: CanonicalMessage = {
          role: 'assistant',
          text: '',
          calls: calls.map((call) => ({
            id: call.callId,
            name: call.name,
            arguments: call.arguments as Record<string, unknown>,
          })),
        };
        const secondInput = {
          ...input,
          nativeStateRef: completed.nativeStateRef,
          messages: [
            ...input.messages,
            assistant,
            ...calls.map((call) => ({
              role: 'tool' as const,
              callId: call.callId,
              name: call.name,
              text: 'OK',
              isError: false,
            })),
            { role: 'user' as const, text: '继续' },
          ],
        };
        const second = await collect(channel, secondInput);
        expect(second.at(-1)).toMatchObject({ type: 'finish', reason: 'stop' });
        expect(headers).toEqual(
          config.apiFormat === 'anthropic-messages'
            ? ['fixture-key', 'fixture-key']
            : ['Bearer fixture-key', 'Bearer fixture-key'],
        );
        const messages =
          config.apiFormat === 'openai-responses' ? bodies[1]!.input : bodies[1]!.messages;
        if (config.apiFormat === 'anthropic-messages') {
          expect(JSON.stringify(messages)).toContain('private-signature-marker');
          expect(
            messages
              .at(-1)
              .content.filter((item: Record<string, any>) => item.type === 'tool_result'),
          ).toHaveLength(2);
        } else if (provider === 'deepseek') {
          expect(
            messages.find((item: Record<string, any>) => item.role === 'assistant')
              .reasoning_content,
          ).toBe('private-thinking-marker');
          expect(bodies[0]!.thinking).toEqual({ type: 'enabled' });
        } else if (config.apiFormat === 'openai-responses') {
          expect(JSON.stringify(messages)).toContain('private-thinking-marker');
          expect(bodies[1]!.store).toBe(false);
          expect(
            messages.filter((item: Record<string, any>) => item.type === 'function_call_output'),
          ).toHaveLength(2);
        }
        expect(native.values.size).toBe(2);
        expect(JSON.stringify(first) + JSON.stringify(second)).not.toMatch(
          /private-thinking|private-signature/,
        );
        expect(
          (await collect(channel, { ...secondInput, branchId: 'other' })).at(-1),
        ).toMatchObject({ type: 'error' });
        expect(bodies).toHaveLength(2);
        const edited = structuredClone(secondInput);
        edited.messages[0] = { role: 'user', text: 'edited' };
        expect((await collect(channel, edited)).at(-1)).toMatchObject({
          type: 'error',
          error: { code: 'PERMISSION_DENIED' },
        });
        expect(bodies).toHaveLength(2);
      },
    );
  it('migrates v2 API/Codex/opaque history, backs up, reopens and rolls back failed v3 rebuild', async () => {
    const directory = await mkdtemp(resolve('.test-data', 'P01-02-migration-'));
    const db = new Database(join(directory, 'old.sqlite'));
    db.pragma('foreign_keys=ON');
    await migrate(db, join(directory, 'backup'), migrations.slice(0, 2));
    const profile = newId(),
      codex = newId(),
      api = newId(),
      opaque = newId();
    db.prepare(
      'INSERT INTO profiles(id,display_name,locale,timezone,created_at,updated_at) VALUES (?,? ,?,?,0,0)',
    ).run(profile, 'old', 'zh-CN', 'Asia/Shanghai');
    for (const [id, provider, auth] of [
      [codex, 'codex-subscription', 'oauth'],
      [api, 'deepseek', 'api_key'],
    ])
      db.prepare(
        'INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status) VALUES (?,?,0,0,?,?,?,?,?)',
      ).run(id, profile, provider, 'old', auth, newId(), 'unconfigured');
    db.prepare(
      'INSERT INTO opaque_states(id,profile_id,created_at,updated_at,account_id,model_ref,adapter_version,branch_id,cipher_blob_ref,content_hash) VALUES (?,?,0,0,?,?,?,?,?,?)',
    ).run(opaque, profile, codex, 'old-model', 'old/1', 'branch', newId(), '0'.repeat(64));
    await expect(
      migrate(db, join(directory, 'failure'), [
        ...migrations.slice(0, 2),
        { version: 3, sql: migrations[2]!.sql + 'INSERT INTO no_such_table VALUES (1);' },
      ]),
    ).rejects.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(2);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.prepare('SELECT count(*) AS n FROM provider_accounts').get()).toEqual({ n: 2 });
    await migrate(db, join(directory, 'backup'));
    await migrate(db, join(directory, 'backup'));
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.prepare('SELECT account_id FROM opaque_states').get()).toEqual({ account_id: codex });
    expect(
      db.prepare('SELECT api_format,base_url,model_id FROM provider_accounts WHERE id=?').get(api),
    ).toEqual({
      api_format: 'openai-chat',
      base_url: 'https://api.deepseek.com',
      model_id: 'deepseek-flash',
    });
    db.close();
    const reopened = new Database(join(directory, 'old.sqlite'));
    expect(reopened.pragma('user_version', { simple: true })).toBe(10);
    reopened.close();
    const backup = (await readdir(join(directory, 'backup'))).find((name) =>
      name.startsWith('pre-migration-3-'),
    )!;
    const old = new Database(join(directory, 'backup', backup), { readonly: true });
    expect(old.pragma('user_version', { simple: true })).toBe(2);
    expect(old.prepare('SELECT count(*) AS n FROM opaque_states').get()).toEqual({ n: 1 });
    old.close();
  });
  it('saves metadata without secrets, checks through the shared service, and clears only the chosen account', async () => {
    const directory = await mkdtemp(resolve('.test-data', 'P01-02-core-')),
      store = await openStore(directory);
    stores.push(store);
    const core = new CoreService(store);
    const keys = new Map<string, string>();
    const privateStates = new Map<string, unknown>();
    const vault: PrivateVault = async (operation, _accountId, payload) => {
      const value = payload as Record<string, any>;
      if (operation === 'api-key.read')
        return keys.has(value.credentialId) ? { key: keys.get(value.credentialId) } : {};
      if (operation === 'api-key.delete') {
        keys.delete(value.credentialId);
        return {};
      }
      if (operation === 'native.save') {
        privateStates.set(value.ref, value.value);
        return {
          contentHash: createHash('sha256').update(JSON.stringify(value.value)).digest('hex'),
        };
      }
      if (operation === 'native.load') return privateStates.get(value.ref);
      throw new Error('Wrong credential format');
    };
    const service = new ProviderService(store, vault);
    services.push(service);
    for (const provider of ['openai-compatible', 'anthropic-compatible'] as const) {
      const credentialId = newId();
      keys.set(credentialId, provider + '-private-fixture');
      expect(
        core.dispatch(
          request('providers.saveApiKey', {
            providerId: provider,
            label: provider,
            credentialId,
            modelId: 'mock-model',
          }),
        ),
      ).toMatchObject({ ok: true });
    }
    let listing = ProviderListSchema.parse(
      data(await service.dispatch(request('providers.list', {}))),
    );
    expect(listing.accounts).toHaveLength(2);
    expect(
      listing.accounts.every(
        (account) => account.status === 'unconfigured' && account.hasCredential,
      ),
    ).toBe(true);
    expect(
      listing.models.every(
        (model) => model.contextWindow === null && model.toolCalls === 'unknown',
      ),
    ).toBe(true);
    expect(JSON.stringify(listing)).not.toContain('private-fixture');
    // Inject a fixture into this test's API channel only; production still uses secureApiFetch.
    const first = listing.accounts[0]!;
    const channels = (service as unknown as { channels: Map<string, { fetcher: typeof fetch }> })
      .channels;
    channels.get(first.accountId)!.fetcher = async (_url, init) =>
      sseFrames(events(first.apiFormat!, Boolean(JSON.parse(String(init?.body)).tools?.length)));
    expect(
      await service.dispatch(
        request(
          'providers.check',
          { accountId: first.accountId, modelId: first.modelId },
          first.revision,
        ),
      ),
    ).toMatchObject({ ok: true, data: { status: 'ready', text: true, tools: true } });
    listing = ProviderListSchema.parse(data(await service.dispatch(request('providers.list', {}))));
    expect(listing.models.find((model) => model.accountId === first.accountId)).toMatchObject({
      verification: 'probed',
      toolCalls: 'documented',
    });
    expect(
      await service.dispatch(
        request('providers.disconnect', { accountId: first.accountId }, first.revision),
      ),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(
      await service.dispatch(
        request(
          'providers.disconnect',
          { accountId: first.accountId },
          listing.accounts[0]!.revision,
        ),
      ),
    ).toMatchObject({ ok: true });
    expect(keys.size).toBe(1);
    expect(
      store.db.prepare('SELECT deleted_at FROM provider_accounts WHERE id=?').get(first.accountId),
    ).not.toEqual({ deleted_at: null });
    const remaining = listing.accounts.find((account) => account.accountId !== first.accountId)!;
    const restarted = new ProviderService(store, vault);
    services.push(restarted);
    expect(
      ProviderListSchema.parse(
        data(await restarted.dispatch(request('providers.list', {}))),
      ).accounts.map((account) => account.accountId),
    ).toEqual([remaining.accountId]);
    store.db.pragma('wal_checkpoint(TRUNCATE)');
    expect((await readFile(join(directory, 'db', 'app.sqlite'))).toString()).not.toContain(
      'private-fixture',
    );
    expect(
      JSON.stringify(store.db.prepare('SELECT * FROM request_receipts').all()) +
        JSON.stringify(store.db.prepare('SELECT * FROM events').all()),
    ).not.toMatch(/private-fixture|private-thinking/);
  });
});
