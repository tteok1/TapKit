import { test, expect, vi } from 'vitest';
import { retrievalFixture } from './P04-01.fixture';
import { ChatService } from '../../packages/core/src/chat-service';
import { newId } from '../../packages/storage/src';
import {
  DescriptorSchema,
  DEFAULT_MODEL_PREFERENCES,
  ChatSnapshotSchema,
} from '../../packages/contracts/src';
import type { RoutingInput, RoutedEvent } from '../../packages/providers/src/routing/router';

test.each(['verified', 'unknown', 'missing', 'no-answer', 'cancelled'] as const)(
  'P04-01 T09 real chat tool loop %s evidence gates completion and retains answer',
  async (mode) => {
    const f = await retrievalFixture();
    const project = f.project();
    await f.put(project, '退款期限：7天');
    const selection = { accountId: newId(), modelId: 'fixture' },
      descriptor = DescriptorSchema.parse({
        accountId: selection.accountId,
        providerId: 'openai-compatible',
        modelId: 'fixture',
        displayName: 'fixture',
        contextWindow: 128000,
        maxOutput: 8192,
        toolCalls: 'documented',
        verification: 'probed',
        accountLabel: 'fixture',
        status: 'ready',
        reasoningLevels: ['off'],
        modalities: ['text'],
        parallelTools: 'unknown',
        jsonOutput: 'unknown',
        scenario: 'fixture',
        price: null,
        quotaRemaining: null,
        quotaResetAt: null,
      });
    let round = 0;
    const chat = new ChatService(f.store, f.blobs, {
      catalog: async () => [descriptor],
      effective: () => ({ values: structuredClone(DEFAULT_MODEL_PREFERENCES), scope: 'profile' }),
      ledger: { hasPreferences: () => false },
      router: {
        async *stream(input: RoutingInput): AsyncIterable<RoutedEvent> {
          const attemptId = newId();
          yield { type: 'attempt', attemptId, model: selection, attemptNo: 1 };
          if (round++ === 0) {
            yield {
              type: 'model.event',
              attemptId,
              event: {
                type: 'tool_end',
                callId: newId(),
                name: 'knowledge.query',
                arguments: { query: mode === 'no-answer' ? 'E_UNKNOWN_993' : '退款' },
              },
            };
            yield {
              type: 'model.event',
              attemptId,
              event: { type: 'finish', reason: 'tool_calls', nativeStateRef: '' },
            };
          } else {
            const tool = input.request.messages.findLast((m) => m.role === 'tool');
            const id =
              tool?.role === 'tool' ? JSON.parse(tool.text).hits?.[0]?.evidence?.id : undefined;
            const text =
              mode === 'no-answer'
                ? '资料不足，无法支持结论。'
                : mode === 'missing'
                  ? '退款期限为7天。'
                  : '退款期限为7天 [[evidence:' + (mode === 'unknown' ? newId() : id) + ']]';
            yield {
              type: 'model.event',
              attemptId,
              event: { type: 'text_delta', blockId: 'text', text },
            };
            yield {
              type: 'model.event',
              attemptId,
              event: { type: 'finish', reason: 'stop', nativeStateRef: '' },
            };
          }
        },
      },
    });
    let restoreRead: (() => void) | undefined;
    let cancellationReply: boolean | undefined;
    try {
      const create = f.core.dispatch({
        protocolVersion: 1,
        requestId: newId(),
        command: 'sessions.create',
        payload: { title: '合成引用', mode: 'chat', projectId: project },
      });
      if (!create.ok) throw new Error(create.error.code);
      const sessionId = (create.data as { entityId: string }).entityId;
      if (mode === 'cancelled') {
        const actual = f.blobs.readDerivedVersion.bind(f.blobs);
        const spy = vi.spyOn(f.blobs, 'readDerivedVersion').mockImplementation(async (...args) => {
          const value = await actual(...args);
          if (round >= 2) {
            const run = f.store.db
              .prepare("SELECT id FROM runs WHERE session_id=? AND status='running'")
              .get(sessionId) as { id: string } | undefined;
            if (run) {
              const reply = await chat.dispatch({
                protocolVersion: 1,
                requestId: newId(),
                command: 'runs.cancel',
                payload: { runId: run.id },
              });
              cancellationReply = reply.ok;
            }
          }
          return value;
        });
        restoreRead = () => spy.mockRestore();
      }
      chat.start();
      const sent = await chat.dispatch({
        protocolVersion: 1,
        requestId: newId(),
        command: 'messages.send',
        payload: {
          sessionId,
          text: '合成问题',
          attachments: [],
          clientMessageId: newId(),
          mode: 'chat',
        },
      });
      expect(sent.ok).toBe(true);
      const snapshot = async () => {
        const r = await chat.dispatch({
          protocolVersion: 1,
          requestId: newId(),
          command: 'messages.list',
          payload: { sessionId },
        });
        if (!r.ok) throw new Error(r.error.code);
        return ChatSnapshotSchema.parse(r.data);
      };
      await expect
        .poll(async () => (await snapshot()).run?.status, { timeout: 15000 })
        .toMatch(/completed|partial|failed|cancelled/);
      const result = await snapshot();
      if (mode === 'cancelled') expect(cancellationReply).toBe(true);
      expect(result.run?.status).toBe(
        mode === 'cancelled'
          ? 'cancelled'
          : mode === 'unknown' || mode === 'missing'
            ? 'partial'
            : 'completed',
      );
      expect(result.messages.some((m) => m.role === 'assistant' && m.text.length > 0)).toBe(true);
      const citations = f.store.db
        .prepare('SELECT verified,evidence_json,claim_range_json FROM citations')
        .all() as { verified: number; evidence_json: string; claim_range_json: string }[];
      if (mode === 'verified') {
        expect(citations).toHaveLength(1);
        expect(citations[0]!.verified).toBe(1);
        expect(JSON.parse(citations[0]!.claim_range_json)).toEqual({
          start: 0,
          end: '退款期限为7天 '.length,
        });
        expect(result.messages.findLast((m) => m.role === 'assistant')!.attachments).toHaveLength(
          1,
        );
      } else expect(citations).toHaveLength(0);
    } finally {
      restoreRead?.();
      await chat.stop();
      f.store.close();
    }
  },
  30000,
);
