import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  openStore,
  BlobStore,
  JobQueue,
  newId,
  eraseMessageContent,
  migrate,
  SCHEMA_VERSION,
  memoryStore,
  MemoryBlobStore,
} from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
import { ChatService } from '../../packages/core/src/chat-service';
import { HistoryService } from '../../packages/core/src/history-service';
import {
  DEFAULT_MODEL_PREFERENCES,
  DescriptorSchema,
  MemoryPageSchema,
  MemoryUseSchema,
  type MemoryCandidate,
} from '../../packages/contracts/src';
import { conservativeCandidate, countTokens } from '../../packages/context/src';
import { createRequire } from 'node:module';
import { Store, migrations } from '../../packages/storage/src';
import type { RoutingInput, RoutedEvent } from '../../packages/providers/src/routing/router';
const req = (command: string, payload: unknown, expectedRevision?: number) => ({
  protocolVersion: 1 as const,
  requestId: newId(),
  command,
  payload,
  ...(expectedRevision === undefined ? {} : { expectedRevision }),
});
test('P04-03 T11 candidate validation rejects model hallucinations, low confidence and stale leases', async () => {
  const f = await fixture();
  try {
    const sid = f.create();
    for (const variant of ['confidence', 'quote', 'sensitive', 'temporary', 'credential']) {
      f.enqueue(sid, '我喜欢咖啡');
      f.memory.extractor = async () => {
        const c = conservativeCandidate('我喜欢咖啡')[0]!;
        if (variant === 'confidence') c.confidence = 0.84;
        if (variant === 'quote') c.quote = '模型自己编造的来源';
        if (variant === 'sensitive') c.sensitive = true;
        if (variant === 'temporary') c.stable = false;
        if (variant === 'credential') c.value = 'API Key synthetic';
        return [c];
      };
      await f.drain();
    }
    expect(f.memory.list(f.scope).memories).toHaveLength(0);
    expect(f.store.db.prepare('SELECT * FROM memory_candidates').all()).toHaveLength(0);
    f.enqueue(sid, '我喜欢咖啡');
    let release!: (c: MemoryCandidate[]) => void;
    f.memory.extractor = () =>
      new Promise((r) => {
        release = r;
      });
    const queue = new JobQueue(f.store),
      job = queue.claim(newId())!,
      pending = f.memory.execute(job, new AbortController().signal);
    await Promise.resolve();
    f.store.db.prepare('UPDATE jobs SET lease_expires_at=0 WHERE id=?').run(job.id);
    release(conservativeCandidate('我喜欢咖啡'));
    expect(await pending).toBe('conflict');
    expect(f.memory.list(f.scope).memories).toHaveLength(0);
  } finally {
    f.store.close();
  }
});
test('P04-03 T11 two concurrent session candidates lose to a later manual edit; source and settings revisions fence jobs', async () => {
  const f = await fixture();
  try {
    const a = f.create(),
      b = f.create();
    const source = f.enqueue(a, '我喜欢中文回答');
    f.enqueue(b, '我喜欢中文回答');
    const releases: ((c: MemoryCandidate[]) => void)[] = [];
    f.memory.extractor = () => new Promise((r) => releases.push(r));
    const queue = new JobQueue(f.store),
      jobs = [queue.claim(newId())!, queue.claim(newId())!],
      pending = jobs.map((j) => f.memory.execute(j, new AbortController().signal));
    await Promise.resolve();
    f.command('memory.write', { scope: f.scope, predicate: '喜欢', value: '人工选择英文' });
    for (const release of releases) release(conservativeCandidate('我喜欢中文回答'));
    await Promise.all(pending);
    expect(f.memory.list(f.scope).memories[0]!.value).toBe('人工选择英文');
    for (const j of jobs) queue.finish(j, 'completed');
    f.enqueue(a, '我喜欢咖啡');
    const j = queue.claim(newId())!;
    f.store.db
      .prepare('UPDATE messages SET revision=revision+1 WHERE id=?')
      .run(JSON.parse(j.payload_json).messageId);
    expect(await f.memory.execute(j, new AbortController().signal)).toBe('skipped');
    queue.finish(j, 'completed');
    f.enqueue(b, '我喜欢咖啡');
    const j2 = queue.claim(newId())!;
    const s = f.memory.policy(b);
    f.command(
      'memory.policy.set',
      { sessionId: b, memoryEnabled: false, historyEnabled: false },
      s.revision,
    );
    expect(await f.memory.execute(j2, new AbortController().signal)).toBe('skipped');
    expect(f.memory.history(b, '中文')).toHaveLength(0);
    expect(f.memory.background(b, '中文').memoryUses).toHaveLength(0);
    expect(
      f.command('memory.source', {
        memoryId: f.memory.list(f.scope).memories[0]!.id,
        messageId: source.mid,
      }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  } finally {
    f.store.close();
  }
});
test('P04-03 search pagination, scope move, expiry and explicitly saved sensitive fact use the same verified store', async () => {
  const f = await fixture();
  try {
    for (let n = 0; n < 102; n++)
      expect(
        f.command('memory.write', {
          scope: f.scope,
          predicate: '分页' + n,
          value: '中文索引测试' + n,
        }).ok,
      ).toBe(true);
    const first = f.memory.list(f.scope);
    expect(first.memories).toHaveLength(100);
    expect(f.memory.list(f.scope, '', first.nextCursor!).memories).toHaveLength(2);
    expect(f.memory.list(f.scope, '索引测试').memories).toHaveLength(100);
    expect(f.memory.list(f.scope, '中').memories).toHaveLength(100);
    expect(f.command('memory.list', { scope: f.scope, query: '" OR *' }).ok).toBe(true);
    const project = f.project(),
      m = first.memories[0]!;
    expect(
      f.command(
        'memory.update',
        { memoryId: m.id, value: '转入项目', scope: { type: 'project', id: project } },
        m.revision,
      ).ok,
    ).toBe(true);
    expect(f.memory.list({ type: 'project', id: project }).memories[0]!.value).toBe('转入项目');
    expect(f.memory.list(f.scope).memories.some((r) => r.id === m.id)).toBe(false);
    const moved = f.memory.list({ type: 'project', id: project }).memories[0]!;
    expect(moved.id).toBe(m.id);
    expect(f.command('memory.undo', { changeEventId: moved.changeEventId }).ok).toBe(true);
    expect(f.memory.list({ type: 'project', id: project }).memories).toHaveLength(0);
    expect(f.memory.list(f.scope).memories.find((row) => row.id === m.id)?.value).toBe(m.value);
    const sid = f.create(),
      mid = f.add(sid, '记住：健康事实：我需要无糖饮食');
    f.store.db.transaction(() => f.memory.explicit(mid))();
    expect(f.memory.list(f.scope, '无糖').memories[0]).toMatchObject({
      explicit: true,
      sensitive: true,
    });
    expect(
      f.command('memory.write', {
        scope: f.scope,
        predicate: '健康需求',
        value: '健康事实：需要无糖饮食',
      }).ok,
    ).toBe(true);
    expect(f.memory.list(f.scope, '健康事实').memories[0]!.sensitive).toBe(true);
    expect(
      f.command('memory.write', {
        scope: f.scope,
        predicate: '到期',
        value: '不要再注入',
        expiresAt: f.store.now() + 1000,
      }).ok,
    ).toBe(true);
    f.store.db.prepare("UPDATE memories SET expires_at=1 WHERE predicate='到期'").run();
    expect(JSON.stringify(f.memory.background(sid, '到期'))).not.toContain('不要再注入');
    expect(f.memory.list(f.scope, '到期').memories).toHaveLength(0);
  } finally {
    f.store.close();
  }
});
test('P04-03 schema13 to schema14 migration preserves history, dedupes active keys and rebuilds jobs with foreign keys intact', async () => {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P04-03 migration '));
  const require = createRequire(import.meta.url),
    Database =
      require('../../packages/storage/node_modules/better-sqlite3') as typeof import('better-sqlite3');
  const db = new Database(resolve(dir, 'app.sqlite'));
  db.pragma('foreign_keys=ON');
  try {
    await migrate(
      db,
      resolve(dir, 'backups'),
      migrations.filter((m) => m.version <= 13),
    );
    const store = new Store(db, dir),
      now = store.now();
    for (const v of ['旧值', '新值'])
      db.prepare(
        "INSERT INTO memories(id,profile_id,created_at,updated_at,subject,predicate,value_json,scope_type,scope_id,valid_from,content_hash,explicit) VALUES(?,?,?,?,'user','语言',?,'profile',?,?,?,1)",
      ).run(
        newId(),
        store.profileId,
        now,
        now + (v === '新值' ? 1 : 0),
        JSON.stringify(v),
        store.profileId,
        now,
        v,
      );
    const queue = new JobQueue(store),
      job = queue.enqueue({ schemaVersion: 1, kind: 'blob.gc' }, 'migration-gc');
    const previous = db.prepare('SELECT * FROM jobs WHERE id=?').get(job);
    await migrate(db, resolve(dir, 'backups'));
    await migrate(db, resolve(dir, 'backups'));
    expect(db.pragma('user_version', { simple: true })).toBe(19);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.prepare('SELECT * FROM jobs WHERE id=?').get(job)).toEqual(previous);
    expect(db.prepare("SELECT value_json FROM memories WHERE status='active'").all()).toEqual([
      { value_json: JSON.stringify('新值') },
    ]);
    expect(db.prepare("SELECT value_json FROM memories WHERE status='superseded'").all()).toEqual([
      { value_json: JSON.stringify('旧值') },
    ]);
    expect(db.prepare('SELECT body FROM memory_search_documents').all()).toHaveLength(1);
  } finally {
    db.close();
  }
});
test('P04-03 T11 undoing a scope move fences an already extracting candidate in the vacated scope', async () => {
  const f = await fixture();
  try {
    const project = f.project(),
      sid = f.create(project);
    f.enqueue(sid, '我喜欢咖啡');
    await f.drain();
    f.command('memory.write', { scope: f.scope, predicate: '喜欢', value: '咖啡' });
    const m = f.memory.list(f.scope).memories[0]!;
    expect(
      f.command(
        'memory.update',
        { memoryId: m.id, value: '咖啡', scope: { type: 'project', id: project } },
        m.revision,
      ).ok,
    ).toBe(true);
    const moved = f.memory.list({ type: 'project', id: project }).memories[0]!;
    f.enqueue(sid, '我喜欢咖啡');
    let release!: (c: MemoryCandidate[]) => void;
    f.memory.extractor = () =>
      new Promise((r) => {
        release = r;
      });
    const job = new JobQueue(f.store).claim(newId())!,
      pending = f.memory.execute(job, new AbortController().signal);
    await Promise.resolve();
    expect(f.command('memory.undo', { changeEventId: moved.changeEventId }).ok).toBe(true);
    release(conservativeCandidate('我喜欢咖啡'));
    await pending;
    expect(f.memory.list({ type: 'project', id: project }).memories).toHaveLength(0);
    expect(f.memory.list(f.scope).memories[0]!.value).toBe('咖啡');
    const decision = f.store.db
      .prepare('SELECT decision FROM memory_candidates WHERE job_id=?')
      .get(job.id);
    expect(decision).toEqual({ decision: 'conflict' });
  } finally {
    f.store.close();
  }
});
test('P04-03 explicit correction of an arbitrary referenced fact retains its identity and rejects an ambiguous or missing target', async () => {
  const f = await fixture();
  try {
    const sid = f.create(),
      mid = f.add(sid, '记住：我使用合成系统');
    f.store.db.transaction(() => f.memory.explicit(mid))();
    const original = f.memory.list(f.scope).memories[0]!;
    const correction = f.add(sid, '更新记忆：把我使用合成系统改为我使用新的合成系统');
    expect(f.store.db.transaction(() => f.memory.explicit(correction))()).toBe('written');
    const updated = f.memory.list(f.scope).memories[0]!;
    expect(updated.id).toBe(original.id);
    expect(updated.value).toBe('我使用新的合成系统');
    expect(updated.sources[0]!.messageId).toBe(correction);
    const missing = f.add(sid, '更新记忆：把不存在的信息改为错误替换');
    expect(f.store.db.transaction(() => f.memory.explicit(missing))()).toBe('skipped');
    const malformed = f.add(sid, '更新记忆：把我使用新的合成系统改为');
    expect(f.store.db.transaction(() => f.memory.explicit(malformed))()).toBe('skipped');
    expect(f.memory.list(f.scope).memories).toHaveLength(1);
    f.command('memory.write', {
      scope: f.scope,
      predicate: '重复事实',
      value: '我使用新的合成系统',
    });
    const ambiguous = f.add(sid, '纠正记忆：把我使用新的合成系统改为含糊替换');
    expect(f.store.db.transaction(() => f.memory.explicit(ambiguous))()).toBe('skipped');
    expect(f.memory.list(f.scope).memories.every((m) => m.value !== '含糊替换')).toBe(true);
  } finally {
    f.store.close();
  }
});
test('P04-03 background extraction binds the actual answer account and inherited root budget and refuses an unrelated ready account', async () => {
  const f = await fixture();
  try {
    const sid = f.create(),
      parent = f.enqueue(sid, '普通合成目标'),
      child = f.enqueue(sid, '我喜欢咖啡'),
      original = (await f.models.catalog())[0]!;
    const other = DescriptorSchema.parse({
      ...original,
      accountId: newId(),
      modelId: 'unselected',
    });
    f.models.catalog = async () => [other, original];
    f.store.db.prepare('UPDATE runs SET root_run_id=?,task_version=2,model_json=? WHERE id=?').run(
      parent.rid,
      JSON.stringify({
        schemaVersion: 1,
        selection: { accountId: original.accountId, modelId: original.modelId },
      }),
      child.rid,
    );
    await f.drain();
    const input = f.inputs[0]!;
    expect([...input.allowedAccounts!]).toEqual([original.accountId]);
    expect(input.rootRunId).toBe(parent.rid);
    expect(input.runId).toBe(child.rid);
    expect(input.request.taskVersion).toBe(2);
    f.models.catalog = async () => [other];
    await expect(
      f.chat.extractMemory(sid, child.rid, '我喜欢咖啡', new AbortController().signal),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(f.inputs).toHaveLength(1);
  } finally {
    f.store.close();
  }
});
test('P04-03 copying a session preserves provenance without copying a memory-write receipt or repeating the write', async () => {
  const f = await fixture();
  try {
    const sid = f.create(),
      mid = f.add(sid, '记住：我喜欢中文回答');
    f.store.db.transaction(() => f.memory.explicit(mid))();
    f.store.db
      .prepare(
        "UPDATE messages SET chat_json=json_set(chat_json,'$.memoryOutcome','written') WHERE id=?",
      )
      .run(mid);
    const count = f.store.db
      .prepare("SELECT count(*) n FROM events WHERE event_type='memory.changed'")
      .get();
    const reply = await f.history.dispatch(req('sessions.copy', { sessionId: sid }));
    expect(reply.ok).toBe(true);
    if (!reply.ok) throw new Error(reply.error.code);
    const target = (reply.data as { sessionId: string }).sessionId,
      copied = f.store.db
        .prepare(
          "SELECT source_message_id,chat_json FROM messages WHERE session_id=? AND role='user'",
        )
        .get(target) as { source_message_id: string; chat_json: string };
    expect(copied.source_message_id).toBe(mid);
    expect(JSON.parse(copied.chat_json).memoryOutcome).toBeUndefined();
    expect(
      f.store.db.prepare("SELECT count(*) n FROM events WHERE event_type='memory.changed'").get(),
    ).toEqual(count);
    expect(f.memory.list(f.scope).memories).toHaveLength(1);
  } finally {
    f.store.close();
  }
});
async function fixture() {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P04-03 synthetic ')),
    store = await openStore(dir),
    blobs = new BlobStore(store),
    core = new CoreService(store);
  const selection = { accountId: newId(), modelId: 'synthetic' },
    descriptor = DescriptorSchema.parse({
      accountId: selection.accountId,
      providerId: 'openai-compatible',
      modelId: selection.modelId,
      displayName: 'synthetic',
      contextWindow: 64000,
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
  const inputs: RoutingInput[] = [];
  const models = {
    catalog: async () => [descriptor],
    effective: () => ({
      values: structuredClone(DEFAULT_MODEL_PREFERENCES),
      scope: 'profile' as const,
    }),
    ledger: { hasPreferences: () => false },
    router: {
      async *stream(input: RoutingInput): AsyncIterable<RoutedEvent> {
        inputs.push(input);
        const attemptId = newId();
        yield { type: 'attempt', attemptId, model: selection, attemptNo: 1 };
        const extract = input.request.systemModules.some((m) => m.id === 'tapkit.memory.extract');
        yield {
          type: 'model.event',
          attemptId,
          event: {
            type: 'text_delta',
            blockId: 'text',
            text: extract
              ? JSON.stringify(
                  conservativeCandidate((input.request.messages[0] as { text: string }).text),
                )
              : '合成回答',
          },
        };
        yield {
          type: 'model.event',
          attemptId,
          event: { type: 'finish', reason: 'stop', nativeStateRef: '' },
        };
      },
    },
  };
  const chat = new ChatService(store, blobs, models),
    history = new HistoryService(store, blobs, chat),
    memory = chat.memories;
  memory.extractor = (sid, rid, input, signal) => chat.extractMemory(sid, rid, input.text, signal);
  const create = (projectId?: string) => {
    const r = core.dispatch(
      req('sessions.create', {
        title: '合成记忆',
        mode: 'chat',
        ...(projectId ? { projectId } : {}),
      }),
    );
    if (!r.ok) throw new Error(r.error.code);
    return (r.data as { entityId: string }).entityId;
  };
  const project = () => {
    const r = core.dispatch(req('projects.create', { name: '合成项目' }));
    if (!r.ok) throw new Error(r.error.code);
    return (r.data as { entityId: string }).entityId;
  };
  const add = (sid: string, text: string, role: 'user' | 'assistant' = 'user') =>
    store.db.transaction(() => chat.insertMessage(chat.session(sid), role, text, 'final', null))();
  const enqueue = (sid: string, text: string) =>
    store.db.transaction(() => {
      const mid = add(sid, text),
        rid = chat.createRun(chat.session(sid), mid, null);
      store.db.prepare("UPDATE runs SET status='completed' WHERE id=?").run(rid);
      memory.enqueue(sid, rid);
      return { mid, rid };
    })();
  const drain = async () => {
    const queue = new JobQueue(store);
    for (let i = 0; i < 20; i++) {
      const job = queue.claim(newId());
      if (!job) break;
      expect(job.kind).toBe('memory.extract');
      const result = await memory.execute(job, new AbortController().signal);
      queue.finish(job, 'completed', result);
    }
  };
  const scope = { type: 'profile' as const, id: store.profileId };
  const command = (c: string, p: unknown, revision?: number) =>
    memory.dispatch(req(c, p, revision));
  return {
    dir,
    store,
    blobs,
    core,
    chat,
    history,
    memory,
    models,
    inputs,
    create,
    project,
    add,
    enqueue,
    drain,
    scope,
    command,
  };
}
test('P04-03 T11 two independent user events save automatically, model sees only necessary utterance and sources remain verifiable', async () => {
  const f = await fixture();
  try {
    const a = f.create(),
      b = f.create();
    f.enqueue(a, '我喜欢简短中文回答');
    await f.drain();
    expect(f.memory.list(f.scope).memories).toHaveLength(0);
    f.enqueue(b, '我喜欢简短中文回答');
    await f.drain();
    const m = f.memory.list(f.scope).memories[0]!;
    expect(m).toMatchObject({ explicit: false, predicate: '喜欢', value: '简短中文回答' });
    expect(m.sources).toHaveLength(2);
    expect(f.inputs).toHaveLength(2);
    for (const i of f.inputs) {
      expect(i.foreground).toBe(false);
      expect(i.singleAttempt).toBe(true);
      expect(i.request.messages).toHaveLength(1);
      expect(i.request.tools).toHaveLength(0);
    }
    expect(
      f.command('memory.source', { memoryId: m.id, messageId: m.sources[0]!.messageId }).ok,
    ).toBe(true);
    expect(
      f.store.db.prepare("SELECT count(*) n FROM approvals WHERE decision='pending'").get(),
    ).toEqual({ n: 0 });
    expect(
      f.store.db.prepare("SELECT event_type FROM events WHERE event_type='memory.changed'").all(),
    ).toHaveLength(1);
  } finally {
    await f.chat.stop();
    f.store.close();
  }
});
test('P04-03 T11 immediate explicit write, correction CAS, version history, forget and undo conflict', async () => {
  const f = await fixture();
  try {
    const sid = f.create(),
      mid = f.add(sid, '记住：我喜欢简短中文回答');
    f.store.db.transaction(() => f.memory.explicit(mid))();
    const m = f.memory.list(f.scope).memories[0]!;
    expect(m.explicit).toBe(true);
    const written = f.command('memory.notices', { sessionId: sid, messageId: mid });
    expect(written.ok).toBe(true);
    expect(JSON.stringify(written)).toContain('written');
    const oldEvent = m.changeEventId!;
    const request = req('memory.update', { memoryId: m.id, value: '详细英文回答' }, m.revision);
    const changed = f.memory.dispatch(request);
    expect(changed.ok).toBe(true);
    expect(f.memory.dispatch(request)).toEqual(changed);
    expect(f.command('memory.undo', { changeEventId: oldEvent })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(f.command('memory.update', { memoryId: m.id, value: '错误' }, m.revision)).toMatchObject(
      { ok: false, error: { code: 'CONFLICT' } },
    );
    const current = f.memory.list(f.scope).memories[0]!;
    expect(f.command('memory.undo', { changeEventId: current.changeEventId }).ok).toBe(true);
    expect(f.memory.list(f.scope).memories[0]!.value).toBe('简短中文回答');
    const forget = f.add(sid, '忘记：简短中文回答');
    f.store.db.transaction(() => f.memory.explicit(forget))();
    expect(f.memory.list(f.scope).memories).toHaveLength(0);
    expect(f.store.db.prepare('SELECT * FROM memory_search_documents').all()).toHaveLength(0);
    expect(f.store.db.prepare('SELECT * FROM memory_versions').all().length).toBeGreaterThan(1);
  } finally {
    f.store.close();
  }
});
test('P04-03 T11 unsafe single temporary/quoted/third-party/health/credentials and copied sources never create jobs or memories', async () => {
  const f = await fixture();
  try {
    const sid = f.create();
    for (const s of [
      '这次简短回答',
      '我喜欢简短回答，但是今天临时这样做',
      '我喜欢“客户的喜好”',
      '我喜欢朋友的健康诊断',
      '我喜欢API Key sk-synthetic000',
    ]) {
      f.enqueue(sid, s);
      f.enqueue(sid, s);
    }
    await f.drain();
    expect(f.inputs).toHaveLength(0);
    expect(f.memory.list(f.scope).memories).toHaveLength(0);
    const m = f.add(sid, '我喜欢咖啡');
    f.store.db.prepare('UPDATE messages SET source_message_id=? WHERE id=?').run(newId(), m);
    const rid = f.store.db.transaction(() => f.chat.createRun(f.chat.session(sid), m, null))();
    f.store.db.prepare("UPDATE runs SET status='completed' WHERE id=?").run(rid);
    f.memory.enqueue(sid, rid);
    expect(
      f.store.db.prepare("SELECT id FROM jobs WHERE kind='memory.extract'").all(),
    ).toHaveLength(0);
    expect(
      f.command('memory.write', { scope: f.scope, predicate: '凭据', value: 'API Key synthetic' }),
    ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
  } finally {
    f.store.close();
  }
});
test('P04-03 T11 delayed concurrent extraction cannot overwrite user correction or resurrect deletion/clear including empty scope', async () => {
  const f = await fixture();
  try {
    const a = f.create(),
      b = f.create();
    f.enqueue(a, '我喜欢中文回答');
    await f.drain();
    f.enqueue(b, '我喜欢中文回答');
    let release!: (c: MemoryCandidate[]) => void;
    f.memory.extractor = () =>
      new Promise((r) => {
        release = r;
      });
    const queue = new JobQueue(f.store),
      job = queue.claim(newId())!;
    const pending = f.memory.execute(job, new AbortController().signal);
    await Promise.resolve();
    expect(
      f.command('memory.write', { scope: f.scope, predicate: '喜欢', value: '用户纠正优先' }).ok,
    ).toBe(true);
    release(conservativeCandidate('我喜欢中文回答'));
    await pending;
    expect(f.memory.list(f.scope).memories[0]!.value).toBe('用户纠正优先');
    queue.finish(job, 'completed');
    f.enqueue(a, '我喜欢咖啡');
    const job2 = queue.claim(newId())!,
      pending2 = f.memory.execute(job2, new AbortController().signal);
    await Promise.resolve();
    const m = f.memory.list(f.scope).memories[0]!;
    expect(f.command('memory.delete', { memoryId: m.id }, m.revision).ok).toBe(true);
    expect(f.command('memory.clear', {}).ok).toBe(true);
    release(conservativeCandidate('我喜欢咖啡'));
    await pending2;
    expect(f.memory.list(f.scope).memories).toHaveLength(0);
    expect(f.store.db.prepare('SELECT * FROM memory_search_documents').all()).toHaveLength(0);
    const generation = (
      f.store.db.prepare('SELECT generation FROM memory_state').get() as { generation: number }
    ).generation;
    f.command('memory.clear', {});
    expect(
      (f.store.db.prepare('SELECT generation FROM memory_state').get() as { generation: number })
        .generation,
    ).toBeGreaterThan(generation);
  } finally {
    f.store.close();
  }
});
test('P04-03 T10 project isolation covers model background, history, global switches, project-only and 1000-token budget', async () => {
  const f = await fixture();
  try {
    const p = f.project(),
      q = f.project(),
      a = f.create(p),
      b = f.create(q),
      personal = f.create();
    f.command('memory.write', { scope: f.scope, predicate: '个人', value: 'GLOBAL_UNIQUE' });
    f.command('memory.write', {
      scope: { type: 'project', id: p },
      predicate: '项目A',
      value: 'PROJECT_A_UNIQUE',
    });
    f.command('memory.write', {
      scope: { type: 'project', id: q },
      predicate: '项目B',
      value: 'PROJECT_B_UNIQUE',
    });
    f.add(personal, 'global-history UNIQUE查询');
    f.add(a, 'project-a-history UNIQUE查询');
    f.add(b, 'project-b-history UNIQUE查询');
    const bg = f.memory.background(a, 'UNIQUE查询');
    expect(JSON.stringify(bg)).toContain('PROJECT_A_UNIQUE');
    expect(JSON.stringify(bg)).not.toContain('GLOBAL_UNIQUE');
    expect(JSON.stringify(bg)).not.toContain('PROJECT_B_UNIQUE');
    expect(f.memory.history(a, 'UNIQUE查询').map((h) => h.text)).toEqual([
      'project-a-history UNIQUE查询',
    ]);
    f.store.db
      .prepare(
        'UPDATE projects SET allow_global_memory=1,allow_global_history=1,revision=revision+1 WHERE id=?',
      )
      .run(p);
    expect(JSON.stringify(f.memory.background(a, 'UNIQUE查询'))).toContain('GLOBAL_UNIQUE');
    expect(f.memory.history(a, 'UNIQUE查询').map((h) => h.text)).toContain(
      'global-history UNIQUE查询',
    );
    f.store.db
      .prepare(
        "UPDATE sessions SET settings_json=json_set(settings_json,'$.projectScope.projectOnly',json('true')) WHERE id=?",
      )
      .run(a);
    expect(JSON.stringify(f.memory.background(a, 'UNIQUE查询'))).not.toContain('GLOBAL_UNIQUE');
    expect(f.memory.history(a, 'UNIQUE查询')).toHaveLength(0);
    for (let n = 0; n < 12; n++)
      f.command('memory.write', {
        scope: f.scope,
        predicate: '预算' + n,
        value: '长记忆'.repeat(100),
      });
    const budget = f.memory.background(personal, '预算');
    expect(countTokens(budget.module!)).toBeLessThanOrEqual(1000);
    const foreign = { type: 'project', id: newId() };
    expect(f.command('memory.list', { scope: foreign })).toMatchObject({
      ok: false,
      error: { code: 'PERMISSION_DENIED' },
    });
  } finally {
    f.store.close();
  }
});
test('P04-03 T11 session source deletion revalidates shared memory and preserves explicitly selected facts', async () => {
  const f = await fixture();
  try {
    const a = f.create(),
      b = f.create();
    const removedSource = f.enqueue(a, '我喜欢简短回答').mid;
    f.enqueue(b, '我喜欢简短回答');
    await f.drain();
    expect(f.memory.list(f.scope).memories).toHaveLength(1);
    const explicit = f.add(a, '记住：名字是合成甲');
    f.store.db.transaction(() => f.memory.explicit(explicit))();
    expect(
      (
        await f.history.dispatch(
          req('sessions.trash', { sessionIds: [a], keepExplicitMemories: true }),
        )
      ).ok,
    ).toBe(true);
    const remaining = f.memory.list(f.scope).memories;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.predicate).toBe('名字是');
    expect(remaining[0]!.sources).toHaveLength(0);
    const candidates = f.store.db.prepare('SELECT source_ids_json FROM memory_candidates').all();
    expect(JSON.stringify(candidates)).not.toContain(removedSource);
    const mid = f.add(b, '记住：职业是合成工程师');
    f.store.db.transaction(() => f.memory.explicit(mid))();
    expect((await f.history.dispatch(req('sessions.trash', { sessionIds: [b] }))).ok).toBe(true);
    expect(f.memory.list(f.scope).memories).toHaveLength(1);
  } finally {
    f.store.close();
  }
});
test('P04-03 T10 temporary store excludes history and all memory reads/writes/extraction and survives ordinary restart', async () => {
  const f = await fixture();
  let temporary: ReturnType<typeof memoryStore> | undefined;
  try {
    f.command('memory.write', { scope: f.scope, predicate: '个人', value: 'PERSISTED_UNIQUE' });
    temporary = memoryStore(f.store);
    const chat = new ChatService(temporary, new MemoryBlobStore(temporary), f.models),
      core = new CoreService(temporary),
      reply = core.dispatch(req('sessions.create', { title: '临时', mode: 'chat' }));
    if (!reply.ok) throw new Error('create');
    const sid = (reply.data as { entityId: string }).entityId;
    expect(chat.memories.policy(sid)).toMatchObject({
      temporary: true,
      memoryEnabled: false,
      historyEnabled: false,
    });
    expect(JSON.stringify(chat.memories.background(sid, 'UNIQUE'))).not.toContain(
      'PERSISTED_UNIQUE',
    );
    expect(
      chat.memories.dispatch(
        req('memory.write', { scope: f.scope, predicate: '临时', value: '禁止' }),
      ),
    ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
    f.store.close();
    const reopened = await openStore(f.dir);
    try {
      await migrate(reopened.db, resolve(f.dir, 'db/backups'));
      expect(reopened.db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
      const service = new ChatService(reopened, new BlobStore(reopened), f.models).memories;
      expect(
        MemoryPageSchema.parse(
          service.dispatch(req('memory.list', { scope: f.scope })).ok ? service.list(f.scope) : {},
        ).memories[0]!.value,
      ).toBe('PERSISTED_UNIQUE');
    } finally {
      reopened.close();
    }
  } finally {
    temporary?.close();
    if (f.store.db.open) f.store.close();
  }
});
test('P04-03 real chat prompt and per-answer used references invalidate after delete or settings revoke', async () => {
  const f = await fixture();
  try {
    const sid = f.create();
    f.command('memory.write', { scope: f.scope, predicate: '回答语言', value: '简短中文' });
    const older = f.create();
    f.add(older, '中文是合成历史参考');
    const send = await f.chat.dispatch(
      req('messages.send', {
        sessionId: sid,
        clientMessageId: newId(),
        text: '请用中文回答',
        attachments: [],
        mode: 'chat',
      }),
    );
    expect(send.ok).toBe(true);
    f.chat.start();
    for (let i = 0; i < 200; i++) {
      const r = await f.chat.dispatch(req('messages.list', { sessionId: sid }));
      if (r.ok && (r.data as { run?: { status: string } }).run?.status === 'completed') break;
      await new Promise((r) => setTimeout(r, 10));
    }
    await f.chat.stop();
    expect(JSON.stringify(f.inputs)).toContain('简短中文');
    const used = MemoryUseSchema.parse(
      f.command('memory.used', { sessionId: sid }).ok
        ? f.memory.dispatch(req('memory.used', { sessionId: sid })).ok
          ? (
              f.memory.dispatch(req('memory.used', { sessionId: sid })) as {
                ok: true;
                data: unknown;
              }
            ).data
          : {}
        : {},
    );
    expect(used.memoryUses).toHaveLength(1);
    const m = f.memory.list(f.scope).memories[0]!;
    f.command('memory.delete', { memoryId: m.id }, m.revision);
    expect(JSON.stringify(f.command('memory.used', { sessionId: sid }))).not.toContain('简短中文');
    const source = f.store.db.prepare('SELECT id FROM messages WHERE session_id=?').get(older) as {
      id: string;
    };
    f.store.db.transaction(() => eraseMessageContent(f.store, source.id, f.store.now()))();
    expect(f.memory.history(sid, '中文')).not.toContainEqual(
      expect.objectContaining({ messageId: source.id }),
    );
  } finally {
    await f.chat.stop();
    f.store.close();
  }
});
