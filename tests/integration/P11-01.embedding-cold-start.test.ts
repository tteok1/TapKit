import { expect, test, vi } from 'vitest';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as pause } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { loadBackgroundBge } from '../../packages/retrieval/src';

// This applies to Core's test process only. The real worker must load and verify
// the pinned model independently, without importing the tokenizer into Core.
vi.mock('@huggingface/transformers', () => {
  throw new Error('CORE_MODEL_LOAD_FORBIDDEN');
});

test('P11-01 cold background initialization never loads the model or tokenizer in Core', async () => {
  const lag = monitorEventLoopDelay({ resolution: 1 });
  lag.enable();
  await pause(10);
  const started = performance.now();
  const bge = await loadBackgroundBge();
  try {
    expect(await bge.count('首次索引的真实本地资料')).toBeGreaterThan(0);
    expect(await bge.embed('首次索引的真实本地资料')).toHaveLength(bge.dims);
    lag.disable();
    await mkdir('test-results/P11-01', { recursive: true });
    await writeFile(
      'test-results/P11-01/background-cold-start.json',
      JSON.stringify(
        {
          checkedAt: new Date(vi.getRealSystemTime()).toISOString(),
          wallMs: performance.now() - started,
          eventLoopP95Ms: lag.percentile(95) / 1e6,
          eventLoopMaxMs: lag.max / 1e6,
          coreModelImportForbidden: true,
          scope:
            'Real cold worker initialization, pinned file hashing, tokenizer and model loading; Core-side model import fails this test.',
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    lag.disable();
    await bge.dispose();
  }
}, 30_000);

test('P11-01 the background worker refuses corrupt model bytes before becoming ready', async () => {
  const dir = await mkdtemp(join('.test-data', 'P11-01 bad model '));
  await writeFile(join(dir, 'config.json'), '{}');
  await expect(loadBackgroundBge(dir)).rejects.toThrow('INDEX_NOT_READY');
});
