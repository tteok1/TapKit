import { modelWorkDriver } from '../../packages/core/src/work-driver';
import type { ModelService } from '../../packages/core/src/model-service';
import type { RoutingInput } from '../../packages/providers/src';
import { UsageLedger } from '../../packages/storage/src';
import { DEFAULT_MODEL_PREFERENCES, resolveApiConfig } from '../../packages/contracts/src';
import { modelRequest } from '../fixtures/P01-02.api';
import { test, expect } from 'vitest';
import { until } from './P06.fixture';
import { delegationFixture, result } from './P08-03.fixture';
import { newId, StorageError } from '../../packages/storage/src';
import { DelegateSpecSchema } from '../../packages/contracts/src';

test('P08-03 T19 two independent children share run root and verified sources; one failure still delivers the other', async () => {
  const f = await delegationFixture();
  try {
    await f.add('good');
    await f.add('bad', { role: 'reviewer' });
    f.work.delegation.driver = async (_run, spec) => {
      if (spec.key === 'bad') throw new StorageError('NETWORK_ERROR');
      return result();
    };
    await f.start();
    await f.finished();
    expect(f.parent().status).toBe('partial');
    const children = f.work.delegation.children(f.parent());
    expect(children.map((c) => c.root_run_id)).toEqual([
      f.parent().root_run_id,
      f.parent().root_run_id,
    ]);
    expect(children.map((c) => c.status).sort()).toEqual(['completed', 'failed']);
    const good = children.find((c) => c.status === 'completed')!;
    const opened = await f.send('subtasks.source', { runId: good.id, evidenceIndex: 0 });
    expect(opened.ok && 'delegateSource' in opened.data && opened.data.delegateSource.quote).toBe(
      result().evidence[0]!.quote,
    );
    if (f.ref.kind === 'file')
      f.store.db.prepare('UPDATE files SET deleted_at=1 WHERE id=?').run(f.ref.fileId);
    expect((await f.send('subtasks.source', { runId: good.id, evidenceIndex: 0 })).ok).toBe(false);

    expect(f.work.repo.state(f.parent()).delegateSummary?.filter((s) => s.result)).toHaveLength(1);
    expect(f.work.repo.view(f.runId).steps.some((s) => s.artifacts.length)).toBe(true);
    expect(f.work.repo.rootUsage(f.parent()).calls).toBe(3);
  } finally {
    await f.close();
  }
});
test('P08-03 T15 maximum two child executions and dependency ordering', async () => {
  const f = await delegationFixture();
  try {
    await f.add('a');
    await f.add('b');
    await f.add('c');
    await f.add('dependent', { dependencies: ['a', 'b'] });
    let active = 0,
      maximum = 0;
    const ended = new Set<string>();
    f.work.delegation.driver = async (_r, spec) => {
      if (spec.key === 'dependent') expect([...ended]).toEqual(expect.arrayContaining(['a', 'b']));
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      ended.add(spec.key);
      return result();
    };
    await f.start();
    await f.finished();
    expect(maximum).toBe(2);
    expect(ended.size).toBe(4);
    expect(f.parent().status).toBe('completed');
  } finally {
    await f.close();
  }
});
test('P08-03 depth one, scope intersection, strict contract and duplicate request receipt', async () => {
  const f = await delegationFixture();
  try {
    const id = newId(),
      request = { runId: f.runId, spec: f.spec() };
    const revision = f.view().revision;
    const one = await f.send('task.delegate', request, revision, id);
    const two = await f.send('task.delegate', request, revision, id);
    expect(two).toEqual(one);
    const child = f.work.delegation.children(f.parent())[0]!;
    expect(
      (await f.send('task.delegate', { runId: child.id, spec: f.spec('nested') }, child.revision))
        .ok,
    ).toBe(false);
    expect(
      (
        await f.send(
          'task.delegate',
          {
            runId: f.runId,
            spec: f.spec('escape', {
              inputs: [{ kind: 'file', fileId: newId(), versionId: newId() }],
            }),
          },
          f.view().revision,
        )
      ).ok,
    ).toBe(false);
    expect(
      DelegateSpecSchema.safeParse({ ...f.spec(), allowedTools: ['workspace.patch'] }).success,
    ).toBe(false);
    await expect(
      f.gateway.execute(
        child,
        'delegated',
        { tool: 'artifact.write', name: 'escape.md', content: 'no' },
        () => {},
      ),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(f.work.delegation.children(f.parent())).toHaveLength(1);
  } finally {
    await f.close();
  }
});
test('P08-03 root cancellation propagates before late result and no stale publication', async () => {
  const f = await delegationFixture();
  try {
    await f.add();
    let started = false,
      release!: () => void;
    f.work.delegation.driver = async () => {
      started = true;
      await new Promise<void>((r) => (release = r));
      return result();
    };
    await f.start();
    await until(() => started);
    const capacity = await f.send('runs.list', {});
    expect(capacity.ok && 'workItems' in capacity.data && capacity.data.running).toBe(1);
    expect((await f.send('runs.cancel', { runId: f.runId }, f.view().revision)).ok).toBe(true);
    release();
    await until(() => f.work.delegation.children(f.parent())[0]!.status === 'cancelled');
    expect(f.work.repo.state(f.work.delegation.children(f.parent())[0]!).child!.result).toBeNull();
    expect(f.parent().status).toBe('cancelled');
  } finally {
    await f.close();
  }
});
test('P08-03 pausing a running child does not abort its independent sibling', async () => {
  const f = await delegationFixture();
  try {
    const a = await f.add('a');
    await f.add('b');
    let started = false;
    f.work.delegation.driver = async (_run, spec, _sources, _feedback, signal) => {
      if (spec.key === 'a') {
        started = true;
        await new Promise<void>((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new StorageError('CANCELLED')), {
            once: true,
          }),
        );
      } else await new Promise((r) => setTimeout(r, 30));
      return result();
    };
    await f.start();
    await until(() => started);
    expect(
      (
        await f.send(
          'subtasks.control',
          { runId: f.runId, childRunId: a.id, action: 'pause' },
          f.view().revision,
        )
      ).ok,
    ).toBe(true);
    await until(() => f.parent().status === 'waiting_user');
    expect(f.work.repo.row(a.id).status).toBe('paused');
    expect(f.parent().pause_requested_at).toBeNull();
    expect(
      f.work.delegation
        .children(f.parent())
        .find((c) => f.work.repo.state(c).child!.spec.key === 'b')?.status,
    ).toBe('completed');
  } finally {
    await f.close();
  }
});
test('P08-03 revoked fixed-source access is rechecked before publishing a child result', async () => {
  const f = await delegationFixture();
  try {
    await f.add();
    f.work.delegation.driver = async () => {
      if (f.ref.kind !== 'file') throw Error('ref');
      f.store.db.prepare('UPDATE files SET deleted_at=1 WHERE id=?').run(f.ref.fileId);
      return result();
    };
    await f.start();
    await f.finished();
    const child = f.work.delegation.children(f.parent())[0]!;
    expect(child.status).toBe('failed');
    expect(f.work.repo.state(child).child!.result).toBeNull();
  } finally {
    await f.close();
  }
});
test('P08-03 pause one branch retains independent result; feedback archives version and retry shares budget', async () => {
  const f = await delegationFixture();
  try {
    const a = await f.add('a');
    await f.add('b');
    expect(
      (
        await f.send(
          'subtasks.control',
          { runId: f.runId, childRunId: a.id, action: 'pause' },
          f.view().revision,
        )
      ).ok,
    ).toBe(true);
    await f.start();
    await until(() => f.parent().status === 'waiting_user');
    expect(
      f.work.delegation
        .children(f.parent())
        .find((c) => f.work.repo.state(c).child!.spec.key === 'b')?.status,
    ).toBe('completed');
    const before = f.work.repo.rootUsage(f.parent()).calls;
    expect(
      (
        await f.send(
          'subtasks.control',
          { runId: f.runId, childRunId: a.id, action: 'steer', feedback: '只核对耗时，保留未知' },
          f.view().revision,
        )
      ).ok,
    ).toBe(true);
    await f.finished();
    expect(f.work.delegation.children(f.parent(), true)).toHaveLength(3);
    expect(f.work.repo.state(f.work.repo.row(a.id)).child!.archived).toBe(true);
    expect(f.work.repo.rootUsage(f.parent()).calls).toBeGreaterThan(before);
  } finally {
    await f.close();
  }
});
test('P08-03 exact quote failure and revoked source cannot become verified child results', async () => {
  const f = await delegationFixture();
  try {
    await f.add();
    f.work.delegation.driver = async () => ({
      ...result(),
      evidence: [{ inputIndex: 0, start: 0, end: 3, quote: '伪造' }],
    });
    await f.start();
    await f.finished();
    const child = f.work.delegation.children(f.parent())[0]!;
    expect(child.status).toBe('failed');
    expect(f.work.repo.state(child).child!.result).toBeNull();
    expect(f.parent().status).toBe('partial');
  } finally {
    await f.close();
  }
});
test('P08-03 max root calls cannot be refreshed by child retry', async () => {
  const f = await delegationFixture({
    budgetOverrides: { tokens: 10000, activeMs: 30000, maxCalls: 1, maxTools: 10 },
  });
  try {
    await f.add();
    await f.add('b');
    await f.start();
    await f.finished();
    expect(f.work.repo.rootUsage(f.parent()).calls).toBe(1);
    expect(f.parent().status).toBe('budget_stopped');
    expect(f.work.delegation.children(f.parent()).some((c) => c.status === 'budget_stopped')).toBe(
      true,
    );
  } finally {
    await f.close();
  }
});
test('P08-03 root tool ceiling rejects child result without adding another allowance', async () => {
  const f = await delegationFixture({
    budgetOverrides: { tokens: 10000, activeMs: 30000, maxCalls: 10, maxTools: 1 },
  });
  try {
    await f.add('a', { budget: { tokens: 8192, activeMs: 10000, maxCalls: 1, maxTools: 1 } });
    await f.start();
    await f.finished();
    expect(f.work.repo.rootUsage(f.parent()).tools).toBe(1);
    expect(f.work.delegation.children(f.parent())[0]?.status).toBe('budget_stopped');
  } finally {
    await f.close();
  }
});
test('P08-03 changed root version cancels children and retains immutable history', async () => {
  const f = await delegationFixture();
  try {
    const child = await f.add();
    const next = await f.send(
      'runs.steer',
      { runId: f.runId, text: '新目标', refs: [], clientRequestId: newId() },
      f.view().revision,
    );
    expect(next.ok).toBe(true);
    expect(f.work.repo.row(child.id).status).toBe('cancelled');
    expect(f.work.repo.state(f.work.repo.row(child.id)).child!.spec.parentTaskVersion).toBe(1);
  } finally {
    await f.close();
  }
});
test('P08-03 interrupted child restores paused and cannot enter the ordinary root scheduler', async () => {
  const f = await delegationFixture();
  try {
    const child = await f.add();
    f.store.db.prepare("UPDATE runs SET status='running' WHERE id=?").run(child.id);
    const callId = newId();
    f.store.db
      .prepare(
        "INSERT INTO tool_calls(id,profile_id,created_at,updated_at,run_id,task_version,call_id,tool_name,tool_version,args_json,args_hash,resource_hash,idempotency_key,status,side_effect,step_key) VALUES(?,?,?,?,?,1,?,'source.read','p08-03-1','{}','fixture','fixture',?,'dispatched','none','delegated')",
      )
      .run(callId, f.store.profileId, f.store.now(), f.store.now(), child.id, callId, callId);
    f.store.db
      .prepare(
        'INSERT INTO tool_call_attempts(id,profile_id,tool_call_id,attempt_no,started_at) VALUES(?,?,?,1,?)',
      )
      .run(newId(), f.store.profileId, callId, f.store.now());
    await f.work.recover([child.id]);
    expect(f.store.db.prepare('SELECT status FROM tool_calls WHERE id=?').get(callId)).toEqual({
      status: 'cancelled',
    });
    expect(f.work.repo.rootUsage(f.parent()).tools).toBe(1);
    expect(f.work.repo.row(child.id).status).toBe('paused');
    await f.start();
    await until(() => f.parent().status === 'waiting_user');
    expect(f.work.repo.row(child.id).status).toBe('paused');
  } finally {
    await f.close();
  }
});

test('P08-03 retry a failed child after parent completion starts a new parent version without resetting root usage', async () => {
  const f = await delegationFixture();
  try {
    const child = await f.add();
    f.work.delegation.driver = async () => {
      throw new StorageError('NETWORK_ERROR');
    };
    await f.start();
    await f.finished();
    const before = f.work.repo.rootUsage(f.parent()).calls;
    f.work.delegation.driver = async () => result();
    const reply = await f.send(
      'subtasks.control',
      { runId: f.runId, childRunId: child.id, action: 'retry' },
      f.view().revision,
    );
    expect(reply.ok).toBe(true);
    if (!reply.ok || !('work' in reply.data)) throw Error('reply');
    const next = reply.data.work;
    expect(next.version).toBe(2);
    expect(next.runId).not.toBe(f.runId);
    expect(f.parent().status).toBe('partial');
    await until(() => f.work.repo.row(next.runId).status === 'completed');
    expect(f.work.repo.rootUsage(f.work.repo.row(next.runId)).calls).toBeGreaterThan(before);
    expect(f.work.repo.row(next.runId).root_run_id).toBe(f.parent().root_run_id);
  } finally {
    await f.close();
  }
});
test('P08-03 schema21 preserves one active root per session while allowing explicit child runs', async () => {
  const f = await delegationFixture();
  try {
    const child = await f.add();
    f.store.db.prepare("UPDATE runs SET status='running' WHERE id=?").run(f.runId);
    expect(() =>
      f.store.db.prepare("UPDATE runs SET status='running' WHERE id=?").run(child.id),
    ).not.toThrow();
    const root = await f.send('runs.create', { sessionId: f.sessionId, goal: '排队根任务' });
    if (!root.ok || !('work' in root.data)) throw Error('create');
    const queuedId = root.data.work.runId;
    expect(() =>
      f.store.db.prepare("UPDATE runs SET status='running' WHERE id=?").run(queuedId),
    ).toThrow();
    expect(f.store.db.pragma('foreign_key_check')).toEqual([]);
    f.store.db
      .prepare("UPDATE runs SET status='cancelled' WHERE id IN (?,?)")
      .run(child.id, f.runId);
  } finally {
    await f.close();
  }
});

test.each(['deadline', 'active-time'] as const)(
  'P08-03 child %s cannot dispatch beyond its bound',
  async (kind) => {
    const f = await delegationFixture();
    try {
      const child = await f.add(
        'limited',
        kind === 'deadline'
          ? { deadline: f.store.now() - 1 }
          : { budget: { tokens: 8192, activeMs: 100, maxCalls: 1, maxTools: 2 } },
      );
      f.work.delegation.driver = async (_run, _spec, _sources, _feedback, signal) => {
        await new Promise<void>((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        );
        return result();
      };
      await f.start();
      await f.finished();
      const current = f.work.repo.row(child.id);
      expect(current.status).toBe('budget_stopped');
      expect(current.status_reason).toBe('BUDGET_EXCEEDED');
      expect(current.calls).toBe(kind === 'deadline' ? 0 : 1);
    } finally {
      await f.close();
    }
  },
);

test('P08-03 oversized fixed source fails before a model request with a useful limit code', async () => {
  const f = await delegationFixture({}, '界'.repeat(40001));
  try {
    const child = await f.add();
    await f.start();
    await f.finished();
    const current = f.work.repo.row(child.id);
    expect(current.status_reason).toBe('OUTPUT_LIMIT_REACHED');
    expect(current.calls).toBe(0);
  } finally {
    await f.close();
  }
});

test('P08-03 explicit Core summary rechecks and publishes without another model attempt at the root call ceiling', async () => {
  const f = await delegationFixture({
    budgetOverrides: { tokens: 10000, activeMs: 30000, maxCalls: 2, maxTools: 8 },
  });
  try {
    expect(
      (await f.send('subtasks.summaryMode', { runId: f.runId, enabled: true }, f.view().revision))
        .ok,
    ).toBe(true);
    await f.add('a');
    await f.add('b', { role: 'reviewer' });
    await f.start();
    await f.finished();
    expect(f.parent().status).toBe('completed');
    expect(f.parent().calls).toBe(0);
    expect(f.work.repo.rootUsage(f.parent()).calls).toBe(2);
    expect(f.view().steps[0]?.artifacts.length).toBe(1);
  } finally {
    await f.close();
  }
});
test('P08-03 shared ledger enforces work override on every retry or fallback attempt after child usage', async () => {
  const f = await delegationFixture({
    budgetOverrides: { tokens: 10000, activeMs: 30000, maxCalls: 2, maxTools: 8 },
  });
  try {
    const child = await f.add(),
      accountId = newId(),
      ledger = new UsageLedger(f.store);
    f.store.db
      .prepare(
        "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status,api_format,base_url,model_id) VALUES(?,?,?,?, 'openai-compatible','fixture','api_key',?,'ready','openai-chat','https://fixture.invalid/v1','fixture-model')",
      )
      .run(accountId, f.store.profileId, f.store.now(), f.store.now(), newId());
    const config = resolveApiConfig('openai-compatible', {
        apiFormat: 'openai-chat',
        baseURL: 'https://fixture.invalid/v1',
        modelId: 'fixture-model',
      }),
      logicalCallId = newId();
    const reserve = (runId: string, logical = logicalCallId) =>
      ledger.reserve({
        request: {
          ...modelRequest(config),
          logicalCallId: logical,
          attemptId: newId(),
          accountId,
          outputLimit: 64,
        },
        runId,
        rootRunId: f.parent().root_run_id,
        inputTokens: 20,
        preferences: DEFAULT_MODEL_PREFERENCES,
        price: null,
        mode: 'work',
      });
    reserve(child.id, newId());
    reserve(f.runId);
    expect(() => reserve(f.runId)).toThrow('BUDGET_EXCEEDED');
    expect(f.store.db.prepare('SELECT count(*) n FROM provider_attempts').get()).toEqual({ n: 2 });
    const budget = f.store.db
      .prepare("SELECT limits_json FROM budgets WHERE owner_kind='root'")
      .get() as { limits_json: string };
    expect(JSON.parse(budget.limits_json)).toMatchObject({ usedCalls: 2, maxCalls: 2 });
    ledger.recover();
  } finally {
    await f.close();
  }
});

test('P08-03 model-written generic Markdown declares only necessary tools and keeps child text untrusted', async () => {
  const f = await delegationFixture();
  try {
    const state = f.work.repo.state(f.parent());
    state.delegateSummary = [
      { runId: newId(), role: 'researcher', status: 'completed', result: result() },
    ];
    f.work.repo.save(f.parent(), state);
    let captured: RoutingInput | undefined;
    const models = {
      store: f.store,
      effective: () => ({ values: DEFAULT_MODEL_PREFERENCES }),
      catalog: async () => [],
      router: {
        async *stream(input: RoutingInput) {
          captured = input;
          yield {
            type: 'model.event',
            attemptId: newId(),
            event: {
              type: 'tool_end',
              callId: 'summary',
              name: 'artifact.write',
              arguments: { name: '汇总.md', content: '# 已核验资料汇总' },
            },
          };
          yield {
            type: 'model.event',
            attemptId: newId(),
            event: { type: 'finish', reason: 'tool_calls', nativeStateRef: '' },
          };
        },
      },
    } as unknown as ModelService;
    const candidate = await modelWorkDriver(models, f.chat)(
      f.parent(),
      f.work.repo.steps(f.runId)[0]!,
      new AbortController().signal,
    );
    expect(candidate.finished).toBe(true);
    expect(captured!.request.tools.map((t) => t.name)).toEqual(['artifact.write', 'user.ask']);
    expect(
      captured!.request.messages.some(
        (m) => m.role === 'user' && m.text.includes('untrusted_subtask_data'),
      ),
    ).toBe(true);
  } finally {
    await f.close();
  }
});

test('P08-03 Core summary refuses an incompatible selected output contract', async () => {
  const f = await delegationFixture();
  try {
    const step = f.work.repo.steps(f.runId)[0]!;
    f.work.repo.setSteps(f.parent(), [
      { ...step, outputContract: { kind: 'files', formats: ['pdf'] } },
    ]);
    const reply = await f.send(
      'subtasks.summaryMode',
      { runId: f.runId, enabled: true },
      f.view().revision,
    );
    expect(reply.ok).toBe(false);
    expect(f.work.repo.state(f.parent()).definition.delegationSummaryOnly).not.toBe(true);
  } finally {
    await f.close();
  }
});
