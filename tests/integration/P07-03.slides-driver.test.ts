import { expect, test } from 'vitest';
import { fixture } from './P06.fixture';
import { modelWorkDriver } from '../../packages/core/src/work-driver';
import { DEFAULT_MODEL_PREFERENCES } from '../../packages/contracts/src';
import type { ChatService } from '../../packages/core/src/chat-service';
import type { ModelService } from '../../packages/core/src/model-service';
import { validArguments } from '../../packages/providers/src/api/arguments';
import { sampleDeck } from '../fixtures/P07-03.slides';

test('P07-03 selected PPTX tool schema accepts a real editable deck without unrelated document/data tools', async () => {
  const f = await fixture();
  try {
    const view = await f.create({ format: 'pptx' }),
      args = { name: '演示.pptx', spec: sampleDeck() };
    let captured: any;
    const models = {
      store: f.store,
      effective: () => ({ values: DEFAULT_MODEL_PREFERENCES }),
      catalog: async () => [],
      router: {
        async *stream(request: any) {
          captured = request.request;
          yield {
            type: 'model.event',
            event: { type: 'tool_end', callId: '1', name: 'slides.create', arguments: args },
          };
          yield { type: 'model.event', event: { type: 'finish', reason: 'tool_calls' } };
        },
      },
    } as unknown as ModelService;
    const run = f.work.repo.row(view.runId),
      output = await modelWorkDriver(models, { blobs: f.blobs } as ChatService)(
        run,
        f.work.repo.steps(run.id)[0]!,
        new AbortController().signal,
      );
    expect(output.calls[0]?.tool).toBe('slides.create');
    expect(captured.tools.map((t: any) => t.name)).toEqual([
      'slides.create',
      'slides.revise',
      'user.ask',
    ]);
    expect(
      validArguments(args, captured.tools.find((t: any) => t.name === 'slides.create').parameters),
    ).toBe(true);
    expect(captured.outputLimit).toBe(8192);
    expect(
      captured.tools.find((t: any) => t.name === 'slides.create').parameters.properties.name
        .description,
    ).toContain('.pptx');
  } finally {
    await f.close();
  }
});

test('P07-03 a title used as filename is rejected with an actionable fixed message before dispatch', async () => {
  const f = await fixture();
  try {
    const view = await f.create({ format: 'pptx' }),
      run = f.work.repo.row(view.runId);
    const models = {
      store: f.store,
      effective: () => ({ values: DEFAULT_MODEL_PREFERENCES }),
      catalog: async () => [],
      router: {
        async *stream() {
          yield {
            type: 'model.event',
            event: {
              type: 'tool_end',
              callId: '1',
              name: 'slides.create',
              arguments: { name: '合成示例演示', spec: sampleDeck() },
            },
          };
          yield { type: 'model.event', event: { type: 'finish', reason: 'tool_calls' } };
        },
      },
    } as unknown as ModelService;
    await expect(
      modelWorkDriver(models, { blobs: f.blobs } as ChatService)(
        run,
        f.work.repo.steps(run.id)[0]!,
        new AbortController().signal,
      ),
    ).rejects.toThrow('VALIDATION_ERROR');
    const events = JSON.stringify(
      f.store.db
        .prepare("SELECT payload_json FROM events WHERE event_type='tool.validation'")
        .all(),
    );
    expect(events).toContain('文件名必须以.pptx结尾');
    expect(events).not.toContain('合成示例演示');
    expect(f.store.db.prepare('SELECT count(*) n FROM tool_calls').get()).toEqual({ n: 0 });
  } finally {
    await f.close();
  }
});

test('P07-03 malformed model tool diagnostics remain actionable without persisting raw provider text', async () => {
  const f = await fixture();
  try {
    const view = await f.create({ format: 'pptx' });
    const models = {
      store: f.store,
      effective: () => ({ values: DEFAULT_MODEL_PREFERENCES }),
      catalog: async () => [],
      router: {
        async *stream() {
          yield {
            type: 'model.event',
            event: {
              type: 'error',
              error: {
                code: 'STREAM_INTERRUPTED',
                retryable: false,
                diagnosticCode: 'invalid_tool_arguments',
                message: 'PRIVATE_PROVIDER_TEXT_SENTINEL',
              },
            },
          };
        },
      },
    } as unknown as ModelService;
    const run = f.work.repo.row(view.runId);
    await expect(
      modelWorkDriver(models, { blobs: f.blobs } as ChatService)(
        run,
        f.work.repo.steps(run.id)[0]!,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    const events = JSON.stringify(
      f.store.db
        .prepare("SELECT payload_json FROM events WHERE event_type='tool.validation'")
        .all(),
    );
    expect(events).toContain('模型返回的工具参数不符合完整格式');
    expect(events).not.toContain('PRIVATE_PROVIDER_TEXT_SENTINEL');
    expect(f.store.db.prepare('SELECT count(*) AS n FROM tool_calls').get()).toEqual({ n: 0 });
  } finally {
    await f.close();
  }
});
