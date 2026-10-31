import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  existsSync,
  realpathSync,
  readdirSync,
  lstatSync,
} from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { connectionProfile } from './p07-live-profile.mjs';

// Explicit developer live entry; no normal app startup, CI or fixture can invoke it.
const pointer = resolve('.test-data/P08-01-live.json');
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
function clearSecrets(directory) {
  const secrets = join(directory, 'secrets');
  if (!existsSync(secrets)) return;
  if (lstatSync(secrets).isSymbolicLink() || realpathSync(secrets) !== secrets)
    throw Error('PERMISSION_DENIED');
  const files = readdirSync(secrets);
  for (const file of files) {
    if (!/^(?:opaque-)?[a-f0-9-]{36}$/i.test(file)) throw Error('UNEXPECTED_SECRET_FILE');
    if (!lstatSync(join(secrets, file)).isFile()) throw Error('PERMISSION_DENIED');
  }
  for (const file of files) unlinkSync(join(secrets, file));
}
const priorChecks = () => {
  const root = resolve('docs/evidence/P08-01');
  return readdirSync(root)
    .filter((name) => /^live-[a-f0-9-]{36}$/.test(name))
    .reduce((count, name) => {
      const report = join(root, name, 'report.json');
      return count + (existsSync(report) ? read(report).connectionAttempts.length : 0);
    }, 0);
};
if (process.argv.slice(2).join(' ') === '--prepare') {
  if (existsSync(pointer) && !read(pointer).closed) throw Error('PRIOR_LIVE_UNSETTLED');
  if (priorChecks() >= 20) throw Error('CONNECTION_CHECK_LIMIT');
  const round = randomUUID(),
    profile = await connectionProfile(true, 'P08-01', round);
  const out = resolve('docs/evidence/P08-01/live-' + round);
  mkdirSync(out);
  save(pointer, { round, directory: profile.directory, out, closed: false });
  save(join(out, 'prepared.json'), {
    scope:
      'P08-01 user-authorized existing Zhipu Chat account; encrypted isolated copy; no API call',
    model: profile.modelId,
    connectionLimit: 20,
    connectionChecks: 0,
    workCalls: 0,
    taskLimits: { calls: 4, tools: 5, tokens: 60000, activeMs: 600000 },
    target: 'https://example.com/',
    externalWrites: false,
  });
  console.log(
    JSON.stringify({ prepared: true, model: profile.modelId, connectionChecks: 0, workCalls: 0 }),
  );
  process.exit(0);
}
const action = process.argv.slice(2).join(' ');
if (!['--run-once', '--cleanup'].includes(action) || process.env.TAPKIT_P08_LIVE !== '1')
  throw Error('PERMISSION_DENIED');
const manifest = read(pointer),
  directory = realpathSync(manifest.directory),
  out = realpathSync(manifest.out);
if (
  manifest.closed ||
  dirname(directory).toLowerCase() !== resolve('.test-data').toLowerCase() ||
  !basename(directory).startsWith('P08-01-live-profile-') ||
  dirname(out).toLowerCase() !== resolve('docs/evidence/P08-01').toLowerCase() ||
  (action === '--run-once' && existsSync(join(out, 'report.json')))
)
  throw Error('PERMISSION_DENIED');
if (action === '--cleanup') {
  const report = read(join(out, 'report.json'));
  clearSecrets(directory);
  manifest.closed = true;
  save(pointer, manifest);
  report.credentialRemoved = true;
  report.finishedAt = new Date().toISOString();
  report.cleanupRecovered = true;
  save(join(out, 'report.json'), report);
  console.log(
    JSON.stringify({ status: report.status, credentialRemoved: true, additionalCalls: 0 }),
  );
  process.exit(report.status === 'passed' ? 0 : 1);
}
for (const file of ['packages/core/dist/index.cjs', 'apps/desktop/out/main/index.js']) {
  const source = readFileSync(resolve(file), 'utf8');
  if (source.includes('installChatFixture') || source.includes('installBrowserWebFixture'))
    throw Error('TEST_BUILD_REFUSED');
}
const report = {
  status: 'running',
  connectionAttempts: [],
  connectionSucceededBeforeTasks: false,
  taskStarted: false,
  task: null,
  usage: [],
  credentialRemoved: false,
  startedAt: new Date().toISOString(),
};
const checkpoint = () => {
  save(join(out, 'report.json'), report);
  console.log(
    JSON.stringify({
      status: report.status,
      checks: report.connectionAttempts.length,
      connection: report.connectionAttempts.at(-1)?.status,
      task: report.task?.status ?? null,
    }),
  );
};
let app, page, runId;
const invoke = async (channel, command, payload, expectedRevision) => {
  const reply = await page.evaluate(
    async (p) => {
      const random = crypto.randomUUID();
      return window.tapkit[p.channel](
        {
          requestId: random.slice(0, 14) + '7' + random.slice(15),
          ...(p.expectedRevision === undefined ? {} : { expectedRevision: p.expectedRevision }),
        },
        p.command,
        p.payload,
      );
    },
    { channel, command, payload, expectedRevision },
  );
  if (!reply.ok) throw Error(reply.error.code);
  return reply.data;
};
try {
  const env = { ...process.env, TAPKIT_DATA_DIR: directory };
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'TAPKIT_TEST_BUILD',
    'TAPKIT_CHAT_FIXTURE',
    'TAPKIT_WEB_FIXTURE',
    'TAPKIT_BROWSER_FIXTURE',
    'NODE_OPTIONS',
    'TAPKIT_STARTUP_DIAGNOSTICS',
  ])
    delete env[key];
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
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
  const alreadyChecked = priorChecks();
  for (let number = 1; number <= 20 - alreadyChecked; number++) {
    const entry = {
      number: alreadyChecked + number,
      status: 'running',
      startedAt: new Date().toISOString(),
    };
    report.connectionAttempts.push(entry);
    checkpoint();
    await button.click();
    await expect(button).toBeEnabled({ timeout: 180000 });
    await expect(notice).toBeVisible({ timeout: 180000 });
    const text = await notice.innerText();
    entry.status = text.includes('文本与工具检测通过') ? 'passed' : 'failed';
    entry.finishedAt = new Date().toISOString();
    await page.screenshot({
      path: join(out, 'connection-' + number + '.png'),
      mask: [page.locator('.credential-hint')],
    });
    checkpoint();
    if (entry.status === 'passed') break;
  }
  if (report.connectionAttempts.at(-1)?.status !== 'passed') throw Error('CONNECTION_CHECK_LIMIT');
  report.connectionSucceededBeforeTasks = true;
  checkpoint();
  const session = await invoke('desktopCommand', 'sessions.create', {
    mode: 'work',
    title: 'P08-01 智谱真实浏览验收',
  });
  const created = await invoke('workCommand', 'runs.create', {
    sessionId: session.entityId,
    goal: '仅使用匿名浏览器打开 https://example.com/ 并实际读取页面；先browser.open，再仅用artifact.write生成浏览核验.md。正文只写两项：页面标题（逐字）和正文第一条完整段落（逐字引用）。不得写日期、访问时间或其他未返回的内容。不能仅凭已有知识写作。不提交任何网页表单，不调用其他网站，不需要DOCX。',
    browserEnabled: true,
    format: 'md',
    budgetOverrides: { maxCalls: 4, maxTools: 5, tokens: 60000, activeMs: 600000 },
  });
  runId = created.work.runId;
  report.taskStarted = true;
  checkpoint();
  await page.getByRole('link', { name: '工作', exact: true }).click();
  await page.locator('.work-open').first().click();
  const deadline = Date.now() + 660000;
  while (Date.now() < deadline) {
    const work = (await invoke('workCommand', 'runs.get', { runId })).work;
    if (
      ['completed', 'partial', 'failed', 'cancelled', 'budget_stopped', 'waiting_user'].includes(
        work.status,
      )
    ) {
      report.task = {
        runId,
        status: work.status,
        reason: work.reason,
        calls: work.calls,
        tools: work.tools,
        formats: work.steps.flatMap((s) => s.artifactFormats),
      };
      break;
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  if (!report.task) throw Error('TASK_TIMEOUT');
  const db = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
  try {
    const calls = db
      .prepare('SELECT tool_name,status,args_json FROM tool_calls WHERE run_id=?')
      .all(runId);
    report.browserReadVerified = calls.some(
      (c) => c.tool_name === 'browser.open' && c.status === 'succeeded',
    );
    const observed = db
      .prepare(
        'SELECT b.dom_json FROM browser_snapshots b JOIN browser_tabs t ON t.id=b.tab_id JOIN browser_sessions s ON s.id=t.session_id WHERE s.run_id=? ORDER BY b.observed_at DESC LIMIT 1',
      )
      .get(runId);
    const snapshot = observed ? JSON.parse(observed.dom_json) : null;
    const title = snapshot?.title ?? '';
    const paragraph = snapshot?.text.split('\n').find((line) => line.trim().length >= 20) ?? '';
    report.contentVerified =
      !!title &&
      calls.some(
        (c) =>
          c.tool_name === 'artifact.write' &&
          c.status === 'succeeded' &&
          (() => {
            const content = JSON.parse(c.args_json).content ?? '';
            return (
              content.includes(title) &&
              !!paragraph &&
              content.includes(paragraph) &&
              !/\b20\d{2}-\d{2}-\d{2}/.test(content)
            );
          })(),
      );
    const artifact = db
      .prepare(
        "SELECT b.relative_key,b.sha256 FROM file_versions v JOIN blobs b ON b.id=v.blob_id WHERE v.created_by_run_id=? AND v.extension='md' AND v.deleted_at IS NULL ORDER BY v.created_at DESC LIMIT 1",
      )
      .get(runId);
    report.artifactBytesVerified = false;
    if (artifact && /^blobs\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/.test(artifact.relative_key)) {
      const bytes = readFileSync(join(directory, artifact.relative_key));
      const markdown = bytes.toString('utf8');
      const hash = createHash('sha256').update(bytes).digest('hex');
      report.artifactBytesVerified =
        hash === artifact.sha256 &&
        !!paragraph &&
        markdown.includes(title) &&
        markdown.includes(paragraph) &&
        !/\b20\d{2}-\d{2}-\d{2}/.test(markdown);
      save(join(out, 'content-verification.json'), {
        title,
        paragraph,
        markdown,
        sha256: hash,
        verified: report.artifactBytesVerified,
      });
    }
    report.budget = db
      .prepare(
        "SELECT reserved_tokens,used_tokens FROM budgets WHERE owner_kind='root' AND owner_id=?",
      )
      .get(runId);
    report.usage = db
      .prepare(
        'SELECT source,input_tokens,output_tokens,charged_tokens FROM usage_ledger WHERE root_run_id=?',
      )
      .all(runId);
  } finally {
    db.close();
  }
  await page.screenshot({ path: join(out, 'task.png') });
  report.status =
    report.task.status === 'completed' &&
    report.contentVerified &&
    report.artifactBytesVerified &&
    report.budget?.reserved_tokens === 0 &&
    report.browserReadVerified &&
    report.task.formats.includes('md')
      ? 'passed'
      : 'not_verified';
  checkpoint();
} catch (error) {
  report.status = 'failed';
  report.error =
    error instanceof Error && /^[A-Z_]{3,55}$/.test(error.message)
      ? error.message
      : 'UI_OR_INTERNAL_ERROR';
  checkpoint();
} finally {
  if (runId && app) {
    try {
      const view = (await invoke('workCommand', 'runs.get', { runId })).work;
      if (!['completed', 'partial', 'failed', 'cancelled', 'budget_stopped'].includes(view.status))
        await invoke('workCommand', 'runs.cancel', { runId }, view.revision);
    } catch {
      /* closed app cannot dispatch again */
    }
  }
  await app?.close();
  clearSecrets(directory);
  manifest.closed = true;
  save(pointer, manifest);
  report.credentialRemoved = true;
  report.finishedAt = new Date().toISOString();
  checkpoint();
}
if (report.status !== 'passed') process.exitCode = 1;
