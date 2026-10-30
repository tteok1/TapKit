import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from './test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { openSessionFixture } from './session-fixture';
let app: ElectronApplication, page: Page, dir: string;
test('P05-02 T22 recipient preview remains usable in light/dark and 960px at app 200 percent zoom', async () => {
  await openSessionFixture(page);
  await send('中文导出布局检查');
  for (const [theme, zoom, width] of [
    ['light', 1, 1440],
    ['dark', 1, 960],
    ['dark', 2, 960],
  ] as const) {
    await page.evaluate(
      async ({ theme, zoom }) => {
        const id = () => {
          const value = crypto.randomUUID();
          return value.slice(0, 14) + '7' + value.slice(15);
        };
        const b = await window.tapkit.bootstrap({ requestId: id() });
        if (!b.ok || !('profile' in b.data)) throw Error('bootstrap');
        const saved = await window.tapkit.setSettings(
          { requestId: id(), expectedRevision: b.data.settings.revision },
          {
            scope: { type: 'profile', id: b.data.profile.id },
            patch: { desktop: { ...b.data.settings.values.desktop, theme, zoom } },
          },
        );
        if (!saved.ok) throw Error(saved.error.code);
      },
      { theme, zoom },
    );
    await app.evaluate(
      ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]!.setContentSize(width, 900),
      width,
    );
    await page.getByRole('button', { name: '导出分享副本', exact: true }).click();
    const d = page.getByRole('dialog', { name: '导出分享副本', exact: true });
    const close = d.getByRole('button', { name: '关闭分享预览' });
    await close.scrollIntoViewIfNeeded();
    await close.evaluate((element) => element.scrollIntoView({ block: 'end' }));
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const closeBox = await close.boundingBox();
    expect(closeBox).not.toBeNull();
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    expect(closeBox!.x).toBeGreaterThanOrEqual(0);
    expect(closeBox!.y).toBeGreaterThanOrEqual(0);
    expect(closeBox!.x + closeBox!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(closeBox!.y + closeBox!.height).toBeLessThanOrEqual(viewport.height + 1);
    const bounds = await d.evaluate((element) => {
      const r = element.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        right: r.right,
        bottom: r.bottom,
        width: innerWidth,
        height: innerHeight,
      };
    });
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.height + 1);
    const png = await app.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0]!.capturePage()).toPNG().toString('base64'),
    );
    await writeFile(
      `docs/evidence/P05-02/desktop/${theme}-${width}-${zoom}.png`,
      Buffer.from(png, 'base64'),
    );
    await close.click();
    await expect(d).toHaveCount(0);
  }
});
test.beforeEach(async () => {
  await mkdir('.test-data', { recursive: true });
  dir = await mkdtemp(resolve('.test-data', 'P05-02 Electron synthetic '));
  await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  await mkdir('docs/evidence/P05-02/desktop', { recursive: true });
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
      (r): r is [string, string] => r[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
});
test.afterEach(async () => {
  await app?.close();
});
async function send(text: string) {
  await page.getByLabel('输入草稿').fill(text);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.chat-message.assistant').last()).toContainText('隔离测试回复');
  await expect(page.getByRole('button', { name: '停止', exact: true })).toHaveCount(0);
}
async function save(format: string, filename: string) {
  const dialog = page.getByRole('dialog', { name: '导出分享副本', exact: true });
  await dialog.getByLabel('导出格式', { exact: true }).selectOption(format);
  await dialog.getByRole('button', { name: '重新生成预览' }).click();
  await expect(dialog.getByRole('button', { name: '选择位置并导出' })).toBeEnabled();
  const target = join(dir, filename);
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, target);
  await dialog.getByRole('button', { name: '选择位置并导出' }).click();
  await expect(dialog.getByRole('status')).toContainText('副本已保存', { timeout: 60000 });
  await expect(dialog.getByRole('progressbar', { name: '导出进度' })).toHaveAttribute(
    'value',
    '100',
  );
  return target;
}
test('P05-02 T20 recipient preview and MD/TXT/HTML/PDF/ZIP save use a private Host destination and truthful progress', async () => {
  test.setTimeout(180000);
  await openSessionFixture(page);
  await send(
    '用于分享的中文正文。api_key=sk-synthetic-export-secret C:\\Users\\Synthetic\\private.txt',
  );
  // The background title is part of the reviewed source revision; let it finish before previewing.
  await expect(
    page.getByRole('button', { name: /^隔离测试回复：用于分享的中文正文/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: '导出分享副本', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '导出分享副本', exact: true });
  await expect(dialog).toContainText('发送后不能撤销');
  await expect(dialog.getByLabel('接收者可见正文')).not.toContainText('sk-synthetic-export-secret');
  await expect(dialog).toContainText('不包含附件文件');
  await page.screenshot({ path: 'docs/evidence/P05-02/desktop/recipient-preview.png' });
  for (const format of ['md', 'txt', 'html', 'pdf', 'zip']) {
    const path = await save(format, '分享.' + format),
      bytes = await readFile(path);
    expect(bytes.length).toBeGreaterThan(10);
    if (format === 'pdf') {
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      await writeFile('docs/evidence/P05-02/exported/conversation.pdf', bytes);
    } else if (format !== 'zip') {
      expect(bytes.toString()).toContain('中文');
      expect(bytes.toString()).not.toContain('sk-synthetic-export-secret');
      expect(bytes.toString()).not.toContain('C:\\Users');
    }
  }
  await dialog.getByRole('button', { name: '关闭分享预览' }).click();
  await page.getByRole('button', { name: '导出分享副本', exact: true }).click();
  await page
    .getByRole('dialog', { name: '导出分享副本' })
    .getByText('最近导出记录', { exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: '导出分享副本' })).toContainText('副本已保存');
});
