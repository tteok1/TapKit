import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  realpathSync,
  readdirSync,
  mkdtempSync,
  unlinkSync,
} from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';
import { connectionProfile } from './p07-live-profile.mjs';

// One controlled two-page request, no retry/fallback and no fixture. Only public
// receipts/usage and fixed diagnostic summaries are written to evidence.
const root = process.cwd(),
  task = 'P07-03',
  evidence = join(root, 'docs/evidence', task);
const mode = process.argv.slice(2).join(' ');
if (!['--check-only', '--run-once'].includes(mode)) throw Error('VALIDATION_ERROR');
if (mode === '--run-once' && process.env.TAPKIT_P07_LIVE !== '1') throw Error('PERMISSION_DENIED');
const prior = readdirSync(evidence).filter(
  (n) => n.startsWith('live-slides-') && existsSync(join(evidence, n, 'launch.json')),
);
if (mode === '--run-once' && prior.length) throw Error('BUDGET_EXCEEDED');
const preflight = await connectionProfile(false, task);
if (mode === '--check-only') {
  console.log(
    JSON.stringify({
      task,
      ...preflight,
      liveRequests: 0,
      limits: { attempts: 1, calls: 1, tools: 1, tokens: 70000, outputTokens: 8192 },
    }),
  );
  process.exit(0);
}
const checks = readdirSync(evidence).filter((n) =>
  /^connection-\d{4}-\d{2}-\d{2}(?:-\d{2})?$/.test(n),
);
const successful = checks
  .map((name) => {
    const path = join(evidence, name, 'probe-report.json');
    return existsSync(path) ? { name, report: JSON.parse(readFileSync(path, 'utf8')) } : null;
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
const prepared = await connectionProfile(true, task),
  directory = realpathSync(prepared.directory);
if (
  dirname(directory).toLowerCase() !== join(root, '.test-data').toLowerCase() ||
  !basename(directory).startsWith(task + '-live-profile-')
)
  throw Error('PERMISSION_DENIED');
const markerPath = join(directory, 'P07.live-profile.json'),
  marker = JSON.parse(readFileSync(markerPath, 'utf8'));
if (marker.closed || marker.scope !== task + ' isolated live verification only')
  throw Error('PERMISSION_DENIED');
const date = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const out = mkdtempSync(join(evidence, 'live-slides-' + date + '-'));
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
        outputTokens: 8192,
        tokens: 70000,
        activeMs: 600000,
        maxTaskAttempts: 1,
      },
      profile: directory,
      realProvider: true,
      productionCoreSha256: createHash('sha256')
        .update(readFileSync(join(root, 'packages/core/dist/index.cjs')))
        .digest('hex'),
      retries: 0,
      fallbacks: 0,
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
const report = { task, status: 'failed', runId: null, reason: null, credentialRemoved: false };
let app, page;
const invoke = async (command, payload) =>
  page.evaluate(
    async ({ command, payload }) => {
      const id = crypto.randomUUID(),
        requestId = id.slice(0, 14) + '7' + id.slice(15);
      const reply = await window.tapkit.workCommand({ requestId }, command, payload);
      if (!reply.ok) throw Error(reply.error.code);
      return reply.data;
    },
    { command, payload },
  );
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
  page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
  const session = await page.evaluate(async () => {
    const id = crypto.randomUUID();
    const reply = await window.tapkit.desktopCommand(
      { requestId: id.slice(0, 14) + '7' + id.slice(15) },
      'sessions.create',
      { mode: 'work', title: 'P07-03 真实演示验收' },
    );
    if (!reply.ok) throw Error(reply.error.code);
    return reply.data.entityId;
  });
  const created = await invoke('runs.create', {
    sessionId: session,
    format: 'pptx',
    refs: [],
    audience: '验收人员',
    language: '简体中文',
    planFirst: false,
    goal: '只用slides.create生成2页可编辑PPTX。所有内容均为合成示例，仅用于格式检查，不代表真实经营或验收结果。主题浅色商务、16:9。文件名P07示例演示.pptx，文稿标题P07示例演示。第1页id=page-1，layout=title，标题“合成示例”，正文“示例金额123.45元”，备注“仅用于格式检查”。第2页id=page-2，layout=body，标题“检查范围”，正文“可编辑文字与讲者备注”，备注“没有真实经营结论”。只保留给定文字和数字，不添加来源、公司、姓名或结果。只调用一次slides.create，不调用其他工具。',
    slideOptions: { pageCount: 2, aspectRatio: '16:9', theme: 'light_business' },
    acceptance: [{ kind: 'file_exists', format: 'pptx', minCount: 1 }],
    budgetOverrides: { tokens: 70000, activeMs: 600000, maxCalls: 1, maxTools: 1 },
  });
  report.runId = created.work.runId;
  const deadline = Date.now() + 660000;
  let view;
  while (Date.now() < deadline) {
    view = (await invoke('runs.get', { runId: report.runId })).work;
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
  const ref = view.steps
    .flatMap((s) => s.artifacts.map((ref, i) => ({ ref, format: s.artifactFormats[i] })))
    .find((x) => x.format === 'pptx')?.ref;
  if (ref?.kind !== 'file') throw Error('OUTPUT_MISSING');
  const first = (
    await invoke('runs.slides', {
      runId: report.runId,
      fileId: ref.fileId,
      versionId: ref.versionId,
      slideId: 'page-1',
    })
  ).slidePage;
  const second = (
    await invoke('runs.slides', {
      runId: report.runId,
      fileId: ref.fileId,
      versionId: ref.versionId,
      slideId: 'page-2',
    })
  ).slidePage;
  report.contentChecks = {
    pages: first.slides.length === 2,
    order: first.slides.map((s) => s.id).join(',') === 'page-1,page-2',
    first:
      first.slide.title === '合成示例' &&
      first.slide.bullets.join('') === '示例金额123.45元' &&
      first.slide.notes === '仅用于格式检查',
    second:
      second.slide.title === '检查范围' &&
      second.slide.bullets.join('') === '可编辑文字与讲者备注' &&
      second.slide.notes === '没有真实经营结论',
    theme: first.theme === 'light_business' && first.aspectRatio === '16:9',
  };
  if (!Object.values(report.contentChecks).every(Boolean))
    throw Error('CONTENT_VERIFICATION_FAILED');
  await page.getByRole('link', { name: '工作', exact: true }).click();
  await page.locator('.work-open').filter({ hasText: '只用slides.create' }).first().click();
  await page.getByRole('button', { name: '幻灯片与备注', exact: true }).last().click();
  await expect(page.getByRole('region', { name: '演示文稿成果' })).toContainText('合成示例');
  await page.screenshot({ path: join(out, 'desktop.png') });
  report.status = 'passed';
} catch (error) {
  report.errorCode =
    error instanceof Error && /^[A-Z_]{3,50}$/.test(error.message)
      ? error.message
      : 'INTERNAL_ERROR';
} finally {
  if (page && report.runId && ['timeout', undefined].includes(report.runStatus))
    await invoke('runs.cancel', { runId: report.runId }).catch(() => {});
  await app?.close().catch(() => {});
  try {
    const db = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
    let credentialId;
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
      report.diagnostics = db
        .prepare(
          "SELECT json_extract(payload_json,'$.payload.summary') AS summary FROM events WHERE event_type='tool.validation'",
        )
        .all()
        .map((r) => r.summary)
        .filter(
          (s) =>
            typeof s === 'string' &&
            /^(模型返回的工具参数不符合完整格式|模型响应未正常结束|模型响应读取中断|模型服务响应类型不兼容|模型响应头超时|模型服务没有返回响应正文)/.test(
              s,
            ),
        );
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
        !report.toolCalls.some((t) => t.tool_name === 'slides.create' && t.status === 'succeeded'))
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
