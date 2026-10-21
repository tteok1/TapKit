import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const evidence = resolve('docs/evidence/P02-03/chat-simplify-2026-10-21');
const newId = () => {
  const id = randomUUID();
  return id.slice(0, 14) + '7' + id.slice(15);
};
let app: ElectronApplication | undefined;
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
  test(`P02-03 T22 simplified chat and one sidebar scroller ${width}x${height} at ${zoom * 100} percent`, async () => {
    test.setTimeout(180_000);
    await mkdir('.test-data', { recursive: true });
    await mkdir(evidence, { recursive: true });
    const dir = await mkdtemp(resolve('.test-data/P02-03 simplified chat '));
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
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', {
      timeout: 125_000,
    });
    await app.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(...size),
      [width, height] as [number, number],
    );
    await page.getByRole('link', { name: '设置', exact: true }).click();
    await page.getByLabel('缩放', { exact: true }).selectOption(String(zoom));
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    const title = '界面精简会话 0';
    const ids = await page.evaluate(
      async ({ requests, snippetId }) => {
        const ids: string[] = [];
        for (let i = 0; i < 40; i++) {
          const r = await window.tapkit.desktopCommand(
            { requestId: requests[i]! },
            'sessions.create',
            { mode: 'chat', title: '界面精简会话 ' + i },
          );
          if (!r.ok || !('entityId' in r.data)) throw new Error('CREATE_FAILED');
          ids.push(r.data.entityId);
        }
        const saved = await window.tapkit.chatCommand(
          { requestId: requests[40]! },
          'chat.snippets.set',
          { snippets: [{ id: snippetId, name: 'retained', text: '保留的常用提示词内容' }] },
        );
        if (!saved.ok) throw new Error(saved.error.code);
        window.dispatchEvent(new Event('tapkit:history-changed'));
        return ids;
      },
      { requests: Array.from({ length: 41 }, newId), snippetId: newId() },
    );
    const sidebar = page.getByRole('complementary', { name: '侧栏', exact: true });
    await sidebar.getByTitle(title, { exact: true }).click();
    await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', ids[0]!);
    await expect(page.locator('.workspace-title')).toHaveText(title);
    await expect(page.locator('.session-welcome')).toHaveCount(0);
    await expect(
      page.locator('main').getByRole('heading', { name: title, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText('聊天记录保存在本机；回复期间可继续输入、排队或停止。', { exact: true }),
    ).toHaveCount(0);
    const composer = page.locator('.composer');
    await expect(composer.locator('label[for="draft-input"]')).toHaveCount(0);
    await expect(composer.getByText('输入草稿', { exact: true })).toHaveCount(0);
    await expect(composer.getByText('模式', { exact: true })).toHaveCount(0);
    await expect(composer.getByText('输入操作', { exact: true })).toHaveCount(0);
    await expect(composer.getByText('常用提示词', { exact: true })).toHaveCount(0);
    await expect(composer.getByLabel('本轮模型')).toBeEnabled();
    await expect(composer.getByRole('button', { name: '添加附件', exact: true })).toBeEnabled();

    await sidebar.evaluate((el) => {
      el.scrollTop = 0;
    });
    const brandTop = await sidebar
      .locator('.sidebar-brand')
      .evaluate((el) => el.getBoundingClientRect().top);
    const bounds = (await sidebar.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => sidebar.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(
      await sidebar.locator('.sidebar-brand').evaluate((el) => el.getBoundingClientRect().top),
    ).toBeLessThan(brandTop);
    const metrics = await sidebar.evaluate((el) => ({
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      nestedScrollers: [...el.querySelectorAll('*')]
        .filter(
          (child) =>
            ['auto', 'scroll'].includes(getComputedStyle(child).overflowY) &&
            child.scrollHeight > child.clientHeight + 1,
        )
        .map((child) => child.className),
      historyScrollTop: el.querySelector('.history')!.scrollTop,
      savedScroll: JSON.parse(localStorage.getItem('tapkit.layout.' + window.tapkit.windowSlot)!)
        .sidebarScroll,
    }));
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    expect(metrics.nestedScrollers).toEqual([]);
    expect(metrics.historyScrollTop).toBe(0);
    expect(metrics.savedScroll).toBeGreaterThan(0);
    await sidebar.getByRole('link', { name: '设置', exact: true }).scrollIntoViewIfNeeded();
    await expect(sidebar.getByRole('link', { name: '设置', exact: true })).toBeInViewport({
      ratio: 0.99,
    });
    await sidebar.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({
      path: resolve(evidence, `chat-${width}x${height}-${zoom * 100}.png`),
      animations: 'disabled',
    });
    await writeFile(
      resolve(evidence, `sidebar-${width}x${height}-${zoom * 100}.json`),
      JSON.stringify(metrics, null, 2) + '\n',
    );

    const input = page.getByRole('textbox', { name: '输入草稿', exact: true });
    await input.fill('/retained');
    await composer.getByRole('button', { name: '发送', exact: true }).click();
    await expect(input).toHaveValue('保留的常用提示词内容');
    await input.fill('界面精简后的发送回归');
    await composer.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.locator('.chat-message.assistant')).toContainText(
      '隔离测试回复：界面精简后的发送回归',
    );
    await expect(page.locator('.chat-message.user')).toHaveCount(1);
  });
}
