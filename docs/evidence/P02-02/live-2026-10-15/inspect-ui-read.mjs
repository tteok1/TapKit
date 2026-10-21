import { _electron as electron } from '@playwright/test';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../../..');
const manifest = JSON.parse(
  readFileSync(
    join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
    'utf8',
  ),
);
const profile = realpathSync(manifest.dataDir);
if (manifest.root !== root || dirname(profile) !== join(root, '.test-data'))
  throw Error('Unexpected acceptance profile');
const targetArgument = process.argv.indexOf('--session-id');
const targetSessionId =
  targetArgument < 0 ? '01a1442b-3b71-78b6-b3a3-f47c8df370cf' : process.argv[targetArgument + 1];
if (
  !['01a1442b-3b71-78b6-b3a3-f47c8df370cf', '01a1498f-dbb2-7fa8-8829-be6b985c7926'].includes(
    targetSessionId,
  )
)
  throw Error('Unexpected diagnostic test session');
function id() {
  const bytes = randomBytes(16),
    time = BigInt(Date.now());
  for (let i = 0; i < 6; i++) bytes[5 - i] = Number((time >> BigInt(i * 8)) & 255n);
  bytes[6] = (bytes[6] & 15) | 112;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
const env = { ...process.env, TAPKIT_DATA_DIR: profile };
for (const key of [
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_RENDERER_URL',
  'TAPKIT_TEST_BUILD',
  'TAPKIT_CHAT_FIXTURE',
])
  delete env[key];
let server;
const devRenderer = process.argv.includes('--dev-renderer');
if (devRenderer) {
  process.chdir(join(root, 'apps/desktop'));
  process.env.NODE_ENV_ELECTRON_VITE = 'development';
  const { resolveConfig } = await import('electron-vite');
  const { createServer } = await import('vite');
  const config = await resolveConfig(
    { root: join(root, 'apps/desktop'), logLevel: 'error' },
    'serve',
    'development',
  );
  server = await createServer({ ...config.config.renderer, logLevel: 'error' });
  await server.listen();
  env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:' + server.httpServer.address().port;
}
const app = await electron.launch({
  args: [join(root, 'apps/desktop')],
  env,
  chromiumSandbox: true,
  timeout: 30000,
});
let report;
let stage = 'first_window';
const pageErrors = [];
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) =>
    pageErrors.push({
      name: error.name,
      undefinedProperty:
        /^Cannot read properties of (?:undefined|null) \(reading '[A-Za-z_$][\w$]*'\)$/.test(
          error.message,
        )
          ? error.message
          : null,
      undefinedIdentifier: /^[A-Za-z_$][\w$]* is not defined$/.test(error.message)
        ? error.message
        : null,
      evalBlocked: /unsafe-eval|Content Security Policy|code generation|EvalError/i.test(
        error.message,
      ),
      invalidHook: /Invalid hook call|useContext|useState/.test(error.message),
      stackLocations: (error.stack ?? '')
        .split('\n')
        .slice(1, 5)
        .map((line) => line.match(/https?:\/\/127\.0\.0\.1:[\d]+\/[\w/.:@-]+/)?.[0] ?? null),
    }),
  );
  await page.waitForFunction(() => !!window.tapkit, { timeout: 20000 });
  const host = await app.evaluate(({ app }) => ({
    dataDir: app.getPath('userData'),
    appPath: app.getAppPath(),
    packaged: app.isPackaged,
  }));
  report = {
    checkedAt: new Date().toISOString(),
    task: 'P02-02',
    mode:
      (devRenderer ? 'development renderer with existing production Host' : 'production UI') +
      '; public read only; user confirmed prior app fully exited',
    host,
    modelRequests: 0,
    secretBodiesExported: false,
    outcomes: [],
  };
  report.build = Object.fromEntries(
    [
      'packages/core/dist/index.cjs',
      'apps/desktop/out/main/index.js',
      'apps/desktop/out/preload/index.js',
      'apps/desktop/out/renderer/index.html',
    ].map((path) => [
      path,
      createHash('sha256')
        .update(readFileSync(join(root, path)))
        .digest('hex'),
    ]),
  );
  for (const command of ['providers.list', 'models.catalog', 'messages.list']) {
    const result = await page.evaluate(
      async ({ command, requestId, sessionId }) => {
        try {
          const options = { requestId };
          const reply =
            command === 'providers.list'
              ? await window.tapkit.listProviders(options)
              : command === 'models.catalog'
                ? await window.tapkit.modelCommand(options, command, {})
                : await window.tapkit.chatCommand(options, command, { sessionId, limit: 100 });
          if (!reply.ok) return { command, ok: false, code: reply.error.code };
          const data = reply.data;
          return {
            command,
            ok: true,
            keys: Object.keys(data),
            accounts: Array.isArray(data.accounts) ? data.accounts.length : null,
            readyAccounts: Array.isArray(data.accounts)
              ? data.accounts.filter((a) => a.status === 'ready').length
              : null,
            catalog: Array.isArray(data.catalog) ? data.catalog.length : null,
            messages: Array.isArray(data.messages) ? data.messages.length : null,
          };
        } catch (error) {
          return {
            command,
            threw: true,
            name: error?.name ?? 'unknown',
            issuePaths: Array.isArray(error?.issues)
              ? error.issues.map((x) => ({ code: x.code, path: x.path }))
              : [],
            evalBlocked: /unsafe-eval|Content Security Policy|code generation|EvalError/i.test(
              String(error?.message),
            ),
            invalidSchema: /invalid_type|invalid_union|unrecognized_keys|ZodError/.test(
              String(error?.message),
            ),
            referenceError: /not defined|before initialization/.test(String(error?.message)),
          };
        }
      },
      { command, requestId: id(), sessionId: targetSessionId },
    );
    report.outcomes.push(result);
  }
  const sessionId = targetSessionId;
  report.initialUi = await page.evaluate(() => ({
    historyRows: document.querySelectorAll('.history-row').length,
    coreConnected:
      document.querySelector('[data-testid="core-status"]')?.textContent === '本地核心已连接',
    coreUnavailable: document.body.textContent.includes('本地核心暂不可用'),
    sourceErrorOverlay: !!document.querySelector('vite-error-overlay'),
    rootChildElements: document.querySelector('#root')?.children.length,
  }));
  if (devRenderer)
    report.schemaChecks = await page.evaluate(
      async ({ moduleUrl, requestId, sessionId }) => {
        const contracts = await import(moduleUrl);
        const checks = [];
        for (const command of ['bootstrap', 'providers.list', 'messages.list']) {
          try {
            const reply =
              command === 'bootstrap'
                ? await window.tapkit.bootstrap({ requestId })
                : command === 'providers.list'
                  ? await window.tapkit.listProviders({ requestId })
                  : await window.tapkit.chatCommand({ requestId }, command, {
                      sessionId,
                      limit: 100,
                    });
            (command === 'bootstrap'
              ? contracts.BootstrapViewSchema
              : command === 'providers.list'
                ? contracts.ProviderListSchema
                : contracts.ChatSnapshotSchema
            ).parse(reply.data);
            checks.push({ command, parsed: true });
          } catch (error) {
            checks.push({
              command,
              parsed: false,
              name: error?.name,
              issues: Array.isArray(error?.issues)
                ? error.issues.map((x) => ({ code: x.code, path: x.path }))
                : [],
              evalBlocked: /unsafe-eval|Content Security Policy|code generation|EvalError/i.test(
                String(error?.message),
              ),
              referenceError: /not defined|before initialization/.test(String(error?.message)),
              undefinedProperty:
                /^Cannot read properties of (?:undefined|null) \(reading '[A-Za-z_$][\w$]*'\)$/.test(
                  String(error?.message),
                )
                  ? error.message
                  : null,
            });
          }
        }
        return checks;
      },
      {
        moduleUrl: '/@fs/' + root.replaceAll('\\', '/') + '/packages/contracts/src/index.ts',
        requestId: id(),
        sessionId,
      },
    );
  stage = 'open_b_chat';
  await page.locator('.history-row[data-session-id="' + sessionId + '"] .history-link').click();
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll('.chat-message').length > 0 ||
        document.querySelector('.chat-surface [role="alert"]'),
      { timeout: 10000 },
    )
    .catch(() => {});
  report.chatUi = await page.evaluate(() => ({
    messages: document.querySelectorAll('.chat-message').length,
    chatError: !!document.querySelector('.chat-surface [role="alert"]'),
    connectionUnavailable: [...document.querySelectorAll('.shell-error')].some((n) =>
      n.textContent.includes('模型账户暂不可用'),
    ),
  }));
  stage = 'open_settings';
  await page.locator('a[href="/settings/general"]').press('Enter');
  await page.locator('.desktop-settings').waitFor({ state: 'visible' });
  stage = 'open_connections';
  await page.locator('.desktop-settings a[href="/settings/connections"]').press('Enter');
  stage = 'open_api_accounts';
  await page.locator('a[href="/dev/api"]').press('Enter');
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="api-account"]').length > 0 ||
        [...document.querySelectorAll('[role="alert"]')].some((n) =>
          n.textContent.includes('操作失败'),
        ),
      { timeout: 10000 },
    )
    .catch(() => {});
  report.accountUi = await page.evaluate(() => ({
    accounts: document.querySelectorAll('[data-testid="api-account"]').length,
    empty: !!document.querySelector('[data-testid="api-empty"]'),
    connectionUnavailable: [...document.querySelectorAll('.shell-error')].some((n) =>
      n.textContent.includes('模型账户暂不可用'),
    ),
    loadFailed: [...document.querySelectorAll('[role="alert"]')].some((n) =>
      n.textContent.includes('操作失败'),
    ),
  }));
} catch (error) {
  report ??= { checkedAt: new Date().toISOString() };
  report.diagnosticFailure = {
    stage,
    name: error.name,
    timeout: error.name === 'TimeoutError',
    detailExported: false,
  };
  report.failureUi = await app
    .firstWindow()
    .then((page) =>
      page.evaluate(() => ({
        settingsRendered: !!document.querySelector('.desktop-settings'),
        chatRendered: !!document.querySelector('.chat-surface'),
        apiRendered: !!document.querySelector('.api-form'),
        fixedSettingsLinks: [...document.querySelectorAll('a')]
          .map((n) => n.getAttribute('href'))
          .filter((href) => /^\/(settings\/(general|connections)|dev\/api)$/.test(href)),
      })),
    )
    .catch(() => null);
} finally {
  if (report) report.pageErrors = pageErrors;
  await app.close();
  await server?.close();
}
const output = join(directory, 'ui-read-' + Date.now() + '.json');
report.status =
  !report.diagnosticFailure &&
  report.outcomes.every((item) => item.ok) &&
  report.chatUi.messages ===
    report.outcomes.find((item) => item.command === 'messages.list').messages &&
  report.accountUi.accounts === 1 &&
  !report.accountUi.loadFailed &&
  !report.accountUi.connectionUnavailable
    ? 'passed_public_ui_read'
    : 'diagnostic_incomplete';
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ reportPath: output, ...report }));
if (report.status !== 'passed_public_ui_read') process.exitCode = 1;
