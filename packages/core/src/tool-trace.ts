import { appendFileSync, existsSync, lstatSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { IdSchema } from '@tapkit/contracts';
import { ZhipuToolTraceSchema, type ZhipuToolTraceSink } from '@tapkit/providers';

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
