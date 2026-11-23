import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { measureStreaming } from './streaming-perf-fixture';
import { test, expect, _electron as electron } from './test';
import { waitCoreReady } from './core-ready';
import { openSessionFixture } from './session-fixture';

test('P11-01 local stream presentation and cancellation with two concurrent chat roots', async () => {
  test.setTimeout(75_000);
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data/P11-01 stream '));
  await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TAPKIT_DATA_DIR: dir,
    TAPKIT_CHAT_FIXTURE: 'P02-02',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [resolve('apps/desktop')],
    env: Object.fromEntries(
      Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
    chromiumSandbox: true,
  });
  try {
    const page = await app.firstWindow();
    await waitCoreReady(page);
    const first = await openSessionFixture(page, 'P11 流式样本'),
      second = await openSessionFixture(page, 'P11 取消样本');
    await page.locator(`[data-session-id="${first}"] .history-link`).click();
    await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', first);
    const result = await measureStreaming(page, first, second);
    const out = resolve('test-results/P11-01');
    await mkdir(out, { recursive: true });
    await writeFile(
      resolve(out, 'streaming-perf.json'),
      JSON.stringify(
        {
          scope:
            'Two actual Electron chat roots, synthetic upstream. Display times include two animation frames; cancellation acknowledgement is after Core commits. No index or provider workload.',
          ...result,
        },
        null,
        2,
      ) + '\n',
    );
    expect(result.latencies).toHaveLength(24);
    expect(result.displayP95Ms).toBeLessThanOrEqual(100);
    expect(result.cancelAckMs).toBeLessThanOrEqual(200);
    expect(result.cancelSettledMs).toBeLessThanOrEqual(1000);
    expect(result.cancelled).toBe('cancelled');
    expect(result.callsAfter).toBe(result.callsBefore);
  } finally {
    await app.close();
  }
});
