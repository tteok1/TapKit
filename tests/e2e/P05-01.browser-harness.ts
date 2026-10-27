import { app, BrowserWindow, session } from 'electron';
import { createServer } from 'node:http';
import { AnonymousReader, configureAnonymousNetwork } from '../../apps/desktop/src/main/browser';
import { NetworkPolicyService } from '../../packages/network/src';
configureAnonymousNetwork();
app.setPath('userData', process.env.TAPKIT_DATA_DIR!);
const reader = new AnonymousReader();
const state = {
  privateHits: 0,
  postHits: 0,
  popupCount: 0,
  sessions: [] as { persistent: boolean; proxy: string }[],
};
const server = createServer((_req, response) => {
  state.privateHits++;
  response.end('PRIVATE_SENTINEL');
});
const original = session.fromPartition;
session.fromPartition = (partition, options) => {
  const isolated = original(partition, options);
  void isolated.protocol.handle('https', (request) => {
    if (request.method !== 'GET') state.postHits++;
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('address');
    return new Response(
      // The reader returns the first stable visible body. Keep it empty until all async probes finish.
      `<!doctype html><title>浏览器隔离夹具</title><body></body><script>
      (async () => {
        let privateAccess='blocked',post='blocked',permission='denied';
        try { await fetch('http://127.0.0.1:${address.port}/private'); privateAccess='allowed'; } catch {}
        try { await fetch('https://example.com/write',{method:'POST',body:'forbidden'}); post='allowed'; } catch {}
        try { const stream=await navigator.mediaDevices.getUserMedia({audio:true}); stream.getTracks().forEach(t=>t.stop());permission='allowed'; } catch {}
        const cookieBefore=document.cookie;document.cookie='persisted=forbidden';
        window.open('https://example.com/popup');
        document.body.textContent=JSON.stringify({node:typeof require,bridge:typeof window.tapkit,privateAccess,post,permission,cookieBefore});
      })();
    </script>`,
      { headers: { 'Content-Type': 'text/html;charset=utf-8' } },
    );
  });
  const proxy = isolated.setProxy.bind(isolated);
  isolated.setProxy = async (config) => {
    await proxy(config);
    state.sessions.push({
      persistent: isolated.isPersistent(),
      proxy: await isolated.resolveProxy('http://127.0.0.1/'),
    });
  };
  return isolated;
};
// The synthetic origin still passes the real policy's public-address validation.
const destination = NetworkPolicyService.prototype.destination;
NetworkPolicyService.prototype.destination = function (url, signal, kind) {
  if (new URL(url).hostname === 'example.com')
    return Promise.resolve({
      url: new URL(url),
      host: 'example.com',
      address: { address: '93.184.215.14', family: 4 },
    });
  return destination.call(this, url, signal, kind);
};
app.on('web-contents-created', (_event, contents) => {
  contents.on('did-create-window', () => state.popupCount++);
});
const fixture = {
  state,
  read: async () => (await reader.read('synthetic-read', 'https://example.com/')).html,
  rejectPrivate: () =>
    reader.read('private-read', 'http://127.0.0.1/').then(
      () => 'allowed',
      (e: Error) => e.message,
    ),
};
Object.assign(globalThis, { tapkitBrowserFixture: fixture });
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
