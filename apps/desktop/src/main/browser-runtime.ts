import { BrowserWindow, WebContentsView, session, shell, type Session } from 'electron';
import { randomUUID, createHash } from 'node:crypto';
import {
  BrowserHostRequestSchema,
  BrowserSnapshotSchema,
  BrowserActionSchema,
  type BrowserHostRequest,
  type BrowserSnapshot,
  type BrowserPrepared,
  type BrowserAction,
} from '@tapkit/contracts';
import { NetworkPolicyService, publicUrl } from '@tapkit/network';
import { browserProxy } from './browser-proxy';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const browserId = () => {
  const random = randomUUID(),
    time = Date.now().toString(16).padStart(12, '0');
  return time.slice(0, 8) + '-' + time.slice(8) + '-7' + random.slice(15);
};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function boundedText(text: string, max: number) {
  const bytes = Buffer.from(text);
  let end = Math.min(bytes.length, max);
  while (end > 0 && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString('utf8');
}
type NodeHandle = { objectId: string; contextId: number; backendNodeId: number; frameId: string };
type Tab = {
  id: string;
  runId: string;
  rootRunId: string;
  view: WebContentsView;
  mode: 'agent' | 'user';
  epoch: number;
  last?: BrowserSnapshot;
  nodes: Map<string, NodeHandle>;
  busy: boolean;
  downloads: Array<{ url: string; name: string }>;
  window?: BrowserWindow;
  permit?: {
    url: string;
    method: string;
    body: string;
    consumed: boolean;
    requestId?: number;
    status?: number;
    failed?: boolean;
    expires: number;
  };
};
type Root = {
  isolated: Session;
  proxy: Awaited<ReturnType<typeof browserProxy>>;
  tabs: Set<string>;
};

// All code executed inside a remote document is fixed application code. Arguments are CDP values.
const PAGE = `(() => {
  if (!globalThis.__tapkitGuard) {
    globalThis.__tapkitGuard = true;
    for (const type of ['click','dblclick','keydown','beforeinput','submit','paste','drop'])
      addEventListener(type, e => { if(e.isTrusted && !globalThis.__tapkitUser && !globalThis.__tapkitDispatch){e.preventDefault();e.stopImmediatePropagation();} },true);
  }
  const html=document.documentElement?.outerHTML||'';
  if(html.length>2000000)throw Error('OUTPUT_LIMIT_REACHED');
  return {html,text:(document.body?.innerText||'').slice(0,24000),selection:String(getSelection()||'').slice(0,8000),
    blocked:!!document.querySelector('input[type=password],iframe[src*="recaptcha"],iframe[src*="hcaptcha"],[data-sitekey]')};
})()`;
const NODES = `Array.from(document.querySelectorAll('a[href],button,input,textarea,select,[role],[contenteditable=true]')).filter(e=>e.getClientRects().length).slice(0,120)`;
const META = `function(){const label=this.labels?.[0]?.cloneNode(true);label?.querySelectorAll('input,select,textarea,button').forEach(e=>e.remove());const labelled=(this.getAttribute('aria-labelledby')||'').split(/\\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ').trim();return {role:this.getAttribute('role')||({A:'link',BUTTON:'button',SELECT:'combobox',TEXTAREA:'textbox',INPUT:'textbox'}[this.tagName]||'control'),name:(this.getAttribute('aria-label')||labelled||label?.textContent?.trim()||this.innerText||this.getAttribute('placeholder')||this.getAttribute('name')||'').slice(0,240),value:(this.type==='password'||this.type==='hidden'?'':String(this.value||'')).slice(0,4000),type:this.type||this.tagName.toLowerCase(),options:this.tagName==='SELECT'?Array.from(this.options).slice(0,50).map(o=>({value:o.value.slice(0,1000),label:o.label.slice(0,240)})):[]}}`;
const TARGET = `function(){
  const f=this.form; const secret=f&&f.querySelector('input[type=password],input[type=file]');
  const submitter=this.type==='submit';
  const fields=f?Array.from(new FormData(f,submitter?this:undefined).entries()).map(([name,value])=>[name,String(value).replace(/\\r?\\n/g,'\\r\\n')]):[];
  return {tag:this.tagName,type:this.type||'',href:this.href||'',download:this.hasAttribute('download'),disabled:!!this.disabled,
    form:f?{action:submitter&&this.hasAttribute('formaction')?this.formAction:f.action,method:(submitter&&this.hasAttribute('formmethod')?this.formMethod:f.method).toUpperCase(),enctype:submitter&&this.hasAttribute('formenctype')?this.formEnctype:f.enctype,target:submitter&&this.hasAttribute('formtarget')?this.formTarget:f.target,noValidate:f.noValidate||(submitter&&this.formNoValidate),fields,secret:!!secret,
      preview:fields.map(([name,value])=>{const element=Array.from(f.elements).find(e=>e.name===name),label=element?.labels?.[0]?.cloneNode(true);label?.querySelectorAll('input,select,textarea,button').forEach(e=>e.remove());return [(element?.getAttribute('aria-label')||label?.textContent?.trim()||name).slice(0,240),element?.type==='hidden'?'[隐藏字段]':value]})}:null};
}`;
const FILL = `function(value){
  if(!['INPUT','TEXTAREA'].includes(this.tagName)||['password','file','hidden','submit'].includes(this.type))throw Error('PERMISSION_DENIED');
  const proto=this.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(this,value);
  this.dispatchEvent(new Event('input',{bubbles:true}));this.dispatchEvent(new Event('change',{bubbles:true}));
}`;
const SELECT = `function(value){if(this.tagName!=='SELECT'||!Array.from(this.options).some(o=>o.value===value))throw Error('VALIDATION_ERROR');this.value=value;this.dispatchEvent(new Event('change',{bubbles:true}));}`;
const CLICK = `function(){this.click()}`;
const SUBMIT = `function(){if(!this.form)throw Error('PERMISSION_DENIED');globalThis.__tapkitDispatch=true;try{this.form.requestSubmit(this.type==='submit'?this:undefined)}finally{delete globalThis.__tapkitDispatch}}`;

export class BrowserRuntime {
  constructor(
    readonly windowForSlot: (slot: string) => BrowserWindow | null = (id) =>
      BrowserWindow.fromId(Number(id)),
  ) {}
  private roots = new Map<string, Root>();
  private tabs = new Map<string, Tab>();
  private openings = new Map<string, Promise<Root>>();
  private async root(id: string, proxyURL: string) {
    const existing = this.roots.get(id);
    if (existing) return existing;
    const pending = this.openings.get(id);
    if (pending) return pending;
    const create = (async () => {
      if (this.roots.size + this.openings.size >= 2) throw Error('QUOTA_EXCEEDED');
      const proxy = await browserProxy(proxyURL);
      const isolated = session.fromPartition('tapkit-browser-' + id + '-' + randomUUID(), {
        cache: false,
      });
      await isolated.setProxy({
        mode: 'fixed_servers',
        proxyRules: `http=127.0.0.1:${proxy.port};https=127.0.0.1:${proxy.port}`,
        proxyBypassRules: '<-loopback>',
      });
      isolated.setPermissionCheckHandler(() => false);
      isolated.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      isolated.on('will-download', (event, item, contents) => {
        event.preventDefault();
        const tab = [...this.tabs.values()].find((t) => t.view.webContents === contents);
        if (!tab) return;
        try {
          const url = publicUrl(item.getURL()).href;
          const name = item
            .getFilename()
            .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
            .slice(0, 120);
          tab.downloads = [...tab.downloads.filter((d) => d.url !== url), { url, name }].slice(-10);
        } catch {
          /* untrusted downloads are never written by Chromium */
        }
      });
      isolated.webRequest.onBeforeRequest((details, callback) => {
        let cancel = false;
        const tab = [...this.tabs.values()].find(
          (t) => t.view.webContents.id === details.webContentsId,
        );
        try {
          publicUrl(details.url);
          if (
            !tab ||
            !['mainFrame', 'subFrame', 'stylesheet', 'script', 'image', 'font', 'xhr'].includes(
              details.resourceType,
            )
          )
            throw Error();
          const p = tab.permit;
          const matches =
            p &&
            !p.consumed &&
            p.expires > Date.now() &&
            p.url === details.url &&
            p.method === details.method;
          if (matches) {
            const body = Buffer.concat(
              (details.uploadData ?? []).map((d) => d.bytes ?? Buffer.alloc(0)),
            ).toString('utf8');
            if ((details.uploadData ?? []).some((d) => d.file) || hash(body) !== p.body)
              throw Error();
            p.consumed = true;
            p.requestId = details.id;
          } else if (
            p &&
            tab.mode === 'agent' &&
            ['mainFrame', 'subFrame', 'xhr'].includes(details.resourceType)
          ) {
            const receiptRedirect =
              p.expires > Date.now() &&
              p.consumed &&
              details.id === p.requestId &&
              details.method === 'GET' &&
              new URL(details.url).origin === new URL(p.url).origin;
            if (!receiptRedirect) {
              p.failed = true;
              throw Error();
            }
          } else if (!['GET', 'HEAD'].includes(details.method) && tab.mode !== 'user')
            throw Error();
        } catch {
          cancel = true;
        }
        callback({ cancel });
      });
      isolated.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = { ...details.requestHeaders };
        for (const key of Object.keys(headers))
          if (/^(authorization|proxy-authorization|referer)$/i.test(key)) delete headers[key];
        callback({ requestHeaders: headers });
      });
      isolated.webRequest.onCompleted((details) => {
        for (const t of this.tabs.values())
          if (t.permit?.requestId === details.id) t.permit.status = details.statusCode;
      });
      isolated.webRequest.onErrorOccurred((details) => {
        for (const t of this.tabs.values())
          if (t.permit?.requestId === details.id) t.permit.failed = true;
      });
      const root = { isolated, proxy, tabs: new Set<string>() };
      this.roots.set(id, root);
      return root;
    })();
    this.openings.set(id, create);
    try {
      return await create;
    } finally {
      this.openings.delete(id);
    }
  }
  private tab(runId: string, rootRunId: string, id?: string) {
    const t = id ? this.tabs.get(id) : undefined;
    if (!t || t.rootRunId !== rootRunId || t.runId !== runId || t.view.webContents.isDestroyed())
      throw Error('NOT_FOUND');
    return t;
  }
  private async rpc(tab: Tab, method: string, params: Record<string, unknown> = {}) {
    return tab.view.webContents.debugger.sendCommand(method, params);
  }
  private async fn(tab: Tab, node: NodeHandle, functionDeclaration: string, value?: string) {
    const reply = await this.rpc(tab, 'Runtime.callFunctionOn', {
      objectId: node.objectId,
      functionDeclaration,
      arguments: value === undefined ? [] : [{ value }],
      returnByValue: true,
    });
    if (reply.exceptionDetails) throw Error('PERMISSION_DENIED');
    return reply.result?.value;
  }
  private async observe(tab: Tab): Promise<BrowserSnapshot> {
    const wc = tab.view.webContents;
    if (wc.isDestroyed()) throw Error('NOT_FOUND');
    for (const handle of tab.nodes.values())
      await this.rpc(tab, 'Runtime.releaseObject', { objectId: handle.objectId }).catch(() => {});
    const frameTree = await this.rpc(tab, 'Page.getFrameTree');
    const frames: string[] = [];
    const visit = (tree: { frame: { id: string }; childFrames?: (typeof tree)[] }) => {
      frames.push(tree.frame.id);
      for (const child of tree.childFrames ?? []) visit(child);
    };
    visit(frameTree.frameTree);
    if (frames.length > 12) throw Error('OUTPUT_LIMIT_REACHED');
    const nodes: BrowserSnapshot['nodes'] = [],
      handles = new Map<string, NodeHandle>();
    const parts: Array<{
      frame: string;
      html: string;
      text: string;
      selection: string;
      blocked: boolean;
    }> = [];
    for (const frameId of frames) {
      const world = await this.rpc(tab, 'Page.createIsolatedWorld', {
        frameId,
        worldName: 'tapkit-observer',
      });
      const contextId = world.executionContextId as number;
      await this.rpc(tab, 'Runtime.evaluate', {
        contextId,
        expression: 'globalThis.__tapkitUser=' + (tab.mode === 'user' ? 'true' : 'false'),
      });
      const page = await this.rpc(tab, 'Runtime.evaluate', {
        contextId,
        expression: PAGE,
        returnByValue: true,
      });
      if (page.exceptionDetails || !page.result?.value) throw Error('OUTPUT_LIMIT_REACHED');
      parts.push({ frame: frameId, ...page.result.value });
      const array = await this.rpc(tab, 'Runtime.evaluate', { contextId, expression: NODES });
      if (!array.result?.objectId) continue;
      const properties = await this.rpc(tab, 'Runtime.getProperties', {
        objectId: array.result.objectId,
        ownProperties: true,
      });
      for (const property of properties.result ?? []) {
        if (!/^\d+$/.test(property.name) || !property.value?.objectId || nodes.length >= 120)
          continue;
        const objectId = property.value.objectId as string;
        const described = await this.rpc(tab, 'DOM.describeNode', { objectId });
        const backendNodeId = described.node.backendNodeId as number;
        const handle = { objectId, contextId, backendNodeId, frameId };
        const meta = await this.fn(tab, handle, META);
        const id = frameId + ':' + backendNodeId;
        nodes.push({ id, backendNodeId, frameId, ...meta });
        handles.set(id, handle);
      }
      await this.rpc(tab, 'Runtime.releaseObject', { objectId: array.result.objectId });
    }
    const revision = hash({
      epoch: tab.epoch,
      url: wc.getURL(),
      parts,
      nodes,
      mode: tab.mode,
      downloads: tab.downloads,
    });
    let truncated = nodes.length >= 120 || parts.some((p) => p.text.length >= 24000);
    while (Buffer.byteLength(JSON.stringify(nodes)) > 30000) {
      nodes.pop();
      truncated = true;
    }
    const snapshot = BrowserSnapshotSchema.parse({
      id: tab.last?.revision === revision ? tab.last.id : browserId(),
      tabId: tab.id,
      url: publicUrl(wc.getURL()).href,
      title: wc.getTitle().slice(0, 500),
      navigationEpoch: tab.epoch,
      revision,
      text: boundedText(
        parts
          .map((p) => p.text)
          .join('\n')
          .slice(0, 24000),
        20000,
      ),
      selection: boundedText(
        parts
          .map((p) => p.selection)
          .filter(Boolean)
          .join('\n')
          .slice(0, 8000),
        6000,
      ),
      nodes,
      truncated,
      downloads: tab.downloads,
      mode: tab.mode,
      blocked: parts.some((p) => p.blocked) ? 'LOGIN_OR_CAPTCHA' : null,
    });
    if (snapshot.text.length < parts.map((p) => p.text).join('\n').length)
      snapshot.truncated = true;
    while (Buffer.byteLength(JSON.stringify(snapshot)) > 64000 && snapshot.nodes.length) {
      snapshot.nodes.pop();
      snapshot.truncated = true;
    }
    if (Buffer.byteLength(JSON.stringify(snapshot)) > 64000) throw Error('OUTPUT_LIMIT_REACHED');
    const exposed = new Set(snapshot.nodes.map((node) => node.id));
    for (const [id, handle] of handles)
      if (!exposed.has(id)) {
        await this.rpc(tab, 'Runtime.releaseObject', { objectId: handle.objectId }).catch(() => {});
        handles.delete(id);
      }
    tab.last = snapshot;
    tab.nodes = handles;
    return snapshot;
  }
  private async prepare(tab: Tab, action: BrowserAction) {
    const previous = tab.last;
    if (!previous || previous.id !== action.snapshotId) throw Error('APPROVAL_STALE');
    const snapshot = await this.observe(tab);
    if (snapshot.id !== action.snapshotId || snapshot.revision !== previous.revision)
      throw Error('APPROVAL_STALE');
    if (tab.mode !== 'agent') throw Error('PERMISSION_DENIED');
    let classification: BrowserPrepared['classification'] = 'read',
      target = snapshot.url;
    let preview: string = action.action;
    let form:
      | {
          action: string;
          method: string;
          fields: string[][];
          preview: string[][];
          secret: boolean;
          enctype: string;
          target: string;
        }
      | undefined;
    const handle = action.nodeId ? tab.nodes.get(action.nodeId) : undefined;
    if (['click', 'fill', 'select', 'press'].includes(action.action)) {
      if (!handle) throw Error('APPROVAL_STALE');
      const meta = await this.fn(tab, handle, TARGET);
      if (meta.disabled) throw Error('PERMISSION_DENIED');
      if (action.action === 'click' || (action.action === 'press' && action.value === 'Enter')) {
        if (meta.form && (meta.type === 'submit' || action.action === 'press')) {
          form = meta.form;
          if (
            !form ||
            form.secret ||
            !['', '_self'].includes(form.target) ||
            form.enctype !== 'application/x-www-form-urlencoded' ||
            !['GET', 'POST'].includes(form.method)
          )
            classification = 'takeover';
          else {
            classification = 'submit';
            target = publicUrl(form.action).href;
            preview = JSON.stringify({ method: form.method, target, fields: form.preview });
          }
        } else if (
          meta.tag === 'A' &&
          meta.href &&
          !/删除|发送|提交|购买|下单|支付|delete|remove|send|submit|purchase|checkout|buy|pay|logout/i.test(
            meta.href + ' ' + snapshot.nodes.find((n) => n.id === action.nodeId)?.name,
          )
        )
          target = publicUrl(meta.href).href;
        else classification = 'takeover';
      }
      if (action.action === 'press' && !['Enter', 'Tab', 'Escape'].includes(action.value ?? ''))
        throw Error('VALIDATION_ERROR');
      if (['password', 'file', 'hidden'].includes(meta.type)) classification = 'takeover';
    } else if (action.action === 'navigate') target = publicUrl(action.url ?? '').href;
    if (snapshot.blocked) classification = 'takeover';
    return {
      prepared: {
        snapshot,
        classification,
        target,
        preview,
        binding: hash({ revision: snapshot.revision, action, form, classification, target }),
      } satisfies BrowserPrepared,
      handle,
      form,
    };
  }
  private async open(p: BrowserHostRequest) {
    const url = publicUrl(p.url ?? '').href;
    await new NetworkPolicyService().destination(url, AbortSignal.timeout(10000));
    const root = await this.root(p.rootRunId, p.proxyURL ?? '');
    if (root.tabs.size >= 8) throw Error('QUOTA_EXCEEDED');
    const view = new WebContentsView({
      webPreferences: {
        session: root.isolated,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        navigateOnDragDrop: false,
        safeDialogs: true,
      },
    });
    view.setBounds({ x: 0, y: 0, width: 1000, height: 600 });
    const tab: Tab = {
      id: browserId(),
      runId: p.runId,
      rootRunId: p.rootRunId,
      view,
      mode: 'agent',
      epoch: 0,
      nodes: new Map(),
      downloads: [],
      busy: false,
    };
    this.tabs.set(tab.id, tab);
    root.tabs.add(tab.id);
    const wc = view.webContents;
    wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    wc.setWindowOpenHandler(({ url: popup }) => {
      // A popup is never opened implicitly. The destination can be opened as a new reviewed tab.
      if (tab.last) tab.last = { ...tab.last, blocked: 'POPUP_BLOCKED' };
      try {
        publicUrl(popup);
      } catch {
        /* never execute a custom protocol */
      }
      return { action: 'deny' };
    });
    wc.on('will-attach-webview', (event) => event.preventDefault());
    wc.on('will-navigate', (event) => {
      try {
        publicUrl(event.url);
      } catch {
        event.preventDefault();
      }
    });
    let redirects = 0;
    wc.on('will-redirect', (event) => {
      try {
        publicUrl(event.url);
        if (++redirects > 5) event.preventDefault();
      } catch {
        event.preventDefault();
      }
    });
    wc.on('did-start-navigation', (event) => {
      if (event.isMainFrame) {
        tab.epoch++;
        tab.nodes.clear();
      }
    });
    wc.on('login', (event, _details, auth, callback) => {
      event.preventDefault();
      if (auth.isProxy && auth.port === root.proxy.port) {
        const [, value] = root.proxy.authorization.split(' ');
        const password = Buffer.from(value!, 'base64').toString().slice('tapkit:'.length);
        callback('tapkit', password);
      } else callback();
    });
    try {
      await Promise.race([
        wc.loadURL(url),
        pause(18000).then(() => {
          throw Error('NETWORK_ERROR');
        }),
      ]);
      wc.debugger.attach('1.3');
      await this.rpc(tab, 'DOM.enable');
      await this.rpc(tab, 'Page.enable');
      return await this.observe(tab);
    } catch (error) {
      await this.close(tab);
      throw error;
    }
  }
  private async close(tab: Tab) {
    if (tab.window && !tab.window.isDestroyed()) tab.window.contentView.removeChildView(tab.view);
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    this.tabs.delete(tab.id);
    const root = this.roots.get(tab.rootRunId);
    root?.tabs.delete(tab.id);
    if (root && !root.tabs.size) {
      this.roots.delete(tab.rootRunId);
      root.proxy.close();
      await root.isolated.clearStorageData();
      await root.isolated.clearCache();
      await root.isolated.closeAllConnections();
    }
  }
  async disposeAll() {
    for (const tab of [...this.tabs.values()]) await this.close(tab);
  }
  async command(raw: unknown): Promise<unknown> {
    const p = BrowserHostRequestSchema.parse(raw);
    if (p.op === 'open') return this.open(p);
    if (p.op === 'dispose') {
      for (const t of [...this.tabs.values()]) if (t.rootRunId === p.rootRunId) await this.close(t);
      return true;
    }
    const tab = this.tab(p.runId, p.rootRunId, p.tabId);
    if (p.op === 'control') {
      // Set the lock synchronously, before waiting for CDP or a navigation.
      tab.mode = p.mode ?? 'user';
      tab.epoch++;
      delete tab.last;
      return this.observe(tab);
    }
    if (p.op === 'close') {
      await this.close(tab);
      return true;
    }
    if (p.op === 'external') {
      await shell.openExternal(publicUrl(tab.view.webContents.getURL()).href);
      return true;
    }
    if (p.op === 'present') {
      const window = p.windowId ? this.windowForSlot(p.windowId) : null;
      if (!window || window.isDestroyed() || !p.bounds) throw Error('PERMISSION_DENIED');
      if (tab.window && !tab.window.isDestroyed()) tab.window.contentView.removeChildView(tab.view);
      if (!p.visible) {
        delete tab.window;
        return true;
      }
      const area = window.getContentBounds();
      const b = p.bounds;
      if (b.x + b.width > area.width || b.y + b.height > area.height)
        throw Error('VALIDATION_ERROR');
      window.contentView.addChildView(tab.view);
      tab.window = window;
      tab.view.setBounds(b);
      tab.view.setVisible(true);
      return true;
    }
    if (tab.busy) throw Error('CONFLICT');
    tab.busy = true;
    try {
      if (p.op === 'observe') return await this.observe(tab);
      const action = BrowserActionSchema.parse(p.action);
      const { prepared, handle, form } = await this.prepare(tab, action);
      if (p.op === 'prepare') return prepared;
      if (p.binding !== prepared.binding) throw Error('APPROVAL_STALE');
      if (prepared.classification === 'takeover') {
        tab.mode = 'user';
        tab.epoch++;
        return { state: 'takeover', snapshot: await this.observe(tab) };
      }
      if (tab.mode !== 'agent') throw Error('PERMISSION_DENIED');
      if (prepared.classification === 'submit') {
        if (!p.approved || !form || !handle) throw Error('PERMISSION_DENIED');
        const encoded = new URLSearchParams(form.fields as [string, string][]).toString();
        const target = new URL(form.action);
        if (form.method === 'GET') target.search = encoded;
        tab.permit = {
          url: target.href,
          method: form.method,
          body: hash(form.method === 'GET' ? '' : encoded),
          consumed: false,
          expires: Date.now() + 15000,
        };
        await this.fn(tab, handle, SUBMIT).catch(() => {});
      } else if (action.action === 'navigate') await tab.view.webContents.loadURL(prepared.target);
      else if (action.action === 'back' || action.action === 'forward') {
        const history = tab.view.webContents.navigationHistory;
        if (action.action === 'back' && history.canGoBack()) history.goBack();
        else if (action.action === 'forward' && history.canGoForward()) history.goForward();
        else throw Error('VALIDATION_ERROR');
      } else if (action.action === 'reload') tab.view.webContents.reload();
      else if (handle) {
        if (action.action === 'fill') await this.fn(tab, handle, FILL, action.value ?? '');
        else if (action.action === 'select') await this.fn(tab, handle, SELECT, action.value ?? '');
        else if (action.action === 'press') {
          if (action.value === 'Tab') await this.fn(tab, handle, `function(){this.focus()}`);
          else if (action.value === 'Escape') await this.fn(tab, handle, `function(){this.blur()}`);
          else await this.fn(tab, handle, CLICK);
        } else await this.fn(tab, handle, CLICK);
      }
      const deadline = Date.now() + (prepared.classification === 'submit' ? 6000 : 3000);
      let snapshot: BrowserSnapshot | undefined;
      do {
        await pause(150);
        if (tab.mode !== 'agent') throw Error('CANCELLED');
        if (tab.view.webContents.isLoadingMainFrame()) continue;
        try {
          snapshot = await this.observe(tab);
        } catch {
          /* document may be between navigation contexts */
        }
        if (
          snapshot &&
          (prepared.classification !== 'submit' || tab.permit?.status || tab.permit?.failed)
        )
          break;
      } while (Date.now() < deadline);
      snapshot ??= tab.last;
      if (!snapshot) throw Error('WEB_UNAVAILABLE');
      if (prepared.classification === 'submit') {
        const permit = tab.permit;
        const verified =
          permit?.consumed &&
          !permit.failed &&
          permit.status &&
          permit.status >= 200 &&
          permit.status < 400 &&
          snapshot.revision !== prepared.snapshot.revision;
        delete tab.permit;
        return { state: verified ? 'submitted' : 'unknown', snapshot };
      }
      return { state: 'acted', snapshot };
    } finally {
      tab.busy = false;
    }
  }
}
