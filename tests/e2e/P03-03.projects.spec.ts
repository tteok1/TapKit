import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ProjectCommand } from '../../packages/contracts/src';
let app: ElectronApplication | undefined, page: Page, exportRoot: string;
const evidence = resolve('docs/evidence/P03-03');
test.beforeEach(async () => {
  await mkdir('.test-data', { recursive: true });
  await mkdir(evidence, { recursive: true });
  const root = await mkdtemp(resolve('.test-data', 'P03-03 Electron 合成 '));
  exportRoot = root;
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: join(root, 'profile') }).filter(
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
async function create(name: string) {
  await page.getByRole('link', { name: '项目', exact: true }).first().click();
  await page
    .locator('.projects-page')
    .getByRole('button', { name: '新建项目', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('项目名称').fill(name);
  await dialog.getByRole('button', { name: '创建项目', exact: true }).click();
  await page.getByRole('link', { name, exact: true }).last().click();
  await expect(page.locator('.projects-page')).toHaveAttribute('data-project-id', /[0-9a-f-]{36}/);
  await expect(page.locator('.projects-page').getByRole('alert')).toHaveCount(0);
  return (await page.locator('.projects-page').getAttribute('data-project-id'))!;
}
async function command(command: ProjectCommand, payload: unknown, revision?: number) {
  return page.evaluate(
    async ({ command, payload, revision }) => {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6]! & 15) | 112;
      bytes[8] = (bytes[8]! & 63) | 128;
      const h = Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join('');
      const requestId = [
        h.slice(0, 8),
        h.slice(8, 12),
        h.slice(12, 16),
        h.slice(16, 20),
        h.slice(20),
      ].join('-');
      return window.tapkit.projectCommand(
        { requestId, ...(revision === undefined ? {} : { expectedRevision: revision }) },
        command,
        payload,
      );
    },
    { command, payload, revision },
  );
}
async function note(name: string, text: string) {
  await page.getByRole('button', { name: '资料', exact: true }).click();
  await page.getByLabel('笔记名称', { exact: true }).fill(name);
  await page.getByLabel('笔记或网页快照正文', { exact: true }).fill(text);
  await page.getByRole('button', { name: '保存笔记或网页快照', exact: true }).click();
  await expect(page.locator('.project-materials')).toContainText(name + '.txt');
  await expect(page.locator('.project-materials')).toContainText('可使用');
}
test('P03-03 project settings, known local note, classification, original query locator and copy are usable in the real renderer', async () => {
  const id = await create('合成项目甲');
  await page.getByRole('button', { name: '设置', exact: true }).last().click();
  await page.getByLabel('项目简介', { exact: true }).fill('合成资料介绍');
  await page.getByLabel('项目指令', { exact: true }).fill('只讨论合成项目甲');
  await page.getByLabel('图标', { exact: true }).selectOption('book');
  await page.getByRole('button', { name: '保存项目设置', exact: true }).click();
  await expect(page.locator('.projects-page')).toContainText('合成资料介绍');
  await note('甲笔记', '合成原文唯一标记甲');
  await page.getByLabel('标签（逗号分隔）', { exact: true }).fill('测试,中文');
  await page.getByRole('button', { name: '保存分类', exact: true }).click();
  await page.getByLabel('搜索项目资料原文', { exact: true }).fill('唯一标记');
  await page.getByRole('button', { name: '搜索原文', exact: true }).click();
  await expect(page.locator('.projects-page')).toContainText('合成原文唯一标记甲');
  const query = await command('knowledge.query', { projectId: id, query: '唯一标记' });
  expect(query).toMatchObject({
    ok: true,
    data: { hits: [{ ref: { kind: 'file', locator: { kind: 'text', start: 0 } } }] },
  });
  await page.screenshot({ path: join(evidence, 'materials.png'), fullPage: false });
  await page.getByRole('button', { name: '复制项目', exact: true }).click();
  await expect(page.getByRole('heading', { name: '合成项目甲 · 副本', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '资料', exact: true }).click();
  await expect(page.locator('.project-materials')).toContainText('甲笔记.txt');
  await expect(page.getByLabel('标签（逗号分隔）', { exact: true })).toHaveValue('测试,中文');
});
test('P03-03 project session binding, explicit selected scope, archive and deletion preview persist', async () => {
  const id = await create('合成范围项目');
  await note('范围资料', '当前项目唯一标记');
  await page.getByRole('button', { name: '在项目中新建聊天', exact: true }).click();
  await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', /[0-9a-f-]{36}/);
  const sessionId = (await page.locator('.chat-surface').getAttribute('data-session-id'))!;
  await page.locator('.project-scope summary').click();
  await page.getByLabel('本次仅依据项目资料（禁用外部背景和历史工具）', { exact: true }).check();
  await page.getByRole('button', { name: '清空资料选择', exact: true }).click();
  await page.getByRole('button', { name: '保存资料范围', exact: true }).click();
  expect(await command('projects.sessionScope', { sessionId })).toMatchObject({
    ok: true,
    data: { scope: { projectOnly: true, selectedVersionIds: [] } },
  });
  await page
    .locator('.project-scope')
    .getByRole('button', { name: '重新加载', exact: true })
    .click();
  await expect(page.getByLabel('范围资料.txt · 可使用', { exact: true })).not.toBeChecked();
  await page.screenshot({ path: join(evidence, 'scope.png') });
  await page.getByRole('link', { name: '项目', exact: true }).first().click();
  await page.getByRole('link', { name: '合成范围项目', exact: true }).last().click();
  await page.getByRole('button', { name: '归档项目', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消归档', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '在项目中新建聊天', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '取消归档', exact: true }).click();
  await page.getByRole('button', { name: '删除项目', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '删除影响预览' })).toContainText('相关会话：1');
  await page.screenshot({ path: join(evidence, 'deletion.png') });
  await page.getByRole('button', { name: '确认删除项目', exact: true }).click();
  await expect(page.getByRole('heading', { name: '项目', exact: true })).toBeVisible();
  expect(await command('projects.get', { projectId: id })).toMatchObject({
    ok: false,
    error: { code: 'PERMISSION_DENIED' },
  });
});
test('P03-03 Core rejects foreign project material and project-only reference while missing evidence is explicit', async () => {
  const a = await create('合成隔离甲');
  await note('甲资料', '只属于项目甲');
  const b = await create('合成隔离乙');
  await note('乙资料', '只属于项目乙');
  const m = await command('projects.materials', { projectId: b });
  if (!m.ok || !('materials' in m.data)) throw Error('materials');
  const material = m.data.materials[0];
  if (!material || !('file' in material)) throw Error('project materials');
  const version = material.file.version.id;
  expect(
    await command('knowledge.query', {
      projectId: a,
      query: '资料',
      selectedVersionIds: [version],
    }),
  ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
  expect(await command('knowledge.query', { projectId: a, query: '不存在的依据' })).toMatchObject({
    ok: true,
    data: { hits: [], diagnostics: ['当前资料无法支持结论；请补充材料。'] },
  });
  await page.getByRole('button', { name: '设置', exact: true }).last().click();
  await expect(page.locator('.projects-page').getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: join(evidence, 'settings.png') });
});

test('P03-03 project ZIP export traverses Host save authorization and shows a refused overwrite', async () => {
  await create('合成导出项目');
  await note('导出笔记', '合成原件导出标记');
  const target = join(exportRoot, 'project.zip');
  await app!.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, target);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '导出资料与成果', exact: true }).click();
  await expect
    .poll(async () =>
      (await readFile(target).catch(() => Buffer.alloc(0))).subarray(0, 2).toString(),
    )
    .toBe('PK');
  const bytes = await readFile(target);
  expect(bytes.includes(Buffer.from('合成原件导出标记'))).toBe(true);
  expect(bytes.includes(Buffer.from('project.json'))).toBe(true);
  await expect(page.locator('.projects-page').getByRole('alert')).toHaveCount(0);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '导出资料与成果', exact: true }).click();
  await expect(page.locator('.projects-page').getByRole('alert')).toBeVisible();
  expect(await readFile(target)).toEqual(bytes);
});
