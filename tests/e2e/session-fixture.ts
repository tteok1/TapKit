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
  if (await page.getByRole('button', { name: '展开侧栏', exact: true }).count())
    await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  await page
    .getByRole('complementary', { name: '侧栏', exact: true })
    .locator(`[data-tooltip="${title}"]`)
    .click();
  await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', id);
  return id;
}
