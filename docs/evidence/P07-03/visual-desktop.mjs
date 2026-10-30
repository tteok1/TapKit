// Post-completion UI QA in the latest isolated fixture profile, production build.
// No runs are created or resumed; provider attempt counts must stay unchanged.
import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
const root = process.cwd(), base = resolve('docs/evidence/P07-03/desktop-final');
const directory = readdirSync('.test-data').filter(n => n.startsWith('P07-03 desktop ')).map(n => resolve('.test-data', n)).sort((a,b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
if (!directory || dirname(directory) !== resolve('.test-data') || !basename(directory).startsWith('P07-03 desktop ') || !existsSync(join(directory, 'P02-02.fixture'))) throw Error('PERMISSION_DENIED');
if (readFileSync('packages/core/dist/index.cjs', 'utf8').includes('installChatFixture')) throw Error('TEST_BUILD_REFUSED');
function snapshot() {
  const db = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
  try { return { active: db.prepare("SELECT count(*) n FROM runs WHERE status NOT IN ('completed','failed','partial','cancelled','budget_stopped')").get().n, attempts: db.prepare('SELECT count(*) n FROM provider_attempts').get().n }; }
  finally { db.close(); }
}
const before = snapshot();
if (before.active) throw Error('ACTIVE_TASK_REFUSED');
mkdirSync(base, { recursive: true });
let app;
const report = { status: 'failed', profile: directory, before, views: [] };
try {
  const env = { ...process.env, TAPKIT_DATA_DIR: directory };
  for (const k of ['ELECTRON_RUN_AS_NODE','TAPKIT_TEST_BUILD','TAPKIT_CHAT_FIXTURE','TAPKIT_WEB_FIXTURE','NODE_OPTIONS']) delete env[k];
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
  await page.evaluate(async () => {
    const id = () => { const v=crypto.randomUUID(); return v.slice(0,14)+'7'+v.slice(15); };
    const b = await window.tapkit.bootstrap({ requestId:id() });
    if (!b.ok) throw Error('bootstrap');
    const r = await window.tapkit.setSettings({ requestId:id(), expectedRevision:b.data.settings.revision }, { scope:{ type:'profile', id:b.data.profile.id }, patch:{ desktop:{ ...b.data.settings.values.desktop, zoom:1, theme:'light' } } });
    if (!r.ok) throw Error(r.error.code);
  });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  await expect.poll(() => page.locator('.desktop-shell').evaluate(el => Number(getComputedStyle(el).zoom))).toBe(1);
  const initialPanel = page.getByRole('button', { name:'关闭详情', exact:true });
  if (await initialPanel.isVisible()) await initialPanel.click();
  const workLink = page.getByRole('link', { name: '工作', exact: true });
  if (!await workLink.isVisible()) await page.getByRole('button', { name: /^(展开|收起)侧栏$/ }).click();
  await page.getByRole('link', { name: '工作', exact: true }).click();
  await page.locator('.work-open').filter({ hasText: '修改后的中文标题' }).first().click();
  await page.getByRole('button', { name: '幻灯片与备注', exact: true }).last().click();
  const slides = page.getByRole('region', { name: '演示文稿成果' });
  await slides.getByRole('button', { name: '2. 修改后的中文标题', exact: true }).click();
  await expect(slides.getByLabel('页面标题')).toHaveValue('修改后的中文标题');
  const panel = page.getByRole('button', { name: '关闭详情', exact: true });
  if (await panel.isVisible()) await panel.click();
  for (const [theme, zoom, width] of [['light',1,1440],['dark',1,960],['dark',2,960]]) {
    await page.evaluate(async ({ theme, zoom }) => {
      const id = () => { const v = crypto.randomUUID(); return v.slice(0,14)+'7'+v.slice(15); };
      const b = await window.tapkit.bootstrap({ requestId: id() });
      if (!b.ok) throw Error('bootstrap');
      const r = await window.tapkit.setSettings({ requestId: id(), expectedRevision: b.data.settings.revision }, { scope: { type:'profile', id:b.data.profile.id }, patch: { desktop: { ...b.data.settings.values.desktop, theme, zoom } } });
      if (!r.ok) throw Error(r.error.code);
    }, { theme, zoom });
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 900), width);
    await expect(page.locator('.desktop-shell')).toHaveAttribute('data-theme', theme);
    await expect.poll(() => page.locator('.desktop-shell').evaluate(el => Number(getComputedStyle(el).zoom))).toBe(zoom);
    const sidebar = page.getByRole('button', { name: '收起侧栏', exact: true });
    if (width === 960 && await sidebar.isVisible()) await sidebar.click();
    await slides.getByLabel('页面标题').scrollIntoViewIfNeeded();
    const geometry = await slides.getByLabel('页面标题').evaluate(el => {
      const r = el.getBoundingClientRect(), cx = r.left+r.width/2, cy = r.top+r.height/2;
      return { viewport: innerWidth, left:r.left, right:r.right, zoom:getComputedStyle(document.querySelector('.desktop-shell')).zoom, unobscured:document.elementFromPoint(cx,cy) === el };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport+1);
    expect(geometry.unobscured).toBe(true);
    const prefix = `${theme}-${width}-${zoom}`;
    await page.screenshot({ path:join(base, prefix+'-fields.png') });
    await slides.getByRole('button', { name:'生成修改版本', exact:true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path:join(base, prefix+'-actions.png') });
    report.views.push({ theme, zoom, width, ...geometry });
  }
  report.status = 'passed';
} finally {
  await app?.close();
  report.after = snapshot();
  if (report.after.active || report.after.attempts !== before.attempts) report.status = 'failed';
  writeFileSync(join(base,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  process.exitCode = report.status === 'passed' ? 0 : 1;
}
