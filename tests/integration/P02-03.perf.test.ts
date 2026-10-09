import { afterAll, beforeAll, it, expect, vi } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cpus, totalmem } from 'node:os';
import { openStore, BlobStore, newId } from '../../packages/storage/src';
import { ChatService } from '../../packages/core/src/chat-service';
import { HistoryService } from '../../packages/core/src/history-service';
import { SessionPageSchema, SearchPageSchema, type Reply } from '../../packages/contracts/src';
const data = (r: Reply) => {
  if (!r.ok) throw new Error(r.error.code);
  return r.data;
};
let fixture:
  | { store: Awaited<ReturnType<typeof openStore>>; chat: ChatService; history: HistoryService }
  | undefined;
let seedMs = 0;

// Synthetic dataset construction is setup, separate from the measured query budget.
// Windows CI can take over 60s to insert all 100,000 FTS-indexed messages.
beforeAll(async () => {
  vi.useRealTimers();
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data/P02-03 performance ')),
    store = await openStore(dir);
  const chat = new ChatService(store, new BlobStore(store), {
      catalog: async () => [],
      effective: () => {
        throw new Error('NO_MODEL');
      },
      router: {
        async *stream() {
          throw new Error('NO_MODEL');
        },
      },
      ledger: { hasPreferences: () => false },
    }),
    history = new HistoryService(store, new BlobStore(store), chat);
  fixture = { store, chat, history };
  const now = store.now(),
    seedStart = performance.now();
  store.db.transaction(() => {
    const session = store.db.prepare(
        'INSERT INTO sessions(id,profile_id,created_at,updated_at,title,mode,active_branch_id,settings_json,last_activity_at) VALUES(?,?,?,?,?,\'chat\',?,\'{"schemaVersion":1,"values":{}}\',?)',
      ),
      branch = store.db.prepare(
        'INSERT INTO branches(id,profile_id,created_at,updated_at,session_id,label,head_message_id) VALUES(?,?,?,?,?,?,?)',
      ),
      head = store.db.prepare('UPDATE branches SET head_message_id=? WHERE id=?'),
      message = store.db.prepare(
        'INSERT INTO messages(id,profile_id,created_at,updated_at,session_id,branch_id,parent_message_id,role,content_json,status,chat_json) VALUES(?,?,?,?,?,?,?,? ,?,\'final\',\'{"schemaVersion":1,"attachments":[],"calls":[],"model":null,"errorCode":null}\')',
      );
    for (let i = 0; i < 10000; i++) {
      const s = newId(),
        b = newId();
      session.run(s, store.profileId, now + i, now + i, '性能会话 ' + i, b, now + i);
      branch.run(b, store.profileId, now + i, now + i, s, '主分支', null);
      let parent: string | null = null;
      for (let j = 0; j < 10; j++) {
        const id = newId();
        message.run(
          id,
          store.profileId,
          now + i,
          now + i,
          s,
          b,
          parent,
          j % 2 ? 'assistant' : 'user',
          JSON.stringify({
            schemaVersion: 1,
            blocks: [{ kind: 'text', text: '分页性能标记 ' + i + '/' + j }],
          }),
        );
        parent = id;
      }
      head.run(parent, b);
    }
  })();
  seedMs = performance.now() - seedStart;
  console.info('P02-03 performance fixture ready', { seedMs, sessions: 10000, messages: 100000 });
}, 120000);

afterAll(async () => {
  if (!fixture) return;
  try {
    await fixture.history.stop();
    await fixture.chat.stop();
  } finally {
    fixture.store.close();
  }
});

it('P02-03 10,000 sessions / 100,000 messages have bounded pages and local list/search P95 <= 500ms', async () => {
  vi.useRealTimers();
  if (!fixture) throw new Error('PERFORMANCE_FIXTURE_NOT_READY');
  const { store, history } = fixture;
  const sampleStart = performance.now();
  const listTimes: number[] = [],
    searchTimes: number[] = [],
    searchBySort: Record<'updated' | 'relevance', number[]> = { updated: [], relevance: [] },
    seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const started = performance.now(),
      p = SessionPageSchema.parse(
        data(
          await history.dispatch({
            protocolVersion: 1,
            requestId: newId(),
            command: 'sessions.list',
            payload: { limit: 50, ...(cursor ? { cursor } : {}) },
          }),
        ),
      );
    listTimes.push(performance.now() - started);
    expect(p.sessions.length).toBeLessThanOrEqual(50);
    for (const s of p.sessions) {
      expect(seen.has(s.id)).toBe(false);
      seen.add(s.id);
    }
    cursor = p.nextCursor ?? undefined;
  } while (cursor);
  expect(seen.size).toBe(10000);
  expect(store.db.prepare('SELECT count(*) n FROM messages').get()).toEqual({ n: 100000 });
  for (let i = 0; i < 30; i++) {
    const sort = i % 2 ? 'relevance' : 'updated',
      started = performance.now(),
      p = SearchPageSchema.parse(
        data(
          await history.dispatch({
            protocolVersion: 1,
            requestId: newId(),
            command: 'search.query',
            payload: {
              query: '分页性能标记',
              scope: { type: 'all' },
              types: ['message'],
              sort,
              limit: 50,
            },
          }),
        ),
      );
    const elapsed = performance.now() - started;
    searchTimes.push(elapsed);
    searchBySort[sort].push(elapsed);
    expect(p.hits).toHaveLength(50);
    expect(p.nextCursor).not.toBeNull();
  }
  const percentile = (values: number[], fraction: number) =>
    [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]!;
  const report = {
    task: 'P02-03',
    recordedAt: new Date().toISOString(),
    dataset: { sessions: 10000, messages: 100000 },
    seedMs,
    sampleMs: performance.now() - sampleStart,
    timeoutBudgets: { setupMs: 120000, samplingMs: 60000 },
    device: {
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      totalMemory: totalmem(),
    },
    list: {
      samples: listTimes.length,
      p50Ms: percentile(listTimes, 0.5),
      p95Ms: percentile(listTimes, 0.95),
    },
    search: {
      samples: searchTimes.length,
      p50Ms: percentile(searchTimes, 0.5),
      p95Ms: percentile(searchTimes, 0.95),
      bySort: Object.fromEntries(
        Object.entries(searchBySort).map(([sort, times]) => [
          sort,
          { samples: times.length, p50Ms: percentile(times, 0.5), p95Ms: percentile(times, 0.95) },
        ]),
      ),
    },
    processMemory: process.memoryUsage(),
    scope:
      'Isolated Core/SQLite fixture; excludes Electron launch, total app memory and P03 document retrieval',
  };
  await mkdir('test-results/P02-03-perf', { recursive: true });
  await writeFile(
    'test-results/P02-03-perf/performance.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.info(
    'P02-03_PERFORMANCE',
    JSON.stringify({ seedMs, sampleMs: report.sampleMs, list: report.list, search: report.search }),
  );
  expect(report.list.p95Ms).toBeLessThanOrEqual(500);
  expect(report.search.p95Ms).toBeLessThanOrEqual(500);
}, 60000);
