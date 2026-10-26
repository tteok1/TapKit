import { _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
const evidence = fileURLToPath(new URL('.', import.meta.url)), root = resolve(evidence, '../../../..');
await mkdir(join(root, '.test-data'), { recursive: true });
const dataRoot = await mkdtemp(join(root, '.test-data/acceptance-native-ui-'));
const source = join(dataRoot, '验收1026-中文原件.txt');
const content = 'TapKit本机验收1026\r\n中文原件与下载字节应完全一致。\r\nSYNTHETIC-NATIVE-1026\r\n';
await writeFile(source, content);
const env = { ...process.env, TAPKIT_DATA_DIR: join(dataRoot, 'profile') };
for (const key of ['ELECTRON_RUN_AS_NODE', 'TAPKIT_CHAT_FIXTURE', 'TAPKIT_TEST_BUILD', 'ELECTRON_RENDERER_URL']) delete env[key];
const app = await electron.launch({ args: [join(root, 'apps/desktop')], env, chromiumSandbox: true });
let finished = false;
try {
  const page = await app.firstWindow();
  await page.getByTestId('core-status').filter({ hasText: '本地核心已连接' }).waitFor({ state: 'attached', timeout: 125000 });
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.on('page-title-updated', (event) => event.preventDefault());
    window.setTitle('TapKit 自动验收1026 - 仅合成数据');
  });
  const info = { source, download: join(dataRoot, '下载1026.txt'), profile: env.TAPKIT_DATA_DIR, dataRoot, pid: app.process().pid, title: 'TapKit 自动验收1026 - 仅合成数据', sourceSha256: createHash('sha256').update(content).digest('hex') };
  await writeFile(join(evidence, 'native-session.json'), JSON.stringify(info, null, 2) + '\n');
  console.log('Isolated production window ready; no dialogs or shell handlers stubbed.');
  let last = '';
  for (let i = 0; i < 1200 && !finished; i++) {
    const raw = await readFile(join(evidence, 'native-control.json'), 'utf8').catch(() => '');
    if (raw && raw !== last) {
      last = raw;
      const request = JSON.parse(raw);
      if (request.action === 'finish') { finished = true; break; }
      if (request.action === 'snapshot') {
        const state = await page.evaluate(async (requestId) => {
          const reply = await window.tapkit.fileCommand({ requestId }, 'files.list', {});
          return { reply, body: document.body.innerText };
        }, (() => { const value = randomUUID(); return value.slice(0, 14) + '7' + value.slice(15); })());
        await writeFile(join(evidence, 'native-state.json'), JSON.stringify(state, null, 2) + '\n');
        await page.screenshot({ path: join(evidence, 'native-window.png') });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const original = await readFile(source), download = await readFile(info.download).catch(() => undefined);
  await writeFile(join(evidence, 'native-files-result.json'), JSON.stringify({ sourceUnchanged: original.equals(Buffer.from(content)), downloaded: !!download, downloadMatches: download?.equals(original) ?? false, sourceSha256: info.sourceSha256 }, null, 2) + '\n');
} finally {
  await app.close();
  console.log('Only the isolated acceptance window was closed.');
}
