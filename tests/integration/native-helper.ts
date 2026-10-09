import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  HelperEventSchema,
  HelperRequestSchema,
  type HelperEvent,
  type HelperRequest,
} from '../../packages/contracts/src';

export function startNativeHelper(helper: string, raw: HelperRequest) {
  const request = HelperRequestSchema.parse(raw);
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
  }) as ChildProcessWithoutNullStreams;
  const events: HelperEvent[] = [];
  let buffer = '';
  let diagnostics = '';
  let resolveStarted!: (event: HelperEvent) => void;
  let rejectStarted!: (error: Error) => void;
  let startedSettled = false;
  const started = new Promise<HelperEvent>((resolve, reject) => {
    resolveStarted = resolve;
    rejectStarted = reject;
  });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once('close', (code, signal) => {
      if (!startedSettled) {
        startedSettled = true;
        rejectStarted(
          new Error(
            `Helper closed before started: ${JSON.stringify({ code, signal, events, diagnostics })}`,
          ),
        );
      }
      resolve({ code, signal });
    });
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (text: string) => {
    diagnostics = (diagnostics + text).slice(0, 4096);
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (text: string) => {
    buffer += text;
    let end: number;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try {
        const event = HelperEventSchema.parse(JSON.parse(line));
        if (
          event.requestId !== request.requestId ||
          event.runId !== request.runId ||
          event.leaseEpoch !== request.leaseEpoch
        )
          throw new Error('helper event identity mismatch');
        events.push(event);
        if (event.event === 'started' && !startedSettled) {
          startedSettled = true;
          resolveStarted(event);
        } else if (event.event === 'failed' && !startedSettled) {
          startedSettled = true;
          rejectStarted(new Error(`Helper failed before started: ${JSON.stringify(event)}`));
        }
      } catch (error) {
        if (!startedSettled) {
          startedSettled = true;
          rejectStarted(error instanceof Error ? error : new Error('Invalid helper event'));
        }
        child.kill();
      }
    }
  });
  child.once('error', (error) => {
    if (!startedSettled) {
      startedSettled = true;
      rejectStarted(error);
    }
  });
  child.stdin.on('error', () => {});
  child.stdin.write(JSON.stringify(request) + '\n');
  return { child, events, started, closed };
}
