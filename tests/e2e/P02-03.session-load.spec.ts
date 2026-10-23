import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

let app: ElectronApplication;
const evidence = resolve('docs/evidence/P02-03/session-load-2026-10-21');
const newId = () => randomUUID().replace(/^(.{14})./, (_, prefix: string) => prefix + '7');
test.afterEach(async () => {
  await app?.close();
});

test('P02-03 old sessions load without replaying their full event history', async () => {
  test.setTimeout(240_000);
  await mkdir('.test-data', { recursive: true });
  await mkdir(evidence, { recursive: true });
  const dir = await mkdtemp(resolve('.test-data/P02-03 session load '));
  await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const env = Object.fromEntries(
    Object.entries({ ...process.env, TAPKIT_DATA_DIR: dir, TAPKIT_CHAT_FIXTURE: 'P02-02' }).filter(
      (r): r is [string, string] => r[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const launchAt = performance.now();
  app = await electron.launch({ args: [resolve('apps/desktop')], env, chromiumSandbox: true });
  const page = await app.firstWindow();
  const windowMs = performance.now() - launchAt;
  await expect(page.getByTestId('core-status')).toHaveText('本地核心已连接', { timeout: 125_000 });
  const coreReadyMs = performance.now() - launchAt;
  const sessions: { id: string; last: string; turns: number }[] = [];
  for (const turns of [12, 2]) {
    const id = await page.evaluate(async (requestId) => {
      const r = await window.tapkit.desktopCommand({ requestId }, 'sessions.create', {
        mode: 'chat',
        title: '本地加载回归',
      });
      if (!r.ok || !('entityId' in r.data)) throw new Error('CREATE_FAILED');
      return r.data.entityId;
    }, newId());
    let last = '';
    for (let turn = 0; turn < turns; turn++) {
      last = `本地历史第${turn}轮\n\n\`\`\`js\nconst n = ${turn};\n\`\`\``;
      await page.evaluate(
        async ({ sessionId, text, requestId, clientMessageId }) => {
          const r = await window.tapkit.chatCommand({ requestId }, 'messages.send', {
            sessionId,
            text,
            attachments: [],
            clientMessageId,
            mode: 'chat',
          });
          if (!r.ok) throw new Error(r.error.code);
        },
        { sessionId: id, text: last, requestId: newId(), clientMessageId: newId() },
      );
      await expect
        .poll(() =>
          page.evaluate(
            async ({ sessionId, requestId }) => {
              const r = await window.tapkit.chatCommand({ requestId }, 'messages.list', {
                sessionId,
              });
              if (!r.ok || !('run' in r.data)) throw new Error('SNAPSHOT_FAILED');
              return r.data.run?.status;
            },
            { sessionId: id, requestId: newId() },
          ),
        )
        .toBe('completed');
    }
    sessions.push({ id, last, turns });
  }
  const count = async () =>
    (await readFile(resolve(dir, 'logs/ipc.jsonl'), 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((row) => row.command === 'messages.list').length;
  await page.waitForTimeout(750);
  const samples: { turns: number; open: number; displayMs: number; listRequests: number }[] = [];
  for (let open = 0; open < 3; open++) {
    for (const session of sessions) {
      const before = await count();
      const start = performance.now();
      await page.locator(`.history-row[data-session-id="${session.id}"] .history-link`).click();
      const surface = page.locator(`.chat-surface[data-session-id="${session.id}"]`);
      await expect(surface.locator('.chat-message.assistant')).toHaveCount(session.turns);
      const displayMs = performance.now() - start;
      await expect(surface.locator('.chat-message header')).not.toContainText([
        'openai-compatible',
      ]);
      await expect(surface).not.toContainText('请求次数与用量包含标题等辅助请求');
      // Include queued replay reads in the measurement rather than stopping at first paint.
      await page.waitForTimeout(750);
      samples.push({
        turns: session.turns,
        open,
        displayMs: Math.round(displayMs),
        listRequests: (await count()) - before,
      });
    }
  }
  await page.screenshot({ path: resolve(evidence, 'chat-clean.png') });
  await writeFile(
    resolve(evidence, 'measurements.json'),
    JSON.stringify(
      {
        windowMs: Math.round(windowMs),
        coreReadyMs: Math.round(coreReadyMs),
        samples,
        isolatedFixture: true,
        realProviderCalls: 0,
      },
      null,
      2,
    ) + '\n',
  );
  for (const sample of samples)
    expect.soft(sample.listRequests, JSON.stringify(sample)).toBeLessThanOrEqual(4);
  // A new real event must still update the session after establishing its snapshot cursor.
  const current = sessions.at(-1)!;
  await page.evaluate(
    async ({ sessionId, requestId, clientMessageId }) => {
      const r = await window.tapkit.chatCommand({ requestId }, 'messages.send', {
        sessionId,
        text: '新的事件仍然可见',
        attachments: [],
        clientMessageId,
        mode: 'chat',
      });
      if (!r.ok) throw new Error(r.error.code);
    },
    { sessionId: current.id, requestId: newId(), clientMessageId: newId() },
  );
  await expect(page.locator('.chat-message.assistant')).toHaveCount(current.turns + 1);
  await expect(page.locator('.chat-message.assistant').last()).toContainText('新的事件仍然可见');
});
