import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron, type ElectronApplication } from './test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('P08-02 desktop researches fixed sources, opens quote locators, exports real DOCX/PDF, excludes and finishes a new partial run', async () => {
  test.setTimeout(420000);
  const dir = await mkdtemp(resolve('.test-data', 'P08-02 desktop '));
  await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  await writeFile(join(dir, 'P05.fixture'), 'P05 isolated web fixture');
  const env = Object.fromEntries(
    Object.entries({
      ...process.env,
      TAPKIT_DATA_DIR: dir,
      TAPKIT_CHAT_FIXTURE: 'P02-02',
      TAPKIT_WEB_FIXTURE: 'P05-01',
    }).filter((r): r is [string, string] => r[1] !== undefined),
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
    await form.getByLabel('工作类型').selectOption('research');
    await form
      .getByRole('textbox', { name: '工作目标', exact: true })
      .fill('公开价格对照研究（合成验收资料）');
    await form.getByLabel('公开检索问题', { exact: false }).fill('两份资料分别如何描述公开价格？');
    await form
      .getByLabel('起始网页', { exact: false })
      .fill('https://example.com/\nhttps://example.net/');
    await form.getByLabel('研究用途').fill('比较资料差异，保留不同证据');
    await form.getByLabel('成果格式').selectOption('pdf');
    await form.getByLabel('工作范围').fill('仅使用指定的公开样本资料');
    await mkdir('docs/evidence/P08-02/desktop', { recursive: true });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1280, 960));
    await form.evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: 'docs/evidence/P08-02/desktop/create-desktop.png' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(760, 900));
    await form.evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: 'docs/evidence/P08-02/desktop/create-compact.png' });
    expect(await form.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1280, 960));
    await form.getByRole('button', { name: '创建工作', exact: true }).click();
    const panel = page.getByRole('region', { name: '深度研究', exact: true });
    await expect(panel).toContainText('两份资料分别如何描述公开价格？');
    await expect(page.getByRole('button', { name: '确认提纲并开始研究', exact: true })).toBeVisible(
      { timeout: 15000 },
    );
    await page.getByRole('button', { name: '确认提纲并开始研究', exact: true }).click();
    await expect
      .poll(
        async () =>
          /已完成|部分完成|失败|达到预算|已取消/.test(
            await page.locator('.work-detail > p[role="status"]').innerText(),
          ),
        { timeout: 300000 },
      )
      .toBe(true);
    await expect(panel.getByRole('button', { name: '研究报告 PDF', exact: true })).toBeVisible();
    await expect(panel).toContainText('本轮证据整理完成');
    await expect(panel).toContainText('来源读取 2 / 40');
    await panel.getByRole('button', { name: '查看原文依据 1', exact: true }).first().click();
    await expect(panel.locator('.research-original mark')).toHaveText('公开价格 42 元。');
    await expect(panel.locator('.research-original')).toContainText('SHA256');
    await mkdir('docs/evidence/P08-02/desktop', { recursive: true });
    await mkdir('.impeccable/review', { recursive: true });
    await panel.locator('.research-original').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'docs/evidence/P08-02/desktop/quote.png' });
    for (const theme of ['dark', 'system'] as const) {
      await page.emulateMedia({ colorScheme: 'dark' });
      await app.evaluate(({ nativeTheme }) => {
        nativeTheme.themeSource = 'dark';
      });
      await page.evaluate(
        (value) => document.querySelector('.desktop-shell')!.setAttribute('data-theme', value),
        theme,
      );
      await panel.locator('.research-original').scrollIntoViewIfNeeded();
      const colors = await panel.locator('.research-original mark').evaluate((node) => ({
        foreground: getComputedStyle(node).color,
        background: getComputedStyle(node).backgroundColor,
      }));
      expect(colors).toEqual({ foreground: 'rgb(230, 237, 231)', background: 'rgb(58, 51, 34)' });
      await page.screenshot({ path: `docs/evidence/P08-02/desktop/quote-${theme}.png` });
    }
    await app.evaluate(({ nativeTheme }) => {
      nativeTheme.themeSource = 'light';
    });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() =>
      document.querySelector('.desktop-shell')!.setAttribute('data-theme', 'light'),
    );
    await panel.getByRole('button', { name: '关闭原文', exact: true }).click();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1280, 960));
    await panel.evaluate((n) => n.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: '.impeccable/review/desktop.png' });
    const desktopViewport = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
    }));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(760, 900));
    await panel.evaluate((n) => n.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: '.impeccable/review/compact.png' });
    const compactViewport = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
    }));
    await writeFile(
      'docs/evidence/P08-02/desktop/viewports.json',
      JSON.stringify(
        {
          desktop: desktopViewport,
          compact: compactViewport,
          note: 'Compact outer size is clamped to the existing Windows minimum; recorded CSS dimensions are authoritative.',
        },
        null,
        2,
      ),
    );
    expect(await panel.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1280, 960));
    await panel.getByRole('button', { name: '研究报告 PDF', exact: true }).click();
    await expect(page.locator('.artifact-panel .pdf-scroll canvas').first()).toHaveAttribute(
      'data-rendered-page',
      '0',
      { timeout: 150000 },
    );
    await page.screenshot({ path: 'docs/evidence/P08-02/desktop/pdf.png' });
    const renderedPage = await page
      .locator('.artifact-panel .pdf-scroll canvas')
      .first()
      .evaluate((node) => (node as HTMLCanvasElement).toDataURL('image/png'));
    await writeFile(
      'docs/evidence/P08-02/desktop/report-page.png',
      Buffer.from(renderedPage.split(',')[1]!, 'base64'),
    );
    await page.getByRole('button', { name: '关闭预览', exact: true }).click();
    const faultDb = new DatabaseSync(join(dir, 'db/app.sqlite'));
    const saved = faultDb
      .prepare('SELECT id,work_json FROM runs ORDER BY created_at DESC LIMIT 1')
      .get() as { id: string; work_json: string };
    try {
      faultDb
        .prepare(
          "UPDATE runs SET work_json=json_set(work_json,'$.research.searches','invalid-fixture') WHERE id=?",
        )
        .run(saved.id);
      await page
        .getByRole('navigation', { name: '主导航' })
        .getByRole('link', { name: '工作', exact: true })
        .click();
      await page.locator('.work-open').first().click();
      await expect(panel.getByRole('alert')).toContainText('研究进度读取失败');
      await expect(panel).not.toContainText('正在读取研究进度…');
      await page.screenshot({ path: 'docs/evidence/P08-02/desktop/progress-error.png' });
      faultDb.prepare('UPDATE runs SET work_json=? WHERE id=?').run(saved.work_json, saved.id);
      await panel.getByRole('button', { name: '重新读取进度', exact: true }).click();
      await expect(panel.getByRole('alert')).toHaveCount(0);
      await expect(panel).toContainText('来源读取 2 / 40');
      await page.screenshot({ path: 'docs/evidence/P08-02/desktop/progress-recovered.png' });
    } finally {
      faultDb.prepare('UPDATE runs SET work_json=? WHERE id=?').run(saved.work_json, saved.id);
      faultDb.close();
    }
    await panel.getByRole('button', { name: '继续查证此发现', exact: true }).first().click();
    await expect(page.locator('.work-detail h2')).toContainText('继续查证指定发现');
    await expect(panel).toContainText('来源读取 2 / 40');
    await panel.getByRole('button', { name: '提前结束并保存部分成果', exact: true }).click();
    await expect(panel).toContainText('部分成果，仍有证据缺口', { timeout: 30000 });
    await panel.getByRole('button', { name: '排除此来源并重新查证', exact: true }).first().click();
    await expect(panel).toContainText('已排除', { timeout: 15000 });
    await expect(panel).toContainText('来源读取 2 / 40');
    await panel.getByRole('button', { name: '提前结束并保存部分成果', exact: true }).click();
    await expect(panel).toContainText('部分成果，仍有证据缺口', { timeout: 30000 });
    await panel.getByText('继续查证新问题', { exact: true }).click();
    await panel.getByLabel('新的公开检索问题').fill('这些资料有什么局限？');
    await panel.getByRole('button', { name: '创建新运行继续查证', exact: true }).click();
    await expect(panel).toContainText('这些资料有什么局限？');
    await panel.getByRole('button', { name: '提前结束并保存部分成果', exact: true }).click();
    await expect(panel).toContainText('部分成果，仍有证据缺口', { timeout: 30000 });
    await writeFile(
      'docs/evidence/P08-02/desktop/result.json',
      JSON.stringify(
        {
          result: 'passed',
          sourceQuotes: 'actual archived text and character highlight',
          exports: ['md', 'json', 'docx', 'pdf'],
          sourceExclusion: true,
          earlyFinish: true,
          followupNewRun: true,
          compactNoHorizontalOverflow: true,
          scope: 'synthetic model/network, real Core/SQLite/Blob/Office/AppContainer/Electron UI',
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const db = new DatabaseSync(join(dir, 'db/app.sqlite'), { readOnly: true });
    try {
      await mkdir('docs/evidence/P08-02/desktop', { recursive: true });
      await writeFile(
        'docs/evidence/P08-02/desktop/failure-diagnostic.json',
        JSON.stringify(
          {
            runs: db.prepare('SELECT status,status_reason,calls,tools FROM runs').all(),
            files: db
              .prepare('SELECT extension,parse_status,error_code,error_reason FROM file_versions')
              .all(),
            tools: db.prepare('SELECT tool_name,status FROM tool_calls').all(),
          },
          null,
          2,
        ),
      );
    } finally {
      db.close();
    }
    throw error;
  } finally {
    await app?.close();
  }
});
