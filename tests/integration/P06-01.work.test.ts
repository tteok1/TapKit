import { test, expect } from 'vitest';
import { fixture, until } from './P06.fixture';
import { WorkViewSchema } from '../../packages/contracts/src';
import { newId } from '../../packages/storage/src';
import { DEFAULT_MODEL_PREFERENCES } from '../../packages/contracts/src';
import { modelWorkDriver } from '../../packages/core/src/work-driver';
import type { ModelService } from '../../packages/core/src/model-service';
import type { ChatService } from '../../packages/core/src/chat-service';
import type { RoutedEvent } from '../../packages/providers/src/routing/router';
test('P06-01 T13 shared route attempt errors allow the router to retry before dispatching one final tool', async () => {
  const f = await fixture();
  try {
    const view = await f.create(),
      run = f.work.repo.row(view.runId),
      selection = { providerId: 'fixture', modelId: 'fixture', accountId: newId() };
    let completed = false;
    const models = {
      store: f.store,
      effective: () => ({ values: DEFAULT_MODEL_PREFERENCES }),
      catalog: async () => [],
      router: {
        async *stream(): AsyncGenerator<RoutedEvent> {
          yield { type: 'attempt', attemptId: newId(), attemptNo: 1, model: selection };
          yield {
            type: 'model.event',
            attemptId: newId(),
            event: { type: 'text_delta', blockId: 'text', text: '旧尝试' },
          };
          yield {
            type: 'model.event',
            attemptId: newId(),
            event: {
              type: 'error',
              error: { code: 'NETWORK_ERROR', retryable: true },
              partial: false,
            },
          };
          yield { type: 'attempt', attemptId: newId(), attemptNo: 2, model: selection };
          yield {
            type: 'model.event',
            attemptId: newId(),
            event: {
              type: 'tool_end',
              callId: 'final',
              name: 'artifact.write',
              arguments: { name: '结果.md', content: '最终正文' },
            },
          };
          yield {
            type: 'model.event',
            attemptId: newId(),
            event: { type: 'finish', reason: 'tool_calls', nativeStateRef: 'fixture' },
          };
          completed = true;
        },
      },
    } as unknown as ModelService;
    const result = await modelWorkDriver(models, { blobs: f.blobs } as ChatService)(
      run,
      f.work.repo.steps(run.id)[0]!,
      new AbortController().signal,
    );
    expect(completed).toBe(true);
    expect(result.text).toBe('');
    expect(result.calls).toHaveLength(1);
    expect(result.finished).toBe(true);
  } finally {
    await f.close();
  }
});
test('P06-01 T13 terminal retry creates a new run and preserves the root call ceiling', async () => {
  const f = await fixture(async () => ({ text: '无文件', calls: [], finished: true }));
  try {
    const view = await f.create({
      budgetOverrides: { activeMs: 60000, tokens: 10000, maxCalls: 1, maxTools: 5 },
    });
    await f.work.start();
    await until(() => f.work.repo.row(view.runId).status === 'budget_stopped');
    const reply = await f.send(
      'runs.retry',
      { runId: view.runId, reuseVerifiedArtifacts: true },
      f.work.repo.row(view.runId).revision,
    );
    if (!reply.ok || !('work' in reply.data)) throw Error(JSON.stringify(reply));
    const next = reply.data.work;
    expect(next.runId).not.toBe(view.runId);
    await until(() => f.work.repo.row(next.runId).status === 'budget_stopped');
    expect(f.work.repo.row(next.runId).calls).toBe(0);
    expect(f.work.repo.view(next.runId).calls).toBe(1);
  } finally {
    await f.close();
  }
});
test('P06-01 T13 necessary clarification waits without calls, stale answers reject and correct answer resumes', async () => {
  let calls = 0;
  const f = await fixture(async () =>
    ++calls === 1
      ? {
          text: '需要受众',
          calls: [],
          finished: true,
          question: { title: '面向谁？', options: ['同事', '客户'] },
        }
      : {
          text: '已完成',
          calls: [{ tool: 'artifact.write', name: '结果.md', content: '面向同事' }],
          finished: true,
        },
  );
  try {
    const r = await f.create();
    await f.work.start();
    await until(() => f.work.repo.row(r.runId).status === 'waiting_user');
    const waiting = f.work.repo.view(r.runId);
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toBe(1);
    expect(
      (
        await f.send(
          'runs.answer',
          { runId: r.runId, questionId: waiting.questions[0]!.id, taskVersion: 2, answer: '同事' },
          waiting.revision,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await f.send(
          'runs.answer',
          { runId: r.runId, questionId: waiting.questions[0]!.id, taskVersion: 1, answer: '同事' },
          waiting.revision,
        )
      ).ok,
    ).toBe(true);
    await until(() => f.work.repo.row(r.runId).status === 'completed');
  } finally {
    await f.close();
  }
});
test('P06-01 T13 active time ceiling aborts an in-flight model and gives budget_stopped', async () => {
  const f = await fixture(async (_run, _step, signal) => {
    await new Promise<void>((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
    );
    throw Error('unreachable');
  });
  try {
    const r = await f.create({
      budgetOverrides: { activeMs: 100, tokens: 1024, maxCalls: 1, maxTools: 1 },
    });
    await f.work.start();
    await until(() => f.work.repo.row(r.runId).status === 'budget_stopped');
    expect(f.work.repo.view(r.runId).reason).toBe('BUDGET_EXCEEDED');
  } finally {
    await f.close();
  }
});
test('P06-01 T13 wrong artifact format never satisfies an explicit file contract', async () => {
  const f = await fixture();
  try {
    const r = await f.create({
      acceptance: [{ kind: 'file_exists', format: 'json', minCount: 1 }],
    });
    await f.work.start();
    await until(() => f.work.repo.row(r.runId).status === 'failed');
  } finally {
    await f.close();
  }
});
test('P06-01 T13 durable definition and receipt, real artifact required before completed', async () => {
  const f = await fixture();
  try {
    const requestId = newId(),
      payload = { sessionId: f.sessionId, goal: 'P06 计划', audience: '同事', quantity: 1 };
    const a = await f.send('runs.create', payload, undefined, requestId),
      b = await f.send('runs.create', payload, undefined, requestId);
    expect(b).toEqual(a);
    expect(
      (await f.send('runs.create', { ...payload, goal: '不同' }, undefined, requestId)).ok,
    ).toBe(false);
    if (!a.ok || !('work' in a.data)) throw Error('create');
    const run = WorkViewSchema.parse(a.data.work);
    await f.work.start();
    await until(() => f.work.repo.row(run.runId).status === 'completed');
    const view = f.work.repo.view(run.runId);
    expect(view.steps[0]!.artifacts).toHaveLength(1);
    expect(view.definition.audience).toBe('同事');
    const ref = view.steps[0]!.artifacts[0]!;
    if (ref.kind !== 'file') throw Error('ref');
    expect(
      (await f.files.original(ref.fileId, { versionId: ref.versionId })).bytes.toString(),
    ).toContain('可验证正文');
  } finally {
    await f.close();
  }
});
test('P06-01 T13 model completion claim without a file exhausts two repairs and fails', async () => {
  const f = await fixture(async () => ({ text: '文件已经完成', calls: [], finished: true }));
  try {
    const r = await f.create();
    await f.work.start();
    await until(() => f.work.repo.row(r.runId).status === 'failed');
    expect(f.work.repo.row(r.runId).calls).toBe(3);
    expect(f.work.repo.view(r.runId).steps[0]!.status).toBe('failed');
  } finally {
    await f.close();
  }
});
test('P06-01 T13 plan-first waits, rejects a cycle, accepts selection with dependencies and queues same session', async () => {
  const f = await fixture();
  try {
    const r = await f.create({ planFirst: true });
    await f.work.start();
    await until(() => f.work.repo.row(r.runId).status === 'waiting_user');
    const current = f.work.repo.view(r.runId),
      step = current.steps[0]!;
    const invalid = await f.send(
      'runs.setPlan',
      {
        runId: r.runId,
        steps: [
          {
            stepKey: 'x',
            title: 'x',
            dependencies: ['x'],
            inputRefs: [],
            outputContract: step.outputContract,
            acceptance: step.acceptance,
            optional: false,
          },
        ],
      },
      current.revision,
    );
    expect(invalid.ok).toBe(false);
    const next = await f.create();
    await new Promise((r) => setTimeout(r, 50));
    expect(f.work.repo.row(next.runId).status).toBe('queued');
    const steps = ['a', 'b'].map((key, i) => ({
      stepKey: key,
      title: key,
      dependencies: i ? ['a'] : [],
      inputRefs: [],
      outputContract: step.outputContract,
      acceptance: step.acceptance,
      optional: false,
    }));
    const changed = await f.send(
      'runs.setPlan',
      { runId: r.runId, steps, executeStepIds: ['b'] },
      current.revision,
    );
    expect(changed.ok).toBe(true);
    await until(() => f.work.repo.row(next.runId).status === 'completed');
    expect(f.work.repo.view(r.runId).selectedSteps).toEqual(['a', 'b']);
  } finally {
    await f.close();
  }
});
test('P06-01 T13 steer increments task version before late driver result, terminal run cannot resume', async () => {
  let resolve!: () => void;
  const blocked = new Promise<void>((r) => (resolve = r));
  let count = 0;
  const f = await fixture(async () => {
    if (++count === 1) await blocked;
    return {
      text: '旧结果',
      calls: [{ tool: 'artifact.write', name: '结果.md', content: '正文' }],
      finished: true,
    };
  });
  try {
    const r = await f.create();
    await f.work.start();
    await until(() => count === 1);
    const before = f.work.repo.view(r.runId);
    const reply = await f.send(
      'runs.steer',
      { runId: r.runId, text: '新目标', refs: [], clientRequestId: newId() },
      before.revision,
    );
    expect(reply.ok).toBe(true);
    if (!reply.ok || !('work' in reply.data)) throw Error('steer');
    const next = WorkViewSchema.parse(reply.data.work);
    expect(next.version).toBe(2);
    resolve();
    await until(() => f.work.repo.row(next.runId).status === 'completed');
    expect(f.work.repo.view(r.runId).steps[0]!.artifacts).toHaveLength(0);
    expect(f.work.repo.row(r.runId).status).toBe('cancelled');
    expect(
      (await f.send('runs.resume', { runId: r.runId }, f.work.repo.row(r.runId).revision)).ok,
    ).toBe(false);
  } finally {
    resolve();
    await f.close();
  }
});
