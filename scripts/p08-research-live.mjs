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
import { researchQuoteBlock } from './p08-research-markdown.mjs';

// Explicit developer live entry; no normal app startup, CI or fixture can invoke it.
const pointer = resolve('.test-data/P08-02-live.json');
// User added twenty after the redesign; prior thirty checks remain counted.
const connectionLimit = 50;
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
const priorChecks = () =>
  ['P08-01', 'P08-02'].reduce((total, task) => {
    const root = resolve('docs/evidence/' + task);
    return (
      total +
      readdirSync(root)
        .filter((name) => /^live-[a-f0-9-]{36}$/.test(name))
        .reduce((count, name) => {
          const file = join(root, name, 'report.json');
          return count + (existsSync(file) ? read(file).connectionAttempts.length : 0);
        }, 0)
    );
  }, 0);
const prepareAction = process.argv.slice(2).join(' ');
if (
  [
    '--prepare',
    '--prepare-discovery',
    '--prepare-discovery-direct',
    '--prepare-discovery-public-direct',
  ].includes(prepareAction)
) {
  if (existsSync(pointer) && !read(pointer).closed) throw Error('PRIOR_LIVE_UNSETTLED');
  if (priorChecks() >= connectionLimit) throw Error('CONNECTION_CHECK_LIMIT');
  const round = randomUUID(),
    profile = await connectionProfile(true, 'P08-02', round);
  const out = resolve('docs/evidence/P08-02/live-' + round);
  mkdirSync(out);
  const discovery = prepareAction.startsWith('--prepare-discovery');
  save(pointer, {
    round,
    directory: profile.directory,
    out,
    closed: false,
    case: discovery ? 'discovery' : 'seed',
    direct: prepareAction === '--prepare-discovery-direct',
    publicDirect: prepareAction === '--prepare-discovery-public-direct',
  });
  save(join(out, 'prepared.json'), {
    scope:
      'P08-02 user-authorized existing Zhipu Chat account; encrypted isolated copy; no API call',
    model: profile.modelId,
    networkMode:
      prepareAction === '--prepare-discovery-public-direct'
        ? 'configured model route; public domains in isolated launch NO_PROXY'
        : prepareAction === '--prepare-discovery-direct'
          ? 'direct (isolated profile UI only)'
          : 'copied configured network',
    connectionLimit,
    connectionChecks: 0,
    workCalls: 0,
    taskLimits: discovery
      ? { calls: 8, tools: 12, tokens: 100000, activeMs: 600000 }
      : { calls: 6, tools: 8, tokens: 60000, activeMs: 600000 },
    target: discovery
      ? 'Public search → at least two distinct source groups → literal evidence → explicit report; no seed URL'
      : 'https://example.com/',
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
  out = realpathSync(manifest.out),
  traceCase = manifest.round.slice(0, 14) + '7' + manifest.round.slice(15);
if (
  manifest.closed ||
  dirname(directory).toLowerCase() !== resolve('.test-data').toLowerCase() ||
  !basename(directory).startsWith('P08-02-live-profile-') ||
  dirname(out).toLowerCase() !== resolve('docs/evidence/P08-02').toLowerCase() ||
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
  case: manifest.case ?? 'seed',
  connectionLimit,
  workflowVersion: 'snapshot-evidence-handles-core-closeout-v7',
  verifierVersion: 'literal-quote-block-entities-v2',
  build: Object.fromEntries(
    ['packages/core/dist/index.cjs', 'apps/desktop/out/main/index.js'].map((file) => [
      file,
      createHash('sha256')
        .update(readFileSync(resolve(file)))
        .digest('hex'),
    ]),
  ),
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
const discovery = manifest.case === 'discovery';
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
  if (manifest.publicDirect) {
    env.NO_PROXY = [env.NO_PROXY || env.no_proxy || '', 'bing.com', 'iana.org', 'larus.net']
      .filter(Boolean)
      .join(',');
    env.no_proxy = env.NO_PROXY;
    report.publicDirectDomains = ['bing.com', 'iana.org', 'larus.net'];
  }
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
  const traceDb = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
  try {
    env.TAPKIT_TOOL_TRACE = 'P02-02';
    env.TAPKIT_API_TRANSPORT_TRACE = 'P08-02';
    env.TAPKIT_TOOL_TRACE_PROFILE = traceDb.prepare('SELECT id FROM profiles LIMIT 1').get().id;
    env.TAPKIT_TOOL_TRACE_CASE = traceCase;
  } finally {
    traceDb.close();
  }
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  page = await app.firstWindow();
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125000 });
  await page.getByRole('link', { name: '设置', exact: true }).click();
  if (manifest.direct || manifest.publicDirect) {
    await page
      .getByRole('navigation', { name: '设置分类' })
      .getByRole('link', { name: '通用', exact: true })
      .click();
    const mode = manifest.direct ? 'direct' : 'environment';
    const routing = page.getByLabel('模型网络代理', { exact: true });
    if ((await routing.inputValue()) !== mode) {
      await routing.selectOption(mode);
      await page.getByRole('button', { name: '保存设置', exact: true }).click();
      await expect(page.getByText('设置已保存', { exact: true })).toBeVisible();
    }
    report.networkMode = manifest.direct
      ? 'direct'
      : 'configured model environment; public-only NO_PROXY';
    await page.screenshot({
      path: join(out, manifest.direct ? 'network-direct.png' : 'network-public-direct.png'),
    });
  }
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
  const roundChecks = Math.min(connectionLimit - alreadyChecked, 3);
  for (let number = 1; number <= roundChecks; number++) {
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
  if (report.connectionAttempts.at(-1)?.status !== 'passed')
    throw Error('CONNECTION_CHECK_ROUND_LIMIT');
  report.connectionSucceededBeforeTasks = true;
  checkpoint();
  report.phase = 'configure_research';
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '工作', exact: true })
    .click();
  await page.getByRole('button', { name: '新建工作', exact: true }).click();
  const researchForm = page.getByRole('form', { name: '新建工作' });
  await researchForm.getByLabel('工作类型').selectOption('research');
  await researchForm
    .getByRole('textbox', { name: '工作目标', exact: true })
    .fill(discovery ? 'IANA' : 'Example Domain公开页面用途核验');
  await researchForm
    .getByLabel('公开检索问题', { exact: false })
    .fill(
      discovery
        ? 'What resources does IANA coordinate?'
        : 'Example Domain示例网页如何声明自己的用途？',
    );
  await researchForm
    .getByLabel('起始网页', { exact: false })
    .fill(discovery ? '' : 'https://example.com/');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 960));
  await researchForm.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: join(out, 'create-desktop-current.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 900));
  await researchForm.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: join(out, 'create-compact-current.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 960));
  await page.getByRole('button', { name: '新建工作', exact: true }).click();
  report.phase = 'create_task';
  const session = await invoke('desktopCommand', 'sessions.create', {
    mode: 'work',
    title: 'P08-02 智谱真实研究验收',
  });
  const created = await invoke('workCommand', 'runs.create', {
    sessionId: session.entityId,
    goal: discovery
      ? '公开研究IANA协调哪些互联网资源。必须先search(q1)发现来源，不凭预先知识虚构URL。成功搜索一次后，从候选只选iana.org一页和larus.net一页两个不同主域名公开原文；不必读取同域名其他候选。若没有两个可用域名可有限继续搜索或沿实际已读页面链接读取。每读取一个来源，就从当前materials[].evidence选择直接描述IANA互联网资源职责的完整证据编号，调用record：questionKey=q1、kind=fact、evidenceIds=[实际e_编号]；不传text、quote或findings，不翻译或改写，不重复记录同一来源。已有一个来源的事实时继续读取另一域名并选择相关证据。两个来源各有事实后Core自动生成MD和来源清单；不足可记录gap或report保存部分结果。不同域名不等于绝对独立来源，不扩展无关主题，不写网页。'
      : '仅研究指定Example Domain公开网页https://example.com/。先读取，再从materials[].evidence选择一条完整原文编号，用kind=fact和evidenceIds=[编号]记录，不传text或quote。发现非空时立即report，不重复记录；不足记gap。只用研究工具，不扩展来源。',
    research: {
      topic: discovery ? 'IANA' : 'Example Domain公开页面用途核验',
      questions: [
        {
          key: 'q1',
          text: discovery
            ? 'What resources does IANA coordinate?'
            : 'Example Domain示例网页如何声明自己的用途？',
        },
      ],
      scope: discovery
        ? '公开匿名网页；核对IANA互联网资源职责与不同来源的陈述及局限'
        : '仅指定公开示例网页',
      includeDomains: discovery ? ['iana.org', 'larus.net'] : ['example.com'],
      seedUrls: discovery ? [] : ['https://example.com/'],
      outputFormat: 'md',
    },
    format: 'md',
    budgetOverrides: discovery
      ? { maxCalls: 8, maxTools: 12, tokens: 100000, activeMs: 600000 }
      : { maxCalls: 6, maxTools: 8, tokens: 60000, activeMs: 600000 },
  });
  runId = created.work.runId;
  report.taskStarted = true;
  report.phase = 'wait_task';
  checkpoint();
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '工作', exact: true })
    .click();
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
    report.providerAttempts = db
      .prepare('SELECT status,error_code FROM provider_attempts WHERE run_id=? ORDER BY created_at')
      .all(runId);
    report.diagnostics = db
      .prepare(
        "SELECT json_extract(payload_json,'$.payload.summary') summary FROM events WHERE run_id=? AND event_type='tool.validation' ORDER BY seq",
      )
      .all(runId);
    const tracePath = join(directory, 'logs', 'tool-trace-' + traceCase + '.jsonl');
    report.toolTrace = existsSync(tracePath)
      ? readFileSync(tracePath, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
          .filter((row) => row.kind === 'attempt')
          .map((row) => row.trace)
      : [];
    const run = db.prepare('SELECT work_json FROM runs WHERE id=?').get(runId);
    const state = JSON.parse(run.work_json).research;
    const readBlob = (row) => {
      if (!row || !/^blobs\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/.test(row.relative_key))
        throw Error('CONFLICT');
      const bytes = readFileSync(join(directory, row.relative_key));
      if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw Error('CONFLICT');
      return bytes;
    };
    const materials = new Map();
    for (const source of state.sources.filter((s) => s.status === 'ready')) {
      const blob = db
        .prepare(
          'SELECT b.relative_key,b.sha256 FROM web_sources w JOIN blobs b ON b.id=w.snapshot_blob_id WHERE w.id=? AND w.run_id=?',
        )
        .get(source.ref.sourceId, runId);
      const snapshot = JSON.parse(readBlob(blob).toString('utf8'));
      if (createHash('sha256').update(snapshot.text).digest('hex') !== source.contentHash)
        throw Error('CONFLICT');
      materials.set(source.id, snapshot.text);
    }
    const quotes = state.findings.flatMap((f) => [...f.supports, ...f.opposes]);
    report.contentVerified =
      quotes.length > 0 &&
      quotes.every(
        (q) =>
          materials.get(q.sourceId)?.slice(q.start, q.end) === q.quote &&
          createHash('sha256').update(q.quote).digest('hex') === q.quoteHash,
      );
    report.answerVerified = state.findings.some(
      (f) =>
        f.kind === 'fact' &&
        (discovery ? /domain|protocol|address|IP|协议|域名|地址/i : /documentation/i).test(
          f.text,
        ) &&
        f.supports.some((q) => materials.get(q.sourceId)?.slice(q.start, q.end) === q.quote),
    );
    report.sourceReadVerified = materials.size > 0 && state.reads > 0;
    report.multiSourceVerified =
      new Set(
        state.sources
          .filter(
            (s) =>
              s.status === 'ready' &&
              state.findings.some(
                (f) => f.kind === 'fact' && f.supports.some((q) => q.sourceId === s.id),
              ),
          )
          .map((s) => new URL(s.url).hostname.split('.').slice(-2).join('.')),
      ).size >= 2;
    report.search = state.queries.map(({ query, status, error, candidates }) => ({
      query,
      status,
      error,
      candidateCount: candidates.length,
    }));
    report.searchAttempted =
      state.searches === 1 && state.queries.length === 1 && state.queries[0].status !== 'running';
    report.discoveryScope = discovery
      ? 'No seed URLs. Requires successful search, at least two actually read source groups with literal facts selected from snapshot evidence handles, and a succeeded research.report ledger entry with verified artifacts; Core may initiate closeout. Different domains do not prove publisher independence.'
      : 'Explicit single seed URL; discovery is not required. Separate earlier attempts retain unavailable search evidence; this case does not verify successful live discovery.';
    report.searchSettled =
      state.searches <= 3 && state.queries.every((query) => query.status !== 'running');
    report.explicitReportCall = !!db
      .prepare(
        "SELECT 1 FROM tool_calls WHERE run_id=? AND tool_name='research.report' AND status='succeeded'",
      )
      .get(runId);
    if (!state.report?.primary) throw Error('RESEARCH_REPORT_MISSING');
    const artifact = db
      .prepare(
        'SELECT b.relative_key,b.sha256 FROM file_versions v JOIN blobs b ON b.id=v.blob_id WHERE v.id=? AND v.created_by_run_id=?',
      )
      .get(state.report?.primary.versionId, runId);
    const bytes = readBlob(artifact),
      markdown = bytes.toString('utf8');
    report.artifactBytesVerified =
      createHash('sha256').update(bytes).digest('hex') === state.report.contentHash &&
      quotes.every((q) => markdown.includes(researchQuoteBlock(q.quote)));
    report.quality = state.report?.quality;
    report.researchCounts = {
      searches: state.searches,
      reads: state.reads,
      findings: state.findings.length,
    };
    save(join(out, 'content-verification.json'), {
      verified: report.contentVerified && report.artifactBytesVerified,
      sourceCount: materials.size,
      quoteCount: quotes.length,
      sha256: artifact.sha256,
      markdown,
      scope: report.discoveryScope,
    });
  } finally {
    db.close();
  }
  await page
    .getByRole('region', { name: '深度研究', exact: true })
    .evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: join(out, 'task.png') });
  report.status =
    ['completed', 'partial'].includes(report.task.status) &&
    report.contentVerified &&
    report.answerVerified &&
    (discovery
      ? report.multiSourceVerified &&
        report.search.some((q) => q.status === 'ready' && q.candidateCount > 0)
      : report.quality === 'partial') &&
    report.artifactBytesVerified &&
    report.budget?.reserved_tokens === 0 &&
    report.sourceReadVerified &&
    report.searchSettled &&
    report.explicitReportCall &&
    report.task.formats.includes('md')
      ? 'passed'
      : 'not_verified';
  checkpoint();
} catch (error) {
  report.status = 'failed';
  if (error instanceof Error && error.message.includes('strict mode violation'))
    report.uiDiagnostic = error.message.split('\n')[0];
  report.error =
    error instanceof Error && /^[A-Z_]{3,55}$/.test(error.message)
      ? error.message
      : error instanceof Error && error.message.includes('strict mode violation')
        ? 'UI_LOCATOR_AMBIGUOUS'
        : error instanceof Error && error.message.includes('Timeout')
          ? 'UI_TIMEOUT'
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
  const transportFile = join(directory, 'logs', 'api-transport-' + traceCase + '.jsonl');
  try {
    if (existsSync(transportFile)) {
      const allowed = new Set([
        'dns_complete',
        'proxy_resolved',
        'socket_assigned',
        'tcp_connected',
        'tls_connected',
        'request_finished',
        'response_headers',
        'request_error',
      ]);
      const events = readFileSync(transportFile, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
        .filter(
          (row) =>
            row?.kind === 'stage' &&
            allowed.has(row.stage) &&
            typeof row.requestId === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              row.requestId,
            ) &&
            Number.isInteger(row.elapsedMs) &&
            row.elapsedMs >= 0 &&
            row.elapsedMs <= 1000000 &&
            typeof row.at === 'string' &&
            /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(row.at),
        )
        .map(({ requestId, stage, elapsedMs, at }) => ({ requestId, stage, elapsedMs, at }));
      save(join(out, 'api-transport.json'), {
        scope:
          'Actual in-app API transport; fixed stages and timing only, no URL/headers/body/key/reasoning',
        events,
      });
      report.apiTransportEvidence = 'api-transport.json';
    }
  } catch {
    report.apiTransportDiagnostic = 'UNAVAILABLE_OR_INVALID';
  }
  clearSecrets(directory);
  manifest.closed = true;
  save(pointer, manifest);
  report.credentialRemoved = true;
  report.finishedAt = new Date().toISOString();
  checkpoint();
}
if (report.status !== 'passed') process.exitCode = 1;
