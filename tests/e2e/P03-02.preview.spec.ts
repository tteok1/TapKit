import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdir, mkdtemp, readFile, cp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
let app: ElectronApplication | undefined;
const evidence = resolve('docs/evidence/P03-02');
type FileId = { fileId: string; versionId: string };
type Fixtures = {
  pdf: FileId;
  oldPdf: FileId;
  pdfSamples: FileId[];
  markdown: FileId;
  code: FileId;
  oldCode: FileId;
  sheet: FileId;
  csv: FileId;
  zip: FileId;
  image: FileId;
  sessionId: string;
  badPdf: FileId;
  svg: FileId;
};
test.afterEach(async () => {
  await app?.close();
  app = undefined;
});
async function rootDir(name: string) {
  await mkdir('.test-data', { recursive: true });
  await mkdir(evidence, { recursive: true });
  return mkdtemp(resolve('.test-data', 'P03-02 ' + name + ' '));
}
async function seed() {
  const root = await rootDir('portable UI'),
    bundle = join(root, 'bundle'),
    node = resolve('.runtime/node/node-v24.21.0-win-x64/node.exe');
  await promisify(execFile)(
    node,
    [
      resolve('node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      'tests/fixtures/P03-preview.vite.config.ts',
      '--outDir',
      bundle,
    ],
    { windowsHide: true, timeout: 30000 },
  );
  await promisify(execFile)(node, [join(bundle, 'preview.cjs'), root], {
    windowsHide: true,
    timeout: 30000,
  });
  return {
    root,
    fixtures: JSON.parse(await readFile(join(root, 'fixtures.json'), 'utf8')) as Fixtures,
  };
}
async function launch(root: string) {
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: join(root, 'profile') }).filter(
      (item): item is [string, string] => item[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
  return page;
}
const panelFor = (page: Page) => page.getByRole('region', { name: '文件预览', exact: true });
async function closeNarrowDetail(page: Page) {
  const detail = page.locator('.detail-panel');
  if (
    (await detail.count()) &&
    (await detail.evaluate((element) => getComputedStyle(element).position === 'absolute'))
  ) {
    // The specified narrow layout uses a drawer. Follow its real close action
    // before choosing another library item; retain all existing viewer tabs.
    await detail.getByRole('button', { name: '关闭详情', exact: true }).click();
    await expect(detail).toHaveCount(0);
  }
}
async function open(page: Page, file: FileId) {
  await closeNarrowDetail(page);
  await page.getByRole('link', { name: '文件', exact: true }).click();
  await page
    .locator('#file-' + file.fileId)
    .getByRole('button', { name: '排版预览', exact: true })
    .click();
  await expect(panelFor(page).locator('.viewer-file')).toHaveAttribute(
    'data-viewer-version',
    file.versionId,
  );
}
async function rendered(page: Page, index: number) {
  await expect(panelFor(page).locator('.pdf-scroll canvas')).toHaveAttribute(
    'data-rendered-page',
    String(index),
  );
}
async function snapshot(page: Page, name: string) {
  // Fit the actual page inside its scroll viewport before capturing the browser,
  // rather than accepting a canvas screenshot clipped by an ancestor.
  const canvas = panelFor(page).locator('.pdf-scroll canvas'),
    control = panelFor(page).getByRole('combobox', { name: '缩放', exact: true });
  const before = await canvas.evaluate((c) => (c as HTMLCanvasElement).width),
    zoom = Number(await control.inputValue());
  await control.selectOption('0.5');
  await expect
    .poll(() => canvas.evaluate((c) => (c as HTMLCanvasElement).width))
    .toBe(Math.ceil((before * 0.5) / zoom));
  await expect(panelFor(page).locator('.pdf-scroll canvas')).toHaveAttribute(
    'data-rendered-page',
    /\d+/,
  );
  await panelFor(page)
    .locator('.pdf-scroll canvas')
    .screenshot({ path: join(evidence, name + '.png') });
}

test('P03-02 Electron pins inline historical refs, remembers PDF/code positions and previews safe Markdown plus real diffs', async () => {
  test.setTimeout(120000);
  const { root, fixtures: f } = await seed(),
    page = await launch(root),
    panel = panelFor(page);
  await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1100, 850));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, f.pdf);
  await rendered(page, 0);
  await expect(panel.getByRole('button', { name: '上一页', exact: true })).toBeDisabled();
  await panel.getByLabel('页码', { exact: true }).fill('3');
  await rendered(page, 2);
  await expect(panel.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
  await open(page, f.markdown);
  await expect(panel.getByRole('heading', { name: '阅读标题' })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'forbidden'))).toBeUndefined();
  expect(await panel.locator('script').count()).toBe(0);
  expect(await panel.locator('a[href^="javascript:"]').count()).toBe(0);
  await panel.getByRole('tab', { name: '预览材料.pdf · v2', exact: true }).click();
  await rendered(page, 2);
  await open(page, f.code);
  await expect(panel.locator('.viewer-source article')).toHaveCount(100);
  await expect(panel.locator('.viewer-source pre').first()).toContainText('line1 = 42');
  await panel.getByRole('button', { name: '下一段', exact: true }).click();
  await expect(panel.locator('.viewer-source pre').first()).toContainText('line101');
  await panel.getByRole('tab', { name: '阅读.md · v1', exact: true }).click();
  await panel.getByRole('tab', { name: '长代码.ts · v2', exact: true }).click();
  await expect(panel.locator('.viewer-source pre').first()).toContainText('line101');
  await panel.getByRole('button', { name: '版本差异', exact: true }).click();
  await expect(panel.locator('.diff-removed').first()).toContainText('line1 = 1');
  await expect(panel.locator('.diff-added').first()).toContainText('line1 = 42');
  await expect(panel.locator('.viewer-diff pre')).toHaveCount(100);
  await page.getByRole('button', { name: /^预览固定版本会话 / }).click();
  await closeNarrowDetail(page);
  await page.getByText('引用资料（1）', { exact: true }).click();
  await page.locator('.inline-file-card summary').click();
  await expect(page.locator('.inline-file-card pre')).toContainText('Historical PDF text marker');
  await page.getByRole('button', { name: '在右侧展开', exact: true }).click();
  await rendered(page, 2);
  await expect(panel.locator('.viewer-file')).toHaveAttribute(
    'data-viewer-version',
    f.oldPdf.versionId,
  );
  await expect(panel.locator('.viewer-version-change')).toContainText('库中已有新版本');
  await expect(panel.locator('.pdf-scroll .textLayer')).toContainText('Historical PDF');
  await panel.getByRole('button', { name: '打开新版本', exact: true }).click();
  await expect(panel.locator('.viewer-file')).toHaveAttribute(
    'data-viewer-version',
    f.pdf.versionId,
  );
  await rendered(page, 2);
  const saved = await page.evaluate(async (f) => {
    const r = await window.tapkit.artifactCommand(
      {
        requestId: crypto.randomUUID().replace(/^(.{14})./, (_match, start: string) => start + '7'),
      },
      'artifacts.open',
      f,
    );
    if (!r.ok || !('artifact' in r.data)) throw new Error('reading');
    return r.data.artifact.position;
  }, f.pdf);
  expect(saved.locator).toEqual({ kind: 'pdf', pageIndex: 2 });
  expect(errors).toEqual([]);
  await app!.close();
  app = undefined;
  const reopened = await launch(root);
  await open(reopened, f.pdf);
  await rendered(reopened, 2);
});

test('P03-02 Electron PDF selections support copy, annotations, persisted quotes and three PDF layout samples', async () => {
  test.setTimeout(120000);
  const { root, fixtures: f } = await seed(),
    page = await launch(root),
    panel = panelFor(page);
  await page.getByRole('button', { name: /^预览固定版本会话 / }).click();
  await open(page, f.pdf);
  await rendered(page, 0);
  const span = panel
    .locator('.pdf-scroll .textLayer span')
    .filter({ hasText: 'Preview page text marker' })
    .first();
  await span.evaluate((element) => {
    const node = element.firstChild!;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 7);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await expect(panel.getByRole('button', { name: '复制选区', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: '复制选区', exact: true }).click();
  await expect.poll(() => app!.evaluate(({ clipboard }) => clipboard.readText())).toBe('Preview');
  await panel.locator('.viewer-annotations summary').click();
  await panel.getByLabel('备注内容').fill('固定版本批注');
  await panel.getByRole('button', { name: '保存批注', exact: true }).click();
  await expect(panel.locator('.viewer-annotations article')).toHaveCount(1);
  await expect(panel.locator('.pdf-annotation')).toHaveCount(1);
  await panel.getByRole('button', { name: '引用此批注提问', exact: true }).click();
  await expect(page.getByLabel('输入草稿')).toHaveValue(/固定版本批注/);
  await expect
    .poll(async () =>
      page.evaluate(async (sessionId) => {
        const r = await window.tapkit.chatCommand(
          {
            requestId: crypto
              .randomUUID()
              .replace(/^(.{14})./, (_match, start: string) => start + '7'),
          },
          'drafts.get',
          { sessionId, windowId: window.tapkit.windowSlot },
        );
        return r.ok && 'attachments' in r.data ? r.data.attachments : [];
      }, f.sessionId),
    )
    .toEqual([
      expect.objectContaining({
        kind: 'file',
        fileId: f.pdf.fileId,
        versionId: f.pdf.versionId,
        locator: expect.objectContaining({ kind: 'pdf', pageIndex: 0 }),
        selection: expect.objectContaining({
          selectedTextHash: expect.any(String),
          textRange: { start: 0, end: 7 },
        }),
      }),
    ]);
  await open(page, f.pdf);
  await rendered(page, 0);
  await panel.getByLabel('框选区域').check();
  await panel.locator('.pdf-scroll .pdf-page').scrollIntoViewIfNeeded();
  const box = await panel.locator('.pdf-scroll .pdf-page').boundingBox();
  if (!box) throw new Error('PDF surface');
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 80);
  await page.mouse.up();
  await expect(panel.getByRole('button', { name: '复制选区', exact: true })).toBeEnabled();
  for (let i = 0; i < 3; i++) {
    await open(page, f.pdfSamples[i]!);
    await rendered(page, 0);
    await panel.getByRole('button', { name: '全屏预览', exact: true }).click();
    await snapshot(page, 'pdf-sample-' + (i + 1));
    await panel.locator('.pdf-reader details summary').click();
    await panel.getByRole('button', { name: 'Last page', exact: true }).click();
    await rendered(page, i);
    expect(await page.evaluate(() => Reflect.get(window, 'forbidden'))).toBeUndefined();
    await panel.getByRole('button', { name: '退出全屏', exact: true }).click();
  }
});

test('P03-02 Electron merged/formula grids, sorting, image rotation, ZIP directories and 200 percent controls remain usable', async () => {
  test.setTimeout(120000);
  const { root, fixtures: f } = await seed(),
    page = await launch(root),
    panel = panelFor(page);
  await open(page, f.sheet);
  await expect(panel.locator('td').filter({ hasText: '未计算' })).toContainText('B1/0');
  await expect(panel.locator('td[rowspan="2"][colspan="3"]')).toHaveText('合并标题');
  await expect(panel.locator('td[title="公式: B1*2"]')).toContainText('8');
  await open(page, f.csv);
  await panel.getByLabel('列', { exact: true }).fill('2');
  await panel.locator('input[type="checkbox"]').check();
  await expect(panel.locator('tbody tr').first()).toContainText('第一行');
  await panel.getByLabel('筛选当前列').fill('2');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.locator('tbody tr')).toContainText('第二行');
  await open(page, f.image);
  await expect
    .poll(() =>
      panel.locator('.viewer-image canvas').evaluate((c) => (c as HTMLCanvasElement).width),
    )
    .toBe(120);
  await panel.getByRole('button', { name: '旋转', exact: true }).click();
  await expect
    .poll(() =>
      panel.locator('.viewer-image canvas').evaluate((c) => (c as HTMLCanvasElement).width),
    )
    .toBe(60);
  await open(page, f.zip);
  await expect(panel.getByRole('heading', { name: '压缩包安全目录' })).toBeVisible();
  await expect(panel.locator('.viewer-file')).toContainText('中文目录/说明.md');
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('example.invalid')) requests.push(request.url());
  });
  await open(page, f.svg);
  await expect
    .poll(() =>
      panel.locator('.viewer-image canvas').evaluate((c) => (c as HTMLCanvasElement).width),
    )
    .toBe(120);
  expect(await page.evaluate(() => Reflect.get(window, 'forbidden'))).toBeUndefined();
  expect(requests).toEqual([]);
  await open(page, f.code);
  const divider = page.locator('.panel-resize');
  const width = Number(await divider.getAttribute('aria-valuenow'));
  await divider.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(divider).toHaveAttribute('aria-valuenow', String(Math.min(600, width + 10)));
  await page.evaluate(async () => {
    const r = await window.tapkit.bootstrap({
      requestId: crypto.randomUUID().replace(/^(.{14})./, (_match, start: string) => start + '7'),
    });
    if (!r.ok || !('profile' in r.data)) throw new Error('bootstrap');
    const saved = await window.tapkit.setSettings(
      {
        requestId: crypto.randomUUID().replace(/^(.{14})./, (_match, start: string) => start + '7'),
        expectedRevision: r.data.settings.revision,
      },
      {
        scope: { type: 'profile', id: r.data.profile.id },
        patch: { desktop: { ...r.data.settings.values.desktop, zoom: 2 } },
      },
    );
    if (!saved.ok) throw new Error(saved.error.code);
  });
  await expect(page.locator('.desktop-shell')).toHaveCSS('zoom', '2');
  await panel.getByRole('button', { name: '全屏预览', exact: true }).click();
  await expect(panel.getByRole('button', { name: '退出全屏', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '退出全屏', exact: true }).focus();
  await expect(panel.getByRole('button', { name: '退出全屏', exact: true })).toBeFocused();
  await page.screenshot({ path: join(evidence, 'viewer-200-percent.png') });
  await panel.getByRole('button', { name: '关闭预览', exact: true }).click();
  await expect(panel.getByRole('tab', { name: '长代码.ts · v2', exact: true })).toHaveCount(0);
});

test('P03-02 Electron renders six actual isolated Office caches with notes, structural locators, page bounds and presentation', async () => {
  test.setTimeout(120000);
  const manifest = JSON.parse(
    await readFile(join(evidence, 'native-preview-samples.json'), 'utf8'),
  ) as { source: string; profile: string; samples: (FileId & { name: string })[] };
  expect(manifest.source).toBe('real NativeSandboxExecutor/OfficeWorker');
  expect(manifest.samples).toHaveLength(6);
  const root = await rootDir('native Office UI');
  await cp(resolve(manifest.profile), join(root, 'profile'), { recursive: true });
  const page = await launch(root),
    panel = panelFor(page);
  for (const sample of manifest.samples) {
    await open(page, sample);
    await rendered(page, 0);
    const sampleNumber = /-(\d)\./.exec(sample.name)![1];
    await expect(panel.locator('.pdf-scroll .textLayer')).toContainText(
      `${sample.name.endsWith('.docx') ? 'DOCX' : 'PPTX'} 样本 ${sampleNumber}`,
    );
    await expect(panel.locator('.viewer-file')).toContainText('Office结构定位为段落/幻灯片定位');
    if (sample.name.endsWith('.docx'))
      await expect(panel.locator('.pdf-scroll .textLayer')).toContainText('文件预览');
    if (sample.name === 'word-2.docx')
      expect(
        await panel
          .locator('.pdf-scroll canvas')
          .evaluate((c) => (c as HTMLCanvasElement).width > (c as HTMLCanvasElement).height),
      ).toBe(true);
    await panel.getByRole('button', { name: '全屏预览', exact: true }).click();
    await snapshot(page, sample.name.replace('.', '-'));
    const count = Number(await panel.getByLabel('页码', { exact: true }).getAttribute('max'));
    await panel.getByLabel('页码', { exact: true }).fill(String(count));
    await rendered(page, count - 1);
    await expect(panel.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
    if (sample.name.endsWith('.pptx')) {
      await panel.locator('.viewer-slide-notes summary').first().click();
      await expect(panel.locator('.viewer-slide-notes details').first()).toContainText('讲者备注');
      await panel.getByRole('button', { name: '开始放映', exact: true }).click();
      await expect(panel.locator('.viewer-presentation')).toBeVisible();
      await panel.locator('.presentation-close').click();
      await expect(panel.locator('.viewer-presentation')).toHaveCount(0);
    }
    await panel.getByRole('button', { name: '源码/文本', exact: true }).click();
    await expect(panel.locator('.viewer-source article')).not.toHaveCount(0);
    await panel.getByRole('button', { name: '退出全屏', exact: true }).click();
  }
  await writeFile(
    join(evidence, 'renderer-visual-samples.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        source: 'actual Electron/PDF.js canvas',
        samples: [
          'pdf-sample-1.png',
          'pdf-sample-2.png',
          'pdf-sample-3.png',
          ...manifest.samples.map((s) => s.name.replace('.', '-') + '.png'),
        ],
      },
      null,
      2,
    ) + '\n',
  );
});

test('P03-02 Electron preview failure offers real retry, fixed original download/share and scoped external copy', async () => {
  const { root, fixtures: f } = await seed(),
    page = await launch(root),
    panel = panelFor(page),
    target = join(root, 'download.pdf'),
    shared = join(root, 'shared.pdf');
  await app!.evaluate(
    ({ dialog, shell }, { target, shared }) => {
      let saves = 0;
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: saves++ === 0 ? target : shared,
      });
      shell.openPath = async (path) => {
        (globalThis as unknown as { p03ExternalPath: string }).p03ExternalPath = path;
        return '';
      };
    },
    { target, shared },
  );
  await open(page, f.badPdf);
  await expect(panel.getByRole('alert')).toContainText('原件');
  await panel.getByRole('button', { name: '重试预览', exact: true }).first().click();
  await expect(panel.getByRole('button', { name: '重试预览', exact: true }).first()).toBeVisible();
  await panel.getByRole('button', { name: '下载原件', exact: true }).click();
  await expect
    .poll(async () => readFile(target, 'utf8').catch(() => ''))
    .toBe('Invalid PDF original retained for recovery');
  await panel.getByRole('button', { name: '分享副本', exact: true }).click();
  await expect
    .poll(async () => readFile(shared, 'utf8').catch(() => ''))
    .toBe('Invalid PDF original retained for recovery');
  await expect(panel.getByRole('status').filter({ hasText: '保存本地副本' })).toBeVisible();
  await panel.getByRole('button', { name: '外部打开', exact: true }).click();
  await expect
    .poll(() =>
      app!.evaluate(
        () => (globalThis as unknown as { p03ExternalPath?: string }).p03ExternalPath ?? '',
      ),
    )
    .not.toBe('');
  const copy = await app!.evaluate(
    () => (globalThis as unknown as { p03ExternalPath: string }).p03ExternalPath,
  );
  expect(copy.startsWith(join(root, 'profile', 'tmp', 'external-preview'))).toBe(true);
  expect(await readFile(copy, 'utf8')).toBe('Invalid PDF original retained for recovery');
});
