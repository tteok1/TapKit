import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  realpathSync,
  unlinkSync,
  readdirSync,
} from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { connectionProfile } from './p07-live-profile.mjs';

const root = process.cwd(),
  args = process.argv.slice(2),
  task = 'P07-02';
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value, exclusive = false) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', exclusive ? { flag: 'wx' } : {});
function connectionCount() {
  let count = 0;
  for (const id of ['P07-01', 'P07-02', 'P07-03']) {
    const parent = join(root, 'docs/evidence', id);
    if (!existsSync(parent)) continue;
    for (const name of readdirSync(parent)) {
      const dir = join(parent, name);
      if (
        /^connection-\d{4}-\d{2}-\d{2}(?:-\d{2})?$/.test(name) &&
        existsSync(join(dir, 'launch.json'))
      )
        count++;
      if (name.startsWith('ui-live-') && existsSync(join(dir, 'report.json')))
        count += (read(join(dir, 'report.json')).connectionAttempts ?? []).length;
    }
  }
  return count;
}
if (
  args.join(' ') === '--prepare' ||
  (args.length === 3 &&
    args[0] === '--prepare' &&
    args[1] === '--after' &&
    /^[a-f0-9-]{36}$/.test(args[2]))
) {
  let priorCharge = 0;
  if (args[1] === '--after') {
    const previous = read(join(root, '.test-data/P07-ui-live-' + args[2] + '.json')),
      previousReport = read(join(previous.out, 'report.json'));
    if (previousReport.status === 'running' || !previousReport.credentialRemoved)
      throw Error('PRIOR_RESULT_UNSETTLED');
    priorCharge =
      (previous.priorConservativeCharge ?? 0) +
      (previousReport.usage ?? []).reduce((sum, u) => sum + u.charged_tokens, 0);
  }
  const remaining = 120000 - priorCharge,
    dataTokens = priorCharge ? 40000 : 50000,
    pptxTokens = remaining - dataTokens;
  if (pptxTokens < 8192 || connectionCount() >= 20) throw Error('BUDGET_EXCEEDED');
  const round = randomUUID(),
    profile = await connectionProfile(true, task, round);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const out = join(root, 'docs/evidence/P07-02', 'ui-live-' + date + '-' + round);
  mkdirSync(out);
  const manifest = {
    round,
    directory: profile.directory,
    out,
    preparedAt: new Date().toISOString(),
    ...(args[1] === '--after' ? { previousRound: args[2] } : {}),
    priorConservativeCharge: priorCharge,
    priorConnectionChecks: connectionCount(),
    authorization:
      '用户要求启动TapKit，在应用内连接测试成功后执行真实任务；本轮最多20次连接检查，达到上限仍失败则停止汇报。',
    limits: {
      connectionChecks: 20,
      dataLogicalCalls: 1,
      dataTools: 1,
      dataTokens,
      pptxLogicalCalls: 2,
      pptxTools: 2,
      pptxTokens,
      dailyTaskTokens: 120000,
      taskActiveMs: 600000,
    },
  };
  save(join(out, 'prepared.json'), manifest, true);
  save(join(root, '.test-data/P07-ui-live-' + round + '.json'), manifest, true);
  console.log(
    JSON.stringify({
      round,
      out,
      profilePrepared: true,
      applicationStarted: false,
      modelRequests: 0,
    }),
  );
  process.exit(0);
}
const round = args[1];
if (
  args.length !== 2 ||
  args[0] !== '--run-once' ||
  !/^[a-f0-9-]{36}$/.test(round ?? '') ||
  process.env.TAPKIT_P07_LIVE !== '1'
)
  throw Error('PERMISSION_DENIED');
const manifest = read(join(root, '.test-data/P07-ui-live-' + round + '.json'));
const directory = realpathSync(manifest.directory),
  out = realpathSync(manifest.out);
if (
  manifest.round !== round ||
  dirname(directory).toLowerCase() !== resolve('.test-data').toLowerCase() ||
  !basename(directory).startsWith(task + '-live-profile-') ||
  dirname(out) !== join(root, 'docs/evidence/P07-02') ||
  !basename(out).endsWith(round)
)
  throw Error('PERMISSION_DENIED');
const markerPath = join(directory, 'P07.live-profile.json'),
  marker = read(markerPath);
if (marker.closed || marker.scope !== task + ' isolated live verification only')
  throw Error('PERMISSION_DENIED');
const core = readFileSync('packages/core/dist/index.cjs');
if (
  core.includes(Buffer.from('installChatFixture')) ||
  core.includes(Buffer.from('installWebFixture'))
)
  throw Error('TEST_BUILD_REFUSED');
save(
  join(out, 'launch.json'),
  {
    ...manifest,
    startedAt: new Date().toISOString(),
    productionCoreSha256: createHash('sha256').update(core).digest('hex'),
  },
  true,
);
const report = {
  round,
  status: 'running',
  connectionAttempts: [],
  tasks: [],
  credentialRemoved: false,
};
const reportPath = join(out, 'report.json');
const checkpoint = (phase) => {
  save(reportPath, report);
  console.log(
    JSON.stringify({
      phase,
      checks: report.connectionAttempts.length,
      connection: report.connectionAttempts.at(-1)?.status,
      tasks: report.tasks.map((t) => ({ kind: t.kind, status: t.status, reason: t.reason })),
    }),
  );
};
const safeError = (error) =>
  error instanceof Error && /^[A-Z_]{3,55}$/.test(error.message)
    ? error.message
    : 'UI_OR_INTERNAL_ERROR';
let app, page;
const active = new Set();
const call = async (channel, command, payload, expectedRevision) => {
  const reply = await page.evaluate(
    async ({ channel, command, payload, expectedRevision }) => {
      const value = crypto.randomUUID(),
        requestId = value.slice(0, 14) + '7' + value.slice(15);
      return await window.tapkit[channel](
        { requestId, ...(expectedRevision === undefined ? {} : { expectedRevision }) },
        command,
        payload,
      );
    },
    { channel, command, payload, expectedRevision },
  );
  if (!reply.ok) throw Error(reply.error.code);
  return reply.data;
};
const work = (command, payload) => call('workCommand', command, payload);
async function waitRun(runId) {
  const deadline = Date.now() + 660000;
  while (Date.now() < deadline) {
    const view = (await work('runs.get', { runId })).work;
    if (
      ['completed', 'failed', 'partial', 'cancelled', 'budget_stopped', 'waiting_user'].includes(
        view.status,
      )
    ) {
      active.delete(runId);
      return view;
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw Error('TASK_TIMEOUT');
}
const fileRef = (view, format) =>
  view.steps
    .flatMap((s) => s.artifacts.map((ref, i) => ({ ref, format: s.artifactFormats[i] })))
    .find((x) => x.format === format)?.ref;
const screenshot = (name) =>
  page.screenshot({ path: join(out, name + '.png'), mask: [page.locator('.credential-hint')] });
async function showWork(goal) {
  const expand = page.getByRole('button', { name: /^(展开|收起)侧栏$/ });
  if (!(await page.getByRole('link', { name: '工作', exact: true }).isVisible()))
    await expand.click();
  await page.getByRole('link', { name: '工作', exact: true }).click();
  await page.locator('.work-open').filter({ hasText: goal }).first().click();
}
try {
  const env = { ...process.env, TAPKIT_DATA_DIR: directory };
  for (const k of [
    'ELECTRON_RUN_AS_NODE',
    'TAPKIT_TEST_BUILD',
    'TAPKIT_CHAT_FIXTURE',
    'TAPKIT_WEB_FIXTURE',
    'NODE_OPTIONS',
    'TAPKIT_STARTUP_DIAGNOSTICS',
  ])
    delete env[k];
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
  const panel = page.getByRole('button', { name: '关闭详情', exact: true });
  if (await panel.isVisible()) await panel.click();
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('link', { name: '模型连接', exact: true })
    .click();
  await page.getByRole('link', { name: 'API Key 账户', exact: true }).click();
  const account = page.getByTestId('api-account'),
    button = account.getByRole('button', { name: '检测连接', exact: true });
  await expect(account).toHaveCount(1);
  const notice = page.locator('.auth-diagnostic > p[role="status"]');
  for (let number = 1; number <= 20; number++) {
    const priorChecks = connectionCount();
    if (priorChecks >= 20) break;
    const entry = {
      number,
      globalNumber: priorChecks + 1,
      startedAt: new Date().toISOString(),
      status: 'running',
    };
    report.connectionAttempts.push(entry);
    checkpoint('connection-start');
    await button.click();
    await expect(button).toBeEnabled({ timeout: 300000 });
    await expect(notice).toBeVisible({ timeout: 300000 });
    const text = await notice.innerText();
    entry.notice = text.slice(text.indexOf('：') + 1);
    entry.status = text.includes('文本与工具检测通过') ? 'passed' : 'failed';
    entry.finishedAt = new Date().toISOString();
    await screenshot('connection-' + String(number).padStart(2, '0'));
    checkpoint('connection-finished');
    if (entry.status === 'passed') break;
  }
  if (report.connectionAttempts.at(-1)?.status !== 'passed') {
    report.status = 'connection_failed_limit_reached';
    throw Error('CONNECTION_CHECK_LIMIT');
  }
  report.connectionSucceededBeforeTasks = true;
  const session = await call('desktopCommand', 'sessions.create', {
    mode: 'work',
    title: 'P07 应用内连接通过后的真实办公验收',
  });
  const sessionId = session.entityId;
  const csv =
    '地区,数量,单价,日期\n华东,3,0.10,2026-10-01\n华东,2,0.20,2026-10-02\n华南,1,1.05,2026-10-01\n华南,1,1.05,2026-10-01\n';
  const attached = await call('chatCommand', 'inputs.attach', {
    sessionId,
    name: '合成销售.csv',
    bytes: Buffer.from(csv).toString('base64'),
  });
  const source = attached.ref;
  const dataGoal =
    '仅分析附加的合成销售CSV，使用data.analyze一次完成：地区string、数量number、单价number单位元、日期date；完全重复行按四列去重；新增金额=数量*单价，四舍五入到2位；按地区汇总金额为销售额。输出含金额明细detail及地区汇总summary，生成地区销售额柱状图、yLabel元。标题“P07 合成销售分析”，说明去重和金额口径。数据仅为合成示例，不添加真实结论或来源。严格按工具schema填写：原数据dataset id为sales，列属性使用key/label/type；deduplicate的dataset=sales、output=unique、keys为四列；calculate的dataset=unique、output=detail、column=金额、left=数量、operator=multiply、right=单价、scale=2；aggregate的dataset=detail、output=summary、groupBy=[地区]、metrics=[{field:金额,as:销售额,function:sum,scale:2}]。工具顶层必须有fileId、versionId、spec；来源ID使用本次附加版本，不添加schema之外字段。';
  const dataTask = { kind: 'data', status: 'running' };
  report.tasks.push(dataTask);
  checkpoint('data-start');
  const dataCreated = (
    await work('runs.create', {
      sessionId,
      format: 'xlsx',
      refs: [source],
      audience: '验收人员',
      language: '简体中文',
      planFirst: false,
      goal: dataGoal,
      dataOptions: { csvMode: 'safe', includeDetailsInHtml: false },
      acceptance: [{ kind: 'file_exists', format: 'xlsx', minCount: 1 }],
      budgetOverrides: {
        tokens: manifest.limits.dataTokens,
        activeMs: 600000,
        maxCalls: 1,
        maxTools: 1,
      },
    })
  ).work;
  dataTask.runId = dataCreated.runId;
  active.add(dataTask.runId);
  let dataView = await waitRun(dataTask.runId),
    analysis,
    analysisRef;
  dataTask.status = dataView.status;
  dataTask.reason = dataView.reason;
  if (dataView.status === 'completed') {
    analysisRef = fileRef(dataView, 'json');
    if (!analysisRef) throw Error('ANALYSIS_RESULT_MISSING');
    const first = (
      await work('runs.data', {
        runId: dataTask.runId,
        fileId: analysisRef.fileId,
        versionId: analysisRef.versionId,
      })
    ).dataPage;
    const chart = first.charts[0];
    if (!chart) throw Error('CHART_MISSING');
    analysis = { first, chart };
    const summary = (
      await work('runs.data', {
        runId: dataTask.runId,
        fileId: analysisRef.fileId,
        versionId: analysisRef.versionId,
        sheetId: chart.spec.datasetId,
      })
    ).dataPage;
    const x = summary.columns.findIndex((c) => c.key === chart.spec.xField),
      y = summary.columns.findIndex((c) => c.key === chart.spec.yFields[0]);
    dataTask.contentChecks = {
      profileRows: first.profiles[0]?.rows === 4,
      duplicates: first.profiles[0]?.duplicates === 1,
      summary:
        summary.rows.some((r) => r[x] === '华东' && r[y] === 0.7) &&
        summary.rows.some((r) => r[x] === '华南' && r[y] === 1.05),
      xlsx: first.exports.some((e) => /\.xlsx$/i.test(e.name)),
      charts: !!chart,
    };
    if (!Object.values(dataTask.contentChecks).every(Boolean)) dataTask.status = 'content_failed';
    await showWork(dataGoal);
    await page.getByRole('button', { name: '数据与图表', exact: true }).last().click();
    await screenshot('data-result');
  }
  checkpoint('data-finished');
  const combined = dataTask.status === 'completed' && analysis;
  const pptGoal = combined
    ? `仅用slides.create生成2页合成销售演示PPTX和备注，文件名“P07合成销售演示.pptx”，16:9浅色商务。标题P07合成销售演示。第1页id=page-1，layout=title，标题“合成销售示例”，正文“去重后的合成销售数据，仅用于格式检查”，备注“无真实经营结论”。第2页id=page-2，layout=chart，标题“地区销售额”，chartRef必须为${JSON.stringify({ fileId: analysisRef.fileId, versionId: analysisRef.versionId, chartId: analysis.chart.spec.id })}，备注“金额单位元，华东0.70，华南1.05”。直接复用受管分析图表，不重复分析，不添加来源或其他事实。`
    : '仅用slides.create生成2页可编辑PPTX，文件名“P07合成示例演示.pptx”，16:9浅色商务。标题P07合成示例演示。第1页id=page-1，layout=title，标题“合成示例”，正文“示例金额123.45元”，备注“仅用于格式检查”。第2页id=page-2，layout=body，标题“检查范围”，正文“可编辑文字与讲者备注”，备注“没有真实经营结论”。不添加其他事实或来源。';
  const pptTask = { kind: combined ? 'slides_with_analysis' : 'slides', status: 'running' };
  report.tasks.push(pptTask);
  checkpoint('slides-start');
  const pptCreated = (
    await work('runs.create', {
      sessionId,
      format: 'pptx',
      refs: combined ? [source, analysisRef] : [],
      audience: '验收人员',
      language: '简体中文',
      planFirst: false,
      goal: pptGoal,
      slideOptions: { pageCount: 2, aspectRatio: '16:9', theme: 'light_business' },
      acceptance: [{ kind: 'file_exists', format: 'pptx', minCount: 1 }],
      budgetOverrides: {
        tokens: manifest.limits.pptxTokens,
        activeMs: 600000,
        maxCalls: 2,
        maxTools: 2,
      },
    })
  ).work;
  pptTask.runId = pptCreated.runId;
  active.add(pptTask.runId);
  const pptView = await waitRun(pptTask.runId);
  pptTask.status = pptView.status;
  pptTask.reason = pptView.reason;
  if (pptView.status === 'completed') {
    const ref = fileRef(pptView, 'pptx');
    if (!ref) throw Error('PPTX_RESULT_MISSING');
    const first = (
      await work('runs.slides', {
        runId: pptTask.runId,
        fileId: ref.fileId,
        versionId: ref.versionId,
      })
    ).slidePage;
    const second = (
      await work('runs.slides', {
        runId: pptTask.runId,
        fileId: ref.fileId,
        versionId: ref.versionId,
        slideId: first.slides[1].id,
      })
    ).slidePage;
    pptTask.contentChecks = {
      pages: first.slides.length === 2,
      notes: !!first.slide.notes && !!second.slide.notes,
      chart: !combined || second.slide.chartRef?.versionId === analysisRef.versionId,
      theme: first.theme === 'light_business' && first.aspectRatio === '16:9',
    };
    if (!Object.values(pptTask.contentChecks).every(Boolean)) pptTask.status = 'content_failed';
    await showWork(pptGoal);
    await page.getByRole('button', { name: '幻灯片与备注', exact: true }).last().click();
    await screenshot('slides-result');
    if (pptTask.status === 'completed') {
      const revision = { kind: 'slides_revision', status: 'running' };
      report.tasks.push(revision);
      const goal =
        '仅将当前演示文稿第1页标题改为“已修改的合成示例”，讲者备注改为“仅修改这一页，其他内容保持不变”。使用slides.revise，保留本页其他字段、其他页及图表。';
      const revised = (
        await call(
          'workCommand',
          'runs.steer',
          {
            runId: pptTask.runId,
            text: goal,
            refs: [],
            clientRequestId: randomUUID().replace(/^(.{14})./, '$17'),
          },
          (await work('runs.get', { runId: pptTask.runId })).work.revision,
        )
      ).work;
      revision.runId = revised.runId;
      active.add(revision.runId);
      const waiting = await waitRun(revision.runId);
      if (waiting.status === 'waiting_user') {
        await showWork(goal);
        await page.getByRole('button', { name: '权限与审批', exact: true }).click();
        const approval = page.locator('.work-approval');
        await expect(approval).toContainText('已修改的合成示例');
        await screenshot('revision-approval');
        await approval.getByRole('button', { name: '批准操作', exact: true }).click();
        active.add(revision.runId);
        const final = await waitRun(revision.runId);
        revision.status = final.status;
        revision.reason = final.reason;
        if (final.status === 'completed') {
          const newRef = fileRef(final, 'pptx'),
            updated = (
              await work('runs.slides', {
                runId: revision.runId,
                fileId: newRef.fileId,
                versionId: newRef.versionId,
              })
            ).slidePage;
          revision.contentChecks = {
            sameFile: newRef.fileId === ref.fileId,
            newVersion: newRef.versionId !== ref.versionId,
            title: updated.slide.title === '已修改的合成示例',
            otherPages: first.slides
              .slice(1)
              .every((s) => updated.slides.find((n) => n.id === s.id)?.hash === s.hash),
          };
          if (!Object.values(revision.contentChecks).every(Boolean))
            revision.status = 'content_failed';
        }
      } else {
        revision.status = waiting.status;
        revision.reason = waiting.reason;
      }
      checkpoint('revision-finished');
    }
  }
  checkpoint('slides-finished');
  report.status = report.tasks.every((t) => t.status === 'completed') ? 'passed' : 'task_failed';
} catch (error) {
  report.errorCode = safeError(error);
  if (report.status === 'running') report.status = 'failed';
} finally {
  for (const runId of active) await work('runs.cancel', { runId }).catch(() => {});
  await app?.close().catch(() => {});
  try {
    const db = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
    let credentialId;
    try {
      credentialId = db
        .prepare('SELECT credential_id FROM provider_accounts WHERE deleted_at IS NULL')
        .get()?.credential_id;
      report.providerAttempts = db.prepare('SELECT status,error_code FROM provider_attempts').all();
      report.toolCalls = db.prepare('SELECT tool_name,status,side_effect FROM tool_calls').all();
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
          "SELECT json_extract(payload_json,'$.payload.summary') summary FROM events WHERE event_type='tool.validation'",
        )
        .all()
        .map((r) => r.summary)
        .filter((s) => typeof s === 'string' && /^模型/.test(s));
    } finally {
      db.close();
    }
    if (typeof credentialId !== 'string' || !/^[a-f0-9-]{36}$/i.test(credentialId))
      throw Error('PERMISSION_DENIED');
    const secret = join(directory, 'secrets', credentialId);
    if (existsSync(secret)) unlinkSync(secret);
    report.credentialRemoved = !existsSync(secret);
    save(markerPath, { ...marker, closed: true });
  } catch {
    report.cleanupError = 'CLEANUP_OR_REPORT_FAILED';
  }
  report.finishedAt = new Date().toISOString();
  checkpoint('finished');
  process.exitCode = report.status === 'passed' && report.credentialRemoved ? 0 : 1;
}
