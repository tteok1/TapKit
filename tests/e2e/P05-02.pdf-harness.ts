import { app, BrowserWindow } from 'electron';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ExportPdfRenderer } from '../../apps/desktop/src/main/export-pdf';
import { renderExport } from '../../packages/workflows/src/export';
import { ExportDocumentSchema } from '../../packages/contracts/src';
app.setPath('userData', process.env.TAPKIT_DATA_DIR!);
let hits = 0;
const server = createServer((_request, response) => {
  hits++;
  response.end('PRIVATE');
});
const preferences: unknown[] = [];
app.on('web-contents-created', (_event, contents) => {
  const prefs = (
    contents as unknown as {
      getLastWebPreferences(): {
        javascript?: boolean;
        sandbox?: boolean;
        nodeIntegration?: boolean;
        contextIsolation?: boolean;
        preload?: string;
      };
    }
  ).getLastWebPreferences();
  if (prefs.javascript === false)
    preferences.push({
      sandbox: prefs.sandbox,
      nodeIntegration: prefs.nodeIntegration,
      contextIsolation: prefs.contextIsolation,
      javascript: prefs.javascript,
      preload: prefs.preload ?? null,
    });
});
const renderer = new ExportPdfRenderer();
Object.assign(globalThis, {
  tapkitPdfFixture: {
    async render() {
      const address = server.address();
      if (!address || typeof address === 'string') throw Error('server');
      const root = process.env.TAPKIT_SOURCE_ROOT!,
        directory = join(root, 'docs/evidence/P05-02/exported');
      await mkdir(directory, { recursive: true });
      const font = (
        await readFile(join(root, 'resources/fonts/NotoSansCJKsc-Regular.otf'))
      ).toString('base64');
      const table =
        '|项目|金额|说明|\n|---|---|---|\n' +
        Array.from(
          { length: 80 },
          (_, i) => `|中文项目${i + 1}|${i + 42}|这是表格的跨页中文说明，保留正文与数字。|`,
        ).join('\n');
      const code =
        '```javascript\n' +
        Array.from(
          { length: 100 },
          (_, i) =>
            `    const line${i} = "中文代码，较长的内容需要自动换行并保留四个空格缩进 ${'long'.repeat(25)}";`,
        ).join('\n') +
        '\n```';
      const doc = ExportDocumentSchema.parse({
        title: '中文会话导出验收',
        messages: [
          {
            id: '01990000-0000-7000-8000-000000000001',
            role: 'user',
            text:
              '第一段中文内容，验证离线字体。\n\n' +
              table +
              '\n\n' +
              code +
              '\n\n最后一段中文结束。',
            status: 'final',
          },
        ],
        files: [],
        sources: [],
        process: [],
      });
      const rendered = renderExport(doc, font);
      const attack = `<script>document.body.textContent='SCRIPT_EXECUTED'</script><img src="http://127.0.0.1:${address.port}/private">`;
      const pdf = await renderer.render('fixture-pdf', rendered.html);
      await renderer.render('fixture-attack', rendered.html.replace('</body>', attack + '</body>'));
      await writeFile(join(directory, 'chinese-pages.pdf'), pdf);
      await writeFile(join(directory, 'standalone.html'), rendered.html);
      return {
        hits,
        preferences,
        bytes: pdf.length,
        directory,
        htmlBytes: Buffer.byteLength(rendered.html),
      };
    },
  },
});
void (async () => {
  await app.whenReady();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
  });
  await window.loadURL('about:blank');
})();
app.on('before-quit', () => {
  server.closeAllConnections();
  server.close();
});
