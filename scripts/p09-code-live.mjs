import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
  realpathSync,
  lstatSync,
  unlinkSync,
} from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { connectionProfile } from './p07-live-profile.mjs';

// Explicit, bounded developer acceptance; never imported by the app or CI.
const root = resolve('docs/evidence/P09-01'),
  pointer = resolve('.test-data/P09-01-live.json'),
  limit = 10;
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const count = () =>
  readdirSync(root)
    .filter((n) => /^live-[a-f0-9-]{36}$/.test(n))
    .reduce(
      (n, d) =>
        n +
        (existsSync(join(root, d, 'report.json'))
          ? read(join(root, d, 'report.json')).connectionAttempts.length
          : 0),
      0,
    );
if (process.argv[2] === '--prepare') {
  mkdirSync(root, { recursive: true });
  if (existsSync(pointer) && !read(pointer).closed) throw Error('PRIOR_LIVE_UNSETTLED');
  if (count() >= limit) throw Error('CONNECTION_CHECK_LIMIT');
  const round = randomUUID(),
    profile = await connectionProfile(true, 'P09-01', round),
    out = join(root, 'live-' + round),
    source = resolve('.test-data/P09-01-live-code-' + round);
  mkdirSync(out);
  mkdirSync(source);
  writeFileSync(join(source, 'sum.mjs'), 'export const add = (a, b) => a - b;\n');
  writeFileSync(
    join(source, 'AGENTS.md'),
    '合成验收项目。只修正sum.mjs里的加法，保留文件名与其余结构。\n',
  );
  save(pointer, { round, directory: profile.directory, out, source, closed: false });
  save(join(out, 'prepared.json'), {
    task: 'P09-01',
    model: profile.modelId,
    limit,
    formalLimit: { calls: 1, tools: 2, tokens: 20000 },
    connectionChecks: 0,
    scope:
      'isolated encrypted copy of configured Zhipu Chat account; synthetic local code only; no external writes',
  });
  console.log(JSON.stringify({ prepared: true, checks: 0, remaining: limit - count() }));
  process.exit(0);
}
if (process.argv[2] !== '--run-once' || process.env.TAPKIT_P09_LIVE !== '1')
  throw Error('PERMISSION_DENIED');
const manifest = read(pointer),
  directory = realpathSync(manifest.directory),
  out = realpathSync(manifest.out),
  source = realpathSync(manifest.source);
if (
  manifest.closed ||
  dirname(directory).toLowerCase() !== resolve('.test-data').toLowerCase() ||
  !basename(directory).startsWith('P09-01-live-profile-') ||
  lstatSync(directory).isSymbolicLink() ||
  dirname(out) !== root ||
  existsSync(join(out, 'report.json')) ||
  dirname(source).toLowerCase() !== resolve('.test-data').toLowerCase() ||
  !basename(source).startsWith('P09-01-live-code-') ||
  lstatSync(source).isSymbolicLink()
)
  throw Error('PERMISSION_DENIED');
const artifacts = ['packages/core/dist/index.cjs', 'apps/desktop/out/main/index.js'];
for (const path of artifacts)
  if (/installChatFixture|installWebFixture/.test(readFileSync(path, 'utf8')))
    throw Error('TEST_BUILD_REFUSED');
const report = {
  task: 'P09-01',
  status: 'running',
  phase: 'startup',
  connectionLimit: limit,
  connectionAttempts: [],
  connectionSucceededBeforeTask: false,
  credentialRemoved: false,
  build: Object.fromEntries(
    artifacts.map((p) => [p, createHash('sha256').update(readFileSync(p)).digest('hex')]),
  ),
};
const checkpoint = () => {
  save(join(out, 'report.json'), report);
  console.log(
    JSON.stringify({
      phase: report.phase,
      status: report.status,
      checks: report.connectionAttempts.length,
      task: report.taskRun?.status,
    }),
  );
};
let app, page, runId;
const invoke = async (command, payload, revision) => {
  const r = await page.evaluate(
    async (p) => {
      const id = crypto.randomUUID(),
        options = {
          requestId: id.slice(0, 14) + '7' + id.slice(15),
          ...(p.revision === undefined ? {} : { expectedRevision: p.revision }),
        };
      return window.tapkit.workCommand(options, p.command, p.payload);
    },
    { command, payload, revision },
  );
  if (!r.ok) throw Error(r.error.code);
  return r.data;
};
try {
  const env = { ...process.env, TAPKIT_DATA_DIR: directory };
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'NODE_OPTIONS',
    'TAPKIT_TEST_BUILD',
    'TAPKIT_CHAT_FIXTURE',
    'TAPKIT_WEB_FIXTURE',
    'TAPKIT_BROWSER_FIXTURE',
  ])
    delete env[key];
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 180000 });
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('link', { name: '模型连接', exact: true })
    .click();
  await page.getByRole('link', { name: 'API Key 账户', exact: true }).click();
  const account = page.getByTestId('api-account');
  await expect(account).toHaveCount(1);
  const button = account.getByRole('button', { name: '检测连接', exact: true }),
    notice = page.locator('.auth-diagnostic > p[role="status"]');
  const prior = count();
  for (let i = prior; i < limit; i++) {
    report.phase = 'connection';
    const entry = { number: i + 1, status: 'running', startedAt: new Date().toISOString() };
    report.connectionAttempts.push(entry);
    checkpoint();
    await button.click();
    await expect(button).toBeEnabled({ timeout: 180000 });
    await expect(notice).toBeVisible({ timeout: 180000 });
    entry.status = (await notice.innerText()).includes('文本与工具检测通过') ? 'passed' : 'failed';
    entry.finishedAt = new Date().toISOString();
    checkpoint();
    if (entry.status === 'passed') break;
  }
  if (report.connectionAttempts.at(-1)?.status !== 'passed') throw Error('CONNECTION_CHECK_LIMIT');
  report.connectionSucceededBeforeTask = true;
  report.phase = 'code_task';
  checkpoint();
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '工作', exact: true })
    .click();
  await page.getByRole('button', { name: '新建工作', exact: true }).click();
  const form = page.getByRole('form', { name: '新建工作' }),
    goal =
      'P09-01 合成代码验收：修复sum.mjs的add加法。只把a - b改为a + b，保留完整一行和末尾换行。必须用code.applyPatch修改独立副本，只调用一次工具；不要生成报告或声称执行测试。';
  await form.getByRole('textbox', { name: '工作目标', exact: true }).fill(goal);
  await form.getByLabel('先查看计划', { exact: true }).check();
  await form.getByLabel('Token 上限', { exact: true }).fill('20000');
  await form.getByLabel('模型请求上限', { exact: true }).fill('1');
  await form.getByLabel('工具执行上限', { exact: true }).fill('2');
  await form.getByRole('button', { name: '创建工作', exact: true }).click();
  const panel = page.getByRole('region', { name: '代码项目', exact: true });
  await expect(panel).toBeVisible({ timeout: 120000 });
  const list = await invoke('runs.list', { query: goal }),
    item = list.workItems.find((w) => w.definition.goal === goal);
  if (!item) throw Error('NOT_FOUND');
  runId = item.runId;
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, source);
  await panel.getByRole('button', { name: '选择本地代码目录', exact: true }).click();
  await panel.getByRole('button', { name: '创建独立修改副本', exact: true }).click();
  await panel.getByRole('button', { name: 'sum.mjs', exact: true }).click();
  await expect(panel.getByLabel('当前副本', { exact: true })).toContainText('a - b');
  const current = (await invoke('runs.get', { runId })).work;
  await invoke(
    'runs.setPlan',
    {
      runId,
      steps: [
        {
          stepKey: 'code-fix',
          title: '修正合成加法并审阅真实差异',
          dependencies: [],
          inputRefs: [],
          outputContract: { kind: 'code', formats: ['json'] },
          acceptance: [{ kind: 'file_exists', format: 'json', minCount: 1 }],
          optional: false,
        },
      ],
    },
    current.revision,
  );
  await expect
    .poll(
      async () => {
        const v = (await invoke('runs.get', { runId })).work;
        return ['completed', 'partial', 'failed', 'cancelled', 'budget_stopped'].includes(v.status);
      },
      { timeout: 600000, intervals: [1500, 3000] },
    )
    .toBe(true);
  report.taskRun = (await invoke('runs.get', { runId })).work;
  // Retain only safe metadata, never model prose or hidden reasoning.
  report.taskRun = {
    runId,
    status: report.taskRun.status,
    calls: report.taskRun.calls,
    tools: report.taskRun.tools,
  };
  const db = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
  try {
    const w = db.prepare('SELECT canonical_path FROM worktrees WHERE run_id=?').get(runId);
    if (
      !w ||
      dirname(w.canonical_path).toLowerCase() !== join(directory, 'workspaces').toLowerCase()
    )
      throw Error('CONFLICT');
    const actual = readFileSync(join(w.canonical_path, 'sum.mjs'), 'utf8'),
      original = readFileSync(join(source, 'sum.mjs'), 'utf8');
    report.code = {
      originalUnchanged: original === 'export const add = (a, b) => a - b;\n',
      exactFix: actual === 'export const add = (a, b) => a + b;\n',
      hash: createHash('sha256').update(actual).digest('hex'),
      productTestExecuted: false,
    };
    report.attempts = db
      .prepare(
        'SELECT p.attempt_no,p.status,l.charged_tokens,l.source AS usage_source FROM provider_attempts p LEFT JOIN usage_ledger l ON l.provider_attempt_id=p.id WHERE p.run_id=?',
      )
      .all(runId);
    report.toolCalls = db
      .prepare('SELECT tool_name,status,side_effect FROM tool_calls WHERE run_id=?')
      .all(runId);
    report.budget = db
      .prepare(
        "SELECT used_tokens,reserved_tokens FROM budgets WHERE owner_kind='root' AND owner_id=?",
      )
      .all(runId);
    report.status =
      report.code.originalUnchanged &&
      report.code.exactFix &&
      report.toolCalls.length === 1 &&
      report.toolCalls[0].status === 'succeeded' &&
      report.budget.every((b) => b.reserved_tokens === 0)
        ? 'passed'
        : 'not_verified';
    writeFileSync(join(out, 'sum.mjs'), actual);
  } finally {
    db.close();
  }
  await panel.getByRole('button', { name: '刷新代码与差异', exact: true }).click();
  await expect(panel.getByLabel('当前副本', { exact: true })).toContainText('a + b');
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, 'task.png') });
  checkpoint();
} catch (e) {
  report.status = 'failed';
  report.error =
    e instanceof Error && /^[A-Z_]{3,55}$/.test(e.message)
      ? e.message
      : e instanceof Error && /Timeout|timeout/.test(e.message)
        ? 'UI_TIMEOUT'
        : 'UI_OR_INTERNAL_ERROR';
  checkpoint();
} finally {
  if (app && runId)
    try {
      const v = (await invoke('runs.get', { runId })).work;
      if (!['completed', 'partial', 'failed', 'cancelled', 'budget_stopped'].includes(v.status))
        await invoke('runs.cancel', { runId }, v.revision);
    } catch {
      /* closed */
    }
  await app?.close();
  const secrets = join(directory, 'secrets');
  if (existsSync(secrets)) {
    if (lstatSync(secrets).isSymbolicLink() || realpathSync(secrets) !== secrets)
      throw Error('PERMISSION_DENIED');
    const files = readdirSync(secrets);
    for (const name of files)
      if (!/^(?:opaque-)?[a-f0-9-]{36}$/i.test(name) || !lstatSync(join(secrets, name)).isFile())
        throw Error('PERMISSION_DENIED');
    for (const name of files) unlinkSync(join(secrets, name));
  }
  for (const entry of report.connectionAttempts)
    if (entry.status === 'running') entry.status = 'interrupted';
  report.credentialRemoved = true;
  report.finishedAt = new Date().toISOString();
  manifest.closed = true;
  save(pointer, manifest);
  checkpoint();
}
process.exit(report.status === 'passed' ? 0 : 1);
