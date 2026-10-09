// Electron-only mock transport/seed for the live-runner process regression.
const { app, safeStorage } = require('electron');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { resolve, join } = require('node:path');
const { zstdDecompressSync } = require('node:zlib');
const { openStore, newId } = require('../../packages/storage/dist/index.cjs');
const directory = process.env.TAPKIT_LIVE_DATA_DIR;
const accountId = '01990000-0000-7000-8000-000000000001';
const token =
  'e30.' +
  Buffer.from(
    JSON.stringify({
      'https://api.openai.com/auth': { chatgpt_account_id: 'mock-account' },
    }),
  ).toString('base64url') +
  '.mock';
if (!directory || !resolve(directory).startsWith(resolve('.test-data') + require('node:path').sep))
  throw new Error('Mock profile must stay in .test-data');

if (
  process.argv.includes('--seed') ||
  process.argv.includes('--seed-empty') ||
  process.argv.includes('--verify') ||
  process.argv.includes('--verify-disconnect') ||
  process.argv.includes('--verify-empty-clear')
) {
  app.setName('TapKit');
  app.setPath('userData', directory);
  void app.whenReady().then(async () => {
    const store = await openStore(directory);
    try {
      const secretPath = join(directory, 'secrets', 'codex-' + accountId);
      if (process.argv.includes('--seed') || process.argv.includes('--seed-empty')) {
        store.db
          .prepare(
            "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status) VALUES (?,?,?,?,'codex-subscription','mock-live','oauth',?,'ready')",
          )
          .run(accountId, store.profileId, store.now(), store.now(), accountId);
        if (process.argv.includes('--seed-empty')) {
          store.db
            .prepare("UPDATE provider_accounts SET status='unconfigured' WHERE id=?")
            .run(accountId);
        } else {
          await mkdir(join(directory, 'secrets'), { recursive: true });
          await writeFile(
            secretPath,
            safeStorage.encryptString(
              JSON.stringify({
                schemaVersion: 1,
                version: 1,
                credential: {
                  type: 'oauth',
                  access: token,
                  refresh: 'mock-initial',
                  expires: Date.now() + 3600000,
                  accountId: 'mock-account',
                },
              }),
            ),
          );
        }
      } else {
        const doc = JSON.parse(safeStorage.decryptString(await readFile(secretPath)));
        const minimum = process.argv.includes('--verify-empty-clear')
          ? 1
          : process.argv.includes('--verify-disconnect')
            ? 2
            : 4;
        if (doc.credential || doc.version < minimum) throw new Error('Logout not persisted');
        const account = store.db
          .prepare('SELECT status,deleted_at FROM provider_accounts WHERE id=?')
          .get(accountId);
        if (account.status !== 'unconfigured') throw new Error('Account not disconnected');
        if (account.deleted_at === null) throw new Error('Account not removed');
      }
      console.info(JSON.stringify({ taskId: 'P01-01', fixture: 'passed' }));
      store.close();
      app.exit(0);
    } catch {
      store.close();
      app.exit(1);
    }
  });
} else {
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://auth.openai.com/oauth/token') {
      const form = new URLSearchParams(String(init.body));
      if (
        form.get('grant_type') !== 'refresh_token' ||
        form.get('refresh_token') !== 'mock-initial'
      )
        throw new Error('Unexpected refresh');
      return Response.json({
        access_token: token,
        refresh_token: 'mock-rotated',
        expires_in: 3600,
      });
    }
    if (String(url) !== 'https://chatgpt.com/backend-api/codex/responses')
      throw new Error('Mock forbids external traffic');
    const body = JSON.parse(
      new Headers(init.headers).get('content-encoding') === 'zstd'
        ? zstdDecompressSync(Buffer.from(init.body)).toString()
        : String(init.body),
    );
    const input = JSON.stringify(body.input);
    const cancelled = input.includes('500 items');
    const tools = body.tools?.length;
    let events;
    if (tools) {
      const item = {
        type: 'function_call',
        id: 'fc_mock',
        call_id: 'call_mock',
        name: 'echo',
        arguments: '{"text":"TAPKIT_ECHO"}',
      };
      events = [
        { type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '' } },
        { type: 'response.function_call_arguments.delta', output_index: 0, delta: item.arguments },
        { type: 'response.output_item.done', output_index: 0, item },
      ];
    } else {
      const text = cancelled
        ? '1. mock item'
        : input.includes('TAPKIT_REFRESH_OK')
          ? 'TAPKIT_REFRESH_OK'
          : input.includes('tool result only')
            ? 'TAPKIT_ECHO'
            : 'TAPKIT_OK';
      const item = {
        type: 'message',
        id: 'msg_' + newId(),
        role: 'assistant',
        content: [{ type: 'output_text', text, annotations: [] }],
      };
      events = [
        { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
        { type: 'response.output_text.delta', output_index: 0, delta: text },
        { type: 'response.output_item.done', output_index: 0, item },
      ];
    }
    if (!cancelled)
      events.push({
        type: 'response.completed',
        response: {
          id: 'response_' + newId(),
          status: 'completed',
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      });
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        start(controller) {
          for (const event of events)
            controller.enqueue(
              encoder.encode('data: ' + JSON.stringify(event) + String.fromCharCode(10, 10)),
            );
          if (!cancelled) controller.close();
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  };
}
