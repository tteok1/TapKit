import { mkdtemp } from '../../scripts/test-temp.mjs';
import { waitCoreReady } from './core-ready';
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Locator,
  type Page,
} from './test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const evidence = resolve('docs/evidence/P02-03/dialog-layout-2026-10-19');
let app: ElectronApplication | undefined;
const newId = () => {
  const id = randomUUID();
  return id.slice(0, 14) + '7' + id.slice(15);
};

test.afterEach(async () => {
  await app?.close();
  app = undefined;
});

for (const [width, height, zoom] of [
  [1440, 900, 1],
  [960, 640, 1],
  [1440, 900, 2],
  [960, 640, 2],
] as const) {
  test(`P02-03 T22 dialogs fit ${width}x${height} at ${zoom * 100} percent`, async () => {
    test.setTimeout(90_000);
    await mkdir('.test-data', { recursive: true });
    await mkdir(evidence, { recursive: true });
    const dir = await mkdtemp(resolve('.test-data/P02-03 dialogs '));
    await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
    const env = Object.fromEntries(
      Object.entries({
        ...process.env,
        TAPKIT_DATA_DIR: dir,
        TAPKIT_CHAT_FIXTURE: 'P02-02',
      }).filter((r): r is [string, string] => r[1] !== undefined),
    );
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
    app.process().stderr?.on('data', (chunk) => process.stderr.write(chunk));
    const page = await app.firstWindow();
    await waitCoreReady(page);
    await app.evaluate(
      ({ BrowserWindow }, dimensions) =>
        BrowserWindow.getAllWindows()[0]!.setContentSize(...dimensions),
      [width, height] as [number, number],
    );
    await page.getByRole('link', { name: '设置', exact: true }).click();
    await page.getByLabel('缩放', { exact: true }).selectOption(String(zoom));
    await page.getByLabel('字体大小', { exact: true }).selectOption('large');
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(page.locator('.desktop-shell')).toHaveCSS('zoom', String(zoom));
    const title = '弹窗布局回归';
    const id = await page.evaluate(
      async ({ requestId, title }) => {
        const r = await window.tapkit.desktopCommand({ requestId }, 'sessions.create', {
          mode: 'chat',
          title,
        });
        if (!r.ok || !('entityId' in r.data)) throw new Error('CREATE_FAILED');
        return r.data.entityId;
      },
      { requestId: newId(), title },
    );
    if (await page.getByRole('button', { name: '展开侧栏', exact: true }).count())
      await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
    await page.getByRole('link', { name: '聊天', exact: true }).click();
    const list = page.locator('.screen-scroll .history-manager');
    const row = list.locator('.history-row').filter({ hasText: title });
    await row.getByRole('button', { name: '会话信息' + title, exact: true }).click();
    await fits(page, list.getByRole('dialog'), 'session-info');
    await close(list.getByRole('dialog'), '取消');

    await list.getByRole('button', { name: '新建分组', exact: true }).click();
    await fits(page, list.getByRole('dialog'), 'new-group');
    await page.keyboard.press('Escape');
    await expect(list.getByRole('dialog')).toHaveCount(0);

    await row.getByRole('checkbox').check();
    await list.getByRole('button', { name: '批量移动', exact: true }).click();
    await fits(page, list.getByRole('dialog'), 'batch-move');
    await close(list.getByRole('dialog'), '取消');
    await list.getByRole('button', { name: '移入回收站', exact: true }).click();
    await fits(page, list.getByRole('dialog'), 'delete-impact');
    await close(list.getByRole('dialog'), '关闭');

    await page.evaluate(
      async ({ requestId, id }) => {
        const r = await window.tapkit.historyCommand({ requestId }, 'sessions.trash', {
          sessionIds: [id],
        });
        if (!r.ok) throw new Error(r.error.code);
      },
      { requestId: newId(), id },
    );
    await list.getByRole('button', { name: '回收站', exact: true }).click();
    await row.locator('.history-link').click();
    await fits(page, list.getByRole('dialog'), 'purge');
    await close(list.getByRole('dialog'), '取消');
    await page.keyboard.press('Control+k');
    await fits(page, page.getByRole('dialog', { name: '搜索', exact: true }), 'search');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  async function fits(page: Page, dialog: Locator, name: string) {
    await expect(dialog).toBeVisible();
    await dialog.evaluate((el) => {
      el.scrollTop = 0;
    });
    const box = await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        right: r.right,
        bottom: r.bottom,
        cx: r.x + r.width / 2,
        cy: r.y + r.height / 2,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
      };
    });
    const overflow = box.x < 0 || box.y < 0 || box.right > width || box.bottom > height;
    const path = resolve(
      evidence,
      `${name}-${width}x${height}-${zoom * 100}${overflow ? '-overflow' : ''}`,
    );
    await writeFile(path + '.json', JSON.stringify(box, null, 2) + '\n');
    await page.screenshot({ path: path + '.png', animations: 'disabled' });
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(box.viewportWidth);
    expect(box.bottom).toBeLessThanOrEqual(box.viewportHeight);
    expect(Math.abs(box.cx - box.viewportWidth / 2)).toBeLessThan(3);
    expect(Math.abs(box.cy - box.viewportHeight / 2)).toBeLessThan(3);
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
    if (name === 'session-info' && zoom === 2)
      expect(box.scrollHeight).toBeGreaterThan(box.clientHeight);
  }

  async function close(dialog: Locator, name: string) {
    const button = dialog.getByRole('button', { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    // Native zoom rounds IntersectionObserver areas (0.9984 for a fully visible control).
    // Keep exact viewport bounds and actual hit-testing in addition to the rounded area check.
    await expect(button).toBeInViewport({ ratio: 0.99 });
    const geometry = await button.evaluate((element) => {
      const r = element.getBoundingClientRect();
      const points = [
        [r.x + r.width / 2, r.y + 1],
        [r.x + r.width / 2, r.bottom - 1],
        [r.x + 1, r.y + r.height / 2],
        [r.right - 1, r.y + r.height / 2],
      ];
      return {
        x: r.x,
        y: r.y,
        right: r.right,
        bottom: r.bottom,
        width: innerWidth,
        height: innerHeight,
        hits: points.map(([x, y]) => element.contains(document.elementFromPoint(x!, y!))),
      };
    });
    expect(geometry.x).toBeGreaterThanOrEqual(0);
    expect(geometry.y).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.width);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
    expect(geometry.hits).toEqual([true, true, true, true]);
    console.log('DIALOG_CONTROL_BOUNDS', JSON.stringify(geometry));
    await button.focus();
    await expect(button).toBeFocused();
    await button.press('Enter');
    await expect(dialog).toHaveCount(0);
  }
}
