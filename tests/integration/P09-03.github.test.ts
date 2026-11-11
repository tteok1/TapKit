import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import {
  GitHubViewSchema,
  type GitHubAccount,
  type GitHubIntent,
  type GitHubVaultDocument,
  type Reply,
} from '../../packages/contracts/src';
import { NetworkPolicyService } from '../../packages/network/src';
import { CodeGitBroker, codeHash, runtimePaths } from '../../packages/tools/src';
import { CodeService } from '../../packages/core/src/code-service';
import { CodeRuntimeService } from '../../packages/core/src/code-runtime';
import { GitHubRemote } from '../../packages/core/src/github-remote';
import { GitHubService } from '../../packages/core/src/github-service';
import { newId } from '../../packages/storage/src';
import { fixture } from './P06.fixture';

const repo = 'fixture/tapkit-r07';
const synthetic = 'github_pat_' + 'synth_fixture_'.repeat(6);
const original = 'export const sum = (a,b) => a-b;\n';
const fixed = original.replace('a-b', 'a+b');
const sumTest =
  "import {sum} from './sum.mjs'; import assert from 'node:assert/strict'; import test from 'node:test'; test('sum', () => assert.equal(sum(2,3),5));\n";

function view(reply: Reply) {
  if (!reply.ok) throw Error(reply.error.code);
  return GitHubViewSchema.parse('github' in reply.data ? reply.data.github : null);
}
function expectError(reply: Reply, code: string) {
  expect(reply.ok ? 'success' : reply.error.code).toBe(code);
}

async function setup() {
  const f = await fixture();
  const root = await mkdtemp(resolve('.test-data/P09-03 fixture '));
  const source = join(root, '原远程仓库');
  const brokerDir = join(root, 'broker');
  await mkdir(source);
  await mkdir(brokerDir);
  await writeFile(join(source, 'sum.mjs'), original);
  await writeFile(join(source, 'sum.test.mjs'), sumTest);
  await writeFile(join(source, 'package.json'), '{"type":"module"}\n');
  const broker = new CodeGitBroker((await runtimePaths(resolve('.'), 'git')).executable, brokerDir);
  const metadata = join(source, '.git');
  await broker.run(['init', '--quiet', '--initial-branch=main', source]);
  await broker.run(['--git-dir=' + metadata, '--work-tree=' + source, 'add', '--all']);
  await broker.run([
    '--git-dir=' + metadata,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@localhost',
    'commit',
    '--quiet',
    '-m',
    'original',
  ]);
  const baseSha = (await broker.run(['--git-dir=' + metadata, 'rev-parse', 'HEAD']))
    .toString()
    .trim();
  const code = new CodeService(f.store, resolve('.'));
  const runtime = new CodeRuntimeService(f.store, code, resolve('.'), {
    nativeExecution: { status: 'available' },
    terminal: { status: 'available' },
    officeRender: { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason: 'fixture' },
  });
  const id = (await f.create({ planFirst: true })).runId;
  const net = new NetworkPolicyService();
  const counts = { post: 0, list: 0, push: 0, reads: 0 };
  const simulation: {
    authExpired: boolean;
    visible: boolean;
    allow: boolean;
    rejectPush: boolean;
    beforeHead?: () => Promise<void>;
  } = { authExpired: false, visible: false, allow: true, rejectPush: false };
  let pull: Record<string, unknown> | null = null;
  const requests: string[] = [];
  const wire = (url: string, value: unknown, status = 200) => ({
    url,
    status,
    headers: {},
    bytes: Buffer.from(JSON.stringify(value)),
  });
  vi.spyOn(net, 'github').mockImplementation(async (url, token, payload) => {
    if (token !== synthetic) throw Error('fixture token mismatch');
    const u = new URL(url);
    expect(u.origin).toBe('https://api.github.com');
    requests.push((payload ? 'POST ' : 'GET ') + u.pathname);
    if (simulation.authExpired) return wire(url, {}, 401);
    if (u.pathname === '/user') return wire(url, { login: 'fixture-user' });
    if (u.pathname === '/repos/' + repo)
      return wire(url, { full_name: repo, default_branch: 'main', id: 123 });
    if (!u.pathname.startsWith('/repos/' + repo + '/')) return wire(url, {}, 404);
    if (u.pathname.endsWith('/pulls')) {
      if (!payload) {
        counts.list++;
        expect(u.searchParams.get('base')).toBe('main');
        expect(u.searchParams.get('head')).toMatch(/^fixture:tapkit\//);
        return wire(url, simulation.visible && pull ? [pull] : []);
      }
      counts.post++;
      const draft = payload as {
        head: string;
        base: string;
        title: string;
        body: string;
        draft: boolean;
      };
      expect(draft.draft).toBe(true);
      expect(draft.body).toContain('<!-- tapkit-run-id:');
      const sha = (
        await broker.run(['--git-dir=' + metadata, 'rev-parse', 'refs/heads/' + draft.head])
      )
        .toString()
        .trim();
      pull = {
        number: 7,
        title: draft.title,
        body: draft.body,
        draft: true,
        state: 'open',
        head: { ref: draft.head, sha, repo: { id: 123 } },
        base: { ref: draft.base, repo: { id: 123 } },
      };
      throw Error('NETWORK_ERROR'); // The PR exists, but the POST reply was lost.
    }
    if (u.pathname.endsWith('/pulls/7')) {
      counts.reads++;
      return wire(url, pull);
    }
    if (u.pathname.endsWith('/check-runs'))
      return wire(url, {
        total_count: 1,
        check_runs: [{ name: 'check', status: 'completed', conclusion: 'success' }],
      });
    if (u.pathname.endsWith('/status'))
      return wire(url, { total_count: 1, statuses: [{ context: 'lint', state: 'success' }] });
    if (u.pathname.endsWith('/reviews'))
      return wire(url, [
        { user: { login: 'reviewer' }, state: 'COMMENTED', body: '测试反馈 ' + synthetic },
      ]);
    throw Error('unexpected fixture endpoint');
  });
  const remote = new (class extends GitHubRemote {
    override async fetch(worker: CodeGitBroker, projectId: string, account: GitHubAccount) {
      expect(account.repo).toBe(repo);
      const imported = await worker.mirror(source, projectId);
      return {
        mirror: imported.mirror,
        ...(await worker.snapshot(imported.mirror, 'refs/heads/main')),
      };
    }
    override async head(worker: CodeGitBroker, branch: string) {
      await simulation.beforeHead?.();
      const out = (
        await worker.run([
          '-c',
          'protocol.file.allow=always',
          'ls-remote',
          '--refs',
          source,
          'refs/heads/' + branch,
        ])
      ).toString();
      return out.split('\t')[0] || null;
    }
    override async push(
      worker: CodeGitBroker,
      mirror: string,
      sha: string,
      branch: string,
      previous: string | null,
      _account: GitHubAccount,
      _token: string,
      guard: () => void,
    ) {
      guard();
      counts.push++;
      if (simulation.rejectPush) throw Error('PERMISSION_DENIED');
      const ref = 'refs/heads/' + branch;
      await worker.run([
        '-c',
        'protocol.file.allow=always',
        '--git-dir=' + mirror,
        'push',
        `--force-with-lease=${ref}:${previous ?? ''}`,
        source,
        sha + ':' + ref,
      ]);
      throw Error('NETWORK_ERROR'); // The Git ref has changed, but the reply was lost.
    }
  })(net);
  let stored: GitHubVaultDocument | null = null;
  function createService() {
    return new GitHubService(
      f.store,
      code,
      remote,
      async (operation, profile, payload) => {
        expect(profile).toBe(f.store.profileId);
        if (operation === 'github.write') stored = payload as GitHubVaultDocument;
        else if (operation === 'github.delete') stored = null;
        return stored;
      },
      (runId, hash) => runtime.verify(runId, hash),
      () => simulation.allow,
    );
  }
  let github = createService();
  const send = (command: string, payload: Record<string, unknown> = {}, windowId = '1') =>
    github.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command,
      windowId,
      payload: { runId: id, ...payload },
    });
  const local = (command: string, payload: Record<string, unknown> = {}) =>
    code.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command,
      payload: { runId: id, ...payload },
    });
  const connect = (target = repo, contentsWrite = true, pullRequestsWrite = true) =>
    github.connect(newId(), {
      runId: id,
      repo: target,
      token: synthetic,
      contentsWrite,
      pullRequestsWrite,
    });
  const preview = async (intent: GitHubIntent) =>
    view(await send('github.preview', { intent })).preview!;
  const check = async () => {
    const handle = await runtime.start(
      id,
      { runtime: 'node', argv: ['--test', '--test-isolation=none'], cwd: '.', timeoutMs: 30000 },
      false,
    );
    await expect
      .poll(async () => (await runtime.view(id)).processes.find((p) => p.id === handle.id)?.state, {
        timeout: 50000,
      })
      .not.toMatch(/starting|running/);
    return (await runtime.view(id)).processes.find((p) => p.id === handle.id)!;
  };
  return {
    ...f,
    id,
    source,
    metadata,
    baseSha,
    code,
    broker,
    runtime,
    simulation,
    counts,
    requests,
    connect,
    send,
    local,
    preview,
    check,
    restart: () => {
      github = createService();
    },
    close: async () => {
      await runtime.stop();
      await f.close();
    },
  };
}

test('P09-03 tested and reviewed Git changes publish once and recover a lost Draft PR response after restart', async () => {
  const f = await setup();
  try {
    const connected = view(await f.connect());
    expect(connected.account?.repo).toBe(repo);
    expect(JSON.stringify(connected)).not.toContain(synthetic);
    expect((await f.send('github.clone')).ok).toBe(true);
    expect((await f.send('github.fetch')).ok).toBe(true);
    expect((await f.local('code.prepareWorkspace')).ok).toBe(true);
    expect((await f.send('github.fetch')).ok).toBe(false);
    expect((await f.runtime.prepare(f.id, 'node')).state).toBe('ready');
    expect((await f.check()).state).toBe('failed');
    expect(
      (
        await f.local('code.applyPatch', {
          patch: { path: 'sum.mjs', baseHash: codeHash(original), content: fixed },
        })
      ).ok,
    ).toBe(true);
    expectError(
      await f.send('github.preview', { intent: { kind: 'commit', message: 'Fix sum' } }),
      'APPROVAL_REQUIRED',
    );
    expect(
      (await f.local('code.accept', { path: 'sum.mjs', expectedHash: codeHash(fixed) })).ok,
    ).toBe(true);
    expectError(
      await f.send('github.preview', { intent: { kind: 'commit', message: 'Fix sum' } }),
      'APPROVAL_STALE',
    );
    expect((await f.check()).state).toBe('succeeded');
    expectError(
      await f.send('github.preview', { intent: { kind: 'commit', message: synthetic } }),
      'PERMISSION_DENIED',
    );
    const approval = await f.preview({ kind: 'commit', message: 'Fix sum' });
    expect(approval.files).toEqual([{ path: 'sum.mjs', hash: codeHash(fixed) }]);
    expectError(await f.send('github.approve', { previewId: approval.id }, '2'), 'APPROVAL_STALE');
    const committed = view(await f.send('github.approve', { previewId: approval.id }));
    expect(committed.commit?.subject).toBe('Fix sum');
    expectError(await f.send('github.approve', { previewId: approval.id }), 'APPROVAL_STALE');
    expect((await f.send('github.disconnect')).ok).toBe(true);
    expectError(await f.send('github.preview', { intent: { kind: 'push' } }), 'AUTH_REQUIRED');
    expect(view(await f.connect(repo, false, false)).account?.contentsWrite).toBe(false);
    expectError(await f.send('github.preview', { intent: { kind: 'push' } }), 'PERMISSION_DENIED');
    view(await f.connect());
    const interrupted = await f.preview({ kind: 'push' });
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((resolveStart) => {
      entered = resolveStart;
    });
    const paused = new Promise<void>((resolveRelease) => {
      release = resolveRelease;
    });
    f.simulation.beforeHead = async () => {
      entered();
      await paused;
    };
    const inProgress = f.send('github.approve', { previewId: interrupted.id });
    await started;
    const disconnect = f.send('github.disconnect');
    release();
    expectError(await inProgress, 'PERMISSION_DENIED');
    expect(view(await disconnect).account).toBeNull();
    expect(f.counts.push).toBe(0);
    delete f.simulation.beforeHead;
    view(await f.connect());
    const blocked = await f.preview({ kind: 'push' });
    f.simulation.rejectPush = true;
    expectError(await f.send('github.approve', { previewId: blocked.id }), 'PERMISSION_DENIED');
    expect(view(await f.send('github.status')).pending).toBeNull();
    f.simulation.rejectPush = false;
    const push = await f.preview({ kind: 'push' });
    expect(push.commits).toEqual([committed.commit]);
    expect(view(await f.send('github.approve', { previewId: push.id })).pushedSha).toBe(
      committed.commit?.sha,
    );
    expect(f.counts.push).toBe(2);
    const draft = await f.preview({
      kind: 'draft',
      base: 'main',
      title: 'Fix sum',
      body: 'Verified with Node tests',
    });
    expectError(await f.send('github.approve', { previewId: draft.id }), 'SIDE_EFFECT_UNKNOWN');
    expect(f.counts.list).toBe(2);
    expect(f.counts.post).toBe(1);
    f.restart();
    expect(view(await f.send('github.status')).pending).toBe('draft');
    expectError(await f.send('github.preview', { intent: draft.intent }), 'SIDE_EFFECT_UNKNOWN');
    expectError(await f.send('github.reconcile'), 'SIDE_EFFECT_UNKNOWN');
    f.simulation.visible = true;
    const reconciled = view(await f.send('github.reconcile'));
    expect(reconciled.pull?.number).toBe(7);
    expect(reconciled.pending).toBeNull();
    expect(f.counts.post).toBe(1);
    const refreshed = view(await f.send('github.checkPR')).pull!;
    expect(refreshed.checks.map((r) => r.name)).toEqual(['check', 'lint']);
    expect(refreshed.reviews[0]?.body).toBe('测试反馈 [凭据已隐藏]');
    expect(refreshed.draft).toBe(true);
    expect(
      (await f.broker.run(['--git-dir=' + f.metadata, 'rev-parse', 'refs/heads/main']))
        .toString()
        .trim(),
    ).toBe(f.baseSha);
    expect(
      (
        await f.broker.run(['--git-dir=' + f.metadata, 'show', `${committed.commit!.sha}:sum.mjs`])
      ).toString(),
    ).toBe(fixed);
    expect(await readFile(join(f.source, 'sum.mjs'), 'utf8')).toBe(original);
    for (const table of ['code_projects', 'worktrees', 'request_receipts', 'events', 'tool_calls'])
      expect(JSON.stringify(f.store.db.prepare(`SELECT * FROM ${table}`).all())).not.toContain(
        synthetic,
      );
    expect(JSON.stringify(refreshed)).not.toContain(synthetic);
  } finally {
    await f.close();
  }
}, 240000);

test('P09-03 rejects repo and credential errors and stops networking under project scope', async () => {
  const f = await setup();
  try {
    expectError(await f.connect('other/unauthorized'), 'PERMISSION_DENIED');
    expect(view(await f.send('github.status')).account).toBeNull();
    f.simulation.authExpired = true;
    expectError(await f.connect(), 'AUTH_EXPIRED');
    f.simulation.authExpired = false;
    view(await f.connect());
    const count = f.requests.length;
    f.simulation.allow = false;
    expectError(await f.send('github.clone'), 'PERMISSION_DENIED');
    expect(f.requests).toHaveLength(count);
    expect(view(await f.send('github.disconnect')).account).toBeNull();
  } finally {
    await f.close();
  }
});
