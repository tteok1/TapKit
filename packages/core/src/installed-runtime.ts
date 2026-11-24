import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { unavailableExecution } from '@tapkit/contracts';
import { readExecutionCapabilities, runtimePaths } from '@tapkit/tools';

export async function verifyInstalledRuntime(root: string, dataDir: string, signal: AbortSignal) {
  const receipt = join(dataDir, 'runtime-capabilities.json');
  const previous = await readExecutionCapabilities(root, signal, receipt);
  if (Object.values(previous).every((capability) => capability.status === 'available'))
    return previous;
  signal.throwIfAborted();
  const diagnostics = join(dataDir, 'diagnostics');
  await mkdir(diagnostics, { recursive: true });
  const work = await mkdtemp(join(diagnostics, 'native-'));
  try {
    const node = (await runtimePaths(root, 'node')).executable;
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (/^(?:node_|tapkit_|vitest|vite_)/i.test(key)) delete env[key];
    }
    signal.throwIfAborted();
    const result = await new Promise<number | null>((resolve) => {
      const child = spawn(node, [join(root, 'scripts/runtime-probe.mjs'), '--installed', receipt], {
        cwd: root,
        env: { ...env, TAPKIT_NATIVE_PROBE_WORK_DIR: work },
        stdio: 'ignore',
        windowsHide: true,
      });
      const stop = () => {
        if (child.pid && child.exitCode === null) {
          const kill = spawn(
            join(env.SystemRoot ?? 'C:/Windows', 'System32/taskkill.exe'),
            ['/PID', String(child.pid), '/T', '/F'],
            { stdio: 'ignore', windowsHide: true },
          );
          kill.on('error', () => child.kill());
        }
      };
      // The native suite also has its own shorter bound for the Vitest process.
      const timeout = setTimeout(stop, 14 * 60_000);
      signal.addEventListener('abort', stop, { once: true });
      const done = (code: number | null) => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', stop);
        resolve(code);
      };
      child.once('exit', done);
      child.once('error', () => done(null));
    });
    if (result === 3) return unavailableExecution('INSTALLATION_FILE_MISMATCH');
    if (result !== 0) {
      // Preserve only the fixed-case receipt. Probe work files contain no real user data.
      const reported = await readFile(receipt, 'utf8').catch(() => '');
      return unavailableExecution(reported ? 'NATIVE_ACCEPTANCE_FAILED' : 'PROBE_REQUIRED');
    }
    return await readExecutionCapabilities(root, signal, receipt);
  } finally {
    await rm(work, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }).catch(
      () => {},
    );
  }
}
