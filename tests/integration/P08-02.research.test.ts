import gold from '../evals/research/gold.json';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test, expect, vi } from 'vitest';
import { fixture, until } from './P06.fixture';
import { WebService } from '../../packages/core/src/web-service';
import { ChatService } from '../../packages/core/src/chat-service';
import { ResearchService } from '../../packages/core/src/research-service';
import { researchWorkDriver } from '../../packages/core/src/research-driver';
import type { ModelService } from '../../packages/core/src/model-service';
import type { RoutedEvent, RoutingInput } from '../../packages/providers/src';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import { WorkService, type WorkDriver } from '../../packages/core/src/work-service';
import {
  ResearchSpecSchema,
  ResearchProgressSchema,
  DEFAULT_MODEL_PREFERENCES,
  type ResearchWorkToolArgs,
  type ResearchSpec,
} from '../../packages/contracts/src';
import { WebTools, extractPage } from '../../packages/tools/src';
import { researchHash } from '../../packages/workflows/src';
import { newId, StorageError } from '../../packages/storage/src';
import { eraseFileDerivedContent } from '../../packages/storage/src/file-cleanup';

const a = 'https://evidence.example.com/a',
  b = 'https://evidence.example.net/b';
async function setup(extra: Partial<ResearchSpec> = {}, driver?: WorkDriver) {
  const f = await fixture(),
    requests: string[] = [];
  const pages = new Map<string, string>([
    [a, gold.sources.a],
    [b, gold.sources.b],
  ]);
  const reader = {
    read: async (
      raw: { url: string; maxChars?: number },
      _options: unknown,
      signal: AbortSignal,
    ) => {
      signal.throwIfAborted();
      requests.push(raw.url);
      let html = pages.get(raw.url);
      if (raw.url.startsWith('https://www.bing.com/search?'))
        html = '<main><a href="' + a + '">甲</a><a href="' + b + '">乙</a></main>';
      if (!html) throw Error('WEB_UNAVAILABLE');
      const page = extractPage(html, raw.url);
      return {
        ...page,
        url: raw.url,
        fetchedAt: f.store.now(),
        contentHash: researchHash(page.text),
        maxChars: raw.maxChars ?? 20000,
      };
    },
  } as WebTools;
  const web = new WebService(f.store, f.blobs, reader),
    chat = new ChatService(f.store, f.blobs, {} as never),
    research = new ResearchService(f.artifacts, web, chat),
    gateway = new WorkToolGateway(f.artifacts, undefined, chat, undefined, research);
  const work = new WorkService(
    f.store,
    driver ?? (async () => ({ text: 'fixture', calls: [], finished: true })),
    gateway,
    (ref, sessionId) => chat.material(ref, sessionId),
  );
  const spec = ResearchSpecSchema.parse({
    topic: '合成产品研究',
    questions: [{ key: 'q1', text: '方案甲的延迟是多少？' }],
    seedUrls: [a, b],
    ...extra,
  });
  const send = (command: string, payload: unknown, expectedRevision?: number) =>
    work.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command,
      payload,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    });
  const created = await send('runs.create', {
    sessionId: f.sessionId,
    goal: '对照真实原文，不裁定矛盾。',
    format: spec.outputFormat,
    research: spec,
    refs: spec.localVersions.map((v) => ({ kind: 'file', ...v })),
    planFirst: true,
  });
  if (!created.ok || !('work' in created.data)) throw Error('create:' + JSON.stringify(created));
  const runId = created.data.work.runId;
  const activate = (id = runId) => {
    f.store.db
      .prepare(
        "UPDATE runs SET status='running',lease_epoch=lease_epoch+1,lease_owner='fixture',lease_expires_at=? WHERE id=?",
      )
      .run(f.store.now() + 15000, id);
    return work.repo.row(id);
  };
  const execute = async (args: ResearchWorkToolArgs, id = runId) => {
    f.store.db.prepare('UPDATE runs SET calls=calls+1 WHERE id=?').run(id);
    const run = work.repo.row(id);
    return gateway.execute(run, 'deliver-1', args, () => work.repo.guard(run, 'fixture'));
  };
  return {
    ...f,
    web,
    chat,
    research,
    gateway,
    work,
    spec,
    send,
    runId,
    activate,
    execute,
    pages,
    requests,
    close: async () => {
      await work.stop();
      await f.close();
    },
  };
}
const read = (url: string): Extract<ResearchWorkToolArgs, { tool: 'research.read' }> => ({
  tool: 'research.read',
  questionKey: 'q1',
  source: { kind: 'url', url },
  refresh: false,
  offset: 0,
});
async function loadBoth(f: Awaited<ReturnType<typeof setup>>) {
  await f.execute(read(a));
  await f.execute(read(b));
  return f.research.state(f.work.repo.row(f.runId)).progress.sources;
}

function modelFixture(
  f: Awaited<ReturnType<typeof setup>>,
  events: RoutedEvent[],
  onRequest?: (input: RoutingInput) => void,
) {
  return {
    store: f.store,
    effective: () => ({ values: DEFAULT_MODEL_PREFERENCES }),
    catalog: async () => [],
    router: {
      stream: async function* (input: RoutingInput) {
        onRequest?.(input);
        yield* events;
      },
    },
  } as unknown as ModelService;
}
test('P08-02 selected evidence becomes a literal fact and excluded or changed snapshots cannot support it', async () => {
  const f = await setup();
  try {
    const run = f.activate();
    await f.execute(read(a));
    const context = await f.research.context(run),
      e = context.materials[0]!.evidence.find((e) => e.quote.includes('10毫秒'))!;
    expect(e).toBeDefined();
    const events: RoutedEvent[] = [
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: {
          type: 'tool_end',
          callId: 'select',
          name: 'research.record',
          arguments: { questionKey: 'q1', kind: 'fact', evidenceIds: [e.id] },
        },
      },
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: { type: 'finish', reason: 'tool_calls', nativeStateRef: 'fixture' },
      },
    ];
    const candidate = await researchWorkDriver(
      modelFixture(f, events, (input) => {
        const sent = JSON.parse(input.request.messages[0]!.text);
        expect(sent.materials[0].previewOnly).toBe(true);
        expect(sent.materials[0].text.length).toBeLessThanOrEqual(240);
        expect(Object.keys(sent.materials[0].evidence[0]).sort()).toEqual(['id', 'quote']);
        expect(input.request.messages[0]!.text.length).toBeLessThan(JSON.stringify(context).length);
      }),
      f.research,
    )(run, {} as never, new AbortController().signal);
    expect(candidate.calls).toMatchObject([
      { findings: [{ text: e.quote, supports: [{ sourceId: e.sourceId, quote: e.quote }] }] },
    ]);
    await f.execute(candidate.calls[0] as ResearchWorkToolArgs);
    expect(f.research.state(run).progress.findings[0]!.supports[0]).toMatchObject({
      start: e.start,
      end: e.end,
      quoteHash: e.quoteHash,
    });
    const state = f.work.repo.state(f.work.repo.row(run.id));
    state.definition.research!.excludedSources.push(e.sourceId);
    f.work.repo.save(run, state);
    expect((await f.research.context(run)).materials).toEqual([]);
    await f.execute(candidate.calls[0] as ResearchWorkToolArgs);
    expect(f.research.state(run).progress.lastIssue).toBe('SOURCE_NOT_USABLE');
    expect(f.research.closeout(run)).toBeUndefined();
  } finally {
    await f.close();
  }
});
test('P08-02 Core closes verified two-source research at the model limit without another model call', async () => {
  let calls = 0;
  const f = await setup({}, async () => {
    calls++;
    throw Error('MODEL_MUST_NOT_BE_CALLED');
  });
  try {
    const run = f.activate(),
      sources = await loadBoth(f);
    await f.execute({
      tool: 'research.record',
      findings: sources.map((s, i) => ({
        questionKey: 'q1',
        kind: 'fact',
        text: i ? '方案甲的延迟为20毫秒。' : '方案甲的延迟为10毫秒。',
        supports: [
          { sourceId: s.id, quote: i ? '方案甲的延迟为20毫秒。' : '方案甲的延迟为10毫秒。' },
        ],
        opposes: [],
      })),
    });
    const state = f.work.repo.state(f.work.repo.row(run.id));
    state.planAccepted = true;
    f.work.repo.save(run, state);
    f.store.db
      .prepare(
        "UPDATE runs SET calls=?,status='queued',lease_owner=NULL,lease_expires_at=NULL WHERE id=?",
      )
      .run(state.definition.budgetOverrides.maxCalls, run.id);
    await f.work.start();
    await until(() => f.work.repo.row(run.id).status === 'partial');
    expect(calls).toBe(0);
    expect(f.work.repo.rootUsage(run).calls).toBe(state.definition.budgetOverrides.maxCalls);
    expect(f.research.state(run).progress.report).toMatchObject({
      ready: true,
      quality: 'partial',
    });
    expect(await f.research.verify(run)).toBe(true);
    expect(
      f.store.db
        .prepare(
          "SELECT count(*) n FROM tool_calls WHERE run_id=? AND tool_name='research.report' AND status='succeeded'",
        )
        .get(run.id),
    ).toEqual({ n: 1 });
  } finally {
    await f.close();
  }
});
test('P08-02 bounded parse failure preserves a partial report and failure reason without replaying model work', async () => {
  let calls = 0;
  const f = await setup({}, async () => {
    calls++;
    throw new StorageError('PARSE_FAILED');
  });
  try {
    const run = f.work.repo.row(f.runId),
      state = f.work.repo.state(run);
    state.planAccepted = true;
    f.work.repo.save(run, state);
    await f.work.start();
    await until(() => f.work.repo.row(run.id).status === 'partial');
    expect(calls).toBe(1);
    expect(f.work.repo.row(run.id).status_reason).toBe('PARSE_FAILED');
    expect(f.research.state(run).progress.report).toMatchObject({
      ready: true,
      quality: 'partial',
    });
    expect(await f.research.verify(run)).toBe(true);
    expect(f.research.state(run).progress.findings).toEqual([]);
  } finally {
    await f.close();
  }
});
test('P08-02 one selection of different source excerpts closes before any later model hallucination', async () => {
  let actualDriver: WorkDriver = async () => {
      throw Error('NOT_READY');
    },
    calls = 0;
  const f = await setup({}, (...args) => actualDriver(...args));
  try {
    const run = f.activate();
    await loadBoth(f);
    const context = await f.research.context(run);
    const ids = context.materials.map((m) => m.evidence.find((e) => /毫秒/.test(e.quote))!.id);
    const events: RoutedEvent[] = [
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: {
          type: 'tool_end',
          callId: 'select-two',
          name: 'research.record',
          arguments: { questionKey: 'q1', kind: 'fact', evidenceIds: ids },
        },
      },
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: { type: 'finish', reason: 'tool_calls', nativeStateRef: 'fixture' },
      },
    ];
    actualDriver = researchWorkDriver(
      modelFixture(f, events, () => {
        calls++;
        if (calls > 1) throw Error('LATE_UNDECLARED_TOOL_MUST_NOT_BE_REQUESTED');
      }),
      f.research,
    );
    const state = f.work.repo.state(f.work.repo.row(run.id));
    state.planAccepted = true;
    f.work.repo.save(run, state);
    f.store.db
      .prepare("UPDATE runs SET status='queued',lease_owner=NULL,lease_expires_at=NULL WHERE id=?")
      .run(run.id);
    await f.work.start();
    await until(() => f.work.repo.row(run.id).status === 'partial');
    expect(calls).toBe(1);
    expect(f.work.repo.rootUsage(run).calls).toBe(3);
    expect(f.research.state(run).progress.findings).toHaveLength(2);
    expect(f.research.state(run).progress.parameterErrors).toBe(0);
    expect(f.research.state(run).progress.report).toMatchObject({
      ready: true,
      quality: 'partial',
    });
    expect(await f.research.verify(run)).toBe(true);
  } finally {
    await f.close();
  }
});
test('P08-02 a temporary evidence gap can continue discovery before an explicit partial report', async () => {
  let calls = 0;
  const f = await setup({}, async () => {
    calls++;
    return {
      text: 'fixture',
      finished: true,
      calls:
        calls === 1
          ? [
              {
                tool: 'research.record',
                findings: [
                  { questionKey: 'q1', kind: 'gap', text: '尚无证据', supports: [], opposes: [] },
                ],
              },
            ]
          : calls === 2
            ? [{ tool: 'research.search', questionKey: 'q1' }]
            : [{ tool: 'research.report' }],
    };
  });
  try {
    const run = f.work.repo.row(f.runId),
      state = f.work.repo.state(run);
    state.planAccepted = true;
    f.work.repo.save(run, state);
    await f.work.start();
    await until(() => f.work.repo.row(run.id).status === 'partial');
    expect(calls).toBe(3);
    expect(f.research.state(run).progress.searches).toBe(1);
    expect(f.research.state(run).progress.report).toMatchObject({
      ready: true,
      quality: 'partial',
    });
  } finally {
    await f.close();
  }
});
test('P08-02 reserves final model calls for an honest report within the existing root budget', async () => {
  const f = await setup();
  try {
    const run = f.activate();
    f.store.db.prepare('UPDATE runs SET calls=40 WHERE id=?').run(run.id);
    const events: RoutedEvent[] = [
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: { type: 'tool_end', callId: 'report', name: 'research.report', arguments: {} },
      },
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: { type: 'finish', reason: 'tool_calls', nativeStateRef: 'fixture' },
      },
    ];
    const models = modelFixture(f, events, (input) => {
      expect(input.request.tools.map((tool) => tool.name)).toEqual(['research.report']);
      expect(
        input.request.systemModules?.find((module) => module.id === 'tapkit.research.phase')?.text,
      ).toContain('预算即将用尽');
    });
    const result = await researchWorkDriver(models, f.research)(
      run,
      {} as never,
      new AbortController().signal,
    );
    expect(result.calls).toEqual([{ tool: 'research.report' }]);
    expect(f.research.repo.rootUsage(run).calls).toBe(40);
    expect(f.requests).toEqual([]);
  } finally {
    await f.close();
  }
});
test('P08-02 repairs adapter-rejected arguments twice without dispatching partial calls', async () => {
  const f = await setup();
  try {
    const run = f.activate();
    const events: RoutedEvent[] = [
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: {
          type: 'error',
          partial: false,
          error: {
            code: 'STREAM_INTERRUPTED',
            retryable: false,
            diagnosticCode: 'invalid_tool_arguments',
          },
        },
      },
      { type: 'route.error', error: { code: 'STREAM_INTERRUPTED', retryable: false } },
    ];
    const driver = researchWorkDriver(modelFixture(f, events), f.research);
    for (let i = 1; i <= 2; i++) {
      expect(await driver(run, {} as never, new AbortController().signal)).toMatchObject({
        calls: [],
        finished: true,
      });
      expect(f.research.state(run).progress.parameterErrors).toBe(i);
    }
    await expect(driver(run, {} as never, new AbortController().signal)).rejects.toMatchObject({
      code: 'PARSE_FAILED',
    });
    expect(f.research.state(run).progress.parameterErrors).toBe(3);
    expect(f.requests).toEqual([]);
  } finally {
    await f.close();
  }
});
test('P08-02 opt-in selection diagnostics commit through real SQLite for wire and Core failures', async () => {
  for (const stage of ['wire', 'core'] as const) {
    const f = await setup();
    try {
      const run = f.activate();
      vi.stubEnv('TAPKIT_API_TRANSPORT_TRACE', 'P08-02');
      vi.stubEnv('TAPKIT_TOOL_TRACE_PROFILE', f.store.profileId);
      vi.stubEnv('TAPKIT_TOOL_TRACE_CASE', newId());
      const raw = { questionKey: 'q1', evidenceIds: ['e_0000000000000000'] };
      const events: RoutedEvent[] =
        stage === 'wire'
          ? [
              {
                type: 'model.event',
                attemptId: 'fixture',
                event: {
                  type: 'tool_delta',
                  callId: 'bad',
                  name: 'research_record',
                  argumentsDelta: JSON.stringify({ ...raw, 'private-field': 'private-value' }),
                },
              },
              {
                type: 'model.event',
                attemptId: 'fixture',
                event: {
                  type: 'error',
                  partial: false,
                  error: {
                    code: 'STREAM_INTERRUPTED',
                    retryable: false,
                    diagnosticCode: 'invalid_tool_arguments',
                  },
                },
              },
              { type: 'route.error', error: { code: 'STREAM_INTERRUPTED', retryable: false } },
            ]
          : [
              {
                type: 'model.event',
                attemptId: 'fixture',
                event: { type: 'tool_end', callId: 'bad', name: 'research.record', arguments: raw },
              },
              {
                type: 'model.event',
                attemptId: 'fixture',
                event: { type: 'finish', reason: 'tool_calls', nativeStateRef: 'fixture' },
              },
            ];
      const candidate = await researchWorkDriver(modelFixture(f, events), f.research)(
        run,
        {} as never,
        new AbortController().signal,
      );
      expect(candidate.calls).toEqual([]);
      const rows = f.store.db
        .prepare(
          "SELECT json_extract(payload_json,'$.payload.summary') summary FROM events WHERE run_id=? AND event_type='tool.validation'",
        )
        .all(run.id) as { summary: string }[];
      const shape = rows.find((row) => row.summary.startsWith('selection_shape'))?.summary;
      expect(shape).toContain('ids=1;matched=0');
      expect(shape).not.toMatch(/private|e_0000000000000000/);
      expect(f.research.state(run).progress.parameterErrors).toBe(1);
    } finally {
      vi.unstubAllEnvs();
      await f.close();
    }
  }
});
test('P08-02 the visible evidence page fits one bounded selection and preserves snapshot pagination', async () => {
  const f = await setup();
  try {
    f.pages.set(
      a,
      '<main>' +
        Array.from(
          { length: 30 },
          (_, i) => '<p>第' + i + '条公开原文是完整的合成测试句子。</p>',
        ).join('') +
        '</main>',
    );
    const run = f.activate();
    await f.execute(read(a));
    const context = await f.research.context(run),
      first = context.materials[0]!,
      ids = first.evidence.slice(0, 12).map((e) => e.id),
      next = first.evidence[12]!.start;
    const events: RoutedEvent[] = [
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: {
          type: 'tool_end',
          callId: 'select',
          name: 'research.record',
          arguments: { questionKey: 'q1', evidenceIds: ids },
        },
      },
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: { type: 'finish', reason: 'tool_calls', nativeStateRef: 'fixture' },
      },
    ];
    const candidate = await researchWorkDriver(
      modelFixture(f, events, (input) => {
        const sent = JSON.parse(input.request.messages[0]!.text);
        expect(sent.materials.flatMap((m: { evidence: unknown[] }) => m.evidence)).toHaveLength(12);
        expect(sent.materials[0].nextOffset).toBe(next);
        expect(sent.materials[0].truncated).toBe(true);
      }),
      f.research,
    )(run, {} as never, new AbortController().signal);
    await f.execute(candidate.calls[0] as ResearchWorkToolArgs);
    expect(f.research.state(run).progress.findings).toHaveLength(12);
    await f.execute({
      tool: 'research.read',
      questionKey: 'q1',
      source: { kind: 'source', sourceId: first.source.id },
      offset: next,
      refresh: false,
    });
    const later = await f.research.context(run);
    expect(later.materials[0]!.evidence[0]!.start).toBe(next);
    expect(ids).not.toContain(later.materials[0]!.evidence[0]!.id);
    expect(f.research.rootCounts(run).reads).toBe(1);
  } finally {
    await f.close();
  }
});

test('P08-02 consumes discovered candidates and evidence from each source before searching again', async () => {
  const f = await setup();
  try {
    const run = f.activate();
    const inspect = async (first: string) => {
      const events: RoutedEvent[] = [
        {
          type: 'model.event',
          attemptId: 'fixture',
          event: {
            type: 'tool_end',
            callId: 'premature-search',
            name: 'research.search',
            arguments: { questionKey: 'q1' },
          },
        },
        {
          type: 'model.event',
          attemptId: 'fixture',
          event: { type: 'finish', reason: 'tool_calls', nativeStateRef: 'fixture' },
        },
      ];
      const models = modelFixture(f, events, (input) => {
        expect(input.request.tools[0]!.name).toBe(first);
        expect(input.request.tools.some((tool) => tool.name === 'research.search')).toBe(false);
        expect(input.request.tools.some((tool) => tool.name === 'research.report')).toBe(true);
      });
      expect(
        (
          await researchWorkDriver(models, f.research)(
            run,
            {} as never,
            new AbortController().signal,
          )
        ).calls,
      ).toEqual([]);
    };
    await f.execute({ tool: 'research.search', questionKey: 'q1' });
    await inspect('research.read');
    await f.execute(read(a));
    await inspect('research.record');
    const first = f.research.state(run).progress.sources[0]!;
    await f.execute({
      tool: 'research.record',
      findings: [
        {
          questionKey: 'q1',
          kind: 'fact',
          text: '方案甲的延迟为10毫秒。',
          supports: [{ sourceId: first.id, quote: '方案甲的延迟为10毫秒。' }],
          opposes: [],
        },
      ],
    });
    await f.execute(read(b));
    let inspected = false;
    const models = modelFixture(f, [], (input) => {
      inspected = true;
      expect(input.request.tools[0]!.name).toBe('research.record');
    });
    await expect(
      researchWorkDriver(models, f.research)(run, {} as never, new AbortController().signal),
    ).rejects.toThrow('STREAM_INTERRUPTED');
    expect(inspected).toBe(true);
    expect(f.requests).toHaveLength(3);
  } finally {
    await f.close();
  }
});

test('P08-02 an explicit evidence gap permits a new discovery round without a source loop', async () => {
  const f = await setup();
  try {
    const run = f.activate();
    await f.execute({ tool: 'research.search', questionKey: 'q1' });
    await f.execute(read(a));
    await f.execute({
      tool: 'research.record',
      findings: [
        {
          questionKey: 'q1',
          kind: 'gap',
          text: '还缺少足够资料回答问题。',
          supports: [],
          opposes: [],
        },
      ],
    });
    const events: RoutedEvent[] = [
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: {
          type: 'tool_end',
          callId: 'new-search',
          name: 'research.search',
          arguments: { questionKey: 'q1' },
        },
      },
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: { type: 'finish', reason: 'tool_calls', nativeStateRef: 'fixture' },
      },
    ];
    const models = modelFixture(f, events, (input) => {
      expect(input.request.tools.some((tool) => tool.name === 'research.search')).toBe(true);
    });
    expect(
      (await researchWorkDriver(models, f.research)(run, {} as never, new AbortController().signal))
        .calls,
    ).toEqual([{ tool: 'research.search', questionKey: 'q1' }]);
    expect(f.research.rootCounts(run).searches).toBe(1);
  } finally {
    await f.close();
  }
});

test('P08-02 prioritizes an explicit report once all questions have two source groups, leaving repair budget', async () => {
  const f = await setup();
  try {
    const run = f.activate();
    await f.execute({ tool: 'research.search', questionKey: 'q1' });
    const sources = await loadBoth(f);
    await f.execute({
      tool: 'research.record',
      findings: sources.map((source, i) => ({
        questionKey: 'q1',
        kind: 'fact' as const,
        text: i ? '方案甲的延迟为20毫秒。' : '方案甲的延迟为10毫秒。',
        supports: [
          { sourceId: source.id, quote: i ? '方案甲的延迟为20毫秒。' : '方案甲的延迟为10毫秒。' },
        ],
        opposes: [],
      })),
    });
    const saved = f.work.repo.row(run.id),
      state = f.work.repo.state(saved);
    state.research!.queries[0]!.candidates.push({
      url: 'https://evidence.example.com/unneeded',
      title: '未读同域名候选',
    });
    f.work.repo.save(saved, state);
    const events: RoutedEvent[] = [
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: { type: 'tool_end', callId: 'report', name: 'research.report', arguments: {} },
      },
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: { type: 'finish', reason: 'tool_calls', nativeStateRef: 'fixture' },
      },
    ];
    const models = modelFixture(f, events, (input) => {
      expect(input.request.tools[0]!.name).toBe('research.report');
      expect(input.request.tools.some((tool) => tool.name === 'research.search')).toBe(true);
    });
    expect(
      (await researchWorkDriver(models, f.research)(run, {} as never, new AbortController().signal))
        .calls,
    ).toEqual([{ tool: 'research.report' }]);
    expect(f.research.repo.rootUsage(run).calls).toBe(4);
    expect(f.research.state(run).progress.report).toBeUndefined();
  } finally {
    await f.close();
  }
});
test('P08-02 rejected paraphrases receive fixed repair guidance and flat records still execute through strict Core checks', async () => {
  const f = await setup();
  try {
    const run = f.activate();
    await f.execute(read(a));
    const source = f.research.state(run).progress.sources[0]!;
    await f.execute({
      tool: 'research.record',
      findings: [
        {
          questionKey: 'q1',
          kind: 'fact',
          text: '概括了产品延迟。',
          supports: [{ sourceId: source.id, quote: '方案甲的延迟为10毫秒。' }],
          opposes: [],
        },
      ],
    });
    expect(f.research.state(run).progress.lastIssue).toBe('FACT_MUST_BE_A_VERBATIM_EXCERPT');
    const arguments_ = {
      questionKey: 'q1',
      kind: 'fact',
      text: '方案甲的延迟为10毫秒。',
      supports: [{ sourceId: source.id, quote: '方案甲的延迟为10毫秒。' }],
      opposes: [],
    };
    const events: RoutedEvent[] = [
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: {
          type: 'tool_end',
          callId: 'record',
          name: 'research.record',
          arguments: arguments_,
        },
      },
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: { type: 'finish', reason: 'tool_calls', nativeStateRef: 'fixture' },
      },
    ];
    const models = modelFixture(f, events, (input) => {
      expect(
        input.request.systemModules?.find((m) => m.id === 'tapkit.research.phase')?.text,
      ).toContain('materials.evidence选择相关编号');
    });
    const candidate = await researchWorkDriver(models, f.research)(
      run,
      {} as never,
      new AbortController().signal,
    );
    expect(candidate.calls).toEqual([{ tool: 'research.record', findings: [arguments_] }]);
    await f.execute(candidate.calls[0] as ResearchWorkToolArgs);
    expect(f.research.state(run).progress.findings).toHaveLength(1);
    expect(f.research.state(run).progress.parameterErrors).toBe(1);
  } finally {
    await f.close();
  }
});
test('P08-02 transport interruptions cannot enter the parameter repair path', async () => {
  const f = await setup();
  try {
    const run = f.activate();
    for (const diagnosticCode of ['unterminated_sse', 'read_failed', undefined] as const) {
      const events: RoutedEvent[] = [
        {
          type: 'model.event',
          attemptId: 'fixture',
          event: {
            type: 'error',
            partial: false,
            error: {
              code: 'STREAM_INTERRUPTED',
              retryable: false,
              ...(diagnosticCode ? { diagnosticCode } : {}),
            },
          },
        },
        { type: 'route.error', error: { code: 'STREAM_INTERRUPTED', retryable: false } },
      ];
      const driver = researchWorkDriver(modelFixture(f, events), f.research);
      await expect(driver(run, {} as never, new AbortController().signal)).rejects.toMatchObject({
        code: 'STREAM_INTERRUPTED',
      });
      expect(f.research.state(run).progress.parameterErrors).toBe(0);
    }
    expect(f.requests).toEqual([]);
  } finally {
    await f.close();
  }
});

test('P08-02 a unique approved candidate query repairs an omitted index while ambiguous queries still fail closed', async () => {
  const f = await setup();
  try {
    const run = f.activate();
    await f.execute({ tool: 'research.search', questionKey: 'q1' });
    const events: RoutedEvent[] = [
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: {
          type: 'tool_end',
          callId: 'read',
          name: 'research.read',
          arguments: { questionKey: 'q1', sourceKind: 'candidate', candidateIndex: 1 },
        },
      },
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: { type: 'finish', reason: 'tool_calls', nativeStateRef: 'fixture' },
      },
    ];
    const driver = researchWorkDriver(modelFixture(f, events), f.research);
    const candidate = await driver(run, {} as never, new AbortController().signal);
    expect(candidate.calls[0]).toEqual({
      tool: 'research.read',
      questionKey: 'q1',
      source: { kind: 'candidate', queryIndex: 0, candidateIndex: 1 },
      offset: 0,
      refresh: false,
    });
    await f.execute(candidate.calls[0] as ResearchWorkToolArgs);
    expect(f.research.state(run).progress.sources[0]!.url).toBe(b);
    expect(f.research.state(run).progress.parameterErrors).toBe(0);
    await f.execute({ tool: 'research.search', questionKey: 'q1' });
    expect((await driver(run, {} as never, new AbortController().signal)).calls).toEqual([]);
    expect(f.research.state(run).progress.lastIssue).toContain('source.queryIndex:invalid_type');
    expect(f.research.rootCounts(run).reads).toBe(1);
  } finally {
    await f.close();
  }
});

test('P08-02 Core refinement failures report only safe field paths so the next model call can repair IDs', async () => {
  const f = await setup();
  try {
    const run = f.activate();
    const events: RoutedEvent[] = [
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: {
          type: 'tool_end',
          callId: 'invalid-id',
          name: 'research.record',
          arguments: {
            questionKey: 'q1',
            kind: 'fact',
            text: '方案甲的延迟为10毫秒。',
            supports: [{ sourceId: 'private-invalid-id', quote: '方案甲的延迟为10毫秒。' }],
          },
        },
      },
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: { type: 'finish', reason: 'tool_calls', nativeStateRef: 'fixture' },
      },
    ];
    const candidate = await researchWorkDriver(modelFixture(f, events), f.research)(
      run,
      {} as never,
      new AbortController().signal,
    );
    expect(candidate.calls).toEqual([]);
    const issue = f.research.state(run).progress.lastIssue!;
    expect(issue).toContain('findings.[].supports.[].sourceId:invalid_format');
    expect(issue).not.toContain('private-invalid-id');
    expect(f.requests).toEqual([]);
  } finally {
    await f.close();
  }
});
test('P08-02 one invalid tool discards every call in that model response', async () => {
  const f = await setup();
  try {
    const run = f.activate();
    const events: RoutedEvent[] = [
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: {
          type: 'tool_end',
          callId: 'valid',
          name: 'research.search',
          arguments: { questionKey: 'q1' },
        },
      },
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: { type: 'tool_end', callId: 'invalid', name: 'research.search', arguments: [] },
      },
      {
        type: 'model.event',
        attemptId: 'fixture',
        event: { type: 'finish', reason: 'tool_calls', nativeStateRef: 'fixture' },
      },
    ];
    const driver = researchWorkDriver(modelFixture(f, events), f.research);
    expect(await driver(run, {} as never, new AbortController().signal)).toMatchObject({
      calls: [],
      finished: true,
    });
    expect(f.research.state(run).progress.parameterErrors).toBe(1);
    expect(f.requests).toEqual([]);
  } finally {
    await f.close();
  }
});

async function auditFixture(
  f: Awaited<ReturnType<typeof setup>>,
  name: string,
  run = f.work.repo.row(f.runId),
) {
  const progress = f.research.state(run).progress,
    quotes = progress.findings.flatMap((finding) => [...finding.supports, ...finding.opposes]);
  const checks = await Promise.all(
    quotes.map(async (quote) => {
      const source = progress.sources.find((s) => s.id === quote.sourceId)!;
      const text = (await f.research.material(run, source)).text;
      return {
        sourceId: quote.sourceId,
        start: quote.start,
        end: quote.end,
        exact: text.slice(quote.start, quote.end) === quote.quote,
        hashMatches: createHash('sha256').update(quote.quote).digest('hex') === quote.quoteHash,
      };
    }),
  );
  expect(checks.every((q) => q.exact && q.hashMatches)).toBe(true);
  const ref = progress.report!.primary;
  if (ref.kind !== 'file') throw Error('report');
  const bytes = (await f.files.original(ref.fileId, { versionId: ref.versionId })).bytes;
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(progress.report!.contentHash);
  await mkdir('docs/evidence/P08-02/evals', { recursive: true });
  await writeFile('docs/evidence/P08-02/evals/' + name + '.md', bytes);
  await writeFile(
    'docs/evidence/P08-02/evals/' + name + '.json',
    JSON.stringify(
      {
        case: name,
        fixtureHash: gold.fixtureHash,
        result: 'passed',
        quality: progress.report!.quality,
        root: f.research.rootCounts(run),
        sources: progress.sources,
        findings: progress.findings,
        citationChecks: checks,
        reportHash: progress.report!.contentHash,
        scope: 'synthetic; literal locator/hash checks independent of model scoring',
      },
      null,
      2,
    ),
  );
}

test('P08-02 multi-source conflict keeps both immutable originals, verifies citations and exports report plus sources', async () => {
  const f = await setup();
  try {
    const run = f.activate(),
      sources = await loadBoth(f);
    await f.execute({
      tool: 'research.record',
      findings: [
        {
          questionKey: 'q1',
          kind: 'conflict',
          text: '两份资料存在未裁定的差异。',
          supports: [{ sourceId: sources[0]!.id, quote: '方案甲的延迟为10毫秒。' }],
          opposes: [{ sourceId: sources[1]!.id, quote: '方案甲的延迟为20毫秒。' }],
        },
      ],
    });
    const ref = await f.execute({ tool: 'research.report' });
    expect(ref?.kind).toBe('file');
    const state = f.research.state(run).progress;
    expect(state.report?.quality).toBe('complete');
    expect(state.report?.refs).toHaveLength(2);
    expect(await f.research.verify(run)).toBe(true);
    expect(await f.gateway.verify(run, state.report!.refs)).toBe(true);
    const draft = f.work.repo.state(f.work.repo.row(run.id));
    draft.research!.report!.ready = false;
    f.work.repo.save(run, draft);
    expect(await f.gateway.verify(run, state.report!.refs)).toBe(false);
    draft.research!.report!.ready = true;
    f.work.repo.save(run, draft);
    await auditFixture(f, 'conflict');
    const output = await f.research.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: 'research.source',
      payload: { runId: run.id, sourceId: sources[1]!.id, findingId: state.findings[0]!.id },
    });
    expect(output.ok).toBe(true);
    if (output.ok && 'researchSource' in output.data) expect(output.data.text).toContain('20毫秒');
    expect(
      f.store.db
        .prepare("SELECT count(*) n FROM tool_calls WHERE run_id=? AND status='succeeded'")
        .get(run.id),
    ).toEqual({ n: 4 });
    f.pages.set(a, '<main>后来改成99毫秒。</main>');
    expect((await f.research.material(run, sources[0]!)).text).toContain('10毫秒');
    if (ref?.kind === 'file')
      expect(
        (await f.files.original(ref.fileId, { versionId: ref.versionId })).bytes.toString(),
      ).toContain('未裁决');
  } finally {
    await f.close();
  }
});
test('P08-02 inaccessible and no-answer fixtures produce gaps without fake citations', async () => {
  for (const mode of ['inaccessible', 'no-answer']) {
    const f = await setup();
    try {
      const run = f.activate();
      if (mode === 'inaccessible') f.pages.delete(a);
      else f.pages.set(a, gold.sources.noAnswer);
      await f.execute(read(a));
      const s = f.research.state(run).progress.sources[0]!;
      expect(s.status).toBe(mode === 'inaccessible' ? 'unavailable' : 'ready');
      await f.execute({
        tool: 'research.record',
        findings: [
          {
            questionKey: 'q1',
            kind: 'gap',
            text: '尚无足够资料回答目标问题。',
            supports: [],
            opposes: [],
          },
        ],
      });
      await f.execute({ tool: 'research.report' });
      expect(f.research.state(run).progress.report?.quality).toBe('partial');
      expect(f.research.state(run).progress.findings[0]?.supports).toEqual([]);
      await auditFixture(f, mode === 'inaccessible' ? 'unavailable' : 'no-answer');
    } finally {
      await f.close();
    }
  }
});
test('P08-02 time fixture uses declared publication metadata and cannot infer it from body dates', async () => {
  const f = await setup({ dates: { from: '2025-01-01', to: '2025-12-31' } });
  try {
    const run = f.activate();
    f.pages.set(a, gold.sources.time);
    const sources = await loadBoth(f);
    expect(sources[0]?.publishedAt).toBe(Date.parse('2024-06-01'));
    expect(sources[1]?.publishedAt).toBeNull();
    await f.execute({
      tool: 'research.record',
      findings: [
        {
          questionKey: 'q1',
          kind: 'fact',
          text: '方案甲的延迟为10毫秒。',
          supports: [{ sourceId: sources[0]!.id, quote: '方案甲的延迟为10毫秒。' }],
          opposes: [],
        },
      ],
    });
    expect(f.research.state(run).progress.lastIssue).toBe('SOURCE_NOT_USABLE');
    expect(f.research.state(run).progress.findings).toEqual([]);
    await f.execute({
      tool: 'research.record',
      findings: [
        {
          questionKey: 'q1',
          kind: 'gap',
          text: '来源超出时间范围或缺少发布日期。',
          supports: [],
          opposes: [],
        },
      ],
    });
    await f.execute({ tool: 'research.report' });
    expect(f.research.state(run).progress.report?.quality).toBe('partial');
    await auditFixture(f, 'time');
  } finally {
    await f.close();
  }
});
test('P08-02 mid-run source exclusion creates a new version and rejects old-source support', async () => {
  const f = await setup();
  try {
    const run = f.activate(),
      sources = await loadBoth(f);
    const current = f.work.repo.row(run.id);
    const changed = await f.send(
      'runs.steer',
      {
        runId: run.id,
        text: '排除来源甲，重新查证。',
        research: { ...f.spec, excludedSources: [sources[0]!.id] },
        clientRequestId: newId(),
      },
      current.revision,
    );
    expect(changed.ok).toBe(true);
    if (!changed.ok || !('work' in changed.data)) throw Error('steer');
    const next = f.activate(changed.data.work.runId);
    expect(next.task_version).toBe(2);
    expect(f.research.rootCounts(next).reads).toBe(2);
    const requestCount = f.requests.length;
    await f.execute(read(a), next.id);
    expect(f.requests).toHaveLength(requestCount);
    expect(f.research.state(next).progress.sources).toHaveLength(2);
    await f.execute(
      {
        tool: 'research.record',
        findings: [
          {
            questionKey: 'q1',
            kind: 'fact',
            text: '方案甲的延迟为10毫秒。',
            supports: [{ sourceId: sources[0]!.id, quote: '方案甲的延迟为10毫秒。' }],
            opposes: [],
          },
        ],
      },
      next.id,
    );
    expect(f.research.state(next).progress.findings).toEqual([]);
    expect(f.research.state(next).progress.lastIssue).toBe('SOURCE_NOT_USABLE');
    expect(() => f.work.repo.guard(run, 'fixture')).toThrow();
    expect(f.work.repo.row(run.id).status).toBe('cancelled');
    await f.execute(
      {
        tool: 'research.record',
        findings: [
          {
            questionKey: 'q1',
            kind: 'gap',
            text: '来源已排除，证据不足。',
            supports: [],
            opposes: [],
          },
        ],
      },
      next.id,
    );
    await f.execute({ tool: 'research.report' }, next.id);
    await auditFixture(f, 'exclude', next);
  } finally {
    await f.close();
  }
});
test('P08-02 searches are generated from approved questions and bind actual candidate reads', async () => {
  const f = await setup({ seedUrls: [] });
  try {
    const run = f.activate();
    await f.execute({ tool: 'research.search', questionKey: 'q1' });
    expect(decodeURIComponent(f.requests[0]!)).toContain('方案甲的延迟是多少？');
    await f.execute({
      tool: 'research.read',
      questionKey: 'q1',
      source: { kind: 'candidate', queryIndex: 0, candidateIndex: 0 },
      refresh: false,
      offset: 0,
    });
    expect(f.research.state(run).progress.sources).toHaveLength(1);
    const before = f.requests.length;
    await expect(f.execute(read('https://unapproved.example.org/private-data'))).rejects.toThrow();
    expect(f.requests).toHaveLength(before);
    for (let i = 1; i < 3; i++) await f.execute({ tool: 'research.search', questionKey: 'q1' });
    await expect(f.execute({ tool: 'research.search', questionKey: 'q1' })).rejects.toThrow();
    expect(f.research.rootCounts(run).searches).toBe(3);
  } finally {
    await f.close();
  }
});
test('P08-02 local extraction survives GC but original permanent deletion removes its private snapshot', async () => {
  const f = await setup({ webEnabled: false });
  try {
    const blob = await f.blobs.put(
        Buffer.from('本地资料声明：方案甲的延迟为10毫秒。'),
        'text/plain',
      ),
      file = f.blobs.attach(blob.id, '本地合成资料.txt');
    f.files.link(file.id, file.versionId, { type: 'session', id: f.sessionId });
    f.store.db
      .prepare(
        "UPDATE file_versions SET parse_status='ready',preview_status='ready',extension='txt',display_name='本地合成资料.txt' WHERE id=?",
      )
      .run(file.versionId);
    let run = f.activate(),
      state = f.work.repo.state(run);
    state.definition.refs = [{ kind: 'file', fileId: file.id, versionId: file.versionId }];
    state.definition.research!.localVersions = [{ fileId: file.id, versionId: file.versionId }];
    f.work.repo.save(run, state);
    run = f.work.repo.row(run.id);
    await f.execute({
      tool: 'research.read',
      questionKey: 'q1',
      source: { kind: 'file', fileId: file.id, versionId: file.versionId },
      refresh: false,
      offset: 0,
    });
    const s = f.research.state(run).progress.sources[0]!;
    expect(s.status).toBe('ready');
    await f.blobs.gc();
    expect((await f.research.material(run, s)).text).toContain('10毫秒');
    await f.execute({
      tool: 'research.record',
      findings: [
        {
          questionKey: 'q1',
          kind: 'fact',
          text: '本地资料声明：方案甲的延迟为10毫秒。',
          supports: [{ sourceId: s.id, quote: '本地资料声明：方案甲的延迟为10毫秒。' }],
          opposes: [],
        },
      ],
    });
    eraseFileDerivedContent(f.store, file.id, f.store.now());
    await expect(f.research.material(run, s)).rejects.toThrow();
    expect(f.store.db.prepare('SELECT count(*) n FROM research_snapshots').get()).toEqual({ n: 0 });
    await f.research.finishEarly(run, () => f.work.repo.guard(run, 'fixture'));
    expect(f.research.state(run).progress.findings[0]?.kind).toBe('gap');
    expect(f.research.state(run).progress.report?.quality).toBe('partial');
    expect(await f.research.verify(run)).toBe(true);
  } finally {
    await f.close();
  }
});
test('P08-02 early finish generates a partial report without starting a model request', async () => {
  let calls = 0;
  const f = await setup({}, async () => {
    calls++;
    return { text: 'unexpected', calls: [], finished: true };
  });
  try {
    const run = f.work.repo.row(f.runId);
    const result = await f.send('research.finish', { runId: run.id }, run.revision);
    expect(result.ok).toBe(true);
    await f.work.start();
    await until(() => f.work.repo.row(run.id).status === 'partial');
    expect(calls).toBe(0);
    expect(f.research.state(run).progress.report?.quality).toBe('partial');
    expect(await f.research.verify(run)).toBe(true);
    expect(
      f.store.db
        .prepare(
          "SELECT count(*) n FROM tool_calls WHERE run_id=? AND status IN('proposed','dispatched','pending','unknown')",
        )
        .get(run.id),
    ).toEqual({ n: 0 });
  } finally {
    await f.close();
  }
});
test('P08-02 metadata is bounded and the old schema-less work state keeps research optional', () => {
  expect(ResearchProgressSchema.parse({}).sources).toEqual([]);
});

test('P08-02 concurrent reads retain both snapshots and root read budget cannot reset after steering', async () => {
  const f = await setup();
  try {
    const run = f.activate();
    await Promise.all([f.execute(read(a)), f.execute(read(b))]);
    expect(f.research.state(run).progress.sources).toHaveLength(2);
    expect(f.research.rootCounts(run).reads).toBe(2);
    const state = f.work.repo.state(f.work.repo.row(run.id));
    state.research!.reads = 40;
    f.work.repo.save(run, state);
    const changed = await f.send(
      'runs.steer',
      { runId: run.id, text: '继续查证', research: f.spec, clientRequestId: newId() },
      f.work.repo.row(run.id).revision,
    );
    if (!changed.ok || !('work' in changed.data)) throw Error(JSON.stringify(changed));
    const next = f.activate(changed.data.work.runId),
      before = f.requests.length;
    await expect(f.execute({ ...read(a), refresh: true }, next.id)).rejects.toThrow(
      'BUDGET_EXCEEDED',
    );
    expect(f.requests).toHaveLength(before);
    expect(f.research.rootCounts(next).reads).toBe(40);
    await f.execute(read(a), next.id);
    expect(f.research.rootCounts(next).reads).toBe(40);
  } finally {
    await f.close();
  }
});

test('P08-02 root search quota, public permissions and generated-report exclusion precede outbound IO', async () => {
  const f = await setup({
    questions: [
      { key: 'q1', text: '一' },
      { key: 'q2', text: '二' },
      { key: 'q3', text: '三' },
    ],
  });
  try {
    const run = f.activate();
    for (let i = 0; i < 8; i++)
      await f.execute({ tool: 'research.search', questionKey: 'q' + (1 + Math.floor(i / 3)) });
    const before = f.requests.length;
    await expect(f.execute({ tool: 'research.search', questionKey: 'q3' })).rejects.toThrow(
      'BUDGET_EXCEEDED',
    );
    expect(f.requests).toHaveLength(before);
    await expect(f.execute(read('http://127.0.0.1/private'))).rejects.toThrow();
    const state = f.work.repo.state(f.work.repo.row(run.id));
    state.definition.research!.webEnabled = false;
    f.work.repo.save(run, state);
    await expect(f.execute(read(a))).rejects.toThrow('PERMISSION_DENIED');
    expect(f.requests).toHaveLength(before);
    await f.execute({ tool: 'research.report' });
    const ref = f.research.state(run).progress.report!.primary;
    if (ref.kind !== 'file') throw Error('file');
    state.definition.refs.push(ref);
    state.definition.research!.localVersions.push({ fileId: ref.fileId, versionId: ref.versionId });
    state.research = f.research.state(run).progress;
    f.work.repo.save(run, state);
    await expect(
      f.execute({
        tool: 'research.read',
        questionKey: 'q1',
        source: { kind: 'file', fileId: ref.fileId, versionId: ref.versionId },
        refresh: false,
        offset: 0,
      }),
    ).rejects.toThrow();
  } finally {
    await f.close();
  }
});

test('P08-02 active model cancellation saves verified partial output and never dispatches returned tools', async () => {
  let entered = false;
  const f = await setup({}, async (_run, _step, signal) => {
    entered = true;
    await new Promise<void>((resolve) =>
      signal.addEventListener('abort', () => resolve(), { once: true }),
    );
    signal.throwIfAborted();
    return { text: '', calls: [], finished: true };
  });
  try {
    const run = f.work.repo.row(f.runId),
      state = f.work.repo.state(run);
    state.planAccepted = true;
    f.work.repo.save(run, state);
    await f.work.start();
    await until(() => entered);
    const finished = await f.send(
      'research.finish',
      { runId: run.id },
      f.work.repo.row(run.id).revision,
    );
    expect(finished.ok).toBe(true);
    await until(() => f.work.repo.row(run.id).status === 'partial');
    expect(f.research.state(run).progress.report?.ready).toBe(true);
    expect(f.research.rootCounts(run)).toEqual({ searches: 0, reads: 0 });
  } finally {
    await f.close();
  }
});

test('P08-02 repeated unchanged reads stop after one replan and recovery never replays public IO', async () => {
  const f = await setup();
  try {
    const run = f.activate();
    await f.execute(read(a));
    for (let i = 0; i < 3; i++) await f.execute(read(a));
    expect(f.research.state(run).progress.lastIssue).toContain('REPLAN_REQUIRED');
    await expect(f.execute(read(a))).rejects.toThrow('BUDGET_EXCEEDED');
    expect(f.requests).toHaveLength(1);
    f.store.db.prepare("UPDATE tool_calls SET status='dispatched' WHERE run_id=?").run(run.id);
    f.research.recover(run);
    expect(
      f.store.db
        .prepare(
          "SELECT count(*) n FROM tool_calls WHERE run_id=? AND status IN('dispatched','pending','unknown')",
        )
        .get(run.id),
    ).toEqual({ n: 0 });
    expect(f.requests).toHaveLength(1);
    expect(f.research.state(run).progress.sources).toHaveLength(1);
  } finally {
    await f.close();
  }
});

test('P08-02 edited public questions receive their own rounds without resetting the root budget', async () => {
  const f = await setup();
  try {
    const run = f.activate();
    for (let i = 0; i < 3; i++) await f.execute({ tool: 'research.search', questionKey: 'q1' });
    const changed = await f.send(
      'runs.steer',
      {
        runId: run.id,
        text: '改查适用范围',
        research: { ...f.spec, questions: [{ key: 'q1', text: '方案甲的适用范围是什么？' }] },
        clientRequestId: newId(),
      },
      f.work.repo.row(run.id).revision,
    );
    if (!changed.ok || !('work' in changed.data)) throw Error(JSON.stringify(changed));
    const next = f.activate(changed.data.work.runId);
    await f.execute({ tool: 'research.search', questionKey: 'q1' }, next.id);
    expect(f.research.rootCounts(next).searches).toBe(4);
    expect(f.research.state(next).progress.queries[0]?.round).toBe(1);
    expect(decodeURIComponent(f.requests.at(-1)!)).toContain('方案甲的适用范围是什么？');
  } finally {
    await f.close();
  }
});

test('P08-02 permanent deletion during local snapshot staging cannot recreate private derived content', async () => {
  const f = await setup({ webEnabled: false });
  try {
    const blob = await f.blobs.put(Buffer.from('待删除的合成研究资料。'), 'text/plain'),
      file = f.blobs.attach(blob.id, '合成删除样本.txt');
    f.files.link(file.id, file.versionId, { type: 'session', id: f.sessionId });
    f.store.db
      .prepare("UPDATE file_versions SET parse_status='ready',extension='txt' WHERE id=?")
      .run(file.versionId);
    const run = f.activate(),
      state = f.work.repo.state(run);
    state.definition.refs = [{ kind: 'file', fileId: file.id, versionId: file.versionId }];
    state.definition.research!.localVersions = [{ fileId: file.id, versionId: file.versionId }];
    f.work.repo.save(run, state);
    const put = f.blobs.put.bind(f.blobs);
    f.blobs.put = async (...args) => {
      const result = await put(...args);
      if (args[1] === 'application/vnd.tapkit.research-source+json') {
        eraseFileDerivedContent(f.store, file.id, f.store.now());
        f.store.db
          .prepare('UPDATE file_versions SET deleted_at=? WHERE id=?')
          .run(f.store.now(), file.versionId);
        f.store.db.prepare('UPDATE files SET deleted_at=? WHERE id=?').run(f.store.now(), file.id);
      }
      return result;
    };
    await expect(
      f.execute({
        tool: 'research.read',
        questionKey: 'q1',
        source: { kind: 'file', fileId: file.id, versionId: file.versionId },
        refresh: false,
        offset: 0,
      }),
    ).rejects.toThrow('PERMISSION_DENIED');
    expect(f.store.db.prepare('SELECT count(*) n FROM research_snapshots').get()).toEqual({ n: 0 });
    await f.blobs.gc();
    expect(f.research.state(run).progress.sources).toEqual([]);
  } finally {
    await f.close();
  }
});

test('P08-02 paginated finding summaries stay below IPC bounds while full quotes remain in archived locators', async () => {
  const f = await setup();
  try {
    const run = f.activate(),
      qa = '甲'.repeat(1590) + '。',
      qb = '乙'.repeat(1590) + '。';
    f.pages.set(a, '<main><p>' + qa + '</p></main>');
    f.pages.set(b, '<main><p>' + qb + '</p></main>');
    const sources = await loadBoth(f);
    await f.execute({
      tool: 'research.record',
      findings: [
        {
          questionKey: 'q1',
          kind: 'conflict',
          text: '差异未裁决。',
          supports: Array.from({ length: 3 }, () => ({ sourceId: sources[0]!.id, quote: qa })),
          opposes: Array.from({ length: 3 }, () => ({ sourceId: sources[1]!.id, quote: qb })),
        },
      ],
    });
    const first = f.research.state(run).progress.findings[0]!;
    await f.execute({
      tool: 'research.record',
      findings: [
        {
          questionKey: 'q1',
          kind: 'conflict',
          text: '另一组差异未裁决。',
          supports: first.opposes.map(({ sourceId, quote }) => ({ sourceId, quote })),
          opposes: first.supports.map(({ sourceId, quote }) => ({ sourceId, quote })),
        },
      ],
    });
    const reply = await f.research.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: 'research.get',
      payload: { runId: run.id },
    });
    expect(Buffer.byteLength(JSON.stringify(reply))).toBeLessThan(60000);
    expect(JSON.stringify(reply)).not.toContain(qa);
    const finding = f.research.state(run).progress.findings[0]!;
    const original = await f.research.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: 'research.source',
      payload: { runId: run.id, sourceId: sources[0]!.id, findingId: finding.id },
    });
    expect(original.ok && 'highlights' in original.data && original.data.highlights[0]?.quote).toBe(
      qa,
    );
    const { fixtureHash, ...fixture } = gold;
    expect(researchHash(JSON.stringify(fixture))).toBe(fixtureHash);
  } finally {
    await f.close();
  }
});
