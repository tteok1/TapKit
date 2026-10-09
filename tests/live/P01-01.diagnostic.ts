// One fixed text probe, read-only TapKit profile access, bounded safe metadata only.
import { app } from 'electron';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { join, resolve, relative, basename, isAbsolute } from 'node:path';
import { AuthSecrets } from '../../apps/desktop/src/main/auth/secrets';
import {
  AccountCredentialStore,
  CodexCredentialSchema,
  CodexAdapter,
  configureProviderNetwork,
} from '../../packages/providers/src';
import { ErrorCodeSchema, IdSchema, type ModelRequest } from '../../packages/contracts/src';

const directory = process.env.TAPKIT_LIVE_DATA_DIR;
const require = createRequire(__filename);
if (!directory || process.env.TAPKIT_CODEX_DIAGNOSTIC_R01 !== '1') app.exit(2);
else {
  const root = realpathSync(resolve('.test-data'));
  const target = realpathSync(directory);
  const child = relative(root, target);
  if (
    !isAbsolute(directory) ||
    !child ||
    child.startsWith('..') ||
    isAbsolute(child) ||
    !basename(target).startsWith('P01-01-live-')
  )
    app.exit(2);
  else {
    const host = process.env.TAPKIT_DIAGNOSTIC_HOST_DIR;
    const hostPath = host ? realpathSync(host) : '';
    const hostChild = relative(root, hostPath);
    if (
      !host ||
      !hostChild ||
      hostChild.startsWith('..') ||
      isAbsolute(hostChild) ||
      !basename(hostPath).startsWith('P01-01-diagnostic-host-')
    )
      app.exit(2);
    else {
      app.setName('TapKit');
      app.setPath('userData', hostPath);
      void app.whenReady().then(() => inspect(target));
    }
  }
}
async function inspect(directory: string) {
  let database: { close(): void; prepare(sql: string): { all(): unknown[] } } | undefined;
  let setupStep = 'network';
  try {
    configureProviderNetwork();
    setupStep = 'database';
    const Database = require('../../packages/storage/node_modules/better-sqlite3');
    database = new Database(join(directory, 'db/app.sqlite'), {
      readonly: true,
      fileMustExist: true,
    });
    setupStep = 'accounts';
    const rows = database!
      .prepare(
        "SELECT id FROM provider_accounts WHERE provider_id='codex-subscription' AND deleted_at IS NULL",
      )
      .all() as { id: string }[];
    if (rows.length !== 1) throw new Error('AUTH_REQUIRED');
    const accountId = IdSchema.parse(rows[0]!.id);
    setupStep = 'credentials';
    const raw = (await new AuthSecrets(join(directory, 'secrets')).invoke(
      'credential.read',
      accountId,
      {},
    )) as { version: number; credential?: unknown };
    const credential = CodexCredentialSchema.parse(raw.credential);
    setupStep = 'expiry';
    // A diagnostic must never rotate credentials without storing them in the Host.
    if (credential.expires <= Date.now() + 60000) throw new Error('AUTH_EXPIRED');
    const credentials = new AccountCredentialStore({
      read: async () => ({ version: raw.version, credential }),
      write: async () => {
        throw new Error('PERMISSION_DENIED');
      },
    });
    const native = {
      save: async () => 'diagnostic-memory-only',
      load: async () => {
        throw new Error('NOT_FOUND');
      },
    };
    const fetcher: typeof fetch = async (url, init) => {
      const response = await fetch(url, init);
      const rawType = (response.headers.get('content-type') ?? '')
        .split(';')[0]!
        .trim()
        .toLowerCase();
      const contentType = [
        'text/event-stream',
        'application/json',
        'text/html',
        'text/plain',
        'application/octet-stream',
      ].includes(rawType)
        ? rawType
        : rawType
          ? 'other'
          : 'missing';
      const reader = response.body?.getReader();
      const first = await reader?.read();
      const prefix = first?.value
        ? new TextDecoder().decode(first.value.subarray(0, 8192)).trimStart()
        : '';
      const bodyKind = /^(?:data:|event:|:)/.test(prefix)
        ? 'sse'
        : /^<(?:!doctype|html)/i.test(prefix)
          ? 'html'
          : /^[{[]/.test(prefix)
            ? 'json'
            : prefix
              ? 'other'
              : 'empty';
      const meta: Record<string, unknown> = {
        status: response.status,
        contentType,
        bodyKind,
        compressedRequest: new Headers(init?.headers).get('content-encoding') === 'zstd',
      };
      if (bodyKind === 'json')
        try {
          const value = JSON.parse(prefix);
          meta.responseObject = value.object === 'response';
          meta.hasError = Boolean(value.error);
          if (
            ['response.created', 'response.completed', 'response.failed', 'error'].includes(
              value.type,
            )
          )
            meta.eventType = value.type;
        } catch {
          /* No raw response material is printed. */
        }
      console.info(JSON.stringify({ taskId: 'P01-01', stage: 'response', ...meta }));
      if (!reader) return response;
      const scanDecoder = new TextDecoder();
      let tail = first?.value ? scanDecoder.decode(first.value, { stream: true }) : '';
      let frames = 0,
        terminalFrames = 0;
      function scan() {
        for (;;) {
          const boundary = /\r\n\r\n|\n\n|\r\r/.exec(tail);
          if (!boundary) break;
          const frame = tail.slice(0, boundary.index);
          tail = tail.slice(boundary.index + boundary[0].length);
          frames++;
          if (terminalData(frame)) terminalFrames++;
        }
        // Only structure is retained, never returned to logs or evidence.
        if (tail.length > 65_536) tail = tail.slice(-65_536);
      }
      function terminalData(frame: string) {
        const data = frame
          .split(/\r\n|\n|\r/)
          .filter((x) => x.startsWith('data:'))
          .map((x) => x.slice(5).trimStart())
          .join('\n');
        try {
          const value = JSON.parse(data);
          return [
            'response.completed',
            'response.done',
            'response.incomplete',
            'response.failed',
            'error',
          ].includes(value.type);
        } catch {
          return false;
        }
      }
      function end() {
        tail += scanDecoder.decode();
        scan();
        console.info(
          JSON.stringify({
            taskId: 'P01-01',
            stage: 'stream',
            frames,
            terminalFrames,
            tailKind: !tail.trim()
              ? 'empty'
              : tail.trim() === 'data: [DONE]'
                ? 'done'
                : tail.trimStart().startsWith('data:')
                  ? 'data'
                  : 'other',
            tailTerminal: terminalData(tail),
            tailLength: tail.length,
          }),
        );
      }
      scan();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          if (first?.value) controller.enqueue(first.value);
          if (first?.done) {
            end();
            controller.close();
          }
        },
        async pull(controller) {
          const next = await reader.read();
          if (next.done) {
            end();
            controller.close();
          } else {
            tail += scanDecoder.decode(next.value, { stream: true });
            scan();
            controller.enqueue(next.value);
          }
        },
        async cancel() {
          await reader.cancel().catch(() => {});
        },
      });
      return new Response(body, { status: response.status, headers: response.headers });
    };
    const modelId = process.env.TAPKIT_LIVE_MODEL ?? 'gpt-5.6-luna';
    setupStep = 'adapter';
    const adapter = new CodexAdapter(accountId, credentials, native, fetcher);
    if (process.env.TAPKIT_DIAGNOSTIC_CHECK_CONNECTION === '1') {
      setupStep = 'probe';
      const result = await adapter.checkConnection(
        { accountId, modelId },
        AbortSignal.timeout(30000),
      );
      console.info(
        JSON.stringify({
          taskId: 'P01-01',
          stage: 'probe',
          status: result.status,
          text: result.text,
          tools: result.tools,
          errorCode: result.errorCode,
        }),
      );
      app.exit(result.status === 'ready' ? 0 : 1);
      return;
    }
    const request: ModelRequest = {
      logicalCallId: 'diagnostic',
      attemptId: 'diagnostic',
      accountId,
      branchId: 'diagnostic',
      taskVersion: 1,
      model: { providerId: 'codex-subscription', modelId },
      systemModules: [{ id: 'probe', text: 'Reply OK.' }],
      messages: [{ role: 'user', text: 'Reply OK.' }],
      tools: [],
      outputLimit: 32,
      reasoning: 'off',
    };
    setupStep = 'request';
    let finished = false;
    for await (const event of adapter.stream(request, AbortSignal.timeout(30000))) {
      if (event.type === 'finish') finished = true;
      if (event.type === 'error')
        console.info(
          JSON.stringify({
            taskId: 'P01-01',
            stage: 'result',
            errorCode: event.error.code,
            diagnosticCode: event.error.diagnosticCode ?? null,
          }),
        );
    }
    console.info(JSON.stringify({ taskId: 'P01-01', finished }));
    app.exit(finished ? 0 : 1);
  } catch (error) {
    const safe = ErrorCodeSchema.safeParse(error instanceof Error ? error.message : undefined);
    console.info(
      JSON.stringify({
        taskId: 'P01-01',
        stage: 'setup',
        setupStep,
        errorKind:
          error instanceof Error &&
          ['Error', 'TypeError', 'ZodError', 'SqliteError'].includes(error.name)
            ? error.name
            : 'other',
        errorCode: safe.success ? safe.data : 'VALIDATION_ERROR',
      }),
    );
    app.exit(1);
  } finally {
    database?.close();
  }
}
