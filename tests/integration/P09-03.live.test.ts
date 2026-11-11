import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import {
  GitHubConnectSchema,
  GitHubViewSchema,
  type GitHubIntent,
  type GitHubVaultDocument,
} from '../../packages/contracts/src';
import { NetworkPolicyService } from '../../packages/network/src';
import { resolveNetworkProxy } from '../../packages/providers/src';
import { codeHash } from '../../packages/tools/src';
import { CodeService } from '../../packages/core/src/code-service';
import { CodeRuntimeService } from '../../packages/core/src/code-runtime';
import { GitHubRemote } from '../../packages/core/src/github-remote';
import { GitHubService } from '../../packages/core/src/github-service';
import { newId } from '../../packages/storage/src';
import { fixture } from './P06.fixture';

test.skipIf(
  process.env.TAPKIT_P09_GITHUB_LIVE_RUNNER !== '1' ||
    process.env.TAPKIT_P09_GITHUB_LIVE_R07 !== '1',
)(
  'P09-03 live R07 authorized dedicated repo to Draft PR',
  async () => {
    const f = await fixture();
    const code = new CodeService(f.store, resolve('.'));
    const runtime = new CodeRuntimeService(f.store, code, resolve('.'), {
      nativeExecution: { status: 'available' },
      terminal: { status: 'available' },
      officeRender: {
        status: 'failed',
        code: 'SANDBOX_UNAVAILABLE',
        reason: 'R07 does not use Office',
      },
    });
    try {
      const id = (await f.create({ planFirst: true })).runId;
      // Do not let schema diagnostics or Playwright traces print a real credential.
      const input = GitHubConnectSchema.safeParse({
        runId: id,
        repo: process.env.TAPKIT_P09_GITHUB_R07_REPO,
        token: process.env.TAPKIT_P09_GITHUB_R07_TOKEN,
        contentsWrite: true,
        pullRequestsWrite: true,
      });
      if (!input.success) throw Error('R07 fixture repository or PAT is invalid');
      let secret: GitHubVaultDocument | null = null;
      const network = new NetworkPolicyService({
        proxy: (url, signal) =>
          resolveNetworkProxy({ mode: 'environment', proxyURL: '' }, url, undefined, signal),
      });
      const github = new GitHubService(
        f.store,
        code,
        new GitHubRemote(network),
        async (operation, _profile, payload) => {
          if (operation === 'github.write') secret = payload as GitHubVaultDocument;
          else if (operation === 'github.delete') secret = null;
          return secret;
        },
        (runId, hash) => runtime.verify(runId, hash),
        () => true,
      );
      const request = (command: string, payload: object = {}) => ({
        protocolVersion: 1 as const,
        requestId: newId(),
        windowId: '1',
        command,
        payload: { runId: id, ...payload },
      });
      const action = async (command: string, payload: object = {}) => {
        const reply = await github.dispatch(request(command, payload));
        if (!reply.ok) throw Error(reply.error.code);
        return GitHubViewSchema.parse('github' in reply.data ? reply.data.github : null);
      };
      const local = async (command: string, payload: object = {}) => {
        const reply = await code.dispatch(request(command, payload));
        if (!reply.ok) throw Error(reply.error.code);
      };
      const approve = async (intent: GitHubIntent) => {
        const { preview } = await action('github.preview', { intent });
        return action('github.approve', { previewId: preview!.id });
      };
      const connected = await github.connect(newId(), input.data);
      if (!connected.ok || !('github' in connected.data))
        throw Error(connected.ok ? 'R07 connection' : connected.error.code);
      const account = connected.data.github.account!;
      await action('github.clone');
      await local('code.prepareWorkspace');
      const project = await code.view(id);
      const before = 'export const sum = (a,b) => a-b;\n';
      const after = before.replace('a-b', 'a+b');
      if (project.files.find((file) => file.path === 'sum.mjs')?.hash !== codeHash(before))
        throw Error('R07 repository is missing the required synthetic fixture');
      if ((await runtime.prepare(id, 'node')).state !== 'ready')
        throw Error('R07 runtime preparation failed');
      const check = async () => {
        const handle = await runtime.start(
          id,
          {
            runtime: 'node',
            argv: ['--test', '--test-isolation=none'],
            cwd: '.',
            timeoutMs: 30000,
          },
          false,
        );
        const current = async () =>
          (await runtime.view(id)).processes.find((item) => item.id === handle.id)?.state;
        await expect.poll(current, { timeout: 60000 }).not.toMatch(/starting|running/);
        return current();
      };
      expect(await check()).toBe('failed');
      await local('code.applyPatch', {
        patch: { path: 'sum.mjs', baseHash: codeHash(before), content: after },
      });
      expect(await check()).toBe('succeeded');
      await local('code.accept', { path: 'sum.mjs', expectedHash: codeHash(after) });
      const commit = (await approve({ kind: 'commit', message: 'Fix synthetic sum fixture' }))
        .commit!;
      console.log(`R07 target ${account.repo}, branch ${project.branch}, commit ${commit.sha}`);
      expect((await approve({ kind: 'push' })).pushedSha).toBe(commit.sha);
      const draft = await approve({
        kind: 'draft',
        base: account.defaultBranch,
        title: 'TapKit R07 synthetic fixture',
        body: 'P09-03 authorized test fixture. Node checks passed.',
      });
      expect(draft.pull?.draft).toBe(true);
      console.log(`R07 draft PR ${draft.pull!.url}`);
      expect((await action('github.checkPR')).pull?.number).toBe(draft.pull?.number);
      await action('github.disconnect');
    } finally {
      await runtime.stop();
      await f.close();
    }
  },
  360000,
);
