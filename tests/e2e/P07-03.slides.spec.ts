import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron, type ElectronApplication } from './test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { salesCsv } from '../fixtures/P07-02.data';
import { WorkReplySchema } from '../../packages/contracts/src';
test('P07-03 desktop analyzes selected CSV, publishes editable PPTX/PDF, then reviews a local title and notes revision', async () => {
  test.setTimeout(780000);
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P07-03 desktop '));
  await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const csv = join(dir, '销售.csv');
  await writeFile(csv, salesCsv);
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
      (x): x is [string, string] => x[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
    const page = await app.firstWindow();
    const waitStatus = async (status: 'completed' | 'waiting_user', timeout: number) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const data = await page.evaluate(async () => {
          const id = crypto.randomUUID();
          const reply = await window.tapkit.workCommand(
            { requestId: id.slice(0, 14) + '7' + id.slice(15) },
            'runs.list',
            {},
          );
          if (!reply.ok) throw Error(reply.error.code);
          return reply.data;
        });
        const value = WorkReplySchema.parse(data);
        if (!('workItems' in value)) throw Error('work list');
        const latest = value.workItems[0];
        if (latest?.status === status) return;
        if (latest && ['failed', 'partial', 'cancelled', 'budget_stopped'].includes(latest.status))
          throw Error('Work terminal: ' + latest.status + ' ' + latest.reason);
        await page.waitForTimeout(1000);
      }
      throw Error('Work status timeout: ' + status);
    };
    await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
    await page.getByRole('link', { name: '工作', exact: true }).click();
    await page.getByRole('button', { name: '新建工作', exact: true }).click();
    const form = page.getByRole('form', { name: '新建工作' });
    await form
      .getByLabel('工作目标')
      .fill(
        'P07演示 P07数据 先按地区汇总去重销售额，再使用实际分析图表生成10页演示，保留给定数字和讲者备注。',
      );
    await form.getByLabel('成果格式').selectOption('pptx');
    await form.getByLabel('演示页数').fill('10');
    await form.getByLabel('页面比例').selectOption('16:9');
    await form.getByLabel('演示主题').selectOption('dark_presentation');
    await form.locator('input[type=file]').setInputFiles(csv);
    await mkdir('docs/evidence/P07-03/desktop', { recursive: true });
    await page.screenshot({ path: 'docs/evidence/P07-03/desktop/options.png' });
    await form.getByRole('button', { name: '创建工作', exact: true }).click();
    await waitStatus('completed', 360000);
    await expect(page.locator('.work-detail')).toContainText('已完成');
    await page.getByRole('button', { name: '幻灯片与备注', exact: true }).last().click();
    const slides = page.getByRole('region', { name: '演示文稿成果' });
    await expect(slides).toContainText('10页');
    await expect(slides).toContainText('深色演示');
    await slides.getByRole('button', { name: '2. 示例第2页', exact: true }).click();
    await expect(slides.getByLabel('页面标题')).toHaveValue('示例第2页');
    const first = await page.evaluate(async () => {
      const r = await window.tapkit.workCommand(
        { requestId: '0199b35d-9700-7000-8000-0000000000b1' },
        'runs.list',
        {},
      );
      if (!r.ok) throw Error(r.error.code);
      return r.data;
    });
    const parsed = WorkReplySchema.parse(first);
    if (!('workItems' in parsed)) throw Error('works');
    const original = parsed.workItems.find((w) => w.definition.goal.includes('P07演示'))!;
    const refs = original.steps.flatMap((s) => s.artifacts),
      pptx = original.steps
        .flatMap((s) => s.artifacts.map((ref, i) => ({ ref, extension: s.artifactFormats[i] })))
        .find((x) => x.extension === 'pptx')!.ref;
    if (pptx.kind !== 'file') throw Error('pptx');
    const old = await page.evaluate(
      async ({ runId, ref }) => {
        const r = await window.tapkit.workCommand(
          { requestId: '0199b35d-9700-7000-8000-0000000000b2' },
          'runs.slides',
          { runId, fileId: ref.fileId, versionId: ref.versionId },
        );
        if (!r.ok) throw Error(r.error.code);
        return r.data;
      },
      { runId: original.runId, ref: pptx },
    );
    const oldData = WorkReplySchema.parse(old);
    if (!('slidePage' in oldData)) throw Error('deck');
    expect(refs.length).toBeGreaterThanOrEqual(2);
    await slides.getByRole('button', { name: '预览第2页 PDF', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: '页码', exact: true })).toHaveValue('2');
    await expect(
      page.locator('.artifact-panel .pdf-scroll canvas[data-rendered-page="1"]'),
    ).toBeVisible({ timeout: 120000 });
    await page
      .locator('.artifact-panel .pdf-scroll canvas[data-rendered-page="1"]')
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'docs/evidence/P07-03/desktop/pdf-preview.png' });
    await page.getByRole('button', { name: '关闭标签', exact: true }).click();
    await slides.getByRole('button', { name: '5. 示例第5页', exact: true }).click();
    await slides.getByRole('button', { name: '预览第5页 PDF', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: '页码', exact: true })).toHaveValue('5');
    await expect(
      page.locator('.artifact-panel .pdf-scroll canvas[data-rendered-page="4"]'),
    ).toBeVisible({ timeout: 120000 });
    await expect(page.locator('.artifact-panel .pdf-scroll')).toContainText('0.70');
    await expect(page.locator('.artifact-panel .pdf-scroll')).toContainText('1.05');
    await page
      .locator('.artifact-panel .pdf-scroll canvas[data-rendered-page="4"]')
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'docs/evidence/P07-03/desktop/chart-preview.png' });
    await page.getByRole('button', { name: '关闭标签', exact: true }).click();
    await slides.getByRole('button', { name: '2. 示例第2页', exact: true }).click();
    await expect(slides.getByLabel('页面标题')).toHaveValue('示例第2页');
    await slides.getByLabel('页面标题').fill('修改后的中文标题');
    await slides.getByLabel('讲者备注').fill('修改后的讲者备注，数字123.45保持不变。');
    await slides.getByRole('button', { name: '生成修改版本', exact: true }).click();
    await waitStatus('waiting_user', 90000);
    await expect(page.locator('.work-detail')).toContainText('等待输入');
    await page.getByRole('button', { name: '权限与审批', exact: true }).click();
    const card = page.locator('.work-approval');
    await expect(card).toContainText('修改后的中文标题');
    await expect(card).toContainText('修改后的讲者备注');
    await page.screenshot({ path: 'docs/evidence/P07-03/desktop/approval.png' });
    await card.getByRole('button', { name: '批准操作', exact: true }).click();
    await page.getByRole('link', { name: '工作', exact: true }).click();
    await page.locator('.work-open').filter({ hasText: '修改后的中文标题' }).first().click();
    await waitStatus('completed', 300000);
    await expect(page.locator('.work-detail')).toContainText('已完成');
    await page.getByRole('button', { name: '幻灯片与备注', exact: true }).last().click();
    await expect(slides).toContainText('修改后的中文标题');
    await slides.getByRole('button', { name: /2\. 修改后的中文标题/ }).click();
    await expect(slides.getByLabel('讲者备注')).toHaveValue(
      '修改后的讲者备注，数字123.45保持不变。',
    );
    const updatedReply = await page.evaluate(async () => {
      const r = await window.tapkit.workCommand(
        { requestId: '0199b35d-9700-7000-8000-0000000000b3' },
        'runs.list',
        {},
      );
      if (!r.ok) throw Error(r.error.code);
      return r.data;
    });
    const updatedData = WorkReplySchema.parse(updatedReply);
    if (!('workItems' in updatedData)) throw Error('works');
    const updated = updatedData.workItems.find(
      (w) => w.version === 2 && w.taskId === original.taskId,
    )!;
    const next = updated.steps
      .flatMap((s) => s.artifacts.map((ref, i) => ({ ref, extension: s.artifactFormats[i] })))
      .find((x) => x.extension === 'pptx')!.ref;
    if (next.kind !== 'file') throw Error('pptx');
    expect(next.fileId).toBe(pptx.fileId);
    expect(next.versionId).not.toBe(pptx.versionId);
    const latestReply = await page.evaluate(
      async ({ runId, ref }) => {
        const r = await window.tapkit.workCommand(
          { requestId: '0199b35d-9700-7000-8000-0000000000b4' },
          'runs.slides',
          { runId, fileId: ref.fileId, versionId: ref.versionId },
        );
        if (!r.ok) throw Error(r.error.code);
        return r.data;
      },
      { runId: updated.runId, ref: next },
    );
    const latest = WorkReplySchema.parse(latestReply);
    if (!('slidePage' in latest)) throw Error('deck');
    for (const oldSlide of oldData.slidePage.slides.filter((s) => s.id !== 'page-2'))
      expect(latest.slidePage.slides.find((s) => s.id === oldSlide.id)?.hash).toBe(oldSlide.hash);
    await page.screenshot({ path: 'docs/evidence/P07-03/desktop/revised.png' });
    const closeDetails = page.getByRole('button', { name: '关闭详情', exact: true });
    if (await closeDetails.isVisible()) await closeDetails.click();
    for (const [theme, zoom, width] of [
      ['light', 1, 1440],
      ['dark', 1, 960],
      ['dark', 2, 960],
    ] as const) {
      await page.evaluate(
        async ({ theme, zoom }) => {
          const id = () => {
            const v = crypto.randomUUID();
            return v.slice(0, 14) + '7' + v.slice(15);
          };
          const b = await window.tapkit.bootstrap({ requestId: id() });
          if (!b.ok || !('profile' in b.data)) throw Error('bootstrap');
          const reply = await window.tapkit.setSettings(
            { requestId: id(), expectedRevision: b.data.settings.revision },
            {
              scope: { type: 'profile', id: b.data.profile.id },
              patch: { desktop: { ...b.data.settings.values.desktop, theme, zoom } },
            },
          );
          if (!reply.ok) throw Error(reply.error.code);
        },
        { theme, zoom },
      );
      await app.evaluate(
        ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]!.setContentSize(width, 900),
        width,
      );
      await expect(page.locator('.desktop-shell')).toHaveAttribute('data-theme', theme);
      await expect
        .poll(() =>
          page
            .locator('.desktop-shell')
            .evaluate((el) => getComputedStyle(el).getPropertyValue('--ui-zoom').trim()),
        )
        .toBe(String(zoom));
      await slides.getByLabel('页面标题').scrollIntoViewIfNeeded();
      const geometry = await slides.evaluate((el) => {
        const section = el.getBoundingClientRect(),
          input = el.querySelector('input')!.getBoundingClientRect();
        return {
          width: innerWidth,
          left: section.left,
          right: section.right,
          inputLeft: input.left,
          inputRight: input.right,
        };
      });
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
      expect(geometry.inputRight).toBeLessThanOrEqual(geometry.right + 1);
      await page.screenshot({
        path: `docs/evidence/P07-03/desktop/slides-${theme}-${width}-${zoom}.png`,
      });
      await writeFile(
        `docs/evidence/P07-03/desktop/geometry-${theme}-${width}-${zoom}.json`,
        JSON.stringify(geometry),
      );
    }
  } finally {
    await app?.close();
  }
});
