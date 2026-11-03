import { appendFileSync, existsSync, lstatSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { IdSchema, z } from '@tapkit/contracts';
import { ZhipuToolTraceSchema, type ZhipuToolTraceSink } from '@tapkit/providers';

const ApiTransportStageSchema = z.strictObject({
  requestId: IdSchema,
  stage: z.enum([
    'dns_complete',
    'proxy_resolved',
    'socket_assigned',
    'tcp_connected',
    'tls_connected',
    'request_finished',
    'response_headers',
    'request_error',
  ]),
  elapsedMs: z.number().int().min(0).max(1_000_000),
});
export type ApiTransportTraceSink = (value: {
  requestId: string;
  stage: string;
  elapsedMs: number;
}) => void;

// Opt-in diagnostics for actual API probes as well as formal work. No URL, headers,
// body, errors, reasoning, account or key ever enters this sink.
export function createApiTransportTraceWriter(
  dataDir: string,
  profileId: string,
  env = process.env,
): ApiTransportTraceSink | undefined {
  if (
    env.TAPKIT_API_TRANSPORT_TRACE !== 'P08-02' ||
    env.TAPKIT_TOOL_TRACE_PROFILE !== profileId ||
    !IdSchema.safeParse(profileId).success ||
    !IdSchema.safeParse(env.TAPKIT_TOOL_TRACE_CASE).success ||
    !isAbsolute(dataDir)
  )
    return undefined;
  const caseId = env.TAPKIT_TOOL_TRACE_CASE!,
    logs = join(dataDir, 'logs'),
    path = join(logs, 'api-transport-' + caseId + '.jsonl');
  try {
    mkdirSync(logs, { recursive: true });
    if (
      lstatSync(logs).isSymbolicLink() ||
      dirname(realpathSync(logs)) !== realpathSync(dataDir) ||
      (existsSync(path) && lstatSync(path).isSymbolicLink())
    )
      return undefined;
    appendFileSync(path, JSON.stringify({ kind: 'opened', profileId, caseId }) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
  } catch {
    return undefined;
  }
  return (raw) => {
    const value = ApiTransportStageSchema.safeParse(raw);
    if (!value.success) return;
    try {
      if (lstatSync(path).isSymbolicLink() || statSync(path).size >= 1_048_576) return;
      appendFileSync(
        path,
        JSON.stringify({ kind: 'stage', at: new Date().toISOString(), ...value.data }) + '\n',
      );
    } catch {
      /* Diagnostic failures cannot alter transport. */
    }
  };
}

export function createToolTraceWriter(
  dataDir: string,
  profileId: string,
  env = process.env,
): ZhipuToolTraceSink | undefined {
  if (
    env.TAPKIT_TOOL_TRACE !== 'P02-02' ||
    env.TAPKIT_TOOL_TRACE_PROFILE !== profileId ||
    !IdSchema.safeParse(profileId).success ||
    !IdSchema.safeParse(env.TAPKIT_TOOL_TRACE_CASE).success ||
    !isAbsolute(dataDir)
  )
    return undefined;
  const caseId = env.TAPKIT_TOOL_TRACE_CASE!;
  const logs = join(dataDir, 'logs');
  const path = join(logs, 'tool-trace-' + caseId + '.jsonl');
  try {
    mkdirSync(logs, { recursive: true });
    if (
      lstatSync(logs).isSymbolicLink() ||
      dirname(realpathSync(logs)) !== realpathSync(dataDir) ||
      (existsSync(path) && lstatSync(path).isSymbolicLink())
    )
      return undefined;
    appendFileSync(
      path,
      JSON.stringify({ schemaVersion: 1, kind: 'opened', profileId, caseId }) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  } catch {
    console.warn('TAPKIT_TOOL_TRACE_UNAVAILABLE');
    return undefined;
  }
  return (raw) => {
    const trace = ZhipuToolTraceSchema.safeParse(raw);
    if (!trace.success || !trace.data.attemptId) return;
    try {
      if (lstatSync(path).isSymbolicLink() || statSync(path).size >= 1_048_576) return;
      appendFileSync(
        path,
        JSON.stringify({
          schemaVersion: 1,
          kind: 'attempt',
          profileId,
          caseId,
          trace: trace.data,
        }) + '\n',
      );
    } catch {
      console.warn('TAPKIT_TOOL_TRACE_UNAVAILABLE');
    }
  };
}
