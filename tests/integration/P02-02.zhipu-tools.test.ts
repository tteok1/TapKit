import { mkdtemp } from '../../scripts/test-temp.mjs';
import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BlobStore, newId, openStore } from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
import { ProviderService, type PrivateVault } from '../../packages/core/src/provider-service';
import { ModelService } from '../../packages/core/src/model-service';
import { ChatService } from '../../packages/core/src/chat-service';
import {
  ChatSendViewSchema,
  ChatSnapshotSchema,
  CreatedEntitySchema,
  ProviderListSchema,
  type Reply,
} from '../../packages/contracts/src';
import { events } from '../fixtures/P01-02.api';
import type { ZhipuToolTrace } from '../../packages/providers/src';

const req = (command: string, payload: unknown, expectedRevision?: number) => ({
  protocolVersion: 1 as const,
  requestId: newId(),
  command,
  payload,
  ...(expectedRevision === undefined ? {} : { expectedRevision }),
});
const data = (reply: Reply) => {
  if (!reply.ok) throw new Error(reply.error.code);
  return reply.data;
};
const response = (frames: unknown[]) =>
  new Response(
    frames
      .map(
        (frame) => 'data: ' + (typeof frame === 'string' ? frame : JSON.stringify(frame)) + '\n\n',
      )
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );

it.each(['tool_call', 'plain_text', 'prior_refusals'] as const)(
  'P02-02 Zhipu Chat/FlashX %s crosses the real provider/router/gateway boundary without inferring calls from text',
  async (mode) => {
    const executesTool = mode !== 'plain_text';
    const latestPrompt = 'P02ToolMarker: search this session with history.search before answering.';
    await mkdir('.test-data', { recursive: true });
    const store = await openStore(await mkdtemp(resolve('.test-data', 'P02-02-zhipu-tools-')));
    const native = new Map<string, unknown>();
    const vault: PrivateVault = async (operation, _account, raw) => {
      const value = raw as Record<string, any>;
      if (operation === 'api-key.read') return { key: 'fixture-zhipu-key' };
      if (operation === 'native.save') {
        native.set(value.ref, value.value);
        return {
          contentHash: createHash('sha256').update(JSON.stringify(value.value)).digest('hex'),
        };
      }
      if (operation === 'native.load') return native.get(value.ref);
      throw new Error('Unexpected fixture vault operation');
    };
    const traces: ZhipuToolTrace[] = [];
    const providers = new ProviderService(store, vault, undefined, (trace) => traces.push(trace));
    const models = new ModelService(store, providers);
    const chat = new ChatService(store, new BlobStore(store), models);
    const core = new CoreService(store);
    const bodies: Record<string, any>[] = [];
    const callId = 'synthetic-history-call';
    let probing = true;
    let sessionId = '';
    try {
      data(
        core.dispatch(
          req('providers.saveApiKey', {
            providerId: 'openai-compatible',
            label: 'Synthetic Zhipu',
            credentialId: newId(),
            apiFormat: 'openai-chat',
            baseURL: 'https://open.bigmodel.cn/api/paas/v4',
            modelId: 'glm-4.7-flashx',
          }),
        ),
      );
      const account = ProviderListSchema.parse(
        data(await providers.dispatch(req('providers.list', {}))),
      ).accounts[0]!;
      // Only this isolated fixture replaces transport. No real key/profile or network is used.
      (providers.adapter(account.accountId) as unknown as { fetcher: typeof fetch }).fetcher =
        async (url, init) => {
          expect(String(url)).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
          const body = JSON.parse(String(init?.body));
          if (probing) return response(events('openai-chat', !!body.tools?.length));
          bodies.push(body);
          if (mode === 'plain_text')
            return response(events('openai-chat', false, false, undefined, '检索完成：找到3条'));
          if (bodies.length === 1) {
            const args = JSON.stringify({
              query: 'P02ToolMarker',
              limit: 1,
              sessionIds: [sessionId],
            });
            const split = Math.floor(args.length / 2);
            return response([
              {
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: callId,
                          type: 'function',
                          function: { name: 'history_search', arguments: args.slice(0, split) },
                        },
                      ],
                    },
                  },
                ],
              },
              {
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [{ index: 0, function: { arguments: args.slice(split) } }],
                    },
                  },
                ],
              },
              { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
              { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } },
              '[DONE]',
            ]);
          }
          const result = body.messages.findLast(
            (message: Record<string, any>) => message.role === 'tool',
          );
          expect(result.tool_call_id).toBe(callId);
          const refs = JSON.parse(result.content).messageRefs;
          expect(refs).toHaveLength(1);
          expect(refs[0].sessionId).toBe(sessionId);
          return response(
            events('openai-chat', false, false, undefined, `检索完成：找到${refs.length}条`),
          );
        };
      expect(
        data(
          await providers.dispatch(
            req('providers.check', { accountId: account.accountId }, account.revision),
          ),
        ),
      ).toMatchObject({ status: 'ready', tools: true });
      expect((await models.catalog())[0]).toMatchObject({
        status: 'ready',
        toolCalls: 'documented',
      });
      probing = false;
      traces.length = 0;
      sessionId = CreatedEntitySchema.parse(
        data(core.dispatch(req('sessions.create', { mode: 'chat', title: 'Synthetic tools' }))),
      ).entityId;
      if (mode === 'prior_refusals') {
        const session = chat.session(sessionId);
        chat.insertMessage(
          session,
          'user',
          'Old task: only reply with a short acknowledgement.',
          'final',
          null,
        );
        chat.insertMessage(session, 'assistant', 'Acknowledged.', 'final', null);
        for (let i = 0; i < 3; i++) {
          chat.insertMessage(
            session,
            'user',
            'Previous request: use history.search.',
            'final',
            null,
          );
          chat.insertMessage(session, 'assistant', '未执行工具', 'final', null);
        }
      }
      chat.start();
      const sent = ChatSendViewSchema.parse(
        data(
          await chat.dispatch(
            req('messages.send', {
              sessionId,
              clientMessageId: newId(),
              text: latestPrompt,
              attachments: [],
              mode: 'chat',
            }),
          ),
        ),
      );
      const snapshot = async () =>
        ChatSnapshotSchema.parse(data(await chat.dispatch(req('messages.list', { sessionId }))));
      await expect
        .poll(async () => (await snapshot()).run?.status, { timeout: 8000 })
        .toBe('completed');
      const state = await snapshot();
      expect(bodies[0]!.messages.at(-1)).toEqual({ role: 'user', content: latestPrompt });
      if (mode === 'prior_refusals') {
        expect(
          bodies[0]!.messages.some(
            (m: any) => m.role === 'assistant' && m.content === '未执行工具',
          ),
        ).toBe(true);
        expect(bodies[0]!.messages.filter((m: any) => m.role === 'user')).toHaveLength(5);
      }
      expect(bodies[0]!.thinking).toEqual({ type: 'disabled' });
      expect(bodies[0]!.tools.map((tool: Record<string, any>) => tool.function.name)).toEqual([
        'files_read',
        'history_search',
      ]);
      expect(bodies[0]!.tool_choice).toBeUndefined();
      expect(state.run).toMatchObject({
        calls: executesTool ? 2 : 1,
        tools: executesTool ? 1 : 0,
        usage: { state: 'actual', tokens: executesTool ? 30 : 15 },
      });
      const toolRows = store.db
        .prepare('SELECT call_id,tool_name,status,side_effect FROM tool_calls WHERE run_id=?')
        .all(sent.runId);
      if (executesTool) {
        expect(
          bodies[1]!.messages.findLast(
            (message: Record<string, any>) => message.role === 'assistant',
          ).tool_calls[0].function.name,
        ).toBe('history_search');
        expect(toolRows).toEqual([
          {
            call_id: callId,
            tool_name: 'history.search',
            status: 'succeeded',
            side_effect: 'none',
          },
        ]);
        const result = bodies[1]!.messages.findLast(
          (message: Record<string, any>) => message.role === 'tool',
        );
        expect(JSON.parse(result.content).messageRefs[0].messageId).toBe(sent.messageId);
        expect(state.messages.filter((message) => message.role === 'tool')).toHaveLength(1);
        expect(state.messages.at(-1)?.text).toBe('检索完成：找到1条');
      } else {
        expect(toolRows).toEqual([]);
        expect(state.messages.filter((message) => message.role === 'tool')).toEqual([]);
        expect(state.messages.at(-1)?.text).toBe('检索完成：找到3条');
      }
      expect(bodies).toHaveLength(executesTool ? 2 : 1);
      expect(traces).toHaveLength(executesTool ? 2 : 1);
      expect(traces[0]).toMatchObject({
        request: { fetchInvoked: true, knownToolNames: ['files_read', 'history_search'] },
        response: {
          httpStatus: 200,
          deltaToolItems: executesTool ? 2 : 0,
          deliveredToolEnds: executesTool ? 1 : 0,
          finishReasons: [executesTool ? 'tool_calls' : 'stop'],
          outcome: 'finished',
        },
      });
      expect(JSON.stringify(traces)).not.toMatch(
        /fixture-zhipu-key|private-thinking-marker|P02ToolMarker|nativeStateRef/,
      );
      expect(
        store.db.prepare('SELECT count(*) n FROM budgets WHERE reserved_tokens<>0').get(),
      ).toEqual({ n: 0 });
      expect(
        store.db
          .prepare(
            "SELECT count(*) n FROM provider_attempts WHERE status NOT IN ('completed','failed','cancelled')",
          )
          .get(),
      ).toEqual({ n: 0 });
    } finally {
      await chat.stop();
      await providers.stop();
      store.close();
    }
  },
);
