import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { ProjectCommand } from '../../packages/contracts/src';
let app: ElectronApplication | undefined, page: Page;
test.beforeEach(async () => {
  await mkdir('.test-data', { recursive: true });
  await mkdir('docs/evidence/P04-01', { recursive: true });
  const data = await mkdtemp(resolve('.test-data', 'P04-01 Electron synthetic '));
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: data }).filter(
      (v): v is [string, string] => v[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
});
test.afterEach(async () => {
  await app?.close();
  app = undefined;
});
async function create() {
  await page.getByRole('link', { name: '项目', exact: true }).first().click();
  await page
    .locator('.projects-page')
    .getByRole('button', { name: '新建项目', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('项目名称').fill('P04检索合成甲');
  await dialog.getByRole('button', { name: '创建项目', exact: true }).click();
  await page.getByRole('link', { name: 'P04检索合成甲', exact: true }).last().click();
  await expect(page.locator('.projects-page')).toHaveAttribute('data-project-id', /[0-9a-f-]{36}/);
  return (await page.locator('.projects-page').getAttribute('data-project-id'))!;
}
async function command(command: ProjectCommand, payload: unknown) {
  return page.evaluate(
    async ({ command, payload }) => {
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6]! & 15) | 112;
      b[8] = (b[8]! & 63) | 128;
      const h = Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
      const id = [
        h.slice(0, 8),
        h.slice(8, 12),
        h.slice(12, 16),
        h.slice(16, 20),
        h.slice(20),
      ].join('-');
      return window.tapkit.projectCommand({ requestId: id }, command, payload);
    },
    { command, payload },
  );
}
test('P04-01 T09 real Core CPU hybrid evidence opens the original fixed source and no-answer is explicit', async () => {
  const projectId = await create();
  await page.getByRole('button', { name: '资料', exact: true }).click();
  await page.getByLabel('笔记名称', { exact: true }).fill('退款依据');
  await page
    .getByLabel('笔记或网页快照正文', { exact: true })
    .fill('退款期限：7天。商品退货后的款项会退回原支付账户。');
  await page.getByRole('button', { name: '保存笔记或网页快照', exact: true }).click();
  await expect(page.locator('.project-materials')).toContainText('可使用');
  const r = await command('knowledge.query', { projectId, query: '退货的钱会打到哪里' });
  expect(r).toMatchObject({
    ok: true,
    data: {
      hits: [
        {
          evidence: {
            sourceVersion: expect.any(String),
            hash: expect.stringMatching(/^[a-f0-9]{64}$/),
            modelRevision: expect.stringContaining('q8:cls'),
            ref: { kind: 'file', locator: { kind: 'text' } },
          },
        },
      ],
    },
  });
  await page.getByLabel('搜索项目资料原文', { exact: true }).fill('退款');
  await page.getByRole('button', { name: '搜索原文', exact: true }).click();
  const hit = page.locator('.project-evidence');
  await expect(hit).toContainText('退款期限：7天');
  await hit.getByRole('button', { name: '打开固定版本', exact: true }).first().click();
  await expect(page.locator('.viewer-file')).toContainText('退款期限：7天');
  await page.screenshot({
    path: join(resolve('docs/evidence/P04-01'), 'source-location.png'),
    fullPage: false,
  });
  const none = await command('knowledge.query', { projectId, query: 'E_UNLISTED_997' });
  expect(none).toMatchObject({
    ok: true,
    data: { hits: [], diagnostics: [expect.stringContaining('无法支持结论')] },
  });
});
