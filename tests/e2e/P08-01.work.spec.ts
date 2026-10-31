import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron, type ElectronApplication } from './test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { WorkReplySchema } from '../../packages/contracts/src';

test('P08-01 desktop work observes, fills, reviews one submit, exports material and finishes a verified deliverable', async () => {
  test.setTimeout(240000);
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P08-01 desktop '));
  await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  await writeFile(join(dir, 'P08-01.fixture'), 'P08-01 isolated browser fixture');
  const env = Object.fromEntries(
    Object.entries({
      ...process.env,
      TAPKIT_DATA_DIR: dir,
      TAPKIT_CHAT_FIXTURE: 'P02-02',
      TAPKIT_BROWSER_FIXTURE: 'P08-01',
    }).filter((row): row is [string, string] => row[1] !== undefined),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
    const page = await app.firstWindow();
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
    await page.getByRole('link', { name: '工作', exact: true }).click();
    await page.getByRole('button', { name: '新建工作', exact: true }).click();
    const form = page.getByRole('form', { name: '新建工作' });
    await form
      .getByLabel('工作目标')
      .fill('P08-01合成浏览 打开网页、填写备注、经审批提交后保存结果');
    await form.getByLabel('允许此工作使用匿名浏览器').check();
    await form.getByRole('button', { name: '创建工作', exact: true }).click();
    const browser = page.getByRole('region', { name: '匿名浏览器', exact: true });
    await expect(browser.getByRole('button', { name: '批准本次提交', exact: true })).toBeVisible({
      timeout: 60000,
    });
    await expect(browser).toContainText('P08合成字段');
    const stateBefore = await app.evaluate(
      () =>
        (globalThis as unknown as { tapkitBrowserWebFixture: { records: string[] } })
          .tapkitBrowserWebFixture.records.length,
    );
    expect(stateBefore).toBe(0);
    await browser.getByLabel('网页地址', { exact: true }).fill('https://example.com/next');
    await browser.getByRole('button', { name: '打开新标签', exact: true }).click();
    await expect(browser.getByRole('tab', { name: '下一页', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await browser.getByRole('button', { name: '手动接管', exact: true }).click();
    await expect(browser).toContainText('你已接管');
    await expect(browser.getByRole('button', { name: '后退', exact: true })).toBeDisabled();
    await browser.getByRole('button', { name: '交回 Agent', exact: true }).click();
    await expect(browser).toContainText('Agent 操作中');
    await browser.getByRole('button', { name: '关闭标签', exact: true }).click();
    await browser.getByRole('tab', { name: '匿名浏览器验收', exact: true }).click();
    await browser.getByRole('button', { name: '复制地址', exact: true }).click();
    expect(
      await app.evaluate(
        () =>
          (globalThis as unknown as { tapkitBrowserWebFixture: { copiedText: string } })
            .tapkitBrowserWebFixture.copiedText,
      ),
    ).toBe('https://example.com/');
    const nativeAttached = () =>
      app!.evaluate(
        () =>
          [
            ...(
              globalThis as unknown as {
                tapkitBrowserRuntime: { tabs: Map<string, { window?: unknown }> };
              }
            ).tapkitBrowserRuntime.tabs.values(),
          ].filter((t) => t.window).length,
      );
    const viewport = browser.locator('.browser-viewport');
    await viewport.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    await expect.poll(nativeAttached).toBe(1);
    await page
      .locator('.screen-scroll')
      .first()
      .evaluate((node) => {
        const frame = node.querySelector('.browser-viewport')!;
        node.scrollTop += frame.getBoundingClientRect().top - node.getBoundingClientRect().top + 12;
      });
    await expect.poll(nativeAttached).toBe(0);
    await viewport.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    await expect.poll(nativeAttached).toBe(1);
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect.poll(nativeAttached).toBe(0);
    await mkdir('docs/evidence/P08-01/desktop', { recursive: true });
    await page.screenshot({ path: 'docs/evidence/P08-01/desktop/modal.png' });
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect.poll(nativeAttached).toBe(1);
    await writeFile(
      'docs/evidence/P08-01/desktop/geometry.json',
      JSON.stringify(
        {
          scrollportClippingHidesNative: true,
          appModalHidesNative: true,
          restoresAfterModal: true,
        },
        null,
        2,
      ),
    );
    await browser.getByRole('button', { name: '将当前网页作为任务材料', exact: true }).click();
    await expect(browser).toContainText('网页材料已保存');
    await mkdir('docs/evidence/P08-01/desktop', { recursive: true });
    await viewport.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    await expect.poll(nativeAttached).toBe(1);
    const actualPage = await app.evaluate(async () => {
      const runtime = (
        globalThis as unknown as {
          tapkitBrowserRuntime: {
            tabs: Map<string, { view: { webContents: Electron.WebContents } }>;
          };
        }
      ).tapkitBrowserRuntime;
      const tab = [...runtime.tabs.values()][0]!;
      const image = await Promise.race([
        tab.view.webContents.capturePage(),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(Error('SCREENSHOT_TIMEOUT')), 6000),
        ),
      ]);
      return image.toPNG().toString('base64');
    });
    expect(Buffer.from(actualPage, 'base64').length).toBeGreaterThan(1000);
    await writeFile(
      'docs/evidence/P08-01/desktop/current-web-page.png',
      Buffer.from(actualPage, 'base64'),
    );
    await browser.evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: 'docs/evidence/P08-01/desktop/review.png' });
    await app.evaluate(async () => {
      const tab = [
        ...(
          globalThis as unknown as {
            tapkitBrowserRuntime: {
              tabs: Map<string, { view: { webContents: Electron.WebContents } }>;
            };
          }
        ).tapkitBrowserRuntime.tabs.values(),
      ][0]!;
      await tab.view.webContents.executeJavaScript(
        "document.querySelector('input[name=note]').value='已改变的页面字段'",
      );
    });
    await browser.getByRole('button', { name: '批准本次提交', exact: true }).click();
    await expect(browser.getByRole('alert')).toContainText('页面已变化');
    await page.screenshot({ path: 'docs/evidence/P08-01/desktop/stale.png' });
    await browser.getByRole('alert').getByRole('button', { name: '重新观察', exact: true }).click();
    await expect(browser.getByRole('alert')).toHaveCount(0);
    const refreshed = await page.evaluate(async () => {
      const id = crypto.randomUUID(),
        options = { requestId: id.slice(0, 14) + '7' + id.slice(15) };
      const works = await window.tapkit.workCommand(options, 'runs.list', {});
      if (!works.ok || !('workItems' in works.data)) throw Error('works');
      const work = works.data.workItems[0]!;
      const next = crypto.randomUUID();
      const tabs = await window.tapkit.browserCommand(
        { requestId: next.slice(0, 14) + '7' + next.slice(15) },
        'browser.tabs',
        { runId: work.runId },
      );
      if (!tabs.ok || !('tabs' in tabs.data)) throw Error('tabs');
      const changed = tabs.data.tabs.some((t) =>
        t.snapshot?.nodes.some((n) => n.name === '备注' && n.value === '已改变的页面字段'),
      );
      const resume = crypto.randomUUID();
      const reply = await window.tapkit.workCommand(
        {
          requestId: resume.slice(0, 14) + '7' + resume.slice(15),
          expectedRevision: work.revision,
        },
        'runs.resume',
        { runId: work.runId },
      );
      if (!reply.ok) throw Error(reply.error.code);
      return changed;
    });
    expect(refreshed).toBe(true);
    await expect(browser.getByRole('button', { name: '批准本次提交', exact: true })).toBeVisible({
      timeout: 60000,
    });
    await browser
      .getByRole('region', { name: '待审阅的网页提交', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'docs/evidence/P08-01/desktop/approval.png' });
    await browser.getByRole('button', { name: '批准本次提交', exact: true }).click();
    await expect(page.locator('.work-detail')).toContainText('已完成', { timeout: 60000 });
    const final = await page.evaluate(async () => {
      const value = crypto.randomUUID();
      const reply = await window.tapkit.workCommand(
        { requestId: value.slice(0, 14) + '7' + value.slice(15) },
        'runs.list',
        {},
      );
      if (!reply.ok) throw Error(reply.error.code);
      return reply.data;
    });
    const data = WorkReplySchema.parse(final);
    if (!('workItems' in data)) throw Error('works');
    const work = data.workItems[0]!;
    expect(work.status).toBe('completed');
    expect(work.calls).toBe(6);
    expect(work.tools).toBe(5);
    expect(work.steps[0]?.artifactFormats).toContain('md');
    const records = await app.evaluate(
      () =>
        (
          globalThis as unknown as {
            tapkitBrowserWebFixture: { records: string[]; unauthorizedWrites: number };
          }
        ).tapkitBrowserWebFixture,
    );
    expect(records.records).toHaveLength(1);
    expect(records.records[0]).toContain('note=P08');
    expect(records.unauthorizedWrites).toBe(0);
    await page.screenshot({ path: 'docs/evidence/P08-01/desktop/completed.png' });
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.setSize(760, 900);
    });
    await expect(browser).toBeVisible();
    await browser.evaluate((node) => node.scrollIntoView({ block: 'start' }));
    const overflow = await browser.evaluate((node) => node.scrollWidth > node.clientWidth + 1);
    expect(overflow).toBe(false);
    await page.screenshot({ path: 'docs/evidence/P08-01/desktop/compact.png' });
    await writeFile(
      'docs/evidence/P08-01/desktop/work.json',
      JSON.stringify(
        {
          scope: 'actual Electron/Host/Core/Chromium and SQLite; synthetic model and public origin',
          status: work.status,
          calls: work.calls,
          tools: work.tools,
          recordCount: records.records.length,
          unauthorizedWrites: records.unauthorizedWrites,
          selectedMaterialSaved: true,
          staleRecoveryObservedActualPage: true,
          nativeGeometryChecked: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await app?.close();
  }
});
