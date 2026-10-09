// Test-only interposition. Production Core/SQLite/adapters/IPC run unchanged; no external traffic.
const { resolve, sep } = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const directory = process.env.TAPKIT_CORE_DATA_DIR;
if (!directory || !resolve(directory).startsWith(resolve('.test-data') + sep))
  throw new Error('Fixture path denied');
const subscription = '01990000-0000-7000-8000-000000000001';
const api = '01990000-0000-7000-8000-000000000002';
const logicalCallId = '01990000-0000-7000-8000-000000000003';
if (process.parentPort) {
  // Real sockets hold Core alive. The in-memory HTTPS fixture needs an equivalent handle.
  setInterval(() => {}, 1000);
  globalThis.fetch = async (url) => {
    if (String(url) !== 'https://chatgpt.com/backend-api/codex/responses')
      throw new Error('External traffic denied');
    process.parentPort.postMessage({ fixture: 'subscription' });
    return new Response(JSON.stringify({ error: { code: 'usage_limit_reached' } }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
  };
  require('node:dns/promises').lookup = async () => [{ address: '1.1.1.1', family: 4 }];
  require('node:https').request = (options, callback) => {
    const { Writable, Readable } = require('node:stream');
    if (options.servername !== 'api.deepseek.com') throw new Error('External traffic denied');
    let body = '';
    const req = new Writable({
      write(chunk, _, done) {
        body += chunk.toString();
        done();
      },
    });
    req.setTimeout = () => req;
    req.on('finish', () => {
      const input = JSON.parse(body);
      if (input.tools?.length || input.model !== 'fixture-model')
        throw new Error('Unexpected request');
      process.parentPort.postMessage({ fixture: 'api' });
      const data = [
        { choices: [{ index: 0, delta: { content: 'API fixture OK' }, finish_reason: null }] },
        { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
        {
          choices: [],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            prompt_tokens_details: { cached_tokens: 80 },
            completion_tokens_details: { reasoning_tokens: 30 },
          },
        },
      ];
      const res = Readable.from([
        Buffer.from(
          data.map((x) => 'data: ' + JSON.stringify(x) + '\n\n').join('') + 'data: [DONE]\n\n',
        ),
      ]);
      res.statusCode = 200;
      res.headers = { 'content-type': 'text/event-stream' };
      callback(res);
    });
    return req;
  };
  require('../../packages/core/dist/index.cjs');
} else {
  const { app, utilityProcess } = require('electron');
  const { openStore, newId } = require('../../packages/storage/dist/index.cjs');
  app.setPath('userData', directory);
  void app.whenReady().then(async () => {
    const store = await openStore(directory);
    for (const [id, providerId, auth] of [
      [subscription, 'codex-subscription', 'oauth'],
      [api, 'deepseek', 'api_key'],
    ])
      store.db
        .prepare(
          "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status,api_format,base_url,model_id) VALUES(?,?,?,?,?,?,?, ?,'ready',?,?,?)",
        )
        .run(
          id,
          store.profileId,
          store.now(),
          store.now(),
          providerId,
          'fixture',
          auth,
          id,
          auth === 'oauth' ? null : 'openai-chat',
          auth === 'oauth' ? null : 'https://api.deepseek.com',
          auth === 'oauth' ? null : 'fixture-model',
        );
    store.close();
    const child = utilityProcess.fork(__filename, [], { stdio: 'pipe', env: process.env });
    let subscriptions = 0,
      apis = 0,
      reply;
    const timer = setTimeout(() => {
      child.kill();
      app.exit(1);
    }, 20000);
    child.on('message', (message) => {
      if (message.fixture === 'subscription') {
        subscriptions++;
        return;
      }
      if (message.fixture === 'api') {
        apis++;
        return;
      }
      if (message.type === 'vault.request') {
        const token =
          'e30.' +
          Buffer.from(
            JSON.stringify({
              'https://api.openai.com/auth': { chatgpt_account_id: 'mock-account' },
            }),
          ).toString('base64url') +
          '.mock';
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
            : message.operation === 'api-key.read'
              ? { key: 'fixture-private-key' }
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
            command: 'models.diagnostic',
            payload: {
              logicalCallId,
              current: {
                selection: { accountId: subscription, modelId: 'gpt-5.6-luna' },
                allowPaidFallback: true,
              },
            },
          },
        });
      } else if (message.type === 'reply') {
        reply = message.reply;
        child.postMessage({ type: 'shutdown' });
      }
    });
    child.on('exit', async (code) => {
      clearTimeout(timer);
      const saved = await openStore(directory);
      const rows = saved.db
        .prepare(
          'SELECT a.is_active_answer,u.charged_tokens,u.source FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id ORDER BY a.attempt_no',
        )
        .all();
      const switched = saved.replay(0, 100).items.some((e) => e.type === 'provider.switched');
      const statuses = saved.db
        .prepare('SELECT status,error_code FROM provider_attempts ORDER BY attempt_no')
        .all();
      saved.close();
      const passed =
        code === 0 &&
        reply?.ok &&
        reply.data.actualModel?.accountId === api &&
        reply.data.attempts.length === 2 &&
        subscriptions === 1 &&
        apis === 1 &&
        rows.length === 2 &&
        rows[0].source === 'estimated' &&
        rows[1].charged_tokens === 150 &&
        rows[1].is_active_answer === 1 &&
        switched;
      console.info(
        JSON.stringify({
          taskId: 'P01-03',
          status: passed ? 'passed' : 'failed',
          subscriptions,
          apis,
          attempts: rows.length,
          resultAttempts: reply?.data?.attempts?.length,
          actualApi: reply?.data?.actualModel?.accountId === api,
          switched,
          usage: rows,
          statuses,
          errorCode: reply?.data?.errorCode ?? reply?.error?.code ?? null,
        }),
      );
      app.exit(passed ? 0 : 1);
    });
  });
}
