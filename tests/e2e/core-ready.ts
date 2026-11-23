import { expect, test, type Page } from './test';

// The Host watchdog and background native verification have separate budgets.
export async function waitCoreReady(page: Page) {
  // The Host's existing maximum is 120s; add 5s only for ready propagation.
  const allowance = 125_000;
  const actionBudget = test.info().timeout,
    started = performance.now();
  test.setTimeout(actionBudget + allowance);
  try {
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', {
      timeout: allowance,
    });
  } finally {
    test.setTimeout(actionBudget + Math.ceil(performance.now() - started));
  }
}

export function readRuntimeCapabilities(page: Page) {
  return page.evaluate(async () => {
    const id = crypto.randomUUID();
    const requestId = id.slice(0, 14) + '7' + id.slice(15);
    const reply = await window.tapkit.bootstrap({ requestId });
    if (!reply.ok || !('runtimeCapabilities' in reply.data) || !reply.data.runtimeCapabilities)
      throw new Error('Runtime capabilities missing from bootstrap');
    return reply.data.runtimeCapabilities;
  });
}

export async function waitRuntimeCapabilities(page: Page) {
  let capabilities = await readRuntimeCapabilities(page);
  await expect
    .poll(
      async () => {
        capabilities = await readRuntimeCapabilities(page);
        return Object.values(capabilities).some(
          (capability) =>
            capability.status === 'failed' && capability.reason === 'PROBE_IN_PROGRESS',
        );
      },
      { timeout: 125_000, intervals: [250, 500, 1000] },
    )
    .toBe(false);
  return capabilities;
}
