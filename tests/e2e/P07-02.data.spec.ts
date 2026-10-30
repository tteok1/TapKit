import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron, type ElectronApplication } from './test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { salesCsv } from '../fixtures/P07-02.data';
import { WorkReplySchema } from '../../packages/contracts/src';

test('P07-02 desktop imports CSV, runs isolated analysis and links filters, charts, formulas and exports', async () => {
  test.setTimeout(480000);
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P07-02 desktop '));
  await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const source = join(dir, '销售.csv');
  await writeFile(source, salesCsv);
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
      (item): item is [string, string] => item[1] !== undefined,
    ),
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
      .fill('P07数据 按地区汇总销售额，完全重复行去重，数量乘单价保留两位小数');
    await form.getByLabel('成果格式').selectOption('xlsx');
    await form.locator('input[type="file"]').setInputFiles(source);
    await form.getByRole('button', { name: '创建工作', exact: true }).click();
    await expect(page.locator('.work-detail')).toContainText('已完成', { timeout: 240000 });
    const initialReply = await page.evaluate(() =>
      window.tapkit.workCommand(
        { requestId: '0199b35d-9700-7000-8000-0000000000a1' },
        'runs.list',
        {},
      ),
    );
    if (!initialReply.ok) throw Error(initialReply.error.code);
    const initialData = WorkReplySchema.parse(initialReply.data);
    if (!('workItems' in initialData)) throw Error('work list');
    const initialWork = initialData.workItems.find((w) => w.definition.goal.startsWith('P07数据'))!;
    const initialRef = initialWork.steps
      .flatMap((s) => s.artifacts)
      .find((ref) => ref.kind === 'file')!;
    if (initialRef.kind !== 'file') throw Error('initial result');
    await page.getByRole('button', { name: '数据与图表', exact: true }).last().click();
    const data = page.getByRole('region', { name: '数据分析成果' });
    await expect(data.getByRole('cell', { name: '0.7', exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(data.getByRole('cell', { name: '1.05', exact: true })).toBeVisible();
    await expect(data.getByRole('img', { name: '分地区销售额' })).toBeVisible();
    await data.getByLabel('筛选字段').selectOption('地区');
    await data.getByLabel('筛选值', { exact: true }).fill('华东');
    await data.getByRole('button', { name: '应用筛选' }).click();
    await expect(data.locator('.data-range')).toContainText('筛选后 1 行');
    await expect(data.getByRole('cell', { name: '华南', exact: true })).toHaveCount(0);
    await expect(data.locator('svg desc')).toContainText('1 条数据');
    await data.getByLabel('图表类型').selectOption('line');
    await data.getByLabel('图表标题').fill('筛选后的销售额');
    await expect(data.getByRole('img', { name: '筛选后的销售额' })).toBeVisible();
    await expect(data.locator('.data-export-list')).toContainText('分析表格.xlsx');
    await expect(data.locator('.data-export-list')).toContainText('分析看板.html');
    await mkdir('docs/evidence/P07-02/desktop', { recursive: true });
    await data.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'docs/evidence/P07-02/desktop/data-results.png' });
    await data.getByRole('button', { name: '清除筛选' }).click();
    await expect(data.locator('.data-range')).toContainText('筛选后 2 行');
    await data.getByLabel('数据表', { exact: true }).selectOption('detail');
    await expect(data.getByRole('columnheader', { name: '金额（元）', exact: true })).toBeVisible();
    await expect(data.locator('tbody tr')).toHaveCount(3);
    await page
      .getByLabel('补充或修改要求')
      .fill('P07数据 保留重复行，其余统计口径不变，重新按地区汇总销售额');
    await page.getByRole('button', { name: '调整任务', exact: true }).click();
    await expect(page.locator('.work-detail')).toContainText(/目标版本\s*2/);
    await expect(page.locator('.work-detail')).toContainText('已完成', { timeout: 240000 });
    await page.getByRole('button', { name: '数据与图表', exact: true }).last().click();
    await expect(data.getByRole('cell', { name: '2.1', exact: true })).toBeVisible({
      timeout: 30000,
    });
    const oldReply = await page.evaluate(
      ({ runId, fileId, versionId }) =>
        window.tapkit.workCommand(
          { requestId: '0199b35d-9700-7000-8000-0000000000a2' },
          'runs.data',
          { runId, fileId, versionId },
        ),
      { runId: initialWork.runId, fileId: initialRef.fileId, versionId: initialRef.versionId },
    );
    if (!oldReply.ok) throw Error(oldReply.error.code);
    const old = WorkReplySchema.parse(oldReply.data);
    expect(
      'dataPage' in old && old.dataPage.rows.some((row) => row[0] === '华南' && row[1] === 1.05),
    ).toBe(true);
    await page.screenshot({ path: 'docs/evidence/P07-02/desktop/data-version-2.png' });
    const visualDir = 'docs/evidence/P07-02/resume-2026-10-30/desktop';
    await mkdir(visualDir, { recursive: true });
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
      await data.locator('.data-chart').scrollIntoViewIfNeeded();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const geometry = await data.evaluate((el) => {
        const box = el.getBoundingClientRect(),
          svg = el.querySelector('svg')!.getBoundingClientRect();
        return {
          width: innerWidth,
          left: box.left,
          right: box.right,
          chartLeft: svg.left,
          chartRight: svg.right,
        };
      });
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
      expect(geometry.chartRight).toBeLessThanOrEqual(geometry.right + 1);
      await data
        .locator('.data-chart')
        .screenshot({ path: `${visualDir}/chart-${theme}-${width}-${zoom}.png` });
      await page.screenshot({ path: `${visualDir}/desktop-${theme}-${width}-${zoom}.png` });
      await writeFile(
        `${visualDir}/geometry-${theme}-${width}-${zoom}.json`,
        JSON.stringify(geometry),
      );
    }
  } finally {
    await app?.close();
  }
});
