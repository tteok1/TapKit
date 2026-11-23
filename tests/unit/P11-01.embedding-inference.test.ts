import { expect, test, vi } from 'vitest';
import { resolve } from 'node:path';
import { EmbeddingInference } from '../../packages/retrieval/src/embedding-inference';
const entry = resolve('tests/fixtures/P11-01.embedding-worker-control.mjs');
const options = { intraOpNumThreads: 2, interOpNumThreads: 1 };

test('P11-01 a cancelled worker window cannot deliver its late vector to another caller', async () => {
  const client = new EmbeddingInference(entry, 'busy', 2, options, () => {});
  try {
    await client.ready;
    const abort = new AbortController();
    const cancelled = client.run([1, 2], abort.signal);
    const rejected = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    const peer = client.run([3, 4]);
    abort.abort();
    await rejected;
    expect(await peer).toEqual(new Float32Array([3, 4]));
  } finally {
    await client.dispose();
  }
});

test('P11-01 worker exit rejects pending requests and closes exactly once', async () => {
  const closed = vi.fn();
  const client = new EmbeddingInference(entry, 'crash', 2, options, closed);
  try {
    await client.ready;
    await expect(client.run([1, 2])).rejects.toThrow('INDEX_NOT_READY');
    expect(client.healthy()).toBe(false);
    await expect(client.run([3, 4])).rejects.toThrow('INDEX_NOT_READY');
    expect(closed).toHaveBeenCalledTimes(1);
  } finally {
    await client.dispose();
  }
});

test('P11-01 shutdown during initialization rejects waiting requests without starting inference', async () => {
  const closed = vi.fn();
  const client = new EmbeddingInference(entry, 'slow-init', 2, options, closed);
  const waiting = expect(client.run([1, 2])).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.all([waiting, client.dispose()]);
  expect(client.healthy()).toBe(false);
  expect(closed).toHaveBeenCalledTimes(1);
});
