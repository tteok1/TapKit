import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

// History/file tests need an empty, persisted conversation. Creating this
// fixture directly keeps them independent of the unified start page's send flow.
export async function openSessionFixture(page: Page) {
  const raw = randomUUID();
  const requestId = raw.slice(0, 14) + '7' + raw.slice(15);
  const title = '隔离会话 ' + requestId;
  const id = await page.evaluate(
    async ({ requestId, title }) => {
      const reply = await window.tapkit.desktopCommand({ requestId }, 'sessions.create', {
        mode: 'chat',
        title,
      });
      if (!reply.ok || !('entityId' in reply.data)) throw new Error('CREATE_FIXTURE_FAILED');
      window.dispatchEvent(new Event('tapkit:history-changed'));
      return reply.data.entityId;
    },
    { requestId, title },
  );
  await reopenSessionFixture(page, id);
  return id;
}

// Reload intentionally starts on the shared task page (ADR0058). Resume the
// existing record through the sidebar; never create a replacement conversation.
export async function reopenSessionFixture(page: Page, sessionId: string) {
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  if (await page.getByRole('button', { name: '展开侧栏', exact: true }).count())
    await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  await page
    .getByRole('complementary', { name: '侧栏', exact: true })
    .locator(`[data-session-id="${sessionId}"] .history-link`)
    .click();
  await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', sessionId);
  await expect(page.locator('.chat-messages')).toBeVisible();
}
