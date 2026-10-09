// Real desktop Core process regression. All credentials and network responses are fixtures.
const { resolve, sep } = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { zstdDecompressSync } = require('node:zlib');
const directory = process.env.TAPKIT_CORE_DATA_DIR;
if (!directory || !resolve(directory).startsWith(resolve('.test-data') + sep))
  throw new Error('Mock profile must stay in .test-data');
const accountId = '01990000-0000-7000-8000-000000000001';
const gateway = process.env.TAPKIT_UTILITY_FIXTURE === 'gateway';
const missingMime = process.env.TAPKIT_UTILITY_FIXTURE === 'missing-mime';
const token =
  'e30.' +
  Buffer.from(
    JSON.stringify({
      'https://api.openai.com/auth': { chatgpt_account_id: 'mock-account' },
    }),
  ).toString('base64url') +
  '.mock';
if (process.parentPort) {
  globalThis.fetch = async (url, init) => {
    if (String(url) !== 'https://chatgpt.com/backend-api/codex/responses')
      throw new Error('Mock forbids external traffic');
    if (gateway) {
      process.parentPort.postMessage({ fixture: 'request', tools: false });
      return new Response('<html>private token</html>', {
        headers: { 'content-type': 'text/html' },
      });
    }
    const body = JSON.parse(
      new Headers(init.headers).get('content-encoding') === 'zstd'
        ? zstdDecompressSync(Buffer.from(init.body)).toString()
        : String(init.body),
    );
    const tools = Boolean(body.tools?.length);
    const item = tools
      ? {
          type: 'function_call',
          id: 'fc_mock',
          call_id: 'call_mock',
          name: 'echo',
          arguments: '{"text":"OK"}',
        }
      : {
          type: 'message',
          id: 'msg_mock',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'OK', annotations: [] }],
        };
    const events = [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: tools ? { ...item, arguments: '' } : { ...item, content: [] },
      },
      {
        type: tools ? 'response.function_call_arguments.delta' : 'response.output_text.delta',
        output_index: 0,
        delta: tools ? item.arguments : 'OK',
      },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'resp_mock', status: 'completed' } },
    ];
    process.parentPort.postMessage({ fixture: 'request', tools });
    return new Response(
      new TextEncoder().encode(
        events
          .map((event) => 'data: ' + JSON.stringify(event) + String.fromCharCode(10, 10))
          .join(''),
      ),
      {
        headers: missingMime ? {} : { 'content-type': 'text/event-stream' },
      },
    );
  };
  require('../../packages/core/dist/index.cjs');
} else {
  const { app, utilityProcess } = require('electron');
  const { openStore, newId } = require('../../packages/storage/dist/index.cjs');
  app.setPath('userData', directory);
  void app.whenReady().then(async () => {
    const store = await openStore(directory);
    store.db
      .prepare(
        "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status) VALUES (?,?,?,?,'codex-subscription','mock-utility','oauth',?,'ready')",
      )
      .run(accountId, store.profileId, store.now(), store.now(), accountId);
    store.close();
    const child = utilityProcess.fork(__filename, [], { stdio: 'pipe', env: process.env });
    let requestCount = 0;
    let outcome;
    const timer = setTimeout(() => {
      child.kill();
      app.exit(1);
    }, 20000);
    child.on('message', (message) => {
      if (message.fixture === 'request') {
        requestCount++;
        return;
      }
      if (message.type === 'vault.request') {
        const value =
          message.operation === 'credential.read'
            ? {
                version: 1,
                credential: {
                  type: 'oauth',
                  access: token,
                  refresh: 'mock-refresh',
                  expires: Date.now() + 3600000,
                  accountId: 'mock-account',
                },
              }
            : message.operation === 'native.save'
              ? {
                  contentHash: createHash('sha256')
                    .update(JSON.stringify(message.payload))
                    .digest('hex'),
                }
              : {};
        child.postMessage({ type: 'vault.reply', id: message.id, ok: true, value });
      } else if (message.type === 'ready') {
        child.postMessage({
          type: 'request',
          id: randomUUID(),
          request: {
            protocolVersion: 1,
            requestId: newId(),
            command: 'providers.check',
            expectedRevision: 1,
            payload: { accountId, modelId: 'gpt-5.6-luna' },
          },
        });
      } else if (message.type === 'reply') {
        outcome = message.reply;
        child.postMessage({ type: 'shutdown' });
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      const passed =
        code === 0 &&
        outcome?.ok &&
        (gateway
          ? outcome.data.errorCode === 'STREAM_INTERRUPTED' &&
            outcome.data.diagnostic?.reason === 'unexpected_content_type' &&
            requestCount === 1
          : outcome.data.status === 'ready' && requestCount === 2);
      console.info(
        JSON.stringify({
          taskId: 'P01-01',
          status: passed ? 'passed' : 'failed',
          requestCount,
          errorCode: outcome?.data?.errorCode ?? 'CORE_FAILED',
          reason: outcome?.data?.diagnostic?.reason ?? null,
        }),
      );
      app.exit(passed ? 0 : 1);
    });
  });
}
