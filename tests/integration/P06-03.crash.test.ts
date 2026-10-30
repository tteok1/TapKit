import { mkdtemp } from '../../scripts/test-temp.mjs';
import { beforeAll, test, expect, vi } from 'vitest';
import { build } from 'vite';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { openStore, BlobStore, FileRepository } from '../../packages/storage/src';
import { WorkService } from '../../packages/core/src/work-service';
import { WorkArtifacts } from '../../packages/core/src/work-artifacts';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import { WorkNativeTools } from '../../packages/core/src/work-native';
import { unavailableExecution } from '../../packages/contracts/src';
import { until } from './P06.fixture';
let harness: string;
beforeAll(async () => {
  await mkdir('.test-data', { recursive: true });
  harness = await mkdtemp(resolve('.test-data', 'P06-03 harness '));
  await build({
    configFile: false,
    logLevel: 'error',
    plugins: [
      {
        name: 'P06-native-sqlite-external',
        enforce: 'pre',
        resolveId(source) {
          if (source === 'better-sqlite3')
            return {
              id: resolve('packages/storage/node_modules/better-sqlite3/lib/index.js'),
              external: true,
            };
        },
      },
    ],
    resolve: {
      alias: {
        '@tapkit/storage': resolve('packages/storage/src/index.ts'),
      },
    },
    build: {
      ssr: 'tests/recovery/P06-03.crash.ts',
      target: 'node24',
      outDir: harness,
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: 'main.cjs' },
      },
    },
    ssr: {
      noExternal: true,
    },
  });
}, 60000);
test.each(['before_dispatch', 'after_intent', 'after_blob', 'after_commit', 'after_native'])(
  'P06-03 T13 actual process kill at %s recovers without replaying a committed tool',
  async (stage) => {
    vi.useRealTimers();
    const directory = await mkdtemp(resolve('.test-data', 'P06-03 kill ' + stage + ' ')),
      output: string[] = [];
    const code = await new Promise<number | null>((resolveExit, reject) => {
      const child = spawn(
        resolve('.runtime/node/node-v24.21.0-win-x64/node.exe'),
        [join(harness, 'main.cjs'), directory, stage],
        {
          cwd: resolve('.'),
          windowsHide: true,
          env: { ...process.env },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      const timer = setTimeout(() => {
        child.kill();
        reject(Error('crash harness timeout'));
      }, 150000);
      child.stdout.on('data', (b) => output.push(b.toString()));
      child.stderr.on('data', (b) => output.push(b.toString()));
      child.on('error', reject);
      child.on('close', (exit) => {
        clearTimeout(timer);
        resolveExit(exit);
      });
    });
    expect(code).not.toBe(0);
    await writeFile(join(directory, 'harness-diagnostic.txt'), output.join(''));
    const checkpoint = JSON.parse(await readFile(join(directory, 'checkpoint.json'), 'utf8'));
    expect(checkpoint.stage).toBe(stage);
    const store = await openStore(directory),
      blobs = new BlobStore(store),
      files = new FileRepository(store, blobs),
      artifacts = new WorkArtifacts(files, blobs),
      gateway = new WorkToolGateway(
        artifacts,
        new WorkNativeTools(
          resolve('.'),
          artifacts,
          unavailableExecution('recovery does not execute'),
        ),
      );
    let modelCalls = 0;
    const work = new WorkService(
      store,
      async () => {
        modelCalls++;
        if (stage === 'after_native' || stage === 'after_commit')
          throw Error('successful tool must not replay');
        return {
          text: '恢复后实际保存',
          calls: [{ tool: 'artifact.write', name: '结果.md', content: '# 可验证成果' }],
          finished: true,
        };
      },
      gateway,
      async () => {},
    );
    try {
      const priorCalls = store.db.prepare('SELECT status,side_effect FROM tool_calls').all();
      await work.start();
      await until(() => work.repo.row(checkpoint.runId).status === 'completed');
      expect(store.db.prepare("SELECT count(*) n FROM files WHERE kind='artifact'").get()).toEqual({
        n: 1,
      });
      expect(modelCalls).toBe(stage === 'after_native' || stage === 'after_commit' ? 0 : 1);
      expect(work.repo.row(checkpoint.runId).lease_epoch).toBeGreaterThan(1);
      expect(work.repo.view(checkpoint.runId).steps[0]!.artifacts).toHaveLength(1);
      await mkdir('docs/evidence/P06-03', { recursive: true });
      await writeFile(
        `docs/evidence/P06-03/crash-${stage}.json`,
        JSON.stringify(
          {
            stage,
            actualProcessExit: code,
            priorCalls,
            modelCallsAfterRestart: modelCalls,
            status: work.repo.row(checkpoint.runId).status,
            artifacts: 1,
            leaseEpoch: work.repo.row(checkpoint.runId).lease_epoch,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      await writeFile(join(directory, 'harness-diagnostic.txt'), output.join(''));
      throw error;
    } finally {
      await work.stop();
      store.close();
    }
  },
  180000,
);
