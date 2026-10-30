import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  realpathSync,
  readdirSync,
  mkdtempSync,
  unlinkSync,
  renameSync,
} from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';
import { connectionProfile } from './p07-live-profile.mjs';

const root = process.cwd(),
  task = 'P07-02';
const mode = process.argv.slice(2).join(' ');
if (!['--check-only', '--run-once', '--new-attempt'].includes(mode))
  throw Error('VALIDATION_ERROR');
if (mode !== '--check-only' && process.env.TAPKIT_P07_LIVE !== '1')
  throw Error('PERMISSION_DENIED');
const evidence = join(root, 'docs/evidence', task);
const prior = readdirSync(evidence).filter(
  (n) => n.startsWith('live-data-') && existsSync(join(evidence, n, 'launch.json')),
);
if (
  mode !== '--check-only' &&
  (prior.length >= 2 || prior.some((n) => !existsSync(join(evidence, n, 'report.json'))))
)
  throw Error('BUDGET_EXCEEDED');
const spent = prior.reduce(
  (total, n) =>
    total +
    (JSON.parse(readFileSync(join(evidence, n, 'report.json'), 'utf8')).usage ?? []).reduce(
      (s, u) => s + u.charged_tokens,
      0,
    ),
  0,
);
const tokens = 120000 - spent;
if (mode !== '--check-only' && tokens < 4096) throw Error('BUDGET_EXCEEDED');
if (mode === '--new-attempt') {
  const pointer = join(root, '.test-data/P07-02-live-profile.json');
  const old = JSON.parse(readFileSync(pointer, 'utf8'));
  const oldPath = realpathSync(old.directory);
  if (
    dirname(oldPath).toLowerCase() !== join(root, '.test-data').toLowerCase() ||
    !basename(oldPath).startsWith(task + '-live-profile-')
  )
    throw Error('PERMISSION_DENIED');
  const closed = JSON.parse(readFileSync(join(oldPath, 'P07.live-profile.json'), 'utf8'));
  if (
    !closed.closed ||
    !prior.length ||
    prior.some(
      (n) => !JSON.parse(readFileSync(join(evidence, n, 'report.json'), 'utf8')).credentialRemoved,
    )
  )
    throw Error('PERMISSION_DENIED');
  renameSync(pointer, join(root, '.test-data/P07-02-live-profile.closed-' + Date.now() + '.json'));
}
const preflight = await connectionProfile(false, task);
if (mode === '--check-only') {
  console.log(JSON.stringify({ task, ...preflight, liveRequests: 0 }));
  process.exit(0);
}
const checks = readdirSync(evidence).filter((n) =>
  /^connection-\d{4}-\d{2}-\d{2}(?:-\d{2})?$/.test(n),
);
const successful = checks
  .map((name) => {
    const path = join(evidence, name, 'probe-report.json');
    if (!existsSync(path)) return null;
    return { name, report: JSON.parse(readFileSync(path, 'utf8')) };
  })
  .filter(Boolean)
  .sort((a, b) => Date.parse(b.report.checkedAt) - Date.parse(a.report.checkedAt))[0];
const probe = successful?.report;
if (
  !probe ||
  probe.task !== task ||
  probe.status !== 'passed' ||
  probe.probe?.status !== 'ready' ||
  !probe.probe.text ||
  !probe.probe.tools ||
  !probe.isolatedCredentialRemoved ||
  probe.limits?.checks !== 1 ||
  !(
    Date.now() - Date.parse(probe.checkedAt) >= 0 &&
    Date.now() - Date.parse(probe.checkedAt) < 3600000
  )
)
  throw Error('CONNECTION_CHECK_REQUIRED');
const prepared = await connectionProfile(true, task);
const directory = realpathSync(prepared.directory);
if (
  dirname(directory).toLowerCase() !== join(root, '.test-data').toLowerCase() ||
  !basename(directory).startsWith(task + '-live-profile-')
)
  throw Error('PERMISSION_DENIED');
const markerPath = join(directory, 'P07.live-profile.json');
const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
if (marker.closed || marker.scope !== task + ' isolated live verification only')
  throw Error('PERMISSION_DENIED');
const out = mkdtempSync(join(evidence, 'live-data-2026-10-30-'));
writeFileSync(
  join(out, 'launch.json'),
  JSON.stringify(
    {
      task,
      startedAt: new Date().toISOString(),
      connectionCheck: successful.name,
      limits: {
        maxCalls: 1,
        maxTools: 1,
        outputTokens: 2048,
        tokens,
        activeMs: 600000,
        totalTaskTokens: 120000,
        priorConservativeCharge: spent,
        maxTaskAttempts: 2,
      },
      profile: directory,
      realProvider: true,
      retries: 0,
      fallbacks: 0,
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
const report = { task, status: 'failed', runId: null, reason: null, credentialRemoved: false };
let app;
try {
  const env = { ...process.env, TAPKIT_DATA_DIR: directory };
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'TAPKIT_TEST_BUILD',
    'TAPKIT_CHAT_FIXTURE',
    'TAPKIT_WEB_FIXTURE',
    'NODE_OPTIONS',
    'TAPKIT_STARTUP_DIAGNOSTICS',
  ])
    delete env[key];
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
  const created = await page.evaluate(async (tokens) => {
    const id = () => {
      const t = Date.now().toString(16).padStart(12, '0');
      return t.slice(0, 8) + '-' + t.slice(8) + '-7' + crypto.randomUUID().slice(15);
    };
    const session = await window.tapkit.desktopCommand({ requestId: id() }, 'sessions.create', {
      mode: 'work',
      title: 'P07-02 真实数据验收',
    });
    if (!session.ok) throw Error(session.error.code);
    const sessionId = session.data.entityId;
    const csv =
      '地区,数量,单价,日期\n华东,3,0.10,2026-10-01\n华东,2,0.20,2026-10-02\n华南,1,1.05,2026-10-01\n华南,1,1.05,2026-10-01\n';
    const bytes = btoa(String.fromCharCode(...new TextEncoder().encode(csv)));
    const attached = await window.tapkit.chatCommand({ requestId: id() }, 'inputs.attach', {
      sessionId,
      name: 'P07示例销售.csv',
      bytes,
    });
    if (!attached.ok) throw Error(attached.error.code);
    const ref = attached.data.ref;
    const reply = await window.tapkit.workCommand({ requestId: id() }, 'runs.create', {
      sessionId,
      format: 'xlsx',
      refs: [ref],
      audience: '验收人员',
      language: '简体中文',
      planFirst: false,
      goal: '这是合成示例销售数据，仅用于验证分析工具。用data.analyze完成：读取所选CSV四列地区(string)、数量(number)、单价(number，单位元)、日期(date)。完全重复行去重（全部四列）；新增金额=数量*单价，四舍五入保留2位小数，单位元；按地区对金额求和输出销售额。输出去重后的含金额明细detail和汇总summary两张表，生成按地区汇总销售额的柱状图。标题“P07 示例销售分析”。在methodology说明去重和金额口径。不添加来源或额外事实。只调用一次工具即可。',
      documentOptions: { template: 'report', theme: 'formal', length: 'concise' },
      dataOptions: { csvMode: 'safe', includeDetailsInHtml: false },
      acceptance: [{ kind: 'file_exists', format: 'xlsx', minCount: 1 }],
      budgetOverrides: { tokens, activeMs: 600000, maxCalls: 1, maxTools: 1 },
    });
    return reply.ok ? { runId: reply.data.work.runId } : { error: reply.error.code };
  }, tokens);
  if (!created.runId) throw Error(created.error || 'CREATE_FAILED');
  report.runId = created.runId;
  const deadline = Date.now() + 660000;
  let view;
  while (Date.now() < deadline) {
    view = await page.evaluate(async (runId) => {
      const t = Date.now().toString(16).padStart(12, '0');
      const requestId = t.slice(0, 8) + '-' + t.slice(8) + '-7' + crypto.randomUUID().slice(15);
      const reply = await window.tapkit.workCommand({ requestId }, 'runs.get', { runId });
      if (!reply.ok) return { error: reply.error.code };
      const work = reply.data.work;
      return {
        status: work.status,
        reason: work.reason,
        artifacts: work.steps.flatMap((s) => s.artifacts),
      };
    }, report.runId);
    if (view.error) throw Error(view.error);
    if (
      ['completed', 'partial', 'failed', 'cancelled', 'budget_stopped', 'waiting_user'].includes(
        view.status,
      )
    )
      break;
    await new Promise((done) => setTimeout(done, 1000));
  }
  report.runStatus = view?.status ?? 'timeout';
  report.reason = view?.reason ?? null;
  if (view?.status !== 'completed') throw Error('TASK_INCOMPLETE');
  const ref = view.artifacts.find((r) => r.kind === 'file');
  if (!ref) throw Error('OUTPUT_MISSING');
  const data = await page.evaluate(
    async ({ runId, ref }) => {
      const t = Date.now().toString(16).padStart(12, '0');
      const requestId = t.slice(0, 8) + '-' + t.slice(8) + '-7' + crypto.randomUUID().slice(15);
      const reply = await window.tapkit.workCommand({ requestId }, 'runs.data', {
        runId,
        fileId: ref.fileId,
        versionId: ref.versionId,
      });
      if (!reply.ok) throw Error(reply.error.code);
      return reply.data.dataPage;
    },
    { runId: report.runId, ref },
  );
  report.contentChecks = {
    profileRows: data.profiles[0]?.rows === 4,
    duplicates: data.profiles[0]?.duplicates === 1,
    summary:
      data.rows.some((r) => r[0] === '华东' && r[1] === 0.7) &&
      data.rows.some((r) => r[0] === '华南' && r[1] === 1.05),
    charts: data.charts.length > 0,
  };
  if (!Object.values(report.contentChecks).every(Boolean))
    throw Error('CONTENT_VERIFICATION_FAILED');
  await page.getByRole('link', { name: '工作', exact: true }).click();
  const card = page.locator('.work-open').filter({ hasText: '这是合成示例销售数据' });
  if ((await card.count()) === 1) await card.click();
  const show = page.getByRole('button', { name: '数据与图表', exact: true });
  if (await show.count()) await show.last().click();
  await page.screenshot({ path: join(out, 'desktop.png') });
  report.status = 'passed';
} catch (error) {
  report.errorCode =
    error instanceof Error && /^[A-Z_]{3,50}$/.test(error.message)
      ? error.message
      : 'INTERNAL_ERROR';
} finally {
  await app?.close().catch(() => {});
  let credentialId;
  try {
    const db = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
    try {
      credentialId = db
        .prepare('SELECT credential_id FROM provider_accounts WHERE deleted_at IS NULL')
        .get()?.credential_id;
      report.toolCalls = db.prepare('SELECT tool_name,status,side_effect FROM tool_calls').all();
      report.attemptCount = db.prepare('SELECT count(*) AS n FROM provider_attempts').get().n;
      report.usage = db
        .prepare(
          'SELECT input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,charged_tokens,source FROM usage_ledger',
        )
        .all();
      report.files = db
        .prepare(
          'SELECT extension,parse_status,preview_status FROM file_versions WHERE created_by_run_id IS NOT NULL',
        )
        .all();
    } finally {
      db.close();
    }
    if (typeof credentialId !== 'string' || !/^[0-9a-f-]{36}$/i.test(credentialId))
      throw Error('PERMISSION_DENIED');
    const secret = join(directory, 'secrets', credentialId);
    if (existsSync(secret)) unlinkSync(secret);
    report.credentialRemoved = !existsSync(secret);
    writeFileSync(markerPath, JSON.stringify({ ...marker, closed: true }));
    if (
      report.status === 'passed' &&
      (report.attemptCount !== 1 ||
        !report.toolCalls.some((t) => t.tool_name === 'data.analyze' && t.status === 'succeeded'))
    ) {
      report.status = 'failed';
      report.errorCode = 'RECEIPT_VERIFICATION_FAILED';
    }
  } catch {
    report.cleanupError = 'CLEANUP_OR_REPORT_FAILED';
  }
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ evidence: out, ...report }));
  process.exitCode = report.status === 'passed' && report.credentialRemoved ? 0 : 1;
}
