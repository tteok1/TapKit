import { expect, test, vi } from 'vitest';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { setImmediate as yieldTurn, setTimeout as pause } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  loadBge,
  loadBackgroundBge,
  localEmbedder,
  closeLocalEmbedder,
  type Embedder,
} from '../../packages/retrieval/src';

async function profile(bge: Embedder, text: string) {
  await bge.embed(text);
  const lag = monitorEventLoopDelay({ resolution: 1 });
  lag.enable();
  await pause(10);
  const started = performance.now();
  for (let i = 0; i < 24; i++) {
    await bge.embed(text);
    await yieldTurn();
  }
  lag.disable();
  return {
    iterations: 24,
    wallMs: performance.now() - started,
    p95Ms: lag.percentile(95) / 1e6,
    maxMs: lag.max / 1e6,
  };
}

test('P11-01 BGE worker preserves counts and real vectors while keeping inference off the Core event loop', async () => {
  const direct = await loadBge();
  const background = await loadBackgroundBge();
  try {
    let maxAbsDifference = 0;
    for (const [text, query] of [
      ['退款期限：七天。', false],
      ['退款', true],
      ['😀中文与English source offsets。'.repeat(100), false],
    ] as const) {
      expect(background.revision).toBe(direct.revision);
      expect(background.dims).toBe(direct.dims);
      expect(background.count(text)).toBe(direct.count(text));
      const expected = await direct.embed(text, query);
      const actual = await background.embed(text, query);
      maxAbsDifference = Math.max(
        maxAbsDifference,
        ...actual.map((v, i) => Math.abs(v - expected[i]!)),
      );
    }
    expect(maxAbsDifference).toBeLessThanOrEqual(1e-6);
    const text = '退款规则、研发排期和材料审阅均通过项目授权。'.repeat(16);
    const baseline = await profile(direct, text);
    const worker = await profile(background, text);
    await mkdir('test-results/P11-01', { recursive: true });
    await writeFile(
      'test-results/P11-01/embedding-worker-profile.json',
      JSON.stringify(
        {
          checkedAt: new Date(vi.getRealSystemTime()).toISOString(),
          scope:
            'Same real BGE model and text in one isolated test process; direct Node binding compared with background inference.',
          tokens: direct.count(text),
          maxAbsDifference,
          baseline,
          worker,
        },
        null,
        2,
      ) + '\n',
    );
    expect(worker.p95Ms).toBeLessThan(baseline.p95Ms);
  } finally {
    await Promise.all([direct.dispose?.(), background.dispose()]);
  }
}, 30_000);

test('P11-01 cancelling one embedding leaves the other root usable and shutdown rejects pending windows', async () => {
  const bge = await loadBackgroundBge();
  try {
    const abort = new AbortController();
    const cancelled = bge.embed('需要取消的索引资料。'.repeat(2000), false, abort.signal);
    const checked = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    const peer = bge.embed('另一个工作根仍能完成检索。');
    await yieldTurn();
    const started = performance.now();
    abort.abort();
    await checked;
    expect(performance.now() - started).toBeLessThanOrEqual(200);
    expect(await peer).toHaveLength(bge.dims);
    const pending = bge.embed('关闭时未完成的资料。'.repeat(2000));
    const stopped = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.all([stopped, bge.dispose()]);
    await expect(bge.embed('不得在已关闭的线程上继续执行。')).rejects.toThrow('INDEX_NOT_READY');
  } finally {
    await bge.dispose();
  }
}, 30_000);

test('P11-01 shared embedding service can reopen after an explicit close', async () => {
  const first = await localEmbedder();
  await first.embed('第一轮检索。');
  await closeLocalEmbedder();
  const next = await localEmbedder();
  expect(next).not.toBe(first);
  expect(await next.embed('重新打开后的检索。')).toHaveLength(next.dims);
  await closeLocalEmbedder();
}, 30_000);
