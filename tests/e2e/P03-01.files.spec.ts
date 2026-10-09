import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import type { IpcMainInvokeEvent } from 'electron';
let app: ElectronApplication | undefined, root: string, dir: string;
function getApp() {
  if (!app) throw new Error('Electron application has not launched');
  return app;
}
let nativeStatus: string | undefined;
let lifecycleRequest = 200;
const lifecycleId = () =>
  `0195abc0-0000-7000-8000-${(++lifecycleRequest).toString(16).padStart(12, '0')}`;
type InvokeHandler = (event: IpcMainInvokeEvent, raw: unknown) => unknown;
type ReplyGate = {
  original: InvokeHandler;
  selectionOriginal: InvokeHandler;
  release: () => void;
  used: boolean;
  held: boolean;
  cancels: number;
  imports: number;
  selections: number;
  releases: number;
  releasedTokens: number;
};
type GateGlobal = { p03ReplyGate?: ReplyGate };
async function holdRealReply(command: 'files.import' | 'sessions.create' | 'selection') {
  await getApp().evaluate(({ ipcMain }, command) => {
    const map = (ipcMain as unknown as { _invokeHandlers: Map<string, InvokeHandler> })
      ._invokeHandlers;
    const original = map.get('tapkit:request');
    const selectionOriginal = map.get('tapkit:select-dropped-files');
    if (!original || !selectionOriginal)
      throw new Error('Original application IPC handler missing');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const state: ReplyGate = {
      original,
      selectionOriginal,
      release,
      used: false,
      held: false,
      cancels: 0,
      imports: 0,
      selections: 0,
      releases: 0,
      releasedTokens: 0,
    };
    (globalThis as unknown as GateGlobal).p03ReplyGate = state;
    ipcMain.removeHandler('tapkit:request');
    ipcMain.handle('tapkit:request', async (event, raw: unknown) => {
      const request = raw as { command?: string };
      if (request.command === 'files.import') state.imports++;
      // Every request still executes the original sender/DTO/permission checks,
      // Core operation and audit. Only the first matching reply is held.
      const hold = request.command === command && !state.used;
      if (hold) state.used = true;
      const reply = await original(event, raw);
      if (request.command === 'files.cancelImport' && (reply as { ok?: boolean }).ok)
        state.cancels++;
      if (request.command === 'files.releaseSelection' && (reply as { ok?: boolean }).ok) {
        state.releases++;
        state.releasedTokens += (
          reply as { data: { changedIds: string[] } }
        ).data.changedIds.length;
      }
      if (hold) {
        state.held = true;
        await gate;
      }
      return reply;
    });
    ipcMain.removeHandler('tapkit:select-dropped-files');
    ipcMain.handle('tapkit:select-dropped-files', async (event, raw: unknown) => {
      state.selections++;
      const reply = await selectionOriginal(event, raw);
      if (command === 'selection' && !state.used) {
        state.used = true;
        state.held = true;
        await gate;
      }
      return reply;
    });
  }, command);
}
async function releaseRealReply(restore = false) {
  await getApp().evaluate(({ ipcMain }, restore) => {
    const root = globalThis as unknown as GateGlobal,
      state = root.p03ReplyGate;
    if (!state) return;
    state.release();
    if (!restore) return;
    ipcMain.removeHandler('tapkit:request');
    ipcMain.handle('tapkit:request', state.original);
    ipcMain.removeHandler('tapkit:select-dropped-files');
    ipcMain.handle('tapkit:select-dropped-files', state.selectionOriginal);
    delete root.p03ReplyGate;
  }, restore);
}
async function latestSession(page: Page) {
  return page.evaluate(async (requestId) => {
    const reply = await window.tapkit.desktopCommand({ requestId }, 'desktop.workspace', {});
    if (!reply.ok || !('sessions' in reply.data)) throw new Error('workspace');
    return reply.data.sessions[0]!.id;
  }, lifecycleId());
}
async function lifecycleDraft(page: Page, sessionId: string) {
  return page.evaluate(
    async ({ requestId, sessionId }) => {
      const reply = await window.tapkit.chatCommand({ requestId }, 'drafts.get', {
        sessionId,
        windowId: window.tapkit.windowSlot,
      });
      if (!reply.ok || !('attachments' in reply.data)) throw new Error('draft');
      return { text: reply.data.text, attachments: reply.data.attachments };
    },
    { requestId: lifecycleId(), sessionId },
  );
}
async function seedUsage(mode?: 'ocr') {
  const node = resolve('.runtime/node/node-v24.21.0-win-x64/node.exe'),
    bundle = join(root, 'usage-bundle');
  await promisify(execFile)(
    node,
    [
      resolve('node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      'tests/fixtures/P03-usage.vite.config.ts',
      '--outDir',
      bundle,
    ],
    { timeout: 15000, windowsHide: true },
  );
  const seeded = await promisify(execFile)(
    node,
    [join(bundle, 'usage.cjs'), root, ...(mode ? [mode] : [])],
    {
      timeout: 15000,
      windowsHide: true,
      env: { ...process.env, TAPKIT_STARTUP_DIAGNOSTICS: '0' },
    },
  );
  expect(seeded.stdout.trim()).toBe('P03_USAGE_FIXTURE_SEEDED');
}
test('P03-01 accepted task usage shows its pinned historical version and follows session trash/restore across restart', async () => {
  await seedUsage();
  const page = await launch();
  const open = async () => {
    await page.getByRole('button', { name: '版本资料.txt', exact: true }).click();
    return page.getByRole('region', { name: '关联与使用记录', exact: true });
  };
  const usage = await open();
  await expect(usage).toContainText('阅读旧版 <img src=x onerror=alert(1)>');
  await expect(usage).toContainText('中文附件会话');
  await expect(usage).toContainText('任务版本 1 · 版本 1 · 执行已取消');
  await expect(usage.locator('img')).toHaveCount(0);
  await noOverflow(page);
  await usage.scrollIntoViewIfNeeded();
  expect(
    await page
      .getByRole('dialog', { name: '文件详情', exact: true })
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: 'docs/evidence/P03-01/task-usage.png' });
  await page
    .getByRole('dialog', { name: '文件详情', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .click();
  await page.evaluate(async () => {
    const r = await window.tapkit.desktopCommand(
      { requestId: '0195abc0-0000-7000-8000-000000000012' },
      'desktop.workspace',
      {},
    );
    if (!r.ok || !('sessions' in r.data)) throw new Error('workspace');
    const session = r.data.sessions.find((s) => s.title === '中文附件会话');
    if (!session) throw new Error('synthetic session');
    const trashed = await window.tapkit.historyCommand(
      { requestId: '0195abc0-0000-7000-8000-000000000013' },
      'sessions.trash',
      { sessionIds: [session.id] },
    );
    if (!trashed.ok) throw new Error(trashed.error.code);
    (window as unknown as { p03UsageSession: string }).p03UsageSession = session.id;
  });
  await expect(await open()).toContainText('尚无已接受执行的附件记录');
  await page
    .getByRole('dialog', { name: '文件详情', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .click();
  await page.evaluate(async () => {
    const r = await window.tapkit.historyCommand(
      { requestId: '0195abc0-0000-7000-8000-000000000014' },
      'sessions.restore',
      { sessionIds: [(window as unknown as { p03UsageSession: string }).p03UsageSession] },
    );
    if (!r.ok) throw new Error(r.error.code);
  });
  await getApp().close();
  const restarted = await launch();
  await restarted.getByRole('button', { name: '版本资料.txt', exact: true }).click();
  await expect(
    restarted.getByRole('region', { name: '关联与使用记录', exact: true }),
  ).toContainText('任务版本 1 · 版本 1 · 执行已取消');
  await picker([], join(root, '历史下载.txt'));
  await restarted
    .getByRole('dialog', { name: '文件详情', exact: true })
    .getByRole('button', { name: '下载原件', exact: true })
    .last()
    .click();
  await expect
    .poll(async () => readFile(join(root, '历史下载.txt'), 'utf8').catch(() => ''))
    .toBe('历史原件保留');
  expect(await readFile(join(root, '原件.txt'), 'utf8')).toBe('历史原件保留');
});
test.beforeEach(async () => {
  app = undefined;
  await mkdir('.test-data', { recursive: true });
  root = await mkdtemp(resolve('.test-data', 'P03-01 Electron files '));
  dir = join(root, 'profile');
  await mkdir('docs/evidence/P03-01', { recursive: true });
});
test.afterEach(async () => {
  const current = app;
  app = undefined;
  if (current) {
    const child = current.process();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        current.close(),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            child.kill();
            resolve();
          }, 5000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
});
async function launch() {
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir }).filter(
      (r): r is [string, string] => r[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  getApp()
    .process()
    .stderr?.on('data', (chunk) => process.stderr.write(chunk));
  const page = await getApp().firstWindow();
  page.on('pageerror', (error) =>
    process.stderr.write('P03_SYNTHETIC_RENDERER_ERROR ' + error.message + '\n'),
  );
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接');
  // Local production capabilities stay fail-closed until a standard-user probe verifies them.
  nativeStatus = await page.evaluate(async () => {
    const r = await window.tapkit.bootstrap({
      requestId: '0195abc0-0000-7000-8000-000000000011',
    });
    if (!r.ok || !('runtimeCapabilities' in r.data)) throw new Error('bootstrap');
    return r.data.runtimeCapabilities?.nativeExecution.status;
  });
  if (process.env.CI !== 'true') expect(nativeStatus).toBe('failed');
  await page.getByRole('link', { name: '文件', exact: true }).click();
  await expect(page.getByRole('heading', { name: '资料库', exact: true })).toBeVisible();
  return page;
}
async function picker(paths: string[], output = join(root, '下载原件.txt')) {
  await getApp().evaluate(
    ({ dialog }, value) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: value.paths });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: value.output });
    },
    { paths, output },
  );
}
async function importPicker(page: Page, paths: string[], folder = false) {
  await picker(paths);
  await page.getByRole('button', { name: folder ? '导入文件夹' : '导入文件', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '待导入文件', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '开始导入', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const library = page.locator('.file-library');
  expect(await library.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
}
test('P03-01 T08 navigation sends cancellation while a real committed import reply is delayed and appends it only to the original draft', async () => {
  const source = join(root, '导航前资料.txt'),
    content = '原会话独占资料\n不污染新会话';
  await writeFile(source, content);
  const sourceHash = createHash('sha256')
    .update(await readFile(source))
    .digest('hex');
  const page = await launch();
  await page.keyboard.press('Control+n');
  await expect(page.getByLabel('输入草稿')).toBeEnabled();
  const originalSession = await latestSession(page);
  await page.getByLabel('输入草稿').fill('原会话问题保留');
  await expect
    .poll(async () => (await lifecycleDraft(page, originalSession)).text)
    .toBe('原会话问题保留');
  await holdRealReply('files.import');
  try {
    await page.locator('input[type=file]').setInputFiles(source);
    await expect
      .poll(() => getApp().evaluate(() => (globalThis as unknown as GateGlobal).p03ReplyGate?.held))
      .toBe(true);
    await expect(page.getByRole('button', { name: '取消文件导入', exact: true })).toBeVisible();
    await page.keyboard.press('Control+n');
    await expect(page.getByLabel('输入草稿')).toBeEnabled();
    const nextSession = await latestSession(page);
    expect(nextSession).not.toBe(originalSession);
    await page.getByLabel('输入草稿').fill('新会话问题不能覆盖');
    await expect
      .poll(async () => (await lifecycleDraft(page, nextSession)).text)
      .toBe('新会话问题不能覆盖');
    await expect
      .poll(() =>
        getApp().evaluate(() => (globalThis as unknown as GateGlobal).p03ReplyGate?.cancels),
      )
      .toBeGreaterThan(0);
    await releaseRealReply();
    await expect
      .poll(async () => (await lifecycleDraft(page, originalSession)).attachments.length)
      .toBe(1);
    const original = await lifecycleDraft(page, originalSession),
      next = await lifecycleDraft(page, nextSession);
    expect(original.text).toBe('原会话问题保留');
    expect(next).toEqual({ text: '新会话问题不能覆盖', attachments: [] });
    const ref = original.attachments[0]!;
    expect(ref.kind).toBe('file');
    if (ref.kind !== 'file') throw new Error('Expected a fixed file reference');
    await expect(page.locator('.composer')).not.toContainText('导航前资料.txt');
    await expect(page.getByLabel('输入草稿')).toHaveValue('新会话问题不能覆盖');
    await picker([], join(root, '导航后原件.txt'));
    expect(
      await page.evaluate(
        async ({ ref, originalSession }) => {
          const reply = await window.tapkit.saveOriginal({
            fileId: ref.fileId,
            versionId: ref.versionId,
            owner: { type: 'session', id: originalSession },
          });
          return reply.ok;
        },
        { ref, originalSession },
      ),
    ).toBe(true);
    await expect
      .poll(() => readFile(join(root, '导航后原件.txt'), 'utf8').catch(() => ''))
      .toBe(content);
    expect(
      createHash('sha256')
        .update(await readFile(source))
        .digest('hex'),
    ).toBe(sourceHash);
    await page.screenshot({ path: 'docs/evidence/P03-01/chat-navigation-isolation.png' });
    await releaseRealReply(true);
    await getApp().close();
    const restarted = await launch();
    expect(await lifecycleDraft(restarted, originalSession)).toEqual(original);
    expect(await lifecycleDraft(restarted, nextSession)).toEqual(next);
  } finally {
    await releaseRealReply(true).catch(() => {});
  }
});
test('P03-01 T08 late session creation after leaving the home composer cannot start a physical import or overwrite the new draft', async () => {
  const source = join(root, '已取消的首页资料.txt');
  await writeFile(source, '取消创建后的物理源不应导入');
  const page = await launch();
  await page.getByRole('link', { name: '首页', exact: true }).click();
  await expect(page.getByLabel('输入草稿')).toBeEnabled();
  await page.getByLabel('输入草稿').fill('首页尚未创建的输入');
  await holdRealReply('sessions.create');
  try {
    await page.locator('input[type=file]').setInputFiles(source);
    await expect
      .poll(() => getApp().evaluate(() => (globalThis as unknown as GateGlobal).p03ReplyGate?.held))
      .toBe(true);
    await page.keyboard.press('Control+n');
    await expect(page.getByLabel('输入草稿')).toBeEnabled();
    const nextSession = await latestSession(page);
    await page.getByLabel('输入草稿').fill('切换后的输入保留');
    await expect
      .poll(async () => (await lifecycleDraft(page, nextSession)).text)
      .toBe('切换后的输入保留');
    await releaseRealReply();
    // Observe the real profile after reply delivery. The canceled composer
    // must not mint a Host grant or begin a managed import.
    await expect
      .poll(async () =>
        page.evaluate(async (requestId) => {
          const reply = await window.tapkit.fileCommand({ requestId }, 'files.list', {});
          if (!reply.ok || !('files' in reply.data)) throw new Error('file list');
          return reply.data.files.length;
        }, lifecycleId()),
      )
      .toBe(0);
    await expect(page.getByLabel('输入草稿')).toHaveValue('切换后的输入保留');
    expect(await lifecycleDraft(page, nextSession)).toEqual({
      text: '切换后的输入保留',
      attachments: [],
    });
    expect(await readFile(source, 'utf8')).toBe('取消创建后的物理源不应导入');
    expect(
      await getApp().evaluate(() => {
        const state = (globalThis as unknown as GateGlobal).p03ReplyGate!;
        return {
          selections: state.selections,
          imports: state.imports,
          releasedTokens: state.releasedTokens,
        };
      }),
    ).toEqual({ selections: 0, imports: 0, releasedTokens: 0 });
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    await releaseRealReply(true).catch(() => {});
  }
});
test('P03-01 T08 leaving during a real Host selection releases its pending grant without importing or changing the new draft', async () => {
  const source = join(root, '待释放选择.txt'),
    content = '只授权选择尚未导入';
  await writeFile(source, content);
  const page = await launch();
  await page.keyboard.press('Control+n');
  await expect(page.getByLabel('输入草稿')).toBeEnabled();
  const originalSession = await latestSession(page);
  await page.getByLabel('输入草稿').fill('选择前的原问题');
  await expect
    .poll(async () => (await lifecycleDraft(page, originalSession)).text)
    .toBe('选择前的原问题');
  await holdRealReply('selection');
  try {
    await page.locator('input[type=file]').setInputFiles(source);
    await expect
      .poll(() => getApp().evaluate(() => (globalThis as unknown as GateGlobal).p03ReplyGate?.held))
      .toBe(true);
    await page.keyboard.press('Control+n');
    await expect(page.getByLabel('输入草稿')).toBeEnabled();
    const nextSession = await latestSession(page);
    expect(nextSession).not.toBe(originalSession);
    await page.getByLabel('输入草稿').fill('选择取消后的新问题');
    await expect
      .poll(async () => (await lifecycleDraft(page, nextSession)).text)
      .toBe('选择取消后的新问题');
    await releaseRealReply();
    await expect
      .poll(() =>
        getApp().evaluate(() => (globalThis as unknown as GateGlobal).p03ReplyGate?.releases),
      )
      .toBe(1);
    expect(
      await getApp().evaluate(() => {
        const state = (globalThis as unknown as GateGlobal).p03ReplyGate!;
        return {
          selections: state.selections,
          imports: state.imports,
          releasedTokens: state.releasedTokens,
        };
      }),
    ).toEqual({ selections: 1, imports: 0, releasedTokens: 1 });
    expect(await lifecycleDraft(page, originalSession)).toEqual({
      text: '选择前的原问题',
      attachments: [],
    });
    expect(await lifecycleDraft(page, nextSession)).toEqual({
      text: '选择取消后的新问题',
      attachments: [],
    });
    await expect(page.getByLabel('输入草稿')).toHaveValue('选择取消后的新问题');
    await expect(page.locator('.composer')).not.toContainText('待释放选择.txt');
    expect(await readFile(source, 'utf8')).toBe(content);
  } finally {
    await releaseRealReply(true).catch(() => {});
  }
});
test('P03-01 T07 chat physical File uses the real Host token import, preserves source bytes and downloads its pinned original', async () => {
  const source = join(root, '聊天物理原件.TXT'),
    text = '真实 Host 文件材料\n中文第二行';
  await writeFile(source, text);
  const before = createHash('sha256')
    .update(await readFile(source))
    .digest('hex');
  const page = await launch();
  await page.keyboard.press('Control+n');
  await expect(page.getByLabel('输入草稿')).toBeEnabled();
  await page.getByLabel('输入草稿').fill('保留此问题');
  expect(
    await page.evaluate(async () => {
      const virtual = await window.tapkit.selectChatFiles([new File(['clipboard'], '粘贴.txt')]);
      let forgedRejected = false;
      try {
        await window.tapkit.selectChatFiles([{ name: 'fake.txt' } as File]);
      } catch {
        forgedRejected = true;
      }
      // Guard the physical renderer route. Core reads its fixed readonly handle.
      const read = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function () {
        if (this.name === '聊天物理原件.TXT') throw new Error('PHYSICAL_RENDERER_BYTES_FORBIDDEN');
        return read.call(this);
      };
      return { virtual, forgedRejected };
    }),
  ).toEqual({ virtual: { selections: [], virtualIndexes: [0] }, forgedRejected: true });
  await page.locator('input[type=file]').setInputFiles(source);
  await expect(page.getByRole('region', { name: '聊天文件导入进度', exact: true })).toContainText(
    '原件已保存',
  );
  const material = page
    .locator('.composer')
    .locator('div')
    .filter({
      has: page.getByRole('button', { name: '下载原件', exact: true }),
    })
    .last();
  await expect(material).toContainText('聊天物理原件.TXT');
  await expect(material).toContainText(nativeStatus === 'available' ? '已就绪' : '处理失败');
  await expect(page.getByLabel('输入草稿')).toHaveValue('保留此问题');
  const record = await page.evaluate(async () => {
    let request = 30;
    const options = () => ({
      requestId: `0195abc0-0000-7000-8000-${(++request).toString(16).padStart(12, '0')}`,
    });
    const workspace = await window.tapkit.desktopCommand(options(), 'desktop.workspace', {});
    if (!workspace.ok || !('sessions' in workspace.data)) throw new Error('workspace');
    const sessionId = workspace.data.sessions[0]!.id;
    const draft = await window.tapkit.chatCommand(options(), 'drafts.get', {
      sessionId,
      windowId: window.tapkit.windowSlot,
    });
    if (!draft.ok || !('attachments' in draft.data)) throw new Error('draft');
    const ref = draft.data.attachments[0];
    if (!ref || ref.kind !== 'file') throw new Error('fixed file ref');
    const file = await window.tapkit.fileCommand(options(), 'files.get', {
      fileId: ref.fileId,
      versionId: ref.versionId,
      owner: { type: 'session', id: sessionId },
    });
    if (!file.ok || !('file' in file.data)) throw new Error('file');
    return {
      attachmentCount: draft.data.attachments.length,
      fileVersion: file.data.file.version.id,
      draftVersion: ref.versionId,
      text: draft.data.text,
      sessionId,
      fileId: ref.fileId,
    };
  });
  expect(record.attachmentCount).toBe(1);
  expect(record.fileVersion).toBe(record.draftVersion);
  expect(record.text).toBe('保留此问题');
  await picker([], join(root, '聊天固定原件.txt'));
  await material.getByRole('button', { name: '下载原件', exact: true }).click();
  await expect
    .poll(() => readFile(join(root, '聊天固定原件.txt'), 'utf8').catch(() => ''))
    .toBe(text);
  expect(
    createHash('sha256')
      .update(await readFile(source))
      .digest('hex'),
  ).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'docs/evidence/P03-01/chat-host-import.png' });
  const projectId = await page.evaluate(async (record) => {
    let request = 40;
    const options = () => ({
      requestId: `0195abc0-0000-7000-8000-${(++request).toString(16).padStart(12, '0')}`,
    });
    const created = await window.tapkit.desktopCommand(options(), 'projects.create', {
      name: '固定资料项目',
    });
    if (!created.ok || !('entityId' in created.data)) throw new Error('project');
    const projectId = created.data.entityId;
    const linked = await window.tapkit.fileCommand(options(), 'files.link', {
      fileId: record.fileId,
      versionId: record.draftVersion,
      owner: { type: 'project', id: projectId },
    });
    if (!linked.ok) throw new Error(linked.error.code);
    const unlinked = await window.tapkit.fileCommand(options(), 'files.unlink', {
      fileIds: [record.fileId],
      owner: { type: 'session', id: record.sessionId },
    });
    if (!unlinked.ok) throw new Error(unlinked.error.code);
    const moved = await window.tapkit.historyCommand(options(), 'sessions.move', {
      sessionIds: [record.sessionId],
      projectId,
    });
    if (!moved.ok) throw new Error(moved.error.code);
    return projectId;
  }, record);
  await picker([], join(root, '项目固定原件.txt'));
  await material.getByRole('button', { name: '下载原件', exact: true }).click();
  await expect
    .poll(() => readFile(join(root, '项目固定原件.txt'), 'utf8').catch(() => ''))
    .toBe(text);
  await page.evaluate(
    async ({ record, projectId }) => {
      const reply = await window.tapkit.fileCommand(
        { requestId: '0195abc0-0000-7000-8000-000000000051' },
        'files.unlink',
        { fileIds: [record.fileId], owner: { type: 'project', id: projectId } },
      );
      if (!reply.ok) throw new Error(reply.error.code);
    },
    { record, projectId },
  );
  await picker([], join(root, '撤权拒绝.txt'));
  await material.getByRole('button', { name: '下载原件', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('无权读取该材料');
  await expect(readFile(join(root, '撤权拒绝.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
});
test('P03-01 T07 real Host picker chain imports an immutable source, separates unavailable parsing and downloads its original', async () => {
  const source = join(root, '中文原件.TXT'),
    text = '只读中文资料\n第二行';
  await writeFile(source, text);
  const before = createHash('sha256')
    .update(await readFile(source))
    .digest('hex');
  const page = await launch();
  await importPicker(page, [source]);
  const card = page
    .locator('.file-card')
    .filter({ has: page.getByRole('button', { name: '中文原件.TXT', exact: true }) });
  await expect(card).toBeVisible();
  await expect(card).toContainText(
    nativeStatus === 'available' ? '内容已读取' : '受限内容读取组件暂不可用',
  );
  await card.getByRole('button', { name: '下载原件', exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return await readFile(join(root, '下载原件.txt'), 'utf8');
      } catch {
        return '';
      }
    })
    .toBe(text);
  expect(
    createHash('sha256')
      .update(await readFile(source))
      .digest('hex'),
  ).toBe(before);
  await card.getByRole('button', { name: '中文原件.TXT', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '文件详情', exact: true });
  await detail.getByLabel('文件名', { exact: true }).fill('资料更名.txt');
  await detail.getByRole('button', { name: '重命名', exact: true }).click();
  await expect(detail.getByRole('heading', { name: '资料更名.txt', exact: true })).toBeVisible();
  await detail.getByRole('button', { name: '收藏', exact: true }).click();
  await expect(detail.getByRole('button', { name: '取消收藏', exact: true })).toBeVisible();
  await detail.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByLabel('仅收藏', { exact: true }).check();
  await expect(page.locator('.file-card')).toHaveCount(1);
  await page.getByLabel('选择 资料更名.txt', { exact: true }).check();
  await page.getByRole('button', { name: '移入回收站', exact: true }).click();
  await page
    .getByRole('dialog', { name: '确认文件影响', exact: true })
    .getByRole('button', { name: '确认执行', exact: true })
    .click();
  await expect(page.locator('.file-card')).toHaveCount(0);
  await page.getByLabel('回收站', { exact: true }).check();
  await expect(page.locator('.file-card')).toHaveCount(1);
  await page.getByLabel('选择 资料更名.txt', { exact: true }).check();
  await page.getByRole('button', { name: '从回收站恢复', exact: true }).click();
  await page.getByLabel('回收站', { exact: true }).uncheck();
  await expect(page.locator('.file-card')).toHaveCount(1);
  await noOverflow(page);
});

test('P03-01 T08 cancelling one selected Host file releases only that choice and imports the remaining original through the actual UI', async () => {
  const keep = join(root, '继续导入.PNG'),
    cancelled = join(root, '取消选择.PNG');
  await writeFile(keep, 'keep original');
  await writeFile(cancelled, 'cancel original');
  const page = await launch();
  await picker([keep, cancelled]);
  await page.getByRole('button', { name: '导入文件', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '待导入文件', exact: true });
  await dialog
    .locator('li')
    .filter({ hasText: '取消选择.PNG' })
    .getByRole('button', { name: '取消此文件', exact: true })
    .click();
  await expect(dialog.locator('li')).toHaveCount(1);
  await expect(dialog).not.toContainText('取消选择.PNG');
  await dialog.getByRole('button', { name: '开始导入', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('button', { name: '继续导入.PNG', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '取消选择.PNG', exact: true })).toHaveCount(0);
  expect(await readFile(keep, 'utf8')).toBe('keep original');
  expect(await readFile(cancelled, 'utf8')).toBe('cancel original');
});

test('P03-01 T08 a persisted synthetic PDF structure needing OCR offers download and a searchable replacement without claiming readable content', async () => {
  await seedUsage('ocr');
  const page = await launch();
  await page.getByRole('button', { name: '扫描资料.pdf', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '文件详情', exact: true });
  await expect(detail.getByRole('status')).toContainText('需要 OCR');
  await expect(detail.getByRole('status')).toContainText('替换为可搜索的文本版 PDF');
  await expect(detail.getByRole('button', { name: '重试内容读取', exact: true })).toBeDisabled();
  await expect(detail).not.toContainText('内容已读取');
  await page.screenshot({ path: 'docs/evidence/P03-01/ocr-original-recovery.png' });
  const output = join(root, '下载扫描.pdf');
  await picker([], output);
  await detail.getByRole('button', { name: '下载原件', exact: true }).first().click();
  const original = await readFile(join(root, '扫描原件.pdf'));
  await expect
    .poll(async () => {
      try {
        return (await readFile(output)).equals(original);
      } catch {
        return false;
      }
    })
    .toBe(true);
});

test('P03-01 T07 image audio and video Host imports show original-only recovery and download exact bytes without offering parse retry', async () => {
  const samples = ['原件图片.PNG', '原件音频.MP3', '原件视频.MP4'].map((name) => ({
    name,
    bytes: Buffer.from('opaque synthetic media bytes ' + name),
  }));
  for (const sample of samples) await writeFile(join(root, sample.name), sample.bytes);
  const page = await launch();
  await importPicker(
    page,
    samples.map((sample) => join(root, sample.name)),
  );
  for (const [index, sample] of samples.entries()) {
    const card = page
      .locator('.file-card')
      .filter({ has: page.getByRole('button', { name: sample.name, exact: true }) });
    await expect(card).toContainText('只保留原件');
    await expect(card).not.toContainText('受限内容读取组件暂不可用');
    await card.getByRole('button', { name: sample.name, exact: true }).click();
    const detail = page.getByRole('dialog', { name: '文件详情', exact: true });
    await expect(detail.getByRole('status')).toContainText('转换为支持的文本与文档格式');
    await expect(detail.getByRole('button', { name: '重试内容读取', exact: true })).toBeDisabled();
    if (index === 0)
      await page.screenshot({ path: 'docs/evidence/P03-01/media-original-only.png' });
    const output = join(root, '下载' + sample.name);
    await picker([], output);
    await detail.getByRole('button', { name: '下载原件', exact: true }).first().click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(output)).equals(sample.bytes);
        } catch {
          return false;
        }
      })
      .toBe(true);
    expect(await readFile(join(root, sample.name))).toEqual(sample.bytes);
    await detail.getByRole('button', { name: '关闭', exact: true }).click();
  }
});

test('P03-01 T07 real saved-message note is searchable as a generated result in the library and pinned session, and remains downloadable after restart', async () => {
  await seedUsage();
  let page = await launch();
  const saved = await page.evaluate(async () => {
    const workspace = await window.tapkit.desktopCommand(
      { requestId: '0195abc0-0000-7000-8000-000000000071' },
      'desktop.workspace',
      {},
    );
    if (!workspace.ok || !('sessions' in workspace.data)) throw new Error('workspace');
    const session = workspace.data.sessions.find((s) => s.title === '中文附件会话')!;
    const messages = await window.tapkit.chatCommand(
      { requestId: '0195abc0-0000-7000-8000-000000000072' },
      'messages.list',
      { sessionId: session.id, limit: 100 },
    );
    if (!messages.ok || !('messages' in messages.data)) throw new Error('messages');
    const note = await window.tapkit.historyCommand(
      { requestId: '0195abc0-0000-7000-8000-000000000073' },
      'messages.saveNote',
      { sessionId: session.id, messageId: messages.data.messages[0]!.id },
    );
    if (!note.ok || !('entityId' in note.data)) throw new Error('save note');
    return { sessionId: session.id, fileId: note.data.entityId };
  });
  for (const owner of ['library', 'session:' + saved.sessionId]) {
    await page.getByRole('combobox', { name: /^文件范围与导入位置/ }).selectOption(owner);
    await page.getByRole('combobox', { name: /^来源/ }).selectOption('generated');
    await page.getByLabel('搜索名称和已读取的内容', { exact: true }).fill('阅读旧版');
    await expect(page.locator('.file-card')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '收藏笔记.md', exact: true })).toBeVisible();
  }
  await page.screenshot({ path: 'docs/evidence/P03-01/generated-note-library.png' });
  await getApp().close();
  page = await launch();
  await page
    .getByRole('combobox', { name: /^文件范围与导入位置/ })
    .selectOption('session:' + saved.sessionId);
  await page.getByRole('combobox', { name: /^来源/ }).selectOption('generated');
  await expect(page.getByRole('button', { name: '收藏笔记.md', exact: true })).toBeVisible();
  const output = join(root, '生成笔记下载.md');
  await picker([], output);
  await page
    .locator('.file-card')
    .filter({ has: page.getByRole('button', { name: '收藏笔记.md', exact: true }) })
    .getByRole('button', { name: '下载原件', exact: true })
    .click();
  await expect
    .poll(async () => {
      try {
        return await readFile(output, 'utf8');
      } catch {
        return '';
      }
    })
    .toBe('阅读旧版 <img src=x onerror=alert(1)>');
  await expect(page.locator('.file-library img')).toHaveCount(0);
});
test('P03-01 T07 genuine DOM File drop traverses preload and retains directory imports after cancelled selections', async () => {
  const path = join(root, '拖入.md');
  await writeFile(path, '# 实际原件');
  const page = await launch();
  await picker([path]);
  await page.getByRole('button', { name: '导入文件', exact: true }).click();
  await page
    .getByRole('dialog', { name: '待导入文件', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .click();
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'p03-physical-file';
    input.type = 'file';
    document.body.append(input);
  });
  await page.locator('#p03-physical-file').setInputFiles(path);
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#p03-physical-file')!,
      transfer = new DataTransfer();
    transfer.items.add(input.files![0]!);
    document
      .querySelector('.file-drop')!
      .dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    input.remove();
  });
  const dialog = page.getByRole('dialog', { name: '待导入文件', exact: true });
  await expect(dialog).toContainText('拖入.md');
  await dialog.getByRole('button', { name: '开始导入', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  const folder = join(root, '中文目录'),
    nested = join(folder, '子目录');
  await mkdir(nested, { recursive: true });
  await writeFile(join(nested, '表格.csv'), '列一,列二\n1,2');
  await importPicker(page, [folder], true);
  const folderSelect = page.getByRole('combobox', { name: '文件夹', exact: true });
  const nestedOption = folderSelect.locator('option').filter({ hasText: /^子目录$/ });
  await expect(nestedOption).toHaveCount(1);
  const id = await nestedOption.getAttribute('value');
  await folderSelect.selectOption(id!);
  await expect(page.locator('.file-card')).toContainText('表格.csv');
});
test('P03-01 responsive library grid and import instructions remain usable in light, dark and 200-percent layouts', async () => {
  const path = join(root, '中文资料_'.repeat(18) + '.txt');
  await writeFile(path, '固定合成内容');
  const page = await launch();
  await importPicker(page, [path]);
  await expect(page.locator('.file-card')).toContainText('中文资料_');
  await page.getByRole('button', { name: '网格', exact: true }).click();
  for (const [width, height] of [
    [1200, 800],
    [960, 640],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await noOverflow(page);
    await page.screenshot({ path: `docs/evidence/P03-01/library-light-${width}.png` });
  }
  await page.evaluate(async () => {
    const r = await window.tapkit.bootstrap({ requestId: '0195abc0-0000-7000-8000-000000000012' });
    if (!r.ok || !('profile' in r.data)) throw new Error('bootstrap');
    const saved = await window.tapkit.setSettings(
      {
        requestId: '0195abc0-0000-7000-8000-000000000013',
        expectedRevision: r.data.settings.revision,
      },
      {
        scope: { type: 'profile', id: r.data.profile.id },
        patch: { desktop: { ...r.data.settings.values.desktop, theme: 'dark' } },
      },
    );
    if (!saved.ok) throw new Error(saved.error.code);
  });
  await expect(page.locator('.desktop-shell')).toHaveAttribute('data-theme', 'dark');
  for (const [width, height] of [
    [1200, 800],
    [960, 640],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await noOverflow(page);
    await page.screenshot({ path: `docs/evidence/P03-01/library-dark-${width}.png` });
  }
  await page.evaluate(async () => {
    const r = await window.tapkit.bootstrap({ requestId: '0195abc0-0000-7000-8000-000000000014' });
    if (!r.ok || !('profile' in r.data)) throw new Error('bootstrap');
    const saved = await window.tapkit.setSettings(
      {
        requestId: '0195abc0-0000-7000-8000-000000000015',
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
  await noOverflow(page);
  await page.getByRole('button', { name: '导入文件', exact: true }).focus();
  await expect(page.getByRole('button', { name: '导入文件', exact: true })).toBeFocused();
  await page.screenshot({ path: 'docs/evidence/P03-01/library-dark-200-percent.png' });
});

test('P03-01 batch download keeps unfinished files selected and stops further dialogs after cancellation', async () => {
  const paths = ['A.txt', 'B.txt', 'C.txt'].map((name) => join(root, name));
  await Promise.all(paths.map((path, i) => writeFile(path, '原件 ' + i)));
  const page = await launch();
  await importPicker(page, paths);
  await expect(page.locator('.file-card')).toHaveCount(3);
  await page.getByRole('combobox', { name: '排序', exact: true }).selectOption('name');
  await expect(page.locator('.file-card').first()).toContainText('A.txt');
  await page.getByLabel('选择本页文件', { exact: true }).check();
  await getApp().evaluate(
    ({ dialog }, output) => {
      let calls = 0;
      dialog.showSaveDialog = async () => {
        calls++;
        return calls === 1
          ? { canceled: false, filePath: output }
          : { canceled: true, filePath: '' };
      };
      (globalThis as unknown as { p03SaveCalls: () => number }).p03SaveCalls = () => calls;
    },
    join(root, 'A-下载.txt'),
  );
  await page
    .locator('.file-actions')
    .getByRole('button', { name: '下载原件', exact: true })
    .click();
  const results = page.getByRole('region', { name: '逐项操作结果', exact: true });
  await expect(results.locator('li')).toHaveCount(3);
  await expect(results.locator('li').nth(0)).toContainText('A.txt · 已完成');
  await expect(results.locator('li').nth(1)).toContainText('B.txt · 已取消');
  await expect(results.locator('li').nth(2)).toContainText('C.txt · 已取消');
  await expect(page.getByLabel('选择 A.txt', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('选择 B.txt', { exact: true })).toBeChecked();
  await expect(page.getByLabel('选择 C.txt', { exact: true })).toBeChecked();
  expect(await readFile(join(root, 'A-下载.txt'), 'utf8')).toBe('原件 0');
  expect(
    await getApp().evaluate(() =>
      (globalThis as unknown as { p03SaveCalls: () => number }).p03SaveCalls(),
    ),
  ).toBe(2);
  await expect(page.getByText('操作已完成', { exact: true })).toHaveCount(0);
});

test('P03-01 T07 scoped library downloads and copies its pinned old version after format replacement, metadata edits and restoration', async () => {
  const source = join(root, '固定原件.TXT'),
    replacement = join(root, '当前新版.md');
  await writeFile(source, '固定旧版本字节');
  await writeFile(replacement, '# 仅文件库最新版');
  const page = await launch();
  await importPicker(page, [source]);
  expect(
    await page.evaluate(async () => {
      const reply = await window.tapkit.desktopCommand(
        { requestId: '0195abc0-0000-7000-8000-000000000061' },
        'projects.create',
        { name: '固定旧版项目' },
      );
      return reply.ok;
    }),
  ).toBe(true);
  const detail = page.getByRole('dialog', { name: '文件详情', exact: true });
  await page.getByRole('button', { name: '固定原件.TXT', exact: true }).click();
  await detail
    .getByRole('combobox', { name: '引用目标', exact: true })
    .selectOption({ label: '项目 · 固定旧版项目' });
  await detail.getByRole('button', { name: '引用到其他会话或项目', exact: true }).click();
  await detail.getByRole('button', { name: '关闭', exact: true }).click();
  await picker([replacement]);
  await page.getByRole('button', { name: '导入文件', exact: true }).click();
  const upload = page.getByRole('dialog', { name: '待导入文件', exact: true });
  await upload.getByRole('combobox', { name: '重复文件处理', exact: true }).selectOption('replace');
  await upload
    .getByRole('combobox', { name: '替换目标', exact: true })
    .selectOption({ label: '固定原件.TXT · 版本 1' });
  await upload.getByRole('button', { name: '开始导入', exact: true }).click();
  await expect(upload.getByRole('button', { name: '关闭', exact: true })).toBeEnabled();
  await upload.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('.file-card')).toContainText(
    nativeStatus === 'available' ? '内容已读取' : '受限内容读取组件暂不可用',
  );
  const scope = page.getByRole('combobox', { name: '文件范围与导入位置', exact: true });
  await scope.selectOption({ label: '项目 · 固定旧版项目' });
  await expect(page.locator('.file-card')).toHaveCount(1);
  await expect(page.locator('.file-card')).toContainText('此范围固定版本 1 · 固定原件.TXT');
  const format = page.getByRole('textbox', { name: '格式', exact: true });
  await format.fill('txt');
  await expect(page.locator('.file-card')).toHaveCount(1);
  await format.fill('md');
  await expect(page.locator('.file-card')).toHaveCount(0);
  await format.fill('');
  await expect(page.locator('.file-card')).toHaveCount(1);
  await picker([], join(root, '范围固定原件.txt'));
  await page.locator('.file-card').getByRole('button', { name: '下载原件', exact: true }).click();
  await expect
    .poll(() => readFile(join(root, '范围固定原件.txt'), 'utf8').catch(() => ''))
    .toBe('固定旧版本字节');
  await page.getByRole('button', { name: '当前新版.md', exact: true }).click();
  await detail.getByRole('textbox', { name: '文件名', exact: true }).fill('项目逻辑更名.md');
  await detail.getByRole('button', { name: '重命名', exact: true }).click();
  await expect(detail.getByRole('heading', { name: '项目逻辑更名.md', exact: true })).toBeVisible();
  await expect(detail).toContainText('此范围固定版本 1 · 固定原件.TXT');
  await detail.getByRole('button', { name: '收藏', exact: true }).click();
  await expect(detail.getByRole('button', { name: '取消收藏', exact: true })).toBeVisible();
  await expect(detail).toContainText('此范围固定版本 1 · 固定原件.TXT');
  await expect(
    detail.getByRole('button', { name: '另存副本', exact: true }).first(),
  ).toBeDisabled();
  await expect(detail).toContainText('副本名称需保留所选版本格式： TXT');
  await detail.getByRole('textbox', { name: '文件名', exact: true }).fill('固定旧版副本.txt');
  await detail.getByRole('button', { name: '另存副本', exact: true }).first().click();
  await detail.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('.file-card')).toHaveCount(2);
  const copy = page
    .locator('.file-card')
    .filter({ has: page.getByRole('button', { name: '固定旧版副本.txt', exact: true }) });
  await picker([], join(root, '范围副本原件.txt'));
  await copy.getByRole('button', { name: '下载原件', exact: true }).click();
  await expect
    .poll(() => readFile(join(root, '范围副本原件.txt'), 'utf8').catch(() => ''))
    .toBe('固定旧版本字节');
  await scope.selectOption('library');
  const current = page
    .locator('.file-card')
    .filter({ has: page.getByRole('button', { name: '项目逻辑更名.md', exact: true }) });
  await expect(current).not.toContainText('此范围固定版本');
  await picker([], join(root, '文件库当前原件.md'));
  await current.getByRole('button', { name: '下载原件', exact: true }).click();
  await expect
    .poll(() => readFile(join(root, '文件库当前原件.md'), 'utf8').catch(() => ''))
    .toBe('# 仅文件库最新版');
  await scope.selectOption({ label: '项目 · 固定旧版项目' });
  await page.getByRole('button', { name: '项目逻辑更名.md', exact: true }).click();
  const oldVersion = detail.locator('li').filter({ hasText: /^版本 1 ·/ });
  await oldVersion.getByRole('button', { name: '恢复为新版本', exact: true }).click();
  await expect(detail.locator('li').filter({ hasText: /^版本 3 ·/ })).toHaveCount(1);
  await expect(detail).toContainText('此范围固定版本 1 · 固定原件.TXT');
  await detail.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('.file-card')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'docs/evidence/P03-01/scoped-pinned-library.png' });
  expect(await readFile(source, 'utf8')).toBe('固定旧版本字节');
  expect(await readFile(replacement, 'utf8')).toBe('# 仅文件库最新版');
});
test('P03-01 T07 linking a folder file keeps it visible at project and session roots, and shared moves remain navigable in each scope', async () => {
  const source = join(root, '跨目录资料.txt');
  const content = '跨目录引用仍保留原件';
  await writeFile(source, content);
  const sourceHash = createHash('sha256')
    .update(await readFile(source))
    .digest('hex');
  const page = await launch();
  const scope = page.getByRole('combobox', { name: '文件范围与导入位置', exact: true });
  const folder = page
    .locator('.file-filters')
    .getByRole('combobox', { name: '文件夹', exact: true });
  const createFolder = async (name: string) => {
    await page.getByRole('button', { name: '新建文件夹', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新建文件夹', exact: true });
    await dialog.getByRole('textbox', { name: '文件夹名称', exact: true }).fill(name);
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(folder.locator('option').filter({ hasText: name })).toHaveCount(1);
  };
  await createFolder('文件库中文目录');
  await folder.selectOption({ label: '文件库中文目录' });
  const libraryFolderId = await folder.inputValue();
  await importPicker(page, [source]);
  const owners = await page.evaluate(
    async (requestIds) => {
      const project = await window.tapkit.desktopCommand(
        { requestId: requestIds.project },
        'projects.create',
        { name: '跨目录项目' },
      );
      const session = await window.tapkit.desktopCommand(
        { requestId: requestIds.session },
        'sessions.create',
        { mode: 'chat', title: '跨目录会话' },
      );
      if (
        !project.ok ||
        !('entityId' in project.data) ||
        !session.ok ||
        !('entityId' in session.data)
      )
        throw new Error('Scope fixtures');
      return { project: project.data.entityId, session: session.data.entityId };
    },
    { project: lifecycleId(), session: lifecycleId() },
  );
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '文件详情', exact: true });
  await page.getByRole('button', { name: '跨目录资料.txt', exact: true }).click();
  for (const label of ['项目 · 跨目录项目', '会话 · 跨目录会话']) {
    await detail.getByRole('combobox', { name: '引用目标', exact: true }).selectOption({ label });
    await detail.getByRole('button', { name: '引用到其他会话或项目', exact: true }).click();
    await expect(
      detail.getByRole('button', { name: '引用到其他会话或项目', exact: true }),
    ).toBeEnabled();
  }
  await detail.getByRole('button', { name: '关闭', exact: true }).click();
  await scope.selectOption('project:' + owners.project);
  await expect(page.locator('.file-card')).toHaveCount(1);
  expect(await folder.inputValue()).toBe('');
  await expect(folder.locator('option').filter({ hasText: '文件库中文目录' })).toHaveCount(0);
  await createFolder('项目中文目录');
  await page.locator('.file-card').getByRole('checkbox').check();
  await page
    .locator('.file-actions')
    .getByRole('combobox', { name: '文件夹', exact: true })
    .selectOption({ label: '项目中文目录' });
  await page.locator('.file-actions').getByRole('button', { name: '移动', exact: true }).click();
  await expect(page.locator('.file-card')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '逐项操作结果', exact: true })).toContainText(
    '已完成',
  );
  await folder.selectOption({ label: '项目中文目录' });
  const projectFolderId = await folder.inputValue();
  expect(projectFolderId).not.toBe(libraryFolderId);
  await expect(page.locator('.file-card')).toHaveCount(1);
  await picker([], join(root, '跨目录下载.txt'));
  await page.locator('.file-card').getByRole('button', { name: '下载原件', exact: true }).click();
  await expect
    .poll(() => readFile(join(root, '跨目录下载.txt'), 'utf8').catch(() => ''))
    .toBe(content);
  await scope.selectOption('session:' + owners.session);
  await expect(page.locator('.file-card')).toHaveCount(1);
  await expect(folder.locator('option')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '新建文件夹', exact: true })).toBeDisabled();
  await scope.selectOption('library');
  await expect(page.locator('.file-card')).toHaveCount(1);
  await folder.selectOption({ label: '文件库中文目录' });
  await expect(page.locator('.file-card')).toHaveCount(0);
  await folder.selectOption('');
  await expect(page.locator('.file-card')).toHaveCount(1);
  const physicalParent = await page.evaluate(async (requestId) => {
    const list = await window.tapkit.fileCommand({ requestId }, 'files.list', {});
    if (!list.ok || !('files' in list.data)) throw Error('Original file metadata');
    const file = list.data.files[0];
    if (!file || !('folderId' in file)) throw Error('Missing library file metadata');
    return file.folderId;
  }, lifecycleId());
  expect(physicalParent).toBe(projectFolderId);
  await noOverflow(page);
  await page.screenshot({ path: 'docs/evidence/P03-01/scoped-folder-root.png' });
  expect(
    createHash('sha256')
      .update(await readFile(source))
      .digest('hex'),
  ).toBe(sourceHash);
});

test('P03-01 T07 duplicate skip, explicit replacement, restoration and copy preserve pinned history and original bytes', async () => {
  const first = join(root, '第一目录', '同名资料.TXT'),
    second = join(root, '第二目录', '同名资料.TXT');
  await mkdir(join(root, '第一目录'));
  await mkdir(join(root, '第二目录'));
  await writeFile(first, '第一版中文原件');
  await writeFile(second, '第二版中文原件');
  const page = await launch();
  await importPicker(page, [first]);
  const selectImport = async (path: string, duplicate: 'skip' | 'replace') => {
    await picker([path]);
    await page.getByRole('button', { name: '导入文件', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '待导入文件', exact: true });
    await dialog
      .getByRole('combobox', { name: '重复文件处理', exact: true })
      .selectOption(duplicate);
    return dialog;
  };
  const closeImport = async (dialog: ReturnType<Page['getByRole']>) => {
    await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  };
  const skipped = await selectImport(first, 'skip');
  await skipped.getByRole('button', { name: '开始导入', exact: true }).click();
  await expect(skipped).toContainText('重复内容已跳过');
  await closeImport(skipped);
  await expect(page.locator('.file-card')).toHaveCount(1);
  const replacement = await selectImport(second, 'replace');
  await expect(replacement.getByRole('button', { name: '开始导入', exact: true })).toBeDisabled();
  await replacement
    .getByRole('combobox', { name: '替换目标', exact: true })
    .selectOption({ label: '同名资料.TXT · 版本 1' });
  await replacement.getByRole('button', { name: '开始导入', exact: true }).click();
  await closeImport(replacement);
  await expect(page.locator('.file-card')).toHaveCount(1);
  await expect(page.locator('.file-card')).toContainText(
    nativeStatus === 'available' ? '内容已读取' : '受限内容读取组件暂不可用',
  );
  await page.getByRole('button', { name: '同名资料.TXT', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '文件详情', exact: true });
  const version = (n: number) =>
    detail.locator('li').filter({ hasText: new RegExp('^版本 ' + n + ' ·') });
  await expect(version(2)).toHaveCount(1);
  await expect(version(1)).toHaveCount(1);
  await version(1).getByRole('button', { name: '恢复为新版本', exact: true }).click();
  await expect(version(3)).toHaveCount(1);
  await expect(version(2)).toHaveCount(1);
  await expect(version(1)).toHaveCount(1);
  await picker([], join(root, '版本二下载.txt'));
  await version(2).getByRole('button', { name: '下载原件', exact: true }).click();
  await expect
    .poll(() => readFile(join(root, '版本二下载.txt'), 'utf8').catch(() => ''))
    .toBe('第二版中文原件');
  await picker([], join(root, '恢复版下载.txt'));
  await version(3).getByRole('button', { name: '下载原件', exact: true }).click();
  await expect
    .poll(() => readFile(join(root, '恢复版下载.txt'), 'utf8').catch(() => ''))
    .toBe('第一版中文原件');
  await detail.getByRole('textbox', { name: '文件名', exact: true }).fill('独立副本.txt');
  await detail.getByRole('button', { name: '另存副本', exact: true }).first().click();
  await detail.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('.file-card')).toHaveCount(2);
  const created = await page.evaluate(async () => {
    const reply = await window.tapkit.desktopCommand(
      { requestId: '0195abc0-0000-7000-8000-000000000021' },
      'projects.create',
      { name: '版本引用项目' },
    );
    return reply.ok;
  });
  expect(created).toBe(true);
  await page.getByRole('button', { name: '同名资料.TXT', exact: true }).click();
  await detail
    .getByRole('combobox', { name: '引用目标', exact: true })
    .selectOption({ label: '项目 · 版本引用项目' });
  await detail.getByRole('button', { name: '引用到其他会话或项目', exact: true }).click();
  await detail.getByRole('button', { name: '关闭', exact: true }).click();
  await page
    .getByRole('combobox', { name: '文件范围与导入位置', exact: true })
    .selectOption({ label: '项目 · 版本引用项目' });
  await expect(page.locator('.file-card')).toHaveCount(1);
  await page.getByLabel('选择 同名资料.TXT', { exact: true }).check();
  await page.getByRole('button', { name: '只移除此范围的引用', exact: true }).click();
  await page
    .getByRole('dialog', { name: '确认文件影响', exact: true })
    .getByRole('button', { name: '确认执行', exact: true })
    .click();
  await expect(page.locator('.file-card')).toHaveCount(0);
  await page
    .getByRole('combobox', { name: '文件范围与导入位置', exact: true })
    .selectOption('library');
  await expect(page.locator('.file-card')).toHaveCount(2);
  await page.getByRole('button', { name: '独立副本.txt', exact: true }).click();
  await expect(version(1)).toHaveCount(1);
  await expect(version(2)).toHaveCount(0);
  await picker([], join(root, '副本下载.txt'));
  await version(1).getByRole('button', { name: '下载原件', exact: true }).click();
  await expect
    .poll(() => readFile(join(root, '副本下载.txt'), 'utf8').catch(() => ''))
    .toBe('第一版中文原件');
  expect(await readFile(first, 'utf8')).toBe('第一版中文原件');
  expect(await readFile(second, 'utf8')).toBe('第二版中文原件');
});

test('P03-01 interrupted import survives actual process termination and its recovery notice can be dismissed across Electron restarts', async () => {
  const node = resolve('.runtime/node/node-v24.21.0-win-x64/node.exe');
  const sources = [join(root, '第一.txt'), join(root, '第二.txt')];
  await Promise.all(sources.map((path, i) => writeFile(path, '原件保留 ' + i)));
  const bundle = join(root, 'crash-bundle');
  await promisify(execFile)(
    node,
    [
      resolve('node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      'tests/fixtures/P03-import-crash.vite.config.ts',
      '--outDir',
      bundle,
    ],
    { timeout: 15000, windowsHide: true },
  );
  const child = spawn(node, [join(bundle, 'import-crash.cjs'), root], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const exited = once(child, 'exit');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const message = await Promise.race([
      once(child, 'message').then(([message]) => message),
      exited.then(() => {
        throw new Error('Import fixture exited before checkpoint');
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Import checkpoint timeout')), 10000);
      }),
    ]);
    expect(message).toMatchObject({ event: 'first_committed_second_waiting' });
  } finally {
    if (timer) clearTimeout(timer);
    child.kill();
    await exited;
  }
  const page = await launch();
  const notice = page.getByRole('region', { name: '中断的导入记录', exact: true });
  await expect(notice).toContainText('第一.txt · 原件已保存');
  await expect(notice).toContainText('第二.txt · 导入未完成');
  await expect(notice).toContainText('未完成项的选择授权已丢失');
  await expect(page.locator('.file-card')).toHaveCount(1);
  await noOverflow(page);
  await page.screenshot({ path: 'docs/evidence/P03-01/import-recovery.png' });
  await notice.getByRole('button', { name: '隐藏此导入记录', exact: true }).click();
  await expect(notice).toHaveCount(0);
  await getApp().close();
  const restarted = await launch();
  await expect(restarted.getByRole('region', { name: '中断的导入记录', exact: true })).toHaveCount(
    0,
  );
  await expect(restarted.locator('.file-card')).toHaveCount(1);
  expect(await readFile(sources[0]!, 'utf8')).toBe('原件保留 0');
  expect(await readFile(sources[1]!, 'utf8')).toBe('原件保留 1');
});
