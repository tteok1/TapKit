import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { executionFingerprint } from '../../../../scripts/runtime-inventory.mjs';
export { executionFingerprint } from '../../../../scripts/runtime-inventory.mjs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import {
  HelperRequestSchema,
  HelperEventSchema,
  ExecutionCapabilitiesSchema,
  unavailableExecution,
  EXECUTION_POLICY,
  type HelperRequest,
  type HelperEvent,
  type ExecutionCapabilities,
} from '@tapkit/contracts';

export class SandboxError extends Error {
  readonly code = 'SANDBOX_UNAVAILABLE';
}
export type DiagnosticResult = { events: HelperEvent[]; exitCode: number | null };
export function runDiagnostic(
  helper: string,
  raw: HelperRequest,
  options: {
    signal?: AbortSignal;
    onStarted?: (
      event: HelperEvent,
      send: (operation: 'cancel' | 'terminal.input', payload?: unknown) => void,
    ) => void;
  } = {},
): Promise<DiagnosticResult> {
  const request = HelperRequestSchema.parse(raw);
  if (!isAbsolute(helper)) throw new SandboxError('HELPER_PATH_NOT_ABSOLUTE');
  return new Promise((resolveResult, reject) => {
    if (options.signal?.aborted) {
      reject(new SandboxError('CANCELLED'));
      return;
    }
    // This process is the trusted native launcher. It never falls back to spawning the payload.
    const child = spawn(helper, [], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        USERPROFILE: process.env.USERPROFILE,
        LOCALAPPDATA: process.env.LOCALAPPDATA,
        APPDATA: process.env.APPDATA,
        ProgramData: process.env.ProgramData,
      },
    });
    const events: HelperEvent[] = [];
    let buffer = '',
      diagnostics = '',
      invalid = false;
    const send = (operation: 'cancel' | 'terminal.input', payload: unknown = {}) => {
      if (!child.stdin.destroyed)
        child.stdin.write(
          JSON.stringify({
            protocolVersion: 1,
            requestId: request.requestId,
            runId: request.runId,
            leaseEpoch: request.leaseEpoch,
            operation,
            payload,
          }) + '\n',
        );
    };
    const cancel = () => send('cancel');
    options.signal?.addEventListener('abort', cancel, { once: true });
    const watchdog = setTimeout(() => {
      invalid = true;
      diagnostics = 'HELPER_WATCHDOG';
      child.kill();
    }, request.payload.timeoutMs + 300_000);
    child.stdin.on('error', () => {});
    child.on('error', () => {
      clearTimeout(watchdog);
      options.signal?.removeEventListener('abort', cancel);
      reject(new SandboxError('HELPER_START_FAILED'));
    });
    child.stderr.on('data', (b: Buffer) => {
      diagnostics = (diagnostics + b.toString('utf8')).slice(0, 4096);
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (text: string) => {
      buffer += text;
      if (buffer.length > 1_048_576) {
        invalid = true;
        child.kill();
        return;
      }
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        try {
          const event = HelperEventSchema.parse(JSON.parse(line));
          if (
            event.requestId !== request.requestId ||
            event.runId !== request.runId ||
            event.leaseEpoch !== request.leaseEpoch ||
            events.length >= 3
          )
            throw new Error('protocol');
          events.push(event);
          if (event.event === 'started') options.onStarted?.(event, send);
        } catch {
          invalid = true;
          child.kill();
        }
      }
    });
    child.on('close', (exitCode) => {
      clearTimeout(watchdog);
      options.signal?.removeEventListener('abort', cancel);
      if (
        invalid ||
        buffer.trim() ||
        /(ACL|PROFILE|EXECUTION_LEASE)_CLEANUP_FAILED/.test(diagnostics)
      ) {
        const cleanupMarker = diagnostics.match(
          /(ACL|PROFILE|EXECUTION_LEASE)_CLEANUP_FAILED/,
        )?.[0];
        reject(
          new SandboxError(
            diagnostics === 'HELPER_WATCHDOG'
              ? 'HELPER_WATCHDOG'
              : cleanupMarker
                ? `HELPER_PROTOCOL_OR_CLEANUP_FAILED:${cleanupMarker}`
                : 'HELPER_PROTOCOL_OR_CLEANUP_FAILED',
          ),
        );
        return;
      }
      const last = events.at(-1);
      if (!last || !['finished', 'failed'].includes(last.event)) {
        reject(new SandboxError('HELPER_INCOMPLETE'));
        return;
      }
      if (
        last.event === 'finished' &&
        (exitCode !== 0 || events[0]?.event !== 'started' || last.data.activeProcesses !== 0)
      ) {
        reject(new SandboxError('HELPER_UNSAFE_RESULT'));
        return;
      }
      resolveResult({ events, exitCode });
    });
    child.stdin.write(JSON.stringify(request) + '\n');
  });
}
export async function runtimePaths(
  root: string,
  runtime: 'node' | 'python' | 'git' | 'libreoffice',
) {
  const lock = JSON.parse(await readFile(join(root, 'runtime-lock.json'), 'utf8'));
  const item = lock.runtimes[runtime];
  const runtimeRoot = resolve(root, '.runtime', runtime, item.directory);
  const executable = resolve(runtimeRoot, item.executable);
  if (!relative(runtimeRoot, executable) || relative(runtimeRoot, executable).startsWith('..'))
    throw new SandboxError('RUNTIME_PATH_INVALID');
  return { runtimeRoot, executable };
}
export function helperPath(root: string) {
  return join(root, 'resources/runtime/helper/tapkit-windows-helper.exe');
}
export async function readExecutionCapabilities(root: string): Promise<ExecutionCapabilities> {
  try {
    const report = JSON.parse(
      await readFile(join(root, 'resources/runtime/capabilities.json'), 'utf8'),
    );
    const capabilities = ExecutionCapabilitiesSchema.parse(report.capabilities);
    if (report.executionPolicy !== EXECUTION_POLICY)
      return unavailableExecution('EXECUTION_POLICY_CHANGED');
    // A failed report never grants permission, so it must not delay chat startup with full runtime hashing.
    if (Object.values(capabilities).every((c) => c.status === 'failed')) return capabilities;
    if (report.fingerprint !== (await executionFingerprint(root)))
      return unavailableExecution('PROBE_STALE');
    if (
      report.standardUser !== true &&
      Object.values(capabilities).some((c) => c.status === 'available')
    )
      return unavailableExecution('STANDARD_USER_VERIFICATION_REQUIRED');
    return capabilities;
  } catch {
    return unavailableExecution('PROBE_REQUIRED');
  }
}
export function requireExecutionCapability(
  capabilities: ExecutionCapabilities,
  name: keyof ExecutionCapabilities,
) {
  const capability = capabilities[name];
  if (capability.status !== 'available') throw new SandboxError(capability.reason);
}
export async function prepareOfficeProfile(workspace: string) {
  const profile = join(workspace, 'office-profile');
  await mkdir(join(profile, 'user'), { recursive: true });
  await writeFile(
    join(profile, 'user/registrymodifications.xcu'),
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<oor:items xmlns:oor="http://openoffice.org/2001/registry">' +
      '<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item>' +
      // These enumerations differ in the locked LibreOffice schemas: Calc never=1, Writer never=2.
      '<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>1</value></prop></item>' +
      '<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>' +
      '</oor:items>',
  );
  return profile;
}
