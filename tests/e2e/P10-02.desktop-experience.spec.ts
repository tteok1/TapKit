import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron, type Page } from './test';
import { solidPng } from '../fixtures/P07-01.images';

async function launch() {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P10-02 Electron '));
  await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [resolve('apps/desktop')],
    env,
    chromiumSandbox: true,
  });
  return { app, page: await app.firstWindow(), dir };
}

async function ready(page: Page) {
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
}

async function saveSettings(page: Page) {
  await page.getByRole('button', { name: '保存设置', exact: true }).press('Enter');
  await expect(page.getByText('设置已保存', { exact: true })).toBeVisible();
}

async function sidebar(page: Page) {
  const toggle = page.getByRole('button', { name: '展开侧栏', exact: true });
  if (await toggle.count()) await toggle.press('Enter');
}

test('P10-02 T22 keyboard-only planned pages and history issue no model, timer or write command', async () => {
  test.setTimeout(165000);
  const { app, page, dir } = await launch();
  try {
    await ready(page);
    await page.getByRole('link', { name: '设置', exact: true }).press('Enter');
    const planning = page.getByRole('checkbox', { name: '显示规划中入口' });
    await expect(planning).not.toBeChecked();
    await expect(page.getByRole('navigation', { name: '规划中功能' })).toHaveCount(0);
    await planning.press('Space');
    await saveSettings(page);
    const nav = page.getByRole('navigation', { name: '规划中功能' });
    const offset = (await readFile(join(dir, 'logs/ipc.jsonl'))).byteLength;
    for (const title of ['智能体', '插件与应用', 'Skills 与模板', '定时任务']) {
      for (const [action, destination] of [
        ['返回聊天', '会话历史'],
        ['查看项目', '项目'],
      ] as const) {
        await nav.getByRole('link', { name: new RegExp(title) }).press('Enter');
        await expect(page.getByRole('main').getByRole('heading', { name: title })).toBeVisible();
        const feature = page.getByRole('region', { name: title, exact: true });
        await expect(feature.getByText('规划中', { exact: true })).toBeVisible();
        await expect(feature.getByRole('link')).toHaveCount(2);
        await expect(feature.getByRole('button')).toHaveCount(0);
        await feature.getByRole('link', { name: action }).press('Enter');
        const main = page.getByRole('main');
        await expect(
          action === '返回聊天'
            ? main.getByRole('region', { name: destination, exact: true })
            : main.getByRole('heading', { name: destination, exact: true }),
        ).toBeVisible();
        const back = page.getByRole('button', { name: '后退', exact: true });
        await expect(back).toBeEnabled();
        await back.press('Enter');
        await expect(feature).toBeVisible();
        const forward = page.getByRole('button', { name: '前进', exact: true });
        await expect(forward).toBeEnabled();
        await forward.press('Enter');
        await expect(feature).toHaveCount(0);
      }
    }
    const projectQuery = page.getByRole('textbox', { name: '搜索项目' });
    await projectQuery.fill('没有匹配的验收项目');
    await expect(page.getByRole('main').getByRole('status')).toHaveText('没有匹配的项目。');
    const commands = (await readFile(join(dir, 'logs/ipc.jsonl')))
      .subarray(offset)
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line).command as string);
    expect(commands.length).toBeGreaterThan(0);
    expect(
      commands.filter(
        (name) =>
          ![
            'app.bootstrap',
            'desktop.workspace',
            'providers.list',
            'sidebar.list',
            'sessions.list',
            'projects.list',
            'events.subscribe',
          ].includes(name),
      ),
    ).toEqual([]);
    await page.keyboard.press('Control+n');
    const input = page.locator('#draft-input');
    await expect(input).toBeFocused();
    await input.fill('@');
    for (const name of ['插件与应用', '定时任务', '图片创作', '语音与视频', '桌面与屏幕操作'])
      await expect(page.getByRole('main').getByRole('button', { name, exact: true })).toHaveCount(
        0,
      );
  } finally {
    await app.close();
  }
});

test('P10-02 T22 settings keyboard search, conflicts, native shortcut, help review and 200-percent themes', async ({}, info) => {
  test.setTimeout(180000);
  const { app, page, dir } = await launch();
  try {
    await ready(page);
    await page.getByRole('link', { name: '设置', exact: true }).press('Enter');
    const settings = page.getByRole('main');
    const search = settings.getByRole('searchbox', { name: '搜索设置' });
    await search.fill('高对比度');
    await settings.getByRole('link', { name: '高对比度', exact: true }).press('Enter');
    await expect(settings.getByRole('checkbox', { name: '高对比度', exact: true })).toBeFocused();
    await search.fill('快捷键');
    await settings.getByRole('link', { name: '快捷键', exact: true }).press('Enter');
    const quickKey = settings.getByLabel('全局快速输入', { exact: true });
    await quickKey.selectOption('Ctrl+K');
    await expect(settings.getByRole('alert')).toContainText('快捷键重复');
    await settings.getByRole('button', { name: '保存设置', exact: true }).press('Enter');
    await expect(settings.getByText('设置已保存', { exact: true })).toHaveCount(0);
    const candidate = 'Ctrl+Alt+Space';
    expect(
      await app.evaluate(
        ({ globalShortcut }, key) => globalShortcut.register(key, () => {}),
        candidate,
      ),
    ).toBe(true);
    await quickKey.selectOption(candidate);
    await saveSettings(page);
    await expect(settings.getByText(/系统快捷键未注册/)).toBeVisible();
    const enableQuickInput = settings.getByRole('checkbox', { name: '启用全局快速输入快捷键' });
    await enableQuickInput.press('Space');
    await saveSettings(page);
    await expect(settings.getByText('系统快捷键已关闭')).toBeVisible();
    await enableQuickInput.press('Space');
    await saveSettings(page);
    await expect(settings.getByText(/系统快捷键未注册/)).toBeVisible();
    await app.evaluate(({ globalShortcut }, key) => globalShortcut.unregister(key), candidate);
    await settings.getByRole('button', { name: '重新加载设置' }).press('Enter');
    await expect(settings.getByText('已重新加载')).toBeVisible();
    await expect(settings.getByText('系统快捷键已注册')).toBeVisible();
    expect(
      await app.evaluate(({ globalShortcut }, key) => globalShortcut.isRegistered(key), candidate),
    ).toBe(true);

    const nextWindow = app.waitForEvent('window');
    await settings.getByRole('button', { name: '打开快速输入窗口' }).press('Enter');
    const quick = await nextWindow;
    const scratch = quick.getByRole('textbox', { name: '聊天草稿' });
    await expect(scratch).toBeFocused();
    await scratch.fill('只转入草稿');
    await quick.getByRole('button', { name: '在聊天中打开' }).press('Enter');
    await expect(quick.locator('#draft-input')).toHaveValue('只转入草稿');
    await expect(quick.getByRole('main').locator('.chat-message')).toHaveCount(0);

    await settings.getByRole('link', { name: '查看发送与关闭浮层快捷键' }).press('Enter');
    await expect(settings.getByText(/TapKit .* · Electron .* · 开发构建/)).toBeVisible();
    await settings.getByRole('searchbox', { name: '搜索帮助' }).fill('无匹配的指南');
    await expect(settings.getByText(/没有匹配的帮助/)).toBeVisible();
    const target = join(dir, 'diagnostic.md');
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, target);
    await settings.getByRole('checkbox', { name: '附带本机诊断摘要' }).press('Space');
    await settings.getByRole('checkbox', { name: '附带我选定的会话片段' }).press('Space');
    await settings.getByLabel('粘贴要分享的内容').fill('用户主动选择的片段');
    await settings.locator('input[type=file]').setInputFiles({
      name: 'synthetic.png',
      mimeType: 'image/png',
      buffer: solidPng(),
    });
    await expect(settings.getByRole('img', { name: '将随诊断附件保存的截图' })).toBeVisible();
    await settings.getByRole('button', { name: '保存反馈附件' }).press('Enter');
    await expect(settings.getByText('已保存反馈附件。')).toBeVisible();
    const diagnostic = await readFile(target, 'utf8');
    expect(diagnostic).toContain('用户主动选择的片段');
    expect(diagnostic).toContain('data:image/jpeg;base64,');
    expect(diagnostic).not.toContain(dir);
    expect(diagnostic).not.toContain('只转入草稿');
    await app.evaluate(({ shell }) => {
      const opened: string[] = [];
      Object.assign(globalThis, { p10OpenedLinks: opened });
      shell.openExternal = async (url) => {
        opened.push(url);
      };
    });
    await expect
      .poll(() => app.evaluate(() => Reflect.get(globalThis, 'p10OpenedLinks')))
      .toEqual([]);
    await settings.getByRole('button', { name: '在 GitHub 提交问题' }).press('Enter');
    await expect
      .poll(() => app.evaluate(() => Reflect.get(globalThis, 'p10OpenedLinks')))
      .toEqual(['https://github.com/tteok1/TapKit/issues/new']);

    await sidebar(page);
    await page.getByRole('link', { name: '设置', exact: true }).press('Enter');
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.id === 1)
        ?.setContentSize(960, 640),
    );
    // Windows per-monitor DPI can round the requested native size by a pixel.
    await expect
      .poll(() =>
        page.evaluate(() =>
          Math.max(Math.abs(window.innerWidth - 960), Math.abs(window.innerHeight - 640)),
        ),
      )
      .toBeLessThanOrEqual(2);
    const shell = page.locator('.desktop-shell');
    const input = page.locator('#draft-input');
    for (const [name, theme, contrast] of [
      ['light', 'light', false],
      ['dark', 'dark', false],
      ['high-contrast', 'light', true],
    ] as const) {
      await settings.getByLabel('主题', { exact: true }).selectOption(theme);
      if (contrast) await settings.getByRole('checkbox', { name: '高对比度' }).press('Space');
      await settings.getByLabel('缩放', { exact: true }).selectOption('2');
      await saveSettings(page);
      await expect(shell).toHaveAttribute('data-theme', theme);
      if (contrast) await expect(shell).toHaveAttribute('data-contrast', 'high');
      await expect(shell).toHaveCSS('zoom', '2');
      const connection = page.locator('.connection-label');
      await expect(connection).toHaveText('本地已连接');
      await expect(connection).toHaveCSS('font-size', '12px');
      await page.keyboard.press('Control+n');
      await expect(input).toBeFocused();
      await expect(input).toBeInViewport();
      await expect(input).toBeEditable();
      await expect(page.getByRole('button', { name: '发送', exact: true })).toBeInViewport();
      await page.keyboard.press('Control+k');
      await expect(page.getByRole('dialog', { name: '搜索' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(input).toBeFocused();
      if (name === 'light') {
        await input.fill('慢速原问题');
        await input.press('Enter');
        const stop = page.getByRole('button', { name: '停止回复', exact: true });
        await expect(stop).toBeInViewport();
        await page.keyboard.press('Escape');
        await expect(stop).toBeVisible();
        await stop.press('Enter');
        await expect(stop).toHaveCount(0);
        await page.keyboard.press('Control+n');
        await expect(input).toBeFocused();
      }
      await page.screenshot({ path: info.outputPath(name + '-960-200.png') });
      await sidebar(page);
      await page.getByRole('link', { name: '设置', exact: true }).press('Enter');
    }
    await settings.getByRole('button', { name: '恢复此类别默认值' }).press('Enter');
    await expect(settings.getByLabel('缩放', { exact: true })).toHaveValue('1');
    await saveSettings(page);
    await settings.getByRole('button', { name: '恢复全部本机偏好', exact: true }).press('Enter');
    await settings.getByRole('button', { name: '确认恢复全部本机偏好' }).press('Enter');
    await expect(settings.getByText('已恢复全部本机偏好。')).toBeVisible();
  } finally {
    await app.close();
  }
});

test('P10-02 T22 keyboard chat, explicit approval and artifact preview', async () => {
  test.setTimeout(180000);
  const { app, page } = await launch();
  try {
    await ready(page);
    await page.keyboard.press('Control+n');
    const input = page.locator('#draft-input');
    await expect(input).toBeFocused();
    await input.fill('验证键盘聊天');
    await input.press('Enter');
    await expect(page.locator('.chat-message.assistant')).toBeVisible({ timeout: 30000 });
    await page.getByRole('link', { name: '文件', exact: true }).press('Enter');
    await page.getByRole('textbox', { name: '搜索名称和已读取的内容' }).fill('没有匹配的验收资料');
    await expect(page.getByRole('main').getByText('没有匹配的文件。')).toBeVisible();
    await page.getByRole('button', { name: '通知', exact: true }).press('Enter');
    await page.getByRole('checkbox', { name: '仅未读' }).press('Space');
    await expect(page.getByRole('main').getByText('没有匹配的通知。')).toBeVisible();
    await page.getByRole('link', { name: '工作', exact: true }).press('Enter');
    const workSearch = page.getByRole('textbox', { name: '搜索工作目标' });
    await workSearch.fill('没有匹配的验收任务');
    await expect(page.getByRole('main').getByText('没有匹配的工作任务。')).toBeVisible();
    await workSearch.clear();
    await page.getByRole('button', { name: '新建工作', exact: true }).press('Enter');
    const form = page.getByRole('form', { name: '新建工作' });
    await form.getByLabel('工作目标').fill('P06审批：P10-02 键盘验证');
    await form.getByLabel('成果数量').fill('2');
    await form.getByRole('button', { name: '创建工作', exact: true }).press('Enter');
    await expect(page.locator('.work-detail')).toContainText('等待输入', { timeout: 30000 });
    await page.getByRole('button', { name: '权限与审批', exact: true }).press('Enter');
    const card = page.locator('.work-approval');
    await expect(card).toHaveAccessibleName('待审阅操作');
    await card.getByRole('button', { name: '批准操作', exact: true }).press('Enter');
    await expect(card).toHaveCount(0);
    await page.getByRole('link', { name: '工作', exact: true }).press('Enter');
    await page
      .locator('.work-open')
      .filter({ hasText: 'P06审批：P10-02 键盘验证' })
      .first()
      .press('Enter');
    await expect(page.locator('.work-detail')).toContainText('已完成', { timeout: 30000 });
    await page.getByRole('button', { name: '打开成果 1', exact: true }).last().press('Enter');
    const preview = page.getByRole('region', { name: '文件预览', exact: true });
    await expect(preview).toBeVisible();
    await preview.getByRole('button', { name: '关闭预览', exact: true }).press('Enter');
    await expect(preview).toHaveCount(0);
  } finally {
    await app.close();
  }
});
