// Continue only reconciled, completed live artifacts. Never replay an old tool.
import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  realpathSync,
  existsSync,
  copyFileSync,
  constants,
  unlinkSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
const parentRound = process.argv[2];
const plainRevision = process.argv[3] === '--plain-revision';
const freshRevision = plainRevision || process.argv[3] === '--fresh-revision';
const graphTaskLimit = plainRevision ? 26000 : freshRevision ? 60000 : 40000;
if (
  process.argv.length !== (freshRevision ? 4 : 3) ||
  !/^[a-f0-9-]{36}$/.test(parentRound ?? '') ||
  process.env.TAPKIT_P07_LIVE !== '1'
)
  throw Error('PERMISSION_DENIED');
const read = (p) => JSON.parse(readFileSync(p, 'utf8')),
  save = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const parent = read('.test-data/P07-ui-live-' + parentRound + '.json'),
  directory = realpathSync(parent.directory),
  markerPath = join(directory, 'P07.live-profile.json'),
  marker = read(markerPath);
if (
  dirname(directory) !== resolve('.test-data') ||
  !basename(directory).startsWith('P07-02-live-profile-') ||
  !marker.closed
)
  throw Error('PERMISSION_DENIED');
const old = read(join(parent.out, 'report.json'));
if (!old.credentialRemoved || !old.connectionSucceededBeforeTasks)
  throw Error('PRIOR_RESULT_UNSETTLED');
const core = readFileSync('packages/core/dist/index.cjs');
if (core.includes(Buffer.from('installChatFixture'))) throw Error('TEST_BUILD_REFUSED');
function countChecks() {
  let n = 0;
  for (const id of ['P07-01', 'P07-02', 'P07-03']) {
    const p = resolve('docs/evidence', id);
    if (!existsSync(p)) continue;
    for (const name of readdirSync(p)) {
      const d = join(p, name);
      if (
        /^connection-\d{4}-\d{2}-\d{2}(?:-\d{2})?$/.test(name) &&
        existsSync(join(d, 'launch.json'))
      )
        n++;
      if (name.startsWith('ui-live-') && existsSync(join(d, 'report.json')))
        n += (read(join(d, 'report.json')).connectionAttempts ?? []).length;
    }
  }
  return n;
}
if (countChecks() >= 20) throw Error('CONNECTION_CHECK_LIMIT');
const db = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
let sourceAccount,
  dataRun,
  pptRun,
  analysis,
  analysisRef,
  sourceRef,
  pptRef,
  oldSlides,
  priorCharge,
  blob;
try {
  if (
    db
      .prepare(
        "SELECT count(*) n FROM runs WHERE task_id IS NOT NULL AND status NOT IN ('completed','failed','partial','cancelled','budget_stopped')",
      )
      .get().n ||
    db
      .prepare(
        "SELECT count(*) n FROM tool_calls WHERE status IN ('dispatched','pending','unknown') OR side_effect='unknown'",
      )
      .get().n
  )
    throw Error('UNSETTLED_STATE_REFUSED');
  sourceAccount = db
    .prepare(
      'SELECT id,credential_id,base_url,model_id FROM provider_accounts WHERE deleted_at IS NULL',
    )
    .get();
  const rows = db
    .prepare('SELECT id,task_id,session_id FROM runs WHERE task_id IS NOT NULL ORDER BY created_at')
    .all();
  dataRun = rows.find((r) => r.id === old.tasks.find((t) => t.kind === 'data').runId);
  pptRun = rows.find((r) => r.id === old.tasks.find((t) => t.kind === 'slides').runId);
  if (!dataRun || !pptRun || dataRun.session_id !== pptRun.session_id)
    throw Error('TASK_IDENTITY_MISMATCH');
  blob = (v) => {
    const r = db
      .prepare(
        'SELECT v.*,b.relative_key FROM file_versions v JOIN blobs b ON b.id=v.blob_id WHERE v.id=? AND v.deleted_at IS NULL',
      )
      .get(v);
    if (!r || r.relative_key !== 'blobs/sha256/' + r.sha256.slice(0, 2) + '/' + r.sha256)
      throw Error('BLOB_IDENTITY_MISMATCH');
    const path = realpathSync(join(directory, r.relative_key));
    if (!path.startsWith(join(directory, 'blobs') + '\\')) throw Error('PERMISSION_DENIED');
    const bytes = readFileSync(path);
    if (createHash('sha256').update(bytes).digest('hex') !== r.sha256) throw Error('HASH_MISMATCH');
    return { row: r, bytes };
  };
  for (const r of db
    .prepare("SELECT id,file_id FROM file_versions WHERE created_by_run_id=? AND extension='json'")
    .all(dataRun.id)) {
    const value = JSON.parse(blob(r.id).bytes.toString('utf8'));
    if (value.kind === 'tapkit.analysis') {
      analysis = value;
      analysisRef = { kind: 'file', fileId: r.file_id, versionId: r.id };
    }
  }
  if (!analysis) throw Error('ANALYSIS_MISSING');
  const chart = analysis.spec.charts[0],
    summary = analysis.spreadsheet.sheets.find((s) => s.id === chart.datasetId),
    x = summary.columns.findIndex((c) => c.key === chart.xField),
    y = summary.columns.findIndex((c) => c.key === chart.yFields[0]);
  const xlsx = analysis.exports.find((e) => /\.xlsx$/i.test(e.name));
  if (!xlsx) throw Error('XLSX_MISSING');
  const workbook = new (createRequire(resolve('packages/workflows/package.json'))(
    'exceljs',
  ).Workbook)();
  await workbook.xlsx.load(blob(xlsx.versionId).bytes);
  let east = false,
    south = false;
  workbook.eachSheet((sheet) =>
    sheet.eachRow((row) => {
      const v = row.values.map((c) => (c && typeof c === 'object' && 'result' in c ? c.result : c));
      if (v.includes('华东') && v.includes(0.7)) east = true;
      if (v.includes('华南') && v.includes(1.05)) south = true;
    }),
  );
  const source = analysis.inputs[0];
  sourceRef = { kind: 'file', fileId: source.fileId, versionId: source.versionId };
  const checks = {
    rows: analysis.profiles[0].rows === 4,
    duplicates: analysis.profiles[0].duplicates === 1,
    summary:
      summary.rows.some((r) => r[x] === '华东' && r[y] === 0.7) &&
      summary.rows.some((r) => r[x] === '华南' && r[y] === 1.05),
    xlsxValues: east && south,
    sourceUnchanged: blob(source.versionId).row.sha256 === source.sha256,
  };
  if (!Object.values(checks).every(Boolean)) throw Error('DATA_CONTENT_VERIFICATION_FAILED');
  const pr = db
    .prepare("SELECT id,file_id FROM file_versions WHERE created_by_run_id=? AND extension='pptx'")
    .get(pptRun.id);
  pptRef = { kind: 'file', fileId: pr.file_id, versionId: pr.id };
  oldSlides = JSON.parse(
    db.prepare('SELECT spec_json FROM document_specs WHERE file_version_id=?').get(pr.id).spec_json,
  ).spec;
  if (oldSlides.slides.length !== 2) throw Error('PPT_CONTENT_VERIFICATION_FAILED');
  const initialPptMissingGivenNumber = !oldSlides.slides.some((s) =>
    s.bullets.join('').includes('123.45'),
  );
  priorCharge =
    (parent.priorConservativeCharge ?? 0) +
    db.prepare('SELECT coalesce(sum(charged_tokens),0) n FROM usage_ledger').get().n;
  if (priorCharge + graphTaskLimit > 120000) throw Error('BUDGET_EXCEEDED');
  const auditPath = join(
    parent.out,
    plainRevision
      ? 'independent-artifact-before-plain-revision.json'
      : freshRevision
        ? 'independent-artifact-after-budget-fix.json'
        : 'independent-artifact-verification.json',
  );
  writeFileSync(
    auditPath,
    JSON.stringify(
      {
        networkRequests: 0,
        checks,
        dataRunId: dataRun.id,
        pptRunId: pptRun.id,
        harnessCorrections: [
          'XLSX export is in analysis.exports, not step artifacts',
          'runs.steer requires current expectedRevision',
        ],
        priorCharge,
        initialPptMissingGivenNumber,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
} finally {
  db.close();
}
const sourceDir = realpathSync(marker.source);
if (
  dirname(sourceDir) !== resolve('.test-data') ||
  !basename(sourceDir).startsWith('P06-connection-debug-') ||
  !/^[a-f0-9-]{36}$/i.test(sourceAccount.credential_id) ||
  sourceAccount.base_url !== 'https://open.bigmodel.cn/api/paas/v4'
)
  throw Error('PERMISSION_DENIED');
if (
  read(join(sourceDir, 'Local State')).os_crypt.encrypted_key !==
  read(join(directory, 'Local State')).os_crypt.encrypted_key
)
  throw Error('CRYPTO_BINDING_MISMATCH');
const round = randomUUID(),
  out = resolve('docs/evidence/P07-02', 'ui-live-2026-10-30-' + round);
mkdirSync(out);
const report = {
  round,
  parentRound,
  status: 'running',
  connectionAttempts: [],
  tasks: [],
  credentialRemoved: false,
  priorCharge,
};
const checkpoint = (phase) => {
  save(join(out, 'report.json'), report);
  console.log(
    JSON.stringify({
      out,
      phase,
      connection: report.connectionAttempts.at(-1)?.status,
      tasks: report.tasks.map((t) => ({ kind: t.kind, status: t.status, reason: t.reason })),
    }),
  );
};
writeFileSync(
  join(out, 'launch.json'),
  JSON.stringify(
    {
      round,
      parentRound,
      directory,
      startedAt: new Date().toISOString(),
      reconciled: true,
      priorCharge,
      taskBudgetRemaining: 120000 - priorCharge,
      graphTaskLimit,
      freshRevision,
      plainRevision,
      maxCalls: freshRevision ? 2 : 1,
      maxTools: freshRevision ? 2 : 1,
      connectionLimit: 20,
      productionCoreSha256: createHash('sha256').update(core).digest('hex'),
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
const secret = join(directory, 'secrets', sourceAccount.credential_id);
copyFileSync(
  join(sourceDir, 'secrets', sourceAccount.credential_id),
  secret,
  constants.COPYFILE_EXCL,
);
save(markerPath, { ...marker, closed: false, followupRound: round });
let app, page;
const active = new Set();
async function call(channel, command, payload, expectedRevision) {
  const reply = await page.evaluate(
    async (p) => {
      const v = crypto.randomUUID();
      return window.tapkit[p.channel](
        {
          requestId: v.slice(0, 14) + '7' + v.slice(15),
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
}
const work = (c, p) => call('workCommand', c, p);
async function waitRun(id) {
  const end = Date.now() + 660000;
  while (Date.now() < end) {
    const v = (await work('runs.get', { runId: id })).work;
    if (
      ['completed', 'failed', 'partial', 'cancelled', 'budget_stopped', 'waiting_user'].includes(
        v.status,
      )
    ) {
      active.delete(id);
      return v;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error('TASK_TIMEOUT');
}
async function show(goal) {
  await page.getByRole('link', { name: '工作', exact: true }).click();
  await page.locator('.work-open').filter({ hasText: goal }).first().click();
}
const refFrom = (v) =>
  v.steps
    .flatMap((s) => s.artifacts.map((r, i) => ({ r, f: s.artifactFormats[i] })))
    .find((x) => x.f === 'pptx')?.r;
try {
  const env = { ...process.env, TAPKIT_DATA_DIR: directory };
  for (const k of [
    'ELECTRON_RUN_AS_NODE',
    'NODE_OPTIONS',
    'TAPKIT_TEST_BUILD',
    'TAPKIT_CHAT_FIXTURE',
    'TAPKIT_WEB_FIXTURE',
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
  const button = page
      .getByTestId('api-account')
      .getByRole('button', { name: '检测连接', exact: true }),
    notice = page.locator('.auth-diagnostic > p[role="status"]');
  while (countChecks() < 20) {
    const e = {
      globalNumber: countChecks() + 1,
      status: 'running',
      startedAt: new Date().toISOString(),
    };
    report.connectionAttempts.push(e);
    checkpoint('connection-start');
    await button.click();
    await expect(button).toBeEnabled({ timeout: 300000 });
    await expect(notice).toBeVisible({ timeout: 300000 });
    e.status = (await notice.innerText()).includes('文本与工具检测通过') ? 'passed' : 'failed';
    e.finishedAt = new Date().toISOString();
    await notice.screenshot({ path: join(out, 'connection-notice-' + e.globalNumber + '.png') });
    checkpoint('connection-finished');
    if (e.status === 'passed') break;
  }
  if (report.connectionAttempts.at(-1)?.status !== 'passed') throw Error('CONNECTION_CHECK_LIMIT');
  async function reviseCurrent() {
    const current = (await work('runs.get', { runId: pptRun.id })).work,
      goal =
        '仅修改当前演示文稿第1页：标题改为“已修改的合成示例”，正文bullets完整替换为[“示例金额123.45元”]，讲者备注改为“仅修改这一页，其他内容保持不变。”。必须保留给定数字123.45。使用slides.revise的replace，提供完整目标页并保留原页ID、layout等其他字段，所有其他页、备注及图表保持不变。';
    const v = randomUUID(),
      revised = (
        await call(
          'workCommand',
          'runs.steer',
          {
            runId: pptRun.id,
            text: goal,
            refs: [],
            clientRequestId: v.slice(0, 14) + '7' + v.slice(15),
          },
          current.revision,
        )
      ).work;
    const revision = { kind: 'slides_revision', runId: revised.runId, status: 'running' };
    report.tasks.push(revision);
    active.add(revised.runId);
    checkpoint('revision-start');
    let result = await waitRun(revised.runId);
    if (result.status === 'waiting_user') {
      await show(goal);
      await page.getByRole('button', { name: '权限与审批', exact: true }).click();
      const card = page.locator('.work-approval');
      await expect(card).toContainText('已修改的合成示例');
      await card.scrollIntoViewIfNeeded();
      await card.screenshot({ path: join(out, 'revision-approval.png') });
      await card.getByRole('button', { name: '批准操作', exact: true }).click();
      active.add(revised.runId);
      result = await waitRun(revised.runId);
    }
    revision.status = result.status;
    revision.reason = result.reason;
    if (result.status === 'completed') {
      const ref = refFrom(result),
        p = (
          await work('runs.slides', {
            runId: result.runId,
            fileId: ref.fileId,
            versionId: ref.versionId,
          })
        ).slidePage;
      revision.checks = {
        sameFile: ref.fileId === pptRef.fileId,
        newVersion: ref.versionId !== pptRef.versionId,
        title: p.slide.title === '已修改的合成示例',
        givenNumber: p.slide.bullets.join('').includes('123.45'),
        notes: p.slide.notes === '仅修改这一页，其他内容保持不变。',
        otherPages: p.slides.slice(1).every((s) => {
          const old = oldSlides.slides.find((x) => x.id === s.id);
          return !!old;
        }),
      };
      const before = (
        await work('runs.slides', {
          runId: pptRun.id,
          fileId: pptRef.fileId,
          versionId: pptRef.versionId,
        })
      ).slidePage;
      revision.checks.otherPages = before.slides
        .slice(1)
        .every((s) => p.slides.find((n) => n.id === s.id)?.hash === s.hash);
      if (!Object.values(revision.checks).every(Boolean)) revision.status = 'content_failed';
    }
    checkpoint('revision-finished');
  }
  if (!freshRevision) await reviseCurrent();
  const chartId = analysis.spec.charts[0].id,
    graphGoal = plainRevision
      ? '仅用slides.create生成2页浅色16:9演示，name必须为“合成修改验收.pptx”，spec.title为“合成修改验收”。第1页id=page-1、layout=body、title=“合成示例”、bullets=[“示例金额123.45元”]、notes=“仅用于格式检查”。第2页id=page-2、layout=body、title=“检查范围”、bullets=[“可编辑文字与讲者备注”]、notes=“没有真实经营结论”。无图表和图片，不添加事实或来源。'
      : `仅用slides.create生成2页浅色16:9演示，文件名“合成销售图表.pptx”。第1页id=page-1，layout=title，标题“合成销售示例”，正文bullets必须为[“去重后的合成销售数据，仅用于格式检查”,“示例金额123.45元仅用于文字格式检查，与图表销售额无关”]，备注“无真实经营结论”。第2页id=page-2，layout=chart，标题“地区销售额”，备注“金额单位元，华东0.70，华南1.05”，chartRef必须为${JSON.stringify({ fileId: analysisRef.fileId, versionId: analysisRef.versionId, chartId })}。仅使用已提供分析成果，不再调用data.analyze，不添加事实或来源。`;
  const created = (
    await work('runs.create', {
      sessionId: dataRun.session_id,
      format: 'pptx',
      refs: plainRevision ? [] : [sourceRef, analysisRef],
      goal: graphGoal,
      audience: '验收人员',
      language: '简体中文',
      planFirst: false,
      slideOptions: { pageCount: 2, aspectRatio: '16:9', theme: 'light_business' },
      acceptance: [{ kind: 'file_exists', format: 'pptx', minCount: 1 }],
      budgetOverrides: {
        tokens: graphTaskLimit,
        activeMs: 600000,
        maxCalls: freshRevision ? 2 : 1,
        maxTools: freshRevision ? 2 : 1,
      },
    })
  ).work;
  const graph = {
    kind: plainRevision ? 'slides_plain' : 'slides_with_analysis',
    runId: created.runId,
    status: 'running',
  };
  report.tasks.push(graph);
  active.add(created.runId);
  checkpoint('graph-start');
  const final = await waitRun(created.runId);
  graph.status = final.status;
  graph.reason = final.reason;
  if (final.status === 'completed') {
    const ref = refFrom(final),
      p = (
        await work('runs.slides', {
          runId: final.runId,
          fileId: ref.fileId,
          versionId: ref.versionId,
          slideId: 'page-2',
        })
      ).slidePage;
    graph.checks = {
      pages: p.slides.length === 2,
      chart:
        plainRevision ||
        (p.slide.chartRef?.versionId === analysisRef.versionId &&
          p.slide.chartRef.chartId === chartId),
      notes: plainRevision
        ? p.slide.notes === '没有真实经营结论'
        : p.slide.notes.includes('0.70') && p.slide.notes.includes('1.05'),
    };
    if (!Object.values(graph.checks).every(Boolean)) graph.status = 'content_failed';
    await show(graphGoal);
    await page.getByRole('button', { name: '幻灯片与备注', exact: true }).last().click();
    await page.screenshot({ path: join(out, 'graph-result.png') });
    if (freshRevision && graph.status === 'completed') {
      pptRun = { ...pptRun, id: final.runId };
      pptRef = ref;
      oldSlides = { slides: p.slides };
      await reviseCurrent();
    }
  }
  report.status = report.tasks.every((t) => t.status === 'completed') ? 'passed' : 'task_failed';
} catch (error) {
  report.errorCode =
    error instanceof Error && /^[A-Z_]{3,55}$/.test(error.message)
      ? error.message
      : 'UI_OR_INTERNAL_ERROR';
  report.status = 'failed';
} finally {
  for (const id of active) await work('runs.cancel', { runId: id }).catch(() => {});
  await app?.close().catch(() => {});
  const end = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
  try {
    report.usage = end
      .prepare(
        'SELECT input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,charged_tokens,source FROM usage_ledger',
      )
      .all();
    report.toolCalls = end.prepare('SELECT tool_name,status,side_effect FROM tool_calls').all();
    report.providerAttempts = end.prepare('SELECT status,error_code FROM provider_attempts').all();
    report.activeRuns = end
      .prepare(
        "SELECT count(*) n FROM runs WHERE task_id IS NOT NULL AND status NOT IN ('completed','failed','partial','cancelled','budget_stopped')",
      )
      .get().n;
  } finally {
    end.close();
  }
  if (existsSync(secret)) unlinkSync(secret);
  report.credentialRemoved = !existsSync(secret);
  save(markerPath, { ...marker, closed: true, followupRound: round });
  report.finishedAt = new Date().toISOString();
  checkpoint('finished');
  process.exitCode = report.status === 'passed' && report.credentialRemoved ? 0 : 1;
}
