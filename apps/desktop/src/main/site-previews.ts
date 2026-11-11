import { randomUUID } from 'node:crypto';
import { BrowserWindow, WebContentsView, session, type Rectangle } from 'electron';
import { SiteRegionSchema } from '@tapkit/contracts';
import { serveSite } from './site-preview-server';

type Preview = {
  id: string;
  view: WebContentsView;
  server: Awaited<ReturnType<typeof serveSite>>;
  timer?: ReturnType<typeof setInterval>;
  selecting: boolean;
};

// Executed in an isolated world without an IPC bridge. The page supplies only bounded DOM data.
const pickRegion = `new Promise(resolve => {
  const finish = value => {
    clearTimeout(timer);
    document.removeEventListener('click', select, true);
    document.removeEventListener('keydown', select, true);
    resolve(value);
  };
  function select(event) {
    if (!event.isTrusted) return;
    if (event.type === 'keydown' && event.key === 'Escape') return finish(null);
    if (event.type === 'keydown' && event.key !== 'Enter') return;
    const element = event.target;
    if (!(element instanceof Element) || element === document.documentElement) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const path = [];
    for (let node = element; node && path.length < 20; node = node.parentElement) {
      if (node.id && node.id.length < 100) {
        path.unshift('#' + CSS.escape(node.id));
        break;
      }
      const siblings = node.parentElement ? Array.from(node.parentElement.children) : [node];
      const tag = node.localName;
      const index = siblings.filter(sibling => sibling.localName === tag).indexOf(node) + 1;
      path.unshift(tag + ':nth-of-type(' + index + ')');
    }
    const rect = element.getBoundingClientRect();
    finish({
      page: (location.pathname.split('/').slice(2).join('/') + location.search).slice(0, 400),
      selector: path.join(' > ').slice(0, 500),
      text: (element.textContent || '').trim().slice(0, 800),
      width: Math.min(100000, Math.round(rect.width)),
      height: Math.min(100000, Math.round(rect.height))
    });
  }
  const timer = setTimeout(() => finish(null), 12000);
  document.addEventListener('click', select, true);
  document.addEventListener('keydown', select, true);
})`;

export class SitePreviews {
  private active = new Map<BrowserWindow, Preview>();
  private opening = new Set<BrowserWindow>();
  async start(
    window: BrowserWindow,
    entries: Parameters<typeof serveSite>[0],
    valid: () => Promise<boolean>,
  ) {
    if (this.opening.has(window) || this.active.size + this.opening.size >= 4)
      throw Error('OUTPUT_LIMIT_REACHED');
    this.opening.add(window);
    let server: Preview['server'] | undefined, view: WebContentsView | undefined;
    try {
      this.stop(window);
      server = await serveSite(entries);
      const site = server;
      const id = randomUUID(),
        isolated = session.fromPartition('tapkit-site-' + id, { cache: false });
      await isolated.setProxy({
        mode: 'fixed_servers',
        proxyRules: 'http://' + site.host,
        proxyBypassRules: '<-loopback>;' + site.host,
      });
      isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      isolated.setPermissionCheckHandler(() => false);
      isolated.setDevicePermissionHandler(() => false);
      isolated.on('will-download', (event) => event.preventDefault());
      isolated.webRequest.onBeforeRequest((request, callback) =>
        callback({
          cancel:
            !['GET', 'HEAD'].includes(request.method) ||
            !site.allows(request.url, request.resourceType === 'mainFrame') ||
            request.resourceType === 'subFrame',
        }),
      );
      view = new WebContentsView({
        webPreferences: {
          session: isolated,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          devTools: false,
          webviewTag: false,
          navigateOnDragDrop: false,
          spellcheck: false,
        },
      });
      const contents = view.webContents;
      contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
      contents.setWindowOpenHandler(() => ({ action: 'deny' }));
      contents.on('will-frame-navigate', (event) => {
        if (!event.isMainFrame || !site.allows(event.url, true)) event.preventDefault();
      });
      contents.on('will-redirect', (event, url) => {
        if (!site.allows(url, true)) event.preventDefault();
      });
      window.contentView.addChildView(view);
      view.setVisible(false);
      await contents.loadURL('about:blank');
      contents.debugger.attach('1.3');
      await contents.debugger.sendCommand('Page.setInterceptFileChooserDialog', { enabled: true });
      if (window.isDestroyed() || !(await valid())) throw Error('PERMISSION_DENIED');
      const preview: Preview = { id, view, server, selecting: false };
      this.active.set(window, preview);
      contents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown' || input.key !== 'Escape' || preview.selecting) return;
        event.preventDefault();
        if (!window.isDestroyed()) window.webContents.focus();
      });
      contents.once('render-process-gone', () => this.stop(window, id));
      contents.once('destroyed', () => this.stop(window, id));
      await contents.loadURL(site.url);
      if (this.active.get(window) !== preview) throw Error('NOT_FOUND');
      let checking = false;
      preview.timer = setInterval(() => {
        if (checking) return;
        checking = true;
        void valid()
          .then(
            (allowed) => {
              if (!allowed) this.stop(window, id);
            },
            () => this.stop(window, id),
          )
          .finally(() => {
            checking = false;
          });
      }, 1000);
      return id;
    } catch (error) {
      if (this.active.get(window)?.view === view) this.stop(window);
      else {
        if (view && !window.isDestroyed()) window.contentView.removeChildView(view);
        if (view && !view.webContents.isDestroyed()) view.webContents.close();
        server?.close();
      }
      throw error;
    } finally {
      this.opening.delete(window);
    }
  }
  private get(window: BrowserWindow, id: string) {
    const preview = this.active.get(window);
    if (!preview || preview.id !== id || preview.view.webContents.isDestroyed())
      throw Error('NOT_FOUND');
    return preview;
  }
  focus(window: BrowserWindow, id: string) {
    this.get(window, id).view.webContents.focus();
  }
  resize(window: BrowserWindow, id: string, viewport: number, bounds: Rectangle) {
    const { view } = this.get(window, id);
    const size = window.getContentBounds();
    const x = Math.max(0, bounds.x),
      y = Math.max(0, bounds.y);
    const width = Math.min(viewport, bounds.x + bounds.width - x, size.width - x);
    const height = Math.min(bounds.y + bounds.height - y, size.height - y);
    view.setVisible(width > 0 && height > 0 && window.isVisible());
    if (width <= 0 || height <= 0) return;
    view.setBounds({ x, y, width, height });
    view.webContents.setZoomFactor(width / viewport);
  }
  async select(window: BrowserWindow, id: string) {
    const preview = this.get(window, id);
    if (preview.selecting) throw Error('CONFLICT');
    preview.selecting = true;
    const contents = preview.view.webContents;
    try {
      contents.focus();
      const selected = await contents.executeJavaScriptInIsolatedWorld(1000, [
        { code: pickRegion },
      ]);
      return selected ? SiteRegionSchema.parse(selected) : undefined;
    } finally {
      preview.selecting = false;
      if (!window.isDestroyed()) window.webContents.focus();
    }
  }
  async refresh(window: BrowserWindow, id: string) {
    const preview = this.get(window, id),
      contents = preview.view.webContents;
    const url = contents.getURL();
    await contents.loadURL(preview.server.allows(url, true) ? url : preview.server.url);
  }
  stop(window: BrowserWindow, id?: string) {
    const preview = this.active.get(window);
    if (!preview || (id && preview.id !== id)) return;
    this.active.delete(window);
    clearInterval(preview.timer);
    if (!window.isDestroyed()) window.contentView.removeChildView(preview.view);
    if (!preview.view.webContents.isDestroyed()) preview.view.webContents.close();
    preview.server.close();
  }
  close() {
    for (const window of this.active.keys()) this.stop(window);
  }
}
