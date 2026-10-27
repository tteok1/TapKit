import { BrowserWindow, session } from 'electron';
import { randomUUID } from 'node:crypto';
export class ExportPdfRenderer {
  private active = new Map<string, () => void>();
  cancel(token: string) {
    this.active.get(token)?.();
  }
  async render(token: string, html: string) {
    if (this.active.size >= 2 || this.active.has(token)) throw new Error('QUOTA_EXHAUSTED');
    const isolated = session.fromPartition('tapkit-export-' + randomUUID(), { cache: false });
    const url = 'https://tapkit-export.invalid/' + randomUUID();
    const content = html.replace(/<a\b[^>]*>/gi, '<span>').replace(/<\/a>/gi, '</span>');
    isolated.setPermissionCheckHandler(() => false);
    isolated.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    isolated.on('will-download', (event) => event.preventDefault());
    isolated.webRequest.onBeforeRequest((details, callback) =>
      callback({
        cancel:
          details.url !== url &&
          !(details.resourceType === 'font' && details.url.startsWith('data:font/otf;base64,')),
      }),
    );
    await isolated.protocol.handle('https', (request) =>
      request.url === url
        ? new Response(content, { headers: { 'Content-Type': 'text/html;charset=utf-8' } })
        : new Response('', { status: 403 }),
    );
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        session: isolated,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        backgroundThrottling: false,
      },
    });
    const close = () => {
      if (!window.isDestroyed()) window.destroy();
    };
    this.active.set(token, close);
    const timer = setTimeout(close, 45000);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, target) => {
      if (target !== url) event.preventDefault();
    });
    try {
      await window.loadURL(url);
      const debug = window.webContents.debugger;
      debug.attach('1.3');
      await debug.sendCommand('DOM.enable');
      await debug.sendCommand('CSS.enable');
      const { root } = await debug.sendCommand('DOM.getDocument');
      const { nodeIds } = await debug.sendCommand('DOM.querySelectorAll', {
        nodeId: root.nodeId,
        selector: 'h1,h2,p,td,code',
      });
      let ready = false;
      const deadline = Date.now() + 15000;
      while (!ready && Date.now() < deadline && !window.isDestroyed()) {
        for (const nodeId of (nodeIds as number[]).slice(0, 20)) {
          const { fonts } = await debug.sendCommand('CSS.getPlatformFontsForNode', { nodeId });
          if (
            (fonts as { isCustomFont: boolean; glyphCount: number }[]).some(
              (font) => font.isCustomFont && font.glyphCount > 0,
            )
          ) {
            ready = true;
            break;
          }
        }
        if (!ready) await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
      if (!ready) throw new Error('FORMAT_UNSUPPORTED');
      const bytes = await window.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate:
          '<div style="width:100%;text-align:center;font-size:9px;color:#66736b"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      });
      if (bytes.length > 100 * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
      return bytes;
    } finally {
      clearTimeout(timer);
      close();
      this.active.delete(token);
      await isolated.closeAllConnections();
      await isolated.clearStorageData();
    }
  }
}
