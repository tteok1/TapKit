import { expect, test, type Page } from './test';

// Runtime integrity verification has its own Host watchdog. Keep UI action budgets separate.
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
