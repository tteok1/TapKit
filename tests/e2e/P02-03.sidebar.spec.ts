import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from './test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HistoryCommand, SidebarView } from '../../packages/contracts/src';

const evidence = resolve('docs/evidence/P02-03/sidebar-groups-2026-10-19');
const groupName = '侧栏回归分组';
let app: ElectronApplication | undefined;
const newId = () => {
  const id = randomUUID();
  return id.slice(0, 14) + '7' + id.slice(15);
};
async function command(
  page: Page,
  command: HistoryCommand,
  payload: unknown = {},
  revision?: number,
) {
  return page.evaluate(
    async ({ command, payload, revision, requestId }) => {
      const reply = await window.tapkit.historyCommand(
        { requestId, ...(revision === undefined ? {} : { expectedRevision: revision }) },
        command,
        payload,
      );
      if (!reply.ok) throw new Error(reply.error.code);
      window.dispatchEvent(new Event('tapkit:history-refresh'));
      return reply.data;
    },
    { command, payload, revision, requestId: newId() },
  );
}
test.afterEach(async () => {
  await app?.close();
  app = undefined;
});

for (const [width, height] of [
  [1440, 900],
  [960, 640],
] as const) {
  test(`P02-03 T20 sidebar grouped conversations expand, collapse and survive removal ${width}x${height}`, async () => {
    test.setTimeout(180_000);
    await mkdir('.test-data', { recursive: true });
    await mkdir(evidence, { recursive: true });
    const dataDir = await mkdtemp(resolve('.test-data/P02-03 sidebar '));
    await writeFile(resolve(dataDir, 'P02-02.fixture'), 'P02-02 isolated fixture');
    const env = Object.fromEntries(
      Object.entries({
        ...process.env,
        TAPKIT_DATA_DIR: dataDir,
        TAPKIT_CHAT_FIXTURE: 'P02-02',
      }).filter((row): row is [string, string] => row[1] !== undefined),
    );
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
    app.process().stderr?.on('data', (chunk) => process.stderr.write(chunk));
    const page = await app.firstWindow();
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', {
      timeout: 125_000,
    });
    await app.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(...size),
      [width, height] as [number, number],
    );
    const ids = await page.evaluate(
      async (requestIds) => {
        const ids: string[] = [];
        for (const [i, requestId] of requestIds.entries()) {
          const reply = await window.tapkit.desktopCommand({ requestId }, 'sessions.create', {
            mode: 'chat',
            title: '侧栏保留会话 ' + i,
          });
          if (!reply.ok || !('entityId' in reply.data)) throw new Error('CREATE_FAILED');
          ids.push(reply.data.entityId);
        }
        return ids;
      },
      Array.from({ length: 5 }, newId),
    );
    await page.getByRole('link', { name: '聊天', exact: true }).click();
    const sidebar = page.locator('.sidebar .history-manager');
    const main = page.locator('.screen-scroll .history-manager');
    await expect(sidebar.locator('.history-row')).toHaveCount(5);
    await expect(main.locator('.history-row')).toHaveCount(5);

    await sidebar.getByRole('button', { name: '会话列表选项', exact: true }).click();
    await page
      .getByRole('region', { name: '会话列表选项', exact: true })
      .getByRole('button', { name: '新建分组', exact: true })
      .click();
    const dialog = sidebar.getByRole('dialog');
    await dialog.getByLabel('分组名称').fill(groupName);
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(sidebar.locator('.history-row')).toHaveCount(5);
    const view = (await command(page, 'sidebar.list')) as SidebarView;
    const groupId = view.sections.find((group) => group.name === groupName)!.id;
    await command(page, 'sessions.move', { sessionIds: ids.slice(0, 2), sectionId: groupId });
    const group = sidebar.locator('.history-group').filter({ hasText: groupName });
    const select = group.getByRole('button', { name: new RegExp('^' + groupName + ' [(]2[)]') });
    await expect(group.locator('.history-row')).toHaveCount(2);
    await expect(sidebar.locator('.history-row')).toHaveCount(5);
    await expect(main.locator('.history-row')).toHaveCount(5);
    await group.getByRole('button', { name: '折叠分组' + groupName, exact: true }).click();
    await expect(
      group.getByRole('button', { name: '展开分组' + groupName, exact: true }),
    ).toBeVisible();
    try {
      await expect(sidebar.getByRole('button', { name: '返回所有会话', exact: true })).toHaveCount(
        0,
      );
      await expect(group.locator('.history-row')).toHaveCount(0);
      await expect(sidebar.locator('.history-row')).toHaveCount(3);
    } finally {
      const count = await sidebar.locator('.history-row').count();
      const label = (count ? 'after' : 'before') + `-collapse-${width}x${height}`;
      await writeFile(
        resolve(evidence, label + '.json'),
        JSON.stringify(
          { sidebarRows: count, mainRows: await main.locator('.history-row').count() },
          null,
          2,
        ) + '\n',
      );
      await page.screenshot({ path: resolve(evidence, label + '.png') });
    }

    // Choosing a collapsed group expands it instead of selecting an invisible list.
    await select.click();
    await expect(
      group.getByRole('button', { name: '折叠分组' + groupName, exact: true }),
    ).toBeVisible();
    await expect(group.locator('.history-row')).toHaveCount(2);
    await expect(sidebar.locator('.history-row')).toHaveCount(5);
    await sidebar.locator('.history-link').first().scrollIntoViewIfNeeded();
    await expect(sidebar.locator('.history-link').first()).toBeInViewport({ ratio: 0.99 });
    const current = (await command(page, 'sidebar.list')) as SidebarView;
    await command(
      page,
      'sidebar.remove',
      { sectionId: groupId },
      current.sections.find((g) => g.id === groupId)!.revision,
    );
    await expect(group).toHaveCount(0);
    await expect(sidebar.getByRole('button', { name: '返回所有会话', exact: true })).toHaveCount(0);
    await expect(sidebar.locator('.history-row')).toHaveCount(5);
    await expect(main.locator('.history-row')).toHaveCount(5);
    await expect(sidebar.getByRole('alert')).toHaveCount(0);
    // The rows must remain reachable in the short sidebar, not merely present in the DOM.
    // Allow fractional-pixel intersection rounding at the scroller's edge.
    for (const row of await sidebar.locator('.history-link').all()) {
      await row.scrollIntoViewIfNeeded();
      await expect(row).toBeInViewport({ ratio: 0.99 });
    }
    await page.screenshot({ path: resolve(evidence, `after-removal-${width}x${height}.png`) });
  });
}
