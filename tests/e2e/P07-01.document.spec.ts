import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { solidPng } from '../fixtures/P07-01.images';

test('P07-01 creates and reviews a localized DOCX revision in the desktop', async () => {
  test.setTimeout(300000);
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P07-01 isolated '));
  await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
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
    const capability = await page.evaluate(async () => {
      const reply = await window.tapkit.bootstrap({
        requestId: '0199b35d-9700-7000-8000-000000000099',
      });
      if (!reply.ok || !('runtimeCapabilities' in reply.data) || !reply.data.runtimeCapabilities)
        throw Error('bootstrap');
      return reply.data.runtimeCapabilities;
    });
    expect(capability.nativeExecution.status).toBe('available');
    expect(capability.officeRender.status).toBe('available');
    await page.getByRole('link', { name: '工作', exact: true }).click();
    await page.getByRole('button', { name: '新建工作', exact: true }).click();
    const form = page.getByRole('form', { name: '新建工作' });
    await form.getByLabel('工作目标').fill('P07文档 生成报告');
    await form.getByLabel('成果格式').selectOption('docx');
    await form.getByText('文档选项（可选）').click();
    await form.getByLabel('文档模板').selectOption('proposal');
    await form.getByLabel('文档主题').selectOption('minimal');
    await form.getByLabel('篇幅').selectOption('detailed');
    await form.getByLabel('封面姓名').fill('验收姓名');
    await form.getByLabel('封面品牌').fill('TapKit');
    await form.getByLabel('封面日期').fill('2026-10-28');
    await form.locator('select[name="documentToc"]').selectOption('true');
    await form.locator('select[name="documentPageNumbers"]').selectOption('true');
    await mkdir('docs/evidence/P07-01/desktop', { recursive: true });
    await page.screenshot({ path: 'docs/evidence/P07-01/desktop/document-options.png' });
    await form.getByRole('button', { name: '创建工作', exact: true }).click();
    await expect(page.locator('.work-detail')).toContainText('已完成', { timeout: 150000 });
    await page.getByRole('button', { name: '打开成果 1', exact: true }).click();
    await expect(page.locator('.artifact-panel')).toContainText('P07报告.docx', {
      timeout: 150000,
    });
    await expect(page.locator('.artifact-panel .pdf-scroll canvas').first()).toHaveAttribute(
      'data-rendered-page',
      '0',
      { timeout: 150000 },
    );
    await mkdir('docs/evidence/P07-01/desktop', { recursive: true });
    await page.screenshot({ path: 'docs/evidence/P07-01/desktop/created-report.png' });
    await page.getByLabel('补充或修改要求').fill('P07文档 修改摘要');
    await page.getByRole('button', { name: '调整任务', exact: true }).click();
    await expect(page.locator('.work-detail')).toContainText('等待输入', { timeout: 60000 });
    await page.getByRole('button', { name: '权限与审批', exact: true }).click();
    const card = page.locator('.work-approval');
    await expect(card).toContainText('原始中文摘要');
    await expect(card).toContainText('修改后的中文摘要');
    await page.screenshot({ path: 'docs/evidence/P07-01/desktop/revision-approval.png' });
    await card.getByRole('button', { name: '批准操作', exact: true }).click();
    await expect(card).toHaveCount(0);
    await page.getByRole('link', { name: '工作', exact: true }).click();
    await page.locator('.work-open').filter({ hasText: 'P07文档 修改摘要' }).first().click();
    await expect(page.locator('.work-detail')).toContainText('已完成', { timeout: 150000 });
    await page.getByRole('button', { name: '打开成果 1', exact: true }).last().click();
    await expect(page.locator('.artifact-panel')).toContainText('P07报告.docx', {
      timeout: 150000,
    });
    await expect(page.locator('.artifact-panel .pdf-scroll canvas').first()).toHaveAttribute(
      'data-rendered-page',
      '0',
      { timeout: 150000 },
    );
    await page.screenshot({ path: 'docs/evidence/P07-01/desktop/revised-report.png' });
  } finally {
    await app?.close();
  }
});

test('P07-01 delivers an actually converted and parsed PDF in the desktop', async () => {
  test.setTimeout(420000);
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P07-01 pdf isolated '));
  await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
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
    await form.getByLabel('工作目标').fill('P07文档 PDF 生成报告');
    await form.getByLabel('成果格式').selectOption('pdf');
    await form.getByRole('button', { name: '创建工作', exact: true }).click();
    await expect(page.locator('.work-detail')).toContainText('已完成', { timeout: 300000 });
    await expect(page.locator('.work-detail')).toContainText('.pdf');
    await page.screenshot({ path: 'docs/evidence/P07-01/desktop/pdf-result.png' });
  } finally {
    await app?.close();
  }
});

test('P07-01 authorized static PNG survives isolated DOCX and PDF validation', async () => {
  test.setTimeout(420000);
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P07-01 image isolated '));
  await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
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
    await form.getByLabel('工作目标').fill('P07文档 P07图片 PDF 插入提供的图片');
    await form.getByLabel('成果格式').selectOption('pdf');
    await form
      .locator('input[type="file"]')
      .setInputFiles({ name: '合成素材.png', mimeType: 'image/png', buffer: solidPng() });
    await expect(
      form.getByText('不超过 128 KiB 的静态 PNG 可作为文档图片插入；模型不会读取或识别图片内容。'),
    ).toBeVisible();
    await form.getByRole('button', { name: '创建工作', exact: true }).click();
    await expect(page.locator('.work-detail')).toContainText('已完成', { timeout: 300000 });
    await page.getByRole('button', { name: '打开成果 2', exact: true }).click();
    await expect(page.locator('.artifact-panel .pdf-scroll canvas').first()).toHaveAttribute(
      'data-rendered-page',
      '0',
      { timeout: 150000 },
    );
    await page.screenshot({ path: 'docs/evidence/P07-01/desktop/image-pdf.png' });
  } finally {
    await app?.close();
  }
});
