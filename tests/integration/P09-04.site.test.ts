import { request } from 'node:http';
import { join, resolve } from 'node:path';
import { link, mkdir, writeFile } from 'node:fs/promises';
import { expect, test, vi } from 'vitest';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { serveSite } from '../../apps/desktop/src/main/site-preview-server';
import { captureSiteAssets, siteArchive, SiteService } from '../../packages/core/src/site-service';
import { CodeService } from '../../packages/core/src/code-service';
import { CodeRuntimeService } from '../../packages/core/src/code-runtime';
import { newId } from '../../packages/storage/src';
import type { CodePatch } from '../../packages/contracts/src';
import { fixture, until } from './P06.fixture';

const encoded = (path: string, content: string) => ({
  path,
  base64: Buffer.from(content).toString('base64'),
});

test('P09-04 HTTP exposes only the leased immutable static files', async () => {
  const server = await serveSite([
    encoded('index.html', '<h1>首页</h1>'),
    encoded('page-2.html', '关于'),
  ]);
  try {
    const home = await fetch(server.url);
    expect(home.status).toBe(200);
    expect(home.headers.get('content-security-policy')).toContain("connect-src 'none'");
    expect(home.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await home.text()).toBe('<h1>首页</h1>');
    expect(await (await fetch(server.url + 'page-2.html')).text()).toBe('关于');
    expect((await fetch(server.url + 'page-2.html', { method: 'POST' })).status).toBe(404);
    expect((await fetch(server.origin + '/index.html')).status).toBe(404);
    expect((await fetch(server.url + 'missing')).status).toBe(404);
    const badPath = new URL(server.url).pathname + '%2e%2e/index.html';
    const result = await new Promise<number | undefined>((resolveCode, reject) => {
      const req = request(server.origin, { path: badPath }, (response) => {
        response.resume();
        resolveCode(response.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    expect(result).toBe(404);
    expect(server.allows(server.url + 'page-2.html', true)).toBe(true);
    expect(server.allows('http://127.0.0.1:9' + new URL(server.url).pathname)).toBe(false);
  } finally {
    server.close();
  }
  await expect(fetch(server.url)).rejects.toThrow();
});

test('P09-04 snapshot refuses hard links and ZIP omits private and derived files', async () => {
  const root = await mkdtemp(resolve('.test-data/P09-04 asset '));
  const dist = join(root, 'dist');
  await mkdir(dist);
  await writeFile(join(dist, 'index.html'), '<h1>Site</h1>');
  await writeFile(join(root, 'private.html'), 'outside scope');
  await link(join(root, 'private.html'), join(dist, 'linked.html'));
  await expect(captureSiteAssets(dist)).rejects.toThrow('PERMISSION_DENIED');
  const input: [string, string][] = [
    ['README.md', 'npm ci && npm run build'],
    ['package-lock.json', '{}'],
    ['index.html', '<h1>Public</h1>'],
    ['dist/index.html', 'compiled'],
    ['.env', 'private'],
    ['node_modules/sample/index.js', 'dependency'],
    ['.git/config', 'private'],
  ];
  const zip = (await siteArchive(input)).toString('utf8');
  expect(zip).toContain('README.md');
  expect(zip).toContain('package-lock.json');
  expect(zip).not.toMatch(/dist\/index\.html|\.env|node_modules|\.git/);
  await expect(
    siteArchive([...input, ['config.js', "const apiKey = 'synthetic-fixture-value';"]]),
  ).rejects.toThrow('PERMISSION_DENIED');
});

test('P09-04 native build receipt binds a revision to its immutable preview source', async () => {
  let code: CodeService;
  const f = await fixture(async (run) => {
    const context = await code.modelContext(run.id);
    const file = context.files.find((entry) => entry.path === 'page-2.html');
    if (!file?.content || context.siteRevision?.region.selector !== 'main > h1')
      throw Error('Missing pinned region');
    return {
      text: '更新参观页标题',
      calls: [
        {
          tool: 'code.applyPatch',
          patch: {
            path: file.path,
            baseHash: file.hash,
            content: file.content.replace('<h1>参观</h1>', '<h1>参观路线</h1>'),
          },
        },
        { tool: 'artifact.write', name: '修改记录.md', content: '# 已修改参观页标题' },
      ],
      finished: true,
    };
  });
  code = new CodeService(f.store, resolve('.'));
  Object.defineProperty(f.gateway, 'code', { value: code });
  const runtime = new CodeRuntimeService(f.store, code, resolve('.'), {
    nativeExecution: { status: 'available' },
    terminal: { status: 'available' },
    officeRender: { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason: 'not used' },
  });
  const service = new SiteService(code, runtime);
  try {
    const original = await f.create({ planFirst: true });
    const runId = original.runId;
    const send = (command: string, payload: object, requestId = newId()) =>
      service.dispatch({ protocolVersion: 1, requestId, command, payload: { runId, ...payload } });
    const created = await send('site.create', {
      brief: {
        goal: '本地展馆',
        audience: '读者',
        pages: ['目录', '参观'],
        template: 'html',
        style: 'studio',
      },
    });
    expect(created.ok).toBe(true);
    const receipt = newId();
    const built = await send('site.build', {}, receipt);
    expect(built.ok, JSON.stringify(built)).toBe(true);
    if (!built.ok || !('site' in built.data)) throw Error('site');
    const process = built.data.site.build!;
    expect(process.state, (await runtime.poll(runId, process.processId, 0)).output.text).toBe(
      'succeeded',
    );
    expect(await send('site.build', {}, receipt)).toEqual(built);
    const version = built.data.site.versions[0]!;
    const snapshot = await service.transfer(newId(), runId, version.id, 'assets');
    expect(snapshot.ok).toBe(true);
    const beforeRestore = await code.siteSource(runId);
    const entries: [string, string][] = beforeRestore.entries.map(([path, text]) => [
      path,
      ['index.html', 'style.css'].includes(path) ? text + '\n' : text,
    ]);
    const writable = code as unknown as {
      write: (id: string, patch: CodePatch, guard: () => void) => Promise<void>;
    };
    const write = writable.write.bind(code);
    const injected = vi.spyOn(writable, 'write').mockImplementation(async (...args) => {
      if (args[1].path === 'style.css') throw Error('synthetic write failure');
      await write(...args);
    });
    try {
      await expect(code.restoreSite(runId, beforeRestore.sourceHash, entries)).rejects.toThrow(
        'synthetic write failure',
      );
      expect((await code.siteSource(runId)).sourceHash).toBe(beforeRestore.sourceHash);
    } finally {
      injected.mockRestore();
    }
    const steered = await f.send(
      'runs.steer',
      {
        runId,
        text: '把参观页标题改为参观路线',
        clientRequestId: newId(),
      },
      f.work.repo.view(runId).revision,
    );
    expect(steered.ok).toBe(true);
    if (!steered.ok || !('work' in steered.data)) throw Error('steer');
    const next = steered.data.work.runId;
    const region = {
      page: 'page-2.html',
      selector: 'main > h1',
      text: '参观',
      width: 390,
      height: 80,
    };
    const inherit = (sourceHash: string) =>
      code.dispatch({
        protocolVersion: 1,
        requestId: newId(),
        command: 'code.inherit',
        payload: {
          runId: next,
          sourceRunId: runId,
          siteRevision: { versionId: version.id, sourceHash, region },
        },
      });
    expect(await inherit('0'.repeat(64))).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect((await inherit(version.sourceHash)).ok).toBe(true);
    const context = await code.modelContext(next);
    expect(context).toMatchObject({
      trust: 'untrusted_project_data',
      siteRevision: { versionId: version.id, region, stale: false },
    });
    expect(await service.transfer(newId(), runId, version.id, 'check')).toMatchObject({
      ok: false,
      error: { code: 'PERMISSION_DENIED' },
    });
    await f.work.start();
    await until(() => f.work.repo.row(next).status === 'waiting_user');
    const planned = f.work.repo.view(next);
    const step = planned.steps[0]!;
    const plannedReply = await f.send(
      'runs.setPlan',
      {
        runId: next,
        steps: [
          {
            stepKey: step.stepKey,
            title: step.title,
            dependencies: step.dependencies,
            inputRefs: step.inputRefs,
            outputContract: step.outputContract,
            acceptance: step.acceptance,
            optional: step.optional,
          },
        ],
      },
      planned.revision,
    );
    expect(plannedReply.ok).toBe(true);
    await until(() => ['completed', 'partial', 'failed'].includes(f.work.repo.row(next).status));
    const outcome = f.work.repo.view(next);
    expect(
      outcome.status,
      JSON.stringify({
        reason: outcome.reason,
        steps: outcome.steps.map(({ status, errorCode }) => ({ status, errorCode })),
      }),
    ).toBe('completed');
    const rebuilt = await service.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: 'site.build',
      payload: { runId: next },
    });
    expect(rebuilt).toMatchObject({
      ok: true,
      data: { site: { build: { state: 'succeeded', exitCode: 0 } } },
    });
    if (!rebuilt.ok || !('site' in rebuilt.data)) throw Error('rebuild');
    const updated = await service.transfer(
      newId(),
      next,
      rebuilt.data.site.versions[0]!.id,
      'assets',
    );
    if (
      !updated.ok ||
      !('siteTransfer' in updated.data) ||
      updated.data.siteTransfer.kind !== 'assets'
    )
      throw Error('updated snapshot');
    const page = updated.data.siteTransfer.entries.find((entry) => entry.path === 'page-2.html');
    expect(Buffer.from(page!.base64, 'base64').toString('utf8')).toContain('<h1>参观路线</h1>');
  } finally {
    await runtime.stop();
    await f.close();
  }
}, 120000);
