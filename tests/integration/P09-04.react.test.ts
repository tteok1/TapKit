import { expect, test } from 'vitest';
import { join, resolve } from 'node:path';
import { newId } from '../../packages/storage/src';
import { CodeService } from '../../packages/core/src/code-service';
import { CodeRuntimeService } from '../../packages/core/src/code-runtime';
import { SiteService } from '../../packages/core/src/site-service';
import { DependencyBroker } from '../../packages/tools/src';
import { NetworkPolicyService } from '../../packages/network/src';
import { fixture } from './P06.fixture';

test.runIf(process.env.TAPKIT_P09_SITE_REGISTRY === '1')(
  'P09-04 locks React registry dependencies and builds offline inside the native sandbox',
  async () => {
    const f = await fixture();
    const code = new CodeService(f.store, resolve('.'));
    const proxy = process.env.TAPKIT_SITE_TEST_PROXY;
    const network = new NetworkPolicyService({ proxy: async () => proxy ?? '' });
    const runtime = new CodeRuntimeService(
      f.store,
      code,
      resolve('.'),
      {
        nativeExecution: { status: 'available' },
        terminal: { status: 'available' },
        officeRender: { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason: 'not used' },
      },
      new DependencyBroker(join(f.dir, 'code-dependency-cache'), network),
    );
    try {
      const service = new SiteService(code, runtime);
      const { runId } = await f.create({ planFirst: true });
      const send = (command: string, payload: object) =>
        service.dispatch({
          protocolVersion: 1,
          requestId: newId(),
          command,
          payload: { runId, ...payload },
        });
      expect(
        (
          await send('site.create', {
            brief: {
              goal: 'React 展馆',
              audience: '本地读者',
              pages: ['目录', '参观'],
              template: 'react',
              style: 'studio',
            },
          })
        ).ok,
      ).toBe(true);
      const result = await send('site.build', { prepareDependencies: true });
      const terminal = await runtime.view(runId);
      const diagnosis = terminal.profiles.map(({ message, dependencyCount, progress }) => ({
        message,
        dependencyCount,
        progress: progress.slice(-2),
      }));
      if (!result.ok || !('site' in result.data)) {
        const processes = await Promise.all(
          terminal.processes.map(async ({ id, reason, state }) => ({
            reason,
            state,
            output: (await runtime.poll(runId, id, 0)).output.text.slice(-5000),
          })),
        );
        throw Error(JSON.stringify({ result, diagnosis, processes }));
      }
      const process = result.data.site.build!;
      const receipt = await runtime.poll(runId, process.processId, 0);
      expect(
        process.state,
        JSON.stringify({
          state: receipt.view.state,
          reason: receipt.view.reason,
          exitCode: receipt.view.exitCode,
          output: receipt.output.text,
        }),
      ).toBe('succeeded');
      expect(process.exitCode).toBe(0);
      const version = result.data.site.versions[0]!;
      const snapshot = await service.transfer(newId(), runId, version.id, 'assets');
      expect(snapshot.ok).toBe(true);
      if (
        !snapshot.ok ||
        !('siteTransfer' in snapshot.data) ||
        snapshot.data.siteTransfer.kind !== 'assets'
      )
        throw Error('snapshot');
      expect(snapshot.data.siteTransfer.entries.map(({ path }) => path)).toEqual(
        expect.arrayContaining(['index.html', 'app.js', 'runtime.js', 'style.css']),
      );
      expect(terminal.profiles[0]?.network).toBe(false);
    } finally {
      await runtime.stop();
      await f.close();
    }
  },
  300000,
);
