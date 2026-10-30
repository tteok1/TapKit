import { _electron as electron, expect } from '@playwright/test';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  realpathSync,
  unlinkSync,
  readdirSync,
} from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

if (process.env.TAPKIT_P07_LIVE !== '1' || process.argv.slice(2).join(' ') !== '--run-once')
  throw Error('PERMISSION_DENIED');
const root = process.cwd();
const evidenceDir = join(root, 'docs/evidence/P07-01');
const latestCheck = readdirSync(evidenceDir)
  .filter(
    (name) =>
      /^connection-2026-10-28(?:-\d{2})?$/.test(name) &&
      existsSync(join(evidenceDir, name, 'launch.json')),
  )
  .sort()
  .at(-1);
if (!latestCheck) throw Error('CONNECTION_CHECK_REQUIRED');
const reportDir = join(evidenceDir, latestCheck);
const probe = JSON.parse(readFileSync(join(reportDir, 'probe-report.json'), 'utf8'));
if (
  probe.status !== 'passed' ||
  probe.probe?.status !== 'ready' ||
  !probe.probe?.text ||
  !probe.probe?.tools ||
  probe.limits?.checks !== 1
)
  throw Error('CONNECTION_CHECK_REQUIRED');
const profile = JSON.parse(readFileSync(join(root, '.test-data/P07-01-live-profile.json'), 'utf8'));
const directory = realpathSync(profile.directory);
if (
  dirname(directory).toLowerCase() !== join(root, '.test-data').toLowerCase() ||
  !basename(directory).startsWith('P07-01-live-profile-')
)
  throw Error('PERMISSION_DENIED');
const markerPath = join(directory, 'P07.live-profile.json');
const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
if (marker.closed) throw Error('PERMISSION_DENIED');
const launch = join(root, 'docs/evidence/P07-01/live-task-launch.json');
writeFileSync(
  launch,
  JSON.stringify(
    {
      startedAt: new Date().toISOString(),
      connectionCheck: latestCheck + '/probe-report.json',
      limits: { maxCalls: 1, maxTools: 1, tokens: 120000 },
      profile: directory,
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
const report = {
  task: 'P07-01',
  status: 'failed',
  connectionCheck: 'passed',
  modelRequestsLimit: 1,
  maxTools: 1,
  runId: null,
  reason: null,
  resultCount: 0,
  credentialRemoved: false,
};
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
  const profileDb = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
  const profileId = profileDb.prepare('SELECT id FROM profiles LIMIT 1').get()?.id;
  profileDb.close();
  if (typeof profileId !== 'string') throw Error('CONFLICT');
  env.TAPKIT_TOOL_TRACE = 'P02-02';
  env.TAPKIT_TOOL_TRACE_PROFILE = profileId;
  const traceTime = Date.now().toString(16).padStart(12, '0');
  env.TAPKIT_TOOL_TRACE_CASE =
    traceTime.slice(0, 8) + '-' + traceTime.slice(8) + '-7' + randomUUID().slice(15);
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  const page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
  const created = await page.evaluate(async () => {
    const id = () => {
      const t = Date.now().toString(16).padStart(12, '0');
      return t.slice(0, 8) + '-' + t.slice(8) + '-7' + crypto.randomUUID().slice(15);
    };
    const session = await window.tapkit.desktopCommand({ requestId: id() }, 'sessions.create', {
      mode: 'work',
      title: 'P07-01 真实文档验收',
    });
    if (!session.ok || !('entityId' in session.data))
      return { error: !session.ok ? session.error.code : 'SESSION_FAILED' };
    const reply = await window.tapkit.workCommand({ requestId: id() }, 'runs.create', {
      sessionId: session.data.entityId,
      goal: '仅使用以下文字生成简短中文 DOCX：标题“P07 示例报告”；摘要“这是合成示例，没有进行真实验收。”；正文“示例数字是 123.45，仅用于格式检查。”不要添加其他事实、来源或姓名。',
      audience: '验收人员',
      language: '简体中文',
      format: 'docx',
      refs: [],
      planFirst: false,
      documentOptions: { template: 'report', theme: 'formal', length: 'concise' },
      acceptance: [{ kind: 'file_exists', format: 'docx', minCount: 1 }],
      budgetOverrides: { tokens: 120000, activeMs: 240000, maxCalls: 1, maxTools: 1 },
    });
    return reply.ok ? { runId: reply.data.work.runId } : { error: reply.error.code };
  });
  if (!created.runId) throw Error(created.error || 'CREATE_FAILED');
  report.runId = created.runId;
  const deadline = Date.now() + 300000;
  let result;
  while (Date.now() < deadline) {
    result = await page.evaluate(async (runId) => {
      const t = Date.now().toString(16).padStart(12, '0');
      const requestId = t.slice(0, 8) + '-' + t.slice(8) + '-7' + crypto.randomUUID().slice(15);
      const reply = await window.tapkit.workCommand({ requestId }, 'runs.get', { runId });
      if (!reply.ok) return { error: reply.error.code };
      const work = reply.data.work;
      return {
        status: work.status,
        reason: work.reason,
        artifacts: work.steps.flatMap((step) => step.artifacts),
        revision: work.revision,
      };
    }, report.runId);
    if (result.error) throw Error(result.error);
    if (
      ['completed', 'partial', 'failed', 'cancelled', 'budget_stopped', 'waiting_user'].includes(
        result.status,
      )
    )
      break;
    await new Promise((done) => setTimeout(done, 1000));
  }
  report.reason = result?.reason ?? null;
  report.resultCount = result?.artifacts?.length ?? 0;
  report.runStatus = result?.status ?? 'timeout';
  report.status = result?.status === 'completed' && report.resultCount > 0 ? 'passed' : 'failed';
  if (report.status !== 'passed')
    throw Error(report.runStatus === 'timeout' ? 'TOOL_TIMEOUT' : 'TASK_INCOMPLETE');
} catch (error) {
  report.errorCode =
    error instanceof Error && /^[A-Z_]{3,50}$/.test(error.message)
      ? error.message
      : 'INTERNAL_ERROR';
} finally {
  await app?.close().catch(() => {});
  try {
    const db = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
    const account = db
      .prepare('SELECT credential_id FROM provider_accounts WHERE deleted_at IS NULL')
      .get();
    report.toolCalls = db.prepare('SELECT tool_name,status,side_effect FROM tool_calls').all();
    report.attemptCount = db.prepare('SELECT count(*) AS n FROM provider_attempts').get().n;
    report.files = db
      .prepare(
        'SELECT version,extension,parse_status,preview_status FROM file_versions WHERE created_by_run_id IS NOT NULL',
      )
      .all();
    const documents = db.prepare('SELECT spec_json FROM document_specs').all();
    report.contentChecks = documents.map((row) => {
      const spec = JSON.parse(row.spec_json);
      return {
        titleMatches: spec.title === 'P07 示例报告',
        numberPresent: JSON.stringify(spec.sections).includes('123.45'),
        exampleCaveatsPresent:
          JSON.stringify(spec.sections).includes('没有进行真实验收') &&
          JSON.stringify(spec.sections).includes('仅用于格式检查'),
        coverFieldsEmpty: Object.values(spec.style.fields).every((value) => value === ''),
        noSourceSection:
          spec.citations.length === 0 &&
          !spec.sections.some((section) =>
            /来源|参考资料|参考文献|references|sources/i.test(section.heading),
          ),
      };
    });
    if (
      report.status === 'passed' &&
      (!report.contentChecks.some(
        (check) =>
          check.titleMatches &&
          check.numberPresent &&
          check.exampleCaveatsPresent &&
          check.coverFieldsEmpty &&
          check.noSourceSection,
      ) ||
        !report.files.some((file) => file.extension === 'docx' && file.parse_status === 'ready'))
    ) {
      report.status = 'failed';
      report.errorCode = 'CONTENT_VERIFICATION_FAILED';
    }
    db.close();
    if (account && /^[0-9a-f-]{36}$/i.test(account.credential_id)) {
      const secret = join(directory, 'secrets', account.credential_id);
      if (existsSync(secret)) unlinkSync(secret);
    }
    writeFileSync(markerPath, JSON.stringify({ ...marker, closed: true }));
    report.credentialRemoved = true;
  } catch {
    report.credentialRemoved = false;
  }
  writeFileSync(
    join(root, 'docs/evidence/P07-01/live-task-report.json'),
    JSON.stringify(report, null, 2) + '\n',
    { flag: 'wx' },
  );
  console.log(JSON.stringify(report));
  process.exitCode = report.status === 'passed' && report.credentialRemoved ? 0 : 1;
}
