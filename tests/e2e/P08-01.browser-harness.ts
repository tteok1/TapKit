import { app, BrowserWindow } from 'electron';
import { BrowserRuntime } from '../../apps/desktop/src/main/browser-runtime';
import { configureAnonymousNetwork } from '../../apps/desktop/src/main/browser';
import { installBrowserWebFixture } from '../fixtures/web-app/fixture';
import { mkdir, writeFile } from 'node:fs/promises';
import type { BrowserHostRequest } from '../../packages/contracts/src';
configureAnonymousNetwork();
app.setPath('userData', process.env.TAPKIT_DATA_DIR!);
const runtime = new BrowserRuntime();
const fixture = {
  state: undefined as ReturnType<typeof installBrowserWebFixture> | undefined,
  command: (request: BrowserHostRequest) => runtime.command(request),
  mutate: async (tabId: string, operation: 'move' | 'field' | 'password' | 'popup' | 'select') => {
    const tab = (
      runtime as unknown as { tabs: Map<string, { view: { webContents: Electron.WebContents } }> }
    ).tabs.get(tabId)!;
    const scripts = {
      move: "const button=document.querySelector('button[type=submit]');document.body.prepend(button);",
      field: "document.querySelector('input[name=note]').value='已篡改';",
      password:
        "const p=document.createElement('input');p.type='password';document.body.appendChild(p);",
      popup: "window.open('https://example.com/next');",
      select:
        "const r=document.createRange();r.selectNodeContents(document.getElementById('facts'));getSelection().removeAllRanges();getSelection().addRange(r);",
    };
    await tab.view.webContents.executeJavaScript(scripts[operation]);
  },
  screenshot: async (tabId: string) => {
    const tab = (
      runtime as unknown as { tabs: Map<string, { view: { webContents: Electron.WebContents } }> }
    ).tabs.get(tabId)!;
    const window = BrowserWindow.getAllWindows()[0]!;
    window.contentView.addChildView(tab.view as unknown as Electron.View);
    (tab.view as unknown as Electron.View).setBounds({ x: 0, y: 0, width: 1000, height: 600 });
    const image = await tab.view.webContents.capturePage();
    await mkdir('docs/evidence/P08-01/desktop', { recursive: true });
    await writeFile('docs/evidence/P08-01/desktop/actual-web-page.png', image.toPNG());
  },
};
Object.assign(globalThis, { tapkitBrowserActionFixture: fixture });
void app.whenReady().then(async () => {
  fixture.state = installBrowserWebFixture(process.env.TAPKIT_DATA_DIR!);
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
  });
  await window.loadURL('about:blank');
});
app.on('before-quit', () => {
  void runtime.disposeAll();
});
