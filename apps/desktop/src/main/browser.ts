import { WebContentsView, session, app } from 'electron';
import { createServer } from 'node:http';
import { type Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { NetworkPolicyService, WEB_BYTE_LIMIT, publicUrl, pinnedSocket } from '@tapkit/network';

// Remote documents have no preload, app protocol, Node, IPC, filesystem or persistent partition.
const OBSERVE = `(() => {
  const body = document.body;
  return { ready: document.readyState, text: body?.innerText?.length ?? 0,
    html: document.documentElement.outerHTML };
})()`;
export class AnonymousReader {
  private active = new Map<string, AbortController>();
  cancel(token: string) {
    this.active.get(token)?.abort();
  }
  async read(token: string, rawUrl: string, proxyURL = '', byteLimit = WEB_BYTE_LIMIT) {
    if (this.active.has(token) || this.active.size >= 2) throw new Error('QUOTA_EXHAUSTED');
    const url = publicUrl(rawUrl),
      controller = new AbortController();
    this.active.set(token, controller);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
    const policy = new NetworkPolicyService({ proxy: async () => proxyURL });
    const password = randomBytes(32).toString('hex');
    const authorization = 'Basic ' + Buffer.from('tapkit:' + password).toString('base64');
    const sockets = new Set<Socket>();
    let bytes = 0;
    const limit = Math.min(byteLimit, WEB_BYTE_LIMIT);
    const meter = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > limit) controller.abort();
    };
    const proxy = createServer((request, response) => {
      request.resume();
      if (request.headers['proxy-authorization'] !== authorization) {
        response.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="TapKit"' }).end();
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method ?? '') || !request.url?.startsWith('http://')) {
        response.writeHead(403).end();
        return;
      }
      void policy
        .request(request.url, { signal, followRedirects: false, limit: limit - bytes })
        .then(
          (reply) => {
            bytes += reply.bytes.length;
            if (bytes > limit || signal.aborted) {
              response.destroy();
              controller.abort();
              return;
            }
            const headers = { ...reply.headers };
            for (const name of Object.keys(headers))
              if (/^(set-cookie|connection|transfer-encoding|content-length)$/i.test(name))
                delete headers[name];
            response
              .writeHead(reply.status, headers)
              .end(request.method === 'HEAD' ? undefined : reply.bytes);
          },
          () => response.destroy(),
        );
    });
    proxy.on('connect', (request, client, head) => {
      const socket = client as Socket;
      if (request.headers['proxy-authorization'] !== authorization) {
        socket.end(
          'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="TapKit"\r\nContent-Length: 0\r\n\r\n',
        );
        return;
      }
      const target = 'https://' + request.url;
      if (new URL(target).port && new URL(target).port !== '443') {
        socket.destroy();
        return;
      }
      void policy
        .destination(target, signal)
        .then(async (dest) => {
          signal.throwIfAborted();
          const remote = await pinnedSocket(dest, proxyURL, signal);
          sockets.add(socket);
          sockets.add(remote);
          remote.on('error', () => socket.destroy());
          socket.on('error', () => remote.destroy());
          remote.on('data', meter);
          socket.on('data', meter);
          socket.on('close', () => {
            remote.destroy();
            sockets.delete(socket);
            sockets.delete(remote);
          });
          const begin = () => {
            if (signal.aborted) {
              remote.destroy();
              socket.destroy();
              return;
            }
            socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            if (head.length) remote.write(head);
            socket.pipe(remote).pipe(socket);
          };
          if (remote.connecting) remote.once('connect', begin);
          else begin();
        })
        .catch(() => socket.destroy());
    });
    proxy.on('clientError', (_error, socket) => socket.destroy());
    let view: WebContentsView | undefined;
    let isolated: Electron.Session | undefined;
    const cleanup = () => {
      for (const socket of sockets) socket.destroy();
      if (view && !view.webContents.isDestroyed()) view.webContents.close();
      proxy.close();
    };
    signal.addEventListener('abort', cleanup, { once: true });
    try {
      await policy.destination(url.href, signal);
      await new Promise<void>((resolve, reject) => {
        proxy.once('error', reject);
        proxy.listen(0, '127.0.0.1', resolve);
      });
      signal.throwIfAborted();
      const address = proxy.address();
      if (!address || typeof address === 'string') throw new Error('NETWORK_ERROR');
      const partition = 'tapkit-web-' + randomBytes(16).toString('hex');
      isolated = session.fromPartition(partition, { cache: false });
      await isolated.setProxy({
        mode: 'fixed_servers',
        proxyRules: 'http=127.0.0.1:' + address.port + ';https=127.0.0.1:' + address.port,
        proxyBypassRules: '<-loopback>',
      });
      isolated.setPermissionCheckHandler(() => false);
      isolated.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      isolated.on('will-download', (event) => event.preventDefault());
      isolated.webRequest.onBeforeRequest((details, callback) => {
        let cancel =
          signal.aborted ||
          !['GET', 'HEAD'].includes(details.method) ||
          !['mainFrame', 'subFrame', 'script', 'xhr', 'stylesheet'].includes(details.resourceType);
        try {
          publicUrl(details.url);
        } catch {
          cancel = true;
        }
        callback({ cancel });
      });
      isolated.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = details.requestHeaders;
        headers['Accept-Encoding'] = 'identity';
        for (const name of Object.keys(headers))
          if (/^(cookie|authorization|proxy-authorization|referer)$/i.test(name))
            delete headers[name];
        callback({ requestHeaders: headers });
      });
      isolated.webRequest.onHeadersReceived((details, callback) => {
        const headers = details.responseHeaders ?? {};
        for (const name of Object.keys(headers))
          if (/^set-cookie$/i.test(name)) delete headers[name];
        const encoding = Object.entries(headers).find(([name]) =>
          /^content-encoding$/i.test(name),
        )?.[1]?.[0];
        callback({ responseHeaders: headers, cancel: !!encoding && encoding !== 'identity' });
      });
      view = new WebContentsView({
        webPreferences: {
          session: isolated,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
          safeDialogs: true,
          navigateOnDragDrop: false,
        },
      });
      const wc = view.webContents;
      let redirects = 0;
      wc.on('will-redirect', (event) => {
        if (++redirects > 5) event.preventDefault();
      });
      wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
      wc.setWindowOpenHandler(() => ({ action: 'deny' }));
      wc.on('will-attach-webview', (event) => event.preventDefault());
      wc.on('select-bluetooth-device', (event, _devices, callback) => {
        event.preventDefault();
        callback('');
      });
      wc.on('login', (event, _details, auth, callback) => {
        event.preventDefault();
        if (auth.isProxy && auth.port === address.port) callback('tapkit', password);
        else callback();
      });
      await wc.loadURL(url.href);
      wc.debugger.attach('1.3');
      let previous = '',
        stable = 0;
      while (!signal.aborted) {
        const response = await wc.debugger.sendCommand('Runtime.evaluate', {
          expression: OBSERVE,
          returnByValue: true,
          awaitPromise: false,
        });
        const result = response.result?.value as
          { ready: string; text: number; html: string } | undefined;
        if (result && result.html.length <= WEB_BYTE_LIMIT && result.ready !== 'loading') {
          stable = previous === result.html ? stable + 1 : 0;
          previous = result.html;
          if (stable >= 2 && result.text > 0)
            return { url: publicUrl(wc.getURL()).href, html: result.html };
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 200);
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
      throw new Error('CANCELLED');
    } finally {
      cleanup();
      signal.removeEventListener('abort', cleanup);
      this.active.delete(token);
      await isolated?.closeAllConnections();
      await isolated?.clearStorageData();
    }
  }
}
export function configureAnonymousNetwork() {
  app.commandLine.appendSwitch('disable-quic');
  app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
}
