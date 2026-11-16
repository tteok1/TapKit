import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { cpus, release, totalmem } from 'node:os';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron, type Page } from './test';
import { waitCoreReady, waitRuntimeCapabilities } from './core-ready';
import { openSessionFixture, reopenSessionFixture } from './session-fixture';
import { measureStreaming } from './streaming-perf-fixture';

type Sample = { at: number; totalBytes: number; processCount: number; nativeHelpers: number };

async function runOfficePair(page: Page) {
  return page.evaluate(async () => {
    const id = () => {
      const value = crypto.randomUUID();
      return value.slice(0, 14) + '7' + value.slice(15);
    };
    const create = async (ordinal: number) => {
      const session = await window.tapkit.desktopCommand({ requestId: id() }, 'sessions.create', {
        mode: 'work',
        title: `P11 并发办公 ${ordinal}`,
      });
      if (!session.ok || !('entityId' in session.data)) throw Error('WORK_SESSION');
      const created = await window.tapkit.workCommand({ requestId: id() }, 'runs.create', {
        sessionId: session.data.entityId,
        goal: `P07文档 PDF 生成报告 P11 并发 ${ordinal}`,
        format: 'pdf',
      });
      if (!created.ok) throw Error(created.error.code);
      if (!('work' in created.data)) throw Error('WORK_CREATE');
      return created.data.work.runId;
    };
    const startedAt = Date.now();
    const ids = await Promise.all([create(1), create(2)]);
    let bothActive = false;
    while (Date.now() - startedAt < 300_000) {
      const states = await Promise.all(
        ids.map(async (runId) => {
          const reply = await window.tapkit.workCommand({ requestId: id() }, 'runs.get', { runId });
          if (!reply.ok) throw Error(reply.error.code);
          if (!('work' in reply.data)) throw Error('WORK_STATUS');
          const work = reply.data.work;
          return {
            status: work.status,
            reason: work.reason,
            artifacts: work.steps.flatMap((step) => step.artifacts).length,
          };
        }),
      );
      if (states.every(({ status }) => status === 'running' || status === 'waiting_tool'))
        bothActive = true;
      if (
        states.every(({ status }) => status === 'completed') ||
        states.some(({ status }) =>
          ['waiting_user', 'failed', 'partial', 'cancelled', 'budget_stopped'].includes(status),
        )
      ) {
        return { startedAt, finishedAt: Date.now(), bothActive, states };
      }
      await new Promise((done) => setTimeout(done, 250));
    }
    throw Error('WORK_PAIR_TIMEOUT');
  });
}

test('P11-01 joint load: live index and two chat roots, then two native Office roots', async () => {
  test.setTimeout(900_000);
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data/P11-01 joint '));

  const seed = await promisify(execFile)(
    process.execPath,
    [
      resolve('.cache/tools/pnpm/package/bin/pnpm.mjs'),
      'exec',
      'vitest',
      'run',
      '--project',
      'joint-fixture',
    ],
    { env: { ...process.env, TAPKIT_JOINT_FIXTURE_DIR: dir }, windowsHide: true, timeout: 550_000 },
  );
  console.info(seed.stdout.trim());
  const { project, base, indexWork } = JSON.parse(
    await readFile(join(dir, 'joint-fixture.json'), 'utf8'),
  ) as {
    project: string;
    base: Record<string, number>;
    indexWork: { projectId: string; selectedVersionIds: string[] };
  };

  expect(base).toEqual({ sessions: 10_000, messages: 100_000, documents: 2_000, chunks: 20_000 });
  await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TAPKIT_DATA_DIR: dir,
    TAPKIT_CHAT_FIXTURE: 'P02-02',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  const app = await electron.launch({
    args: [resolve('apps/desktop')],
    chromiumSandbox: true,
    env: Object.fromEntries(
      Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
  });
  const sampler = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-File',
      resolve('tests/fixtures/P11-01-working-set.ps1'),
      '-RootProcessId',
      String(app.process().pid),
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const samples: Sample[] = [];
  const samplerErrors: string[] = [];
  sampler.on('error', (error) => samplerErrors.push(error.message));
  sampler.stderr.setEncoding('utf8').on('data', (value: string) => samplerErrors.push(value));
  createInterface({ input: sampler.stdout }).on('line', (line) => {
    try {
      samples.push(JSON.parse(line) as Sample);
    } catch {
      samplerErrors.push('Invalid working set sample');
    }
  });
  const phases = (start: number, end: number) => {
    const points = samples.filter(({ at }) => at >= start && at <= end);
    return {
      peakMiB: points.length
        ? Math.max(...points.map(({ totalBytes }) => totalBytes)) / 2 ** 20
        : null,
      maxNativeHelpers: Math.max(0, ...points.map(({ nativeHelpers }) => nativeHelpers)),
      samples: points,
    };
  };
  const report = {
    checkedAt: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      windowsHide: true,
    }).trim(),
    environment: {
      image: process.env.ImageOS ?? null,
      imageVersion: process.env.ImageVersion ?? null,
      osRelease: release(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      ramBytes: totalmem(),
    },
    dataset: base,
    scope:
      'Locked BGE CPU embeddings, two synthetic upstream chats, two isolated DOCX-to-PDF work roots. Windows process-tree working set including native helpers and their children.',
    samplerErrors,
    results: {} as Record<string, unknown>,
  };
  try {
    const page = await app.firstWindow();
    await waitCoreReady(page);
    const capabilities = await waitRuntimeCapabilities(page);
    expect(capabilities.officeRender.status).toBe('available');
    await page.evaluate(async (projectId) => {
      const token = crypto.randomUUID();
      const reply = await window.tapkit.projectCommand(
        { requestId: token.slice(0, 14) + '7' + token.slice(15) },
        'knowledge.query',
        { projectId, query: '退款期限', limit: 4 },
      );
      if (!reply.ok || !('hits' in reply.data) || !reply.data.hits.length)
        throw Error('WARM_RETRIEVAL');
    }, project);
    const first = await openSessionFixture(page, 'P11 联合聊天'),
      second = await openSessionFixture(page, 'P11 联合取消');
    await reopenSessionFixture(page, first);
    const chatStartedAt = Date.now();
    const chat = await measureStreaming(page, first, second, indexWork);
    const chatMemory = phases(chatStartedAt, Date.now());
    report.results.chatAndIndex = { ...chat, ...chatMemory };
    const heavy = await runOfficePair(page);
    const workMemory = phases(heavy.startedAt, heavy.finishedAt);
    report.results.heavyWork = { ...heavy, ...workMemory };
    expect(samplerErrors).toEqual([]);
    expect(chatMemory.samples.length).toBeGreaterThan(0);
    expect(chatMemory.peakMiB!).toBeLessThanOrEqual(2048);
    expect(chat.index?.error).toBeNull();
    expect(chat.index?.hits).toBeGreaterThan(0);
    expect(chat.index?.streamedDuringIndex).toBeGreaterThan(0);
    expect(chat.displayP95Ms).toBeLessThanOrEqual(100);
    expect(chat.cancelAckMs).toBeLessThanOrEqual(200);
    expect(chat.cancelSettledMs).toBeLessThanOrEqual(1000);
    expect(chat.callsAfter).toBe(chat.callsBefore);
    expect(workMemory.maxNativeHelpers).toBeGreaterThanOrEqual(2);
    expect(workMemory.peakMiB!).toBeLessThanOrEqual(4096);
    expect(heavy.bothActive).toBe(true);
    for (const work of heavy.states) {
      expect(work.status, work.reason ?? '').toBe('completed');
      expect(work.artifacts).toBeGreaterThan(0);
    }
  } finally {
    sampler.kill();
    await app.close();
    const path = resolve('test-results/P11-01/joint-load.json');
    await mkdir(resolve('test-results/P11-01'), { recursive: true });
    await writeFile(path, JSON.stringify(report, null, 2) + '\n');
    console.info(
      'P11-01 joint load',
      JSON.stringify({
        chatAndIndex: Object.fromEntries(
          Object.entries(report.results.chatAndIndex ?? {}).filter(([key]) => key !== 'samples'),
        ),
        heavyWork: Object.fromEntries(
          Object.entries(report.results.heavyWork ?? {}).filter(([key]) => key !== 'samples'),
        ),
      }),
    );
  }
});
