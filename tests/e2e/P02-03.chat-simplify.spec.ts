import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const evidence = resolve('docs/evidence/P02-03/inline-selection-2026-10-21');
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
  test(`P02-03 T22 compact chat, fixed footer and continuous scroller ${width}x${height} at ${zoom * 100} percent`, async () => {
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
    if (width === 1440 && zoom === 2)
      await page.getByLabel('主题', { exact: true }).selectOption('dark');
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
    if (await page.getByRole('button', { name: '展开侧栏', exact: true }).count())
      await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
    const sidebar = page.getByRole('complementary', { name: '侧栏', exact: true });
    await sidebar.locator(`[data-tooltip="${title}"]`).click();
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
    await expect(composer.getByRole('button', { name: '本轮模型', exact: true })).toBeEnabled();
    const add = composer.getByRole('button', { name: '添加附件或引用资料', exact: true });
    await add.click();
    const additions = composer.getByRole('region', { name: '添加附件或引用资料', exact: true });
    await expect(additions.getByRole('button', { name: '添加附件', exact: true })).toBeEnabled();
    await expect(additions.getByRole('button', { name: '@ 引用资料', exact: true })).toBeEnabled();
    const popoverBounds = await additions.boundingBox();
    expect(popoverBounds!.x).toBeGreaterThanOrEqual(0);
    expect(popoverBounds!.y).toBeGreaterThanOrEqual(0);
    expect(popoverBounds!.x + popoverBounds!.width).toBeLessThanOrEqual(width + 1);
    expect(popoverBounds!.y + popoverBounds!.height).toBeLessThanOrEqual(height + 1);
    await page.keyboard.press('Escape');
    await expect(additions).toBeHidden();
    await composer.getByRole('button', { name: '本轮模型', exact: true }).click();
    await composer
      .getByRole('region', { name: '本轮模型', exact: true })
      .getByRole('button', { name: /fixture-model/ })
      .click();
    await expect(composer.getByRole('button', { name: '本轮模型', exact: true })).toContainText(
      'fixture-model',
    );
    if (await page.getByRole('button', { name: '展开侧栏', exact: true }).count())
      await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
    const pin = sidebar.getByRole('button', { name: '置顶' + title, exact: true });
    await pin.hover();
    await expect(page.getByRole('tooltip', { name: '置顶聊天', exact: true })).toBeVisible();
    await pin.click();
    await expect(
      sidebar.getByRole('button', { name: '取消置顶' + title, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    const footer = sidebar.locator('.sidebar-footer');
    await expect(footer).toHaveText('');
    const footerBefore = await footer.boundingBox();
    const scroller = sidebar.locator('.sidebar-scroll');

    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    const brandTop = await sidebar
      .locator('.sidebar-brand')
      .evaluate((el) => el.getBoundingClientRect().top);
    const bounds = (await sidebar.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(
      await sidebar.locator('.sidebar-brand').evaluate((el) => el.getBoundingClientRect().top),
    ).toBeLessThan(brandTop);
    const metrics = await scroller.evaluate((el) => ({
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
    expect(await footer.boundingBox()).toEqual(footerBefore);
    await expect(footer.getByRole('link', { name: '个人资料与设置', exact: true })).toBeInViewport({
      ratio: 0.99,
    });
    await expect(sidebar.getByRole('link', { name: '设置', exact: true })).toBeInViewport({
      ratio: 0.99,
    });
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await writeFile(
      resolve(evidence, `sidebar-${width}x${height}-${zoom * 100}.json`),
      JSON.stringify(metrics, null, 2) + '\n',
    );

    if (zoom === 2) await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
    const input = page.getByRole('textbox', { name: '输入草稿', exact: true });
    const initial = await input.evaluate((el) => el.clientHeight);
    await input.fill(Array.from({ length: 6 }, () => '输入框随内容增高').join('\n'));
    expect(await input.evaluate((el) => el.clientHeight)).toBeGreaterThan(initial);
    await input.fill(Array.from({ length: 80 }, () => '达到高度上限后滚动').join('\n'));
    const capped = await input.evaluate((el) => ({
      height: el.clientHeight,
      max: parseFloat(getComputedStyle(el).maxHeight),
      scroll: el.scrollHeight,
    }));
    expect(capped.height).toBeLessThanOrEqual(capped.max + 1);
    expect(capped.scroll).toBeGreaterThan(capped.height);
    await input.fill('/retained');
    await composer.getByRole('button', { name: '发送', exact: true }).click();
    await expect(input).toHaveValue('保留的常用提示词内容');
    await input.fill('界面精简后的发送回归');
    await composer.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.locator('.chat-message.assistant')).toContainText(
      '隔离测试回复：界面精简后的发送回归',
    );
    await expect(page.locator('.chat-message.user')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '停止', exact: true })).toHaveCount(0);
    const answer = page.locator('.chat-message.assistant').last();
    await page.mouse.move(0, 0);
    await answer.getByRole('button', { name: '复制回复', exact: true }).scrollIntoViewIfNeeded();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.evaluate(() => {
      const rows: unknown[] = [];
      (window as unknown as { hoverDiagnostics: unknown[] }).hoverDiagnostics = rows;
      for (const type of ['pointerover', 'pointerout', 'scroll'])
        document.addEventListener(
          type,
          (event) => {
            const target = event.target instanceof Element ? event.target : null;
            rows.push({
              type,
              target: target?.tagName,
              classes: target?.getAttribute('class'),
              hint: target?.closest('[data-tooltip]')?.getAttribute('data-tooltip'),
              time: performance.now(),
            });
            if (rows.length > 30) rows.shift();
          },
          true,
        );
    });
    try {
      await answer.getByRole('button', { name: '复制回复', exact: true }).hover();
      await expect(page.getByRole('tooltip', { name: '复制回复', exact: true })).toBeVisible();
    } finally {
      console.log(
        'HOVER_DIAGNOSTICS',
        JSON.stringify(
          await page.evaluate(() => ({
            rows: (window as unknown as { hoverDiagnostics: unknown[] }).hoverDiagnostics,
            hovered: [...document.querySelectorAll(':hover')].map((e) => ({
              tag: e.tagName,
              classes: e.getAttribute('class'),
              hint: e.getAttribute('data-tooltip'),
            })),
            tooltip: [...document.querySelectorAll('[role=tooltip]')].map((e) => ({
              text: e.textContent,
              open: e.matches(':popover-open'),
            })),
          })),
        ),
      );
    }
    await answer.getByRole('button', { name: '收藏', exact: true }).click();
    await expect(answer.getByRole('button', { name: '取消收藏', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await answer.getByRole('button', { name: '点赞', exact: true }).click();
    await expect(answer.getByRole('button', { name: '点赞', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await answer.getByRole('button', { name: '更多消息操作', exact: true }).click();
    const more = answer.getByRole('region', { name: '更多消息操作', exact: true });
    await expect(more.getByRole('button', { name: '删除消息', exact: true })).toBeVisible();
    const moreBounds = await more.boundingBox();
    expect(moreBounds!.x).toBeGreaterThanOrEqual(0);
    expect(moreBounds!.y).toBeGreaterThanOrEqual(0);
    expect(moreBounds!.x + moreBounds!.width).toBeLessThanOrEqual(width + 1);
    expect(moreBounds!.y + moreBounds!.height).toBeLessThanOrEqual(height + 1);
    await page.keyboard.press('Escape');
    const inputHeight = await input.evaluate((el) => el.clientHeight);
    expect(inputHeight).toBeLessThanOrEqual(initial);
    await composer.scrollIntoViewIfNeeded();
    const spacing = await page.locator('.chat-surface').evaluate((el) => {
      const controls = el.querySelector('.conversation-controls')!.getBoundingClientRect();
      const main = el.closest('main')!.getBoundingClientRect();
      const progress = el.querySelector('.chat-progress')!.getBoundingClientRect();
      const composer = el.querySelector('.composer')!.getBoundingClientRect();
      return {
        top:
          controls.top -
          main.top +
          el.closest('main')!.scrollTop * (main.width / el.closest('main')!.offsetWidth),
        gap: composer.top - progress.bottom,
      };
    });
    expect(spacing.top).toBeLessThanOrEqual(14 * zoom);
    expect(spacing.gap).toBeLessThanOrEqual(8 * zoom + 1);
    const row = await composer.locator('.composer-bar').evaluate((el) => ({
      width: el.clientWidth,
      scrollWidth: el.scrollWidth,
      tops: [...el.children].map((child) => child.getBoundingClientRect().top),
    }));
    expect(row.scrollWidth).toBeLessThanOrEqual(row.width + 1);
    const lowerGap = await composer.evaluate(
      (el) =>
        el.getBoundingClientRect().bottom -
        el.querySelector('.composer-bar')!.getBoundingClientRect().bottom,
    );
    expect(lowerGap).toBeLessThanOrEqual(8 * zoom);
    const footerHeight = footerBefore!.height;
    expect(footerHeight).toBeLessThanOrEqual(38 * zoom);

    expect(Math.max(...row.tops) - Math.min(...row.tops)).toBeLessThanOrEqual(5);
    await page.screenshot({
      path: resolve(evidence, `chat-${width}x${height}-${zoom * 100}.png`),
      animations: 'disabled',
    });
  });
}
