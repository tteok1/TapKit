import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect, _electron as electron, type ElectronApplication } from './test';
import { build } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  BrowserSnapshotSchema,
  BrowserPreparedSchema,
  BrowserResultSchema,
  type BrowserHostRequest,
  type BrowserSnapshot,
  type BrowserAction,
} from '../../packages/contracts/src';

test('P08-01 T16/T19 real Chromium validates DOM, frames, approval, takeover, lost response, isolation and cleanup', async () => {
  test.setTimeout(180000);
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P08-01 Chromium '));
  await writeFile(join(dir, 'P08-01.fixture'), 'P08-01 isolated browser fixture');
  await build({
    configFile: false,
    logLevel: 'error',
    build: {
      ssr: 'tests/e2e/P08-01.browser-harness.ts',
      outDir: join(dir, 'harness'),
      target: 'node24',
      rollupOptions: {
        external: ['electron'],
        output: { format: 'cjs', entryFileNames: 'main.cjs' },
      },
    },
    ssr: { noExternal: ['@tapkit/contracts', '@tapkit/network', 'zod'] },
  });
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: join(dir, 'profile') }).filter(
      (row): row is [string, string] => row[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  await mkdir(env.TAPKIT_DATA_DIR!, { recursive: true });
  await writeFile(join(env.TAPKIT_DATA_DIR!, 'P08-01.fixture'), 'P08-01 isolated browser fixture');
  let app: ElectronApplication | undefined;
  const runId = '0199b35d-9700-7000-8000-000000000811',
    rootRunId = runId;
  try {
    app = await electron.launch({
      args: [join(dir, 'harness/main.cjs')],
      env,
      chromiumSandbox: true,
    });
    await app.firstWindow();
    const command = async (request: Omit<BrowserHostRequest, 'runId' | 'rootRunId'>) =>
      app!.evaluate(
        async (_electron, value) => {
          const fixture = (
            globalThis as unknown as {
              tapkitBrowserActionFixture: { command(p: BrowserHostRequest): Promise<unknown> };
            }
          ).tapkitBrowserActionFixture;
          try {
            return { ok: true, data: await fixture.command(value) };
          } catch (error) {
            return { ok: false, error: (error as Error).message };
          }
        },
        { ...request, runId, rootRunId },
      );
    const mutate = (tabId: string, operation: 'move' | 'field' | 'password' | 'popup' | 'select') =>
      app!.evaluate(
        async (_electron, p) =>
          (
            globalThis as unknown as {
              tapkitBrowserActionFixture: {
                mutate(id: string, op: typeof p.operation): Promise<void>;
              };
            }
          ).tapkitBrowserActionFixture.mutate(p.tabId, p.operation),
        { tabId, operation },
      );
    const open = async (url = 'https://example.com/') => {
      const result = await command({ op: 'open', url });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      return BrowserSnapshotSchema.parse(result.data);
    };
    const observe = async (snapshot: BrowserSnapshot) => {
      const result = await command({ op: 'observe', tabId: snapshot.tabId });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      return BrowserSnapshotSchema.parse(result.data);
    };
    let snapshot = await open();
    expect(snapshot.text).toContain('样本数量 12，合计 84');
    expect(snapshot.text).toContain('"node":"undefined"');
    expect(snapshot.text).toContain('"bridge":"undefined"');
    expect(snapshot.nodes.filter((n) => n.name === '同名按钮')).toHaveLength(2);
    expect(new Set(snapshot.nodes.filter((n) => n.name === '同名按钮').map((n) => n.id)).size).toBe(
      2,
    );
    expect(
      snapshot.nodes.some((n) => n.name === '框架输入' && n.frameId !== snapshot.nodes[0]?.frameId),
    ).toBe(true);
    const act = async (current: BrowserSnapshot, action: BrowserAction, approved = false) => {
      const p = await command({ op: 'prepare', tabId: current.tabId, action });
      expect(p.ok, JSON.stringify(p)).toBe(true);
      const prepared = BrowserPreparedSchema.parse(p.data);
      const result = await command({
        op: 'act',
        tabId: current.tabId,
        action,
        binding: prepared.binding,
        approved,
      });
      return { prepared, result };
    };
    for (const navigation of [
      { action: 'navigate', url: 'https://example.com/next' },
      { action: 'back' },
      { action: 'forward' },
      { action: 'reload' },
      { action: 'back' },
    ] as const) {
      const moved = await act(snapshot, {
        tabId: snapshot.tabId,
        snapshotId: snapshot.id,
        ...navigation,
      });
      expect(moved.result.ok, JSON.stringify(moved)).toBe(true);
      snapshot = BrowserResultSchema.parse(moved.result.data).snapshot;
    }
    expect(snapshot.title).toBe('匿名浏览器验收');
    expect((await command({ op: 'external', tabId: snapshot.tabId })).ok).toBe(true);
    const note = snapshot.nodes.find((n) => n.name === '备注')!;
    const filled = await act(snapshot, {
      tabId: snapshot.tabId,
      snapshotId: snapshot.id,
      nodeId: note.id,
      action: 'fill',
      value: '合成字段',
    });
    expect(filled.result.ok, JSON.stringify(filled)).toBe(true);
    snapshot = BrowserResultSchema.parse(filled.result.data).snapshot;
    const select = snapshot.nodes.find((n) => n.name === '分类')!;
    const selected = await act(snapshot, {
      tabId: snapshot.tabId,
      snapshotId: snapshot.id,
      nodeId: select.id,
      action: 'select',
      value: 'b',
    });
    expect(selected.result.ok).toBe(true);
    snapshot = BrowserResultSchema.parse(selected.result.data).snapshot;
    const frameInput = snapshot.nodes.find((n) => n.name === '框架输入')!;
    const frameFill = await act(snapshot, {
      tabId: snapshot.tabId,
      snapshotId: snapshot.id,
      nodeId: frameInput.id,
      action: 'fill',
      value: '框架值',
    });
    expect(frameFill.result.ok).toBe(true);
    snapshot = BrowserResultSchema.parse(frameFill.result.data).snapshot;
    const stale = await command({
      op: 'prepare',
      tabId: snapshot.tabId,
      action: {
        tabId: snapshot.tabId,
        snapshotId: snapshot.id,
        nodeId: snapshot.nodes.find((n) => n.name === '提交合成记录')!.id,
        action: 'click',
      },
    });
    expect(stale.ok).toBe(true);
    await mutate(snapshot.tabId, 'field');
    const stalePrepared = BrowserPreparedSchema.parse(stale.data);
    const rejected = await command({
      op: 'act',
      tabId: snapshot.tabId,
      action: {
        tabId: snapshot.tabId,
        snapshotId: snapshot.id,
        nodeId: snapshot.nodes.find((n) => n.name === '提交合成记录')!.id,
        action: 'click',
      },
      binding: stalePrepared.binding,
      approved: true,
    });
    expect(rejected).toMatchObject({ ok: false, error: 'APPROVAL_STALE' });
    snapshot = await observe(snapshot);
    const user = await command({ op: 'control', tabId: snapshot.tabId, mode: 'user' });
    expect(user.ok).toBe(true);
    const locked = await command({
      op: 'prepare',
      tabId: snapshot.tabId,
      action: {
        tabId: snapshot.tabId,
        snapshotId: snapshot.id,
        nodeId: note.id,
        action: 'fill',
        value: '不允许',
      },
    });
    expect(locked.ok).toBe(false);
    snapshot = BrowserSnapshotSchema.parse(
      (await command({ op: 'control', tabId: snapshot.tabId, mode: 'agent' })).data,
    );
    const submitAction = {
      tabId: snapshot.tabId,
      snapshotId: snapshot.id,
      nodeId: snapshot.nodes.find((n) => n.name === '提交合成记录')!.id,
      action: 'click' as const,
    };
    const unapproved = await act(snapshot, submitAction);
    expect(unapproved.prepared.classification).toBe('submit');
    expect(unapproved.result.ok).toBe(false);
    const submitted = await act(snapshot, submitAction, true);
    expect(submitted.result.ok, JSON.stringify(submitted)).toBe(true);
    expect(BrowserResultSchema.parse(submitted.result.data).state).toBe('submitted');
    snapshot = BrowserResultSchema.parse(submitted.result.data).snapshot;
    expect(snapshot.text).toContain('已提交合成记录');
    const replayed = await command({
      op: 'act',
      tabId: snapshot.tabId,
      action: submitAction,
      binding: submitted.prepared.binding,
      approved: true,
    });
    expect(replayed.ok).toBe(false);
    const next = await open('https://example.com/?drop=1');
    const lost = await act(
      next,
      {
        tabId: next.tabId,
        snapshotId: next.id,
        nodeId: next.nodes.find((n) => n.name === '提交合成记录')!.id,
        action: 'click',
      },
      true,
    );
    expect(lost.result.ok, JSON.stringify(lost)).toBe(true);
    expect(BrowserResultSchema.parse(lost.result.data).state).toBe('unknown');
    const privatePage = await command({ op: 'open', url: 'http://127.0.0.1/private' });
    expect(privatePage.ok).toBe(false);
    const redirected = await command({ op: 'open', url: 'https://example.com/redirect' });
    expect(redirected.ok).toBe(false);
    let third = await open();
    const oldHandle = {
      tabId: third.tabId,
      snapshotId: third.id,
      nodeId: third.nodes.find((n) => n.name === '提交合成记录')!.id,
      action: 'click' as const,
    };
    await mutate(third.tabId, 'move');
    expect((await command({ op: 'prepare', tabId: third.tabId, action: oldHandle })).ok).toBe(
      false,
    );
    third = await observe(third);
    const downloaded = await act(third, {
      tabId: third.tabId,
      snapshotId: third.id,
      nodeId: third.nodes.find((n) => n.name === '下载资料')!.id,
      action: 'click',
    });
    expect(downloaded.result.ok, JSON.stringify(downloaded)).toBe(true);
    third = BrowserResultSchema.parse(downloaded.result.data).snapshot;
    expect(third.downloads).toContainEqual({
      url: 'https://example.com/download.txt',
      name: 'fixture.txt',
    });
    await mutate(third.tabId, 'select');
    expect((await observe(third)).selection).toContain('样本数量 12');
    await mutate(third.tabId, 'password');
    const blocked = await observe(third);
    expect(blocked.blocked).toBe('LOGIN_OR_CAPTCHA');
    await app.evaluate(
      async (_electron, id) =>
        (
          globalThis as unknown as {
            tapkitBrowserActionFixture: { screenshot(id: string): Promise<void> };
          }
        ).tapkitBrowserActionFixture.screenshot(id),
      third.tabId,
    );
    const override = await open('https://example.com/override');
    const overrideAction = {
      tabId: override.tabId,
      snapshotId: override.id,
      nodeId: override.nodes.find((n) => n.name === '覆盖目标提交')!.id,
      action: 'click' as const,
    };
    const effective = await act(override, overrideAction, true);
    expect(effective.prepared.target).toBe('https://frame.example.com/override-target');
    expect(BrowserResultSchema.parse(effective.result.data).state).toBe('submitted');
    const attack = await open('https://example.com/override?attack=1');
    const attacked = await act(
      attack,
      {
        tabId: attack.tabId,
        snapshotId: attack.id,
        nodeId: attack.nodes.find((n) => n.name === '覆盖目标提交')!.id,
        action: 'click',
      },
      true,
    );
    expect(BrowserResultSchema.parse(attacked.result.data).state).toBe('unknown');
    const state = await app.evaluate(
      () =>
        (globalThis as unknown as { tapkitBrowserActionFixture: { state: unknown } })
          .tapkitBrowserActionFixture.state,
    );
    expect(state).toMatchObject({
      unauthorizedWrites: 0,
      partitions: [{ persistent: false, proxy: expect.stringContaining('PROXY 127.0.0.1:') }],
    });
    expect((state as { records: string[] }).records).toHaveLength(2);
    expect((state as { overrideRecords: string[] }).overrideRecords).toHaveLength(1);
    expect((state as { unreviewedRequests: number }).unreviewedRequests).toBe(0);
    expect((state as { externalUrls: string[] }).externalUrls).toEqual(['https://example.com/']);
    await command({ op: 'dispose' });
    const afterClose = await command({ op: 'observe', tabId: third.tabId });
    expect(afterClose.ok).toBe(false);
    const fresh = await open();
    expect(fresh.text).toContain('"cookieBefore":""');
    await command({ op: 'dispose' });
    await mkdir('docs/evidence/P08-01/desktop', { recursive: true });
    await writeFile(
      'docs/evidence/P08-01/desktop/browser-kernel.json',
      JSON.stringify(
        {
          scope:
            'real Chromium; synthetic public-origin protocol responses; production network and DOM gates',
          result: 'passed',
          state,
          staleApprovalRejected: true,
          manualLock: true,
          lostResponseBusinessRecords: 1,
          freshPartitionCookieEmpty: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await app?.close();
  }
});
