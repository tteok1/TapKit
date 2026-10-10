import {
  clipboard,
  app,
  BrowserWindow,
  ipcMain,
  utilityProcess,
  Tray,
  Menu,
  nativeImage,
  dialog,
  protocol,
  shell,
  type UtilityProcess,
  type IpcMainInvokeEvent,
} from 'electron';
import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  appendFileSync,
  statSync,
  renameSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  z,
  CoreEventSchema,
  RequestSchema,
  ReplySchema,
  PingRequestSchema,
  SaveApiKeySchema,
  ReplaySchema,
  EventEnvelopeSchema,
  HISTORY_COMMANDS,
  FileCommandSchemas,
  ArtifactCommandSchemas,
  ArtifactAssetSchema,
  ArtifactAccessSchema,
  FileGetSchema,
  IdSchema,
  type Reply,
  type EventEnvelope,
} from '@tapkit/contracts';
import { VaultService, VaultError } from './vault';
import { trustedSender } from './security';
import { AuthSecrets } from './auth/secrets';
import strings from './zh-CN.json';
import { avatarDimensions, readAvatarFile } from './avatar';
import { ArtifactProtocol } from './artifact-protocol';
import { ExternalArtifact } from './external-artifact';
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'tapkit-artifact',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);
app.setName('TapKit');
app.setAppUserModelId('io.tapkit.desktop');
if (!app.isPackaged && process.env.TAPKIT_DATA_DIR) {
  if (!isAbsolute(process.env.TAPKIT_DATA_DIR)) throw new Error('TAPKIT_DATA_DIR must be absolute');
  mkdirSync(process.env.TAPKIT_DATA_DIR, { recursive: true });
  app.setPath('userData', process.env.TAPKIT_DATA_DIR);
}
const dataDir = app.getPath('userData');
const ownsLock = app.requestSingleInstanceLock({ intent: 'activate' });
if (!ownsLock) app.quit();
const windows = new Set<BrowserWindow>();
let core: UtilityProcess | undefined,
  quitting = false,
  shutdownComplete = false,
  tray: Tray | undefined;
let storageUnavailable = false;
let generation = 0,
  failures = 0;
type Waiter = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
const pending = new Map<string, Waiter>();
let ready = Promise.resolve();
const rendererFile = join(__dirname, '../renderer/index.html');
const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
const trustedUrl = devUrl ? new URL(devUrl).href : pathToFileURL(rendererFile).href;
const vault = new VaultService(join(dataDir, 'secrets'));
const authSecrets = new AuthSecrets(join(dataDir, 'secrets'));
let secretWork: Promise<unknown> = Promise.resolve();
function serializeSecrets<T>(work: () => Promise<T>) {
  const result = secretWork.then(work);
  secretWork = result.catch(() => {});
  return result;
}
const subscribers = new Map<
  number,
  { afterSeq: number; replaying: boolean; buffer: EventEnvelope[] }
>();
function errorReply(
  requestId: string,
  code:
    | 'VALIDATION_ERROR'
    | 'PERMISSION_DENIED'
    | 'FEATURE_NOT_AVAILABLE'
    | 'AUTH_REQUIRED'
    | 'CONFLICT'
    | 'INTERNAL_ERROR'
    | 'DATABASE_RECOVERY_REQUIRED',
): Reply {
  return ReplySchema.parse({
    ok: false,
    requestId,
    error: {
      code,
      message: strings.requestFailed,
      retryable: false,
      recoveryActions: [],
      traceId: randomUUID(),
    },
  });
}
function forward(command: Record<string, unknown>): Promise<unknown> {
  const child = core;
  if (!child || quitting) return Promise.reject(new Error('Core unavailable'));
  return new Promise((resolve, reject) => {
    const id = randomUUID(),
      timer = setTimeout(
        () => {
          pending.delete(id);
          reject(new Error('Core timeout'));
        },
        (command.request as { command?: string } | undefined)?.command === 'models.diagnostic'
          ? 310_000
          : (command.request as { command?: string } | undefined)?.command === 'providers.check'
            ? 130_000
            : command.type === 'files.export' ||
                command.type === 'artifacts.read' ||
                (command.request as { command?: string } | undefined)?.command ===
                  'artifacts.open' ||
                (command.request as { command?: string } | undefined)?.command ===
                  'artifacts.locate' ||
                (command.request as { command?: string } | undefined)?.command === 'files.import'
              ? 130_000
              : 30_000,
      );
    pending.set(id, { resolve, reject, timer });
    child.postMessage({ ...command, id });
  });
}
function publish(event: EventEnvelope) {
  for (const window of windows) {
    const subscription = subscribers.get(window.webContents.id);
    if (subscription && event.seq > subscription.afterSeq && !window.isDestroyed()) {
      if (subscription.replaying) {
        subscription.buffer.push(event);
        continue;
      }
      // Forward only validated EntityView envelopes, never raw DB rows.
      window.webContents.send('tapkit:event', event);
      subscription.afterSeq = event.seq;
    }
  }
}
function startCore() {
  let resolveReady: () => void = () => {},
    rejectReady: (error: Error) => void = () => {};
  ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  void ready.catch(() => {});
  const current = ++generation;
  const child = utilityProcess.fork(
    join(__dirname, '../../../../packages/core/dist/index.cjs'),
    [],
    {
      serviceName: 'TapKit Core',
      stdio: 'pipe',
      env: {
        ...process.env,
        TAPKIT_CORE_DATA_DIR: dataDir,
        TAPKIT_APP_ROOT: join(__dirname, '../../../..'),
      },
    },
  );
  core = child;
  const timer = setTimeout(() => {
    rejectReady(new Error('Core startup timeout'));
    child.kill();
  }, 15_000);
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => console.error('TAPKIT_CORE_DIAGNOSTIC'));
  child.on('message', (raw: unknown) => {
    const parsed = CoreEventSchema.safeParse(raw);
    if (!parsed.success || generation !== current) return;
    const message = parsed.data;
    if (message.type === 'vault.request') {
      void serializeSecrets(() =>
        authSecrets.invoke(message.operation, message.accountId, message.payload),
      ).then(
        (value) => {
          if (core === child)
            child.postMessage({ type: 'vault.reply', id: message.id, ok: true, value });
        },
        (error) => {
          if (core === child)
            child.postMessage({
              type: 'vault.reply',
              id: message.id,
              ok: false,
              value: error instanceof VaultError ? error.code : 'AUTH_REQUIRED',
            });
        },
      );
      return;
    }
    if (message.type === 'unavailable') {
      storageUnavailable = true;
      clearTimeout(timer);
      rejectReady(new Error(message.code));
      return;
    }
    if (message.type === 'ready') {
      clearTimeout(timer);
      resolveReady();
      console.info('TAPKIT_CORE_READY');
      // Replay after Core replacement; pending outbox delivery may legitimately duplicate.
      for (const [webContentsId, subscription] of subscribers) {
        const window = [...windows].find((w) => w.webContents.id === webContentsId);
        if (window) void replayTo(window, subscription.afterSeq);
      }
    } else if (message.type === 'event') publish(message.event);
    else {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      clearTimeout(waiter.timer);
      pending.delete(message.id);
      waiter.resolve(message.type === 'pong' ? message.payload : message.reply);
      if (message.type === 'pong') console.info('TAPKIT_CORE_PONG');
    }
  });
  child.on('exit', (code) => {
    clearTimeout(timer);
    rejectReady(new Error('Core exited'));
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Core unavailable'));
    }
    pending.clear();
    if (core === child) core = undefined;
    console.info('TAPKIT_CORE_EXIT', code);
    if (!quitting && !storageUnavailable && ++failures <= 3) setTimeout(startCore, 250);
  });
}
async function replayTo(window: BrowserWindow, afterSeq: number) {
  const subscription = subscribers.get(window.webContents.id);
  if (!subscription || subscription.replaying) return false;
  subscription.replaying = true;
  try {
    await ready;
    let cursor = afterSeq;
    for (;;) {
      const reply = ReplySchema.parse(
        await forward({
          type: 'request',
          request: {
            protocolVersion: 1,
            requestId: uuid7(),
            command: 'events.replay',
            payload: { streamId: 'profile', afterSeq: cursor, limit: 100 },
          },
        }),
      );
      if (!reply.ok || !('items' in reply.data)) throw new Error('Replay unavailable');
      for (const rawEvent of reply.data.items) {
        const event = EventEnvelopeSchema.parse(rawEvent);
        if (!window.isDestroyed() && event.seq > subscription.afterSeq) {
          window.webContents.send('tapkit:event', event);
          subscription.afterSeq = event.seq;
        }
        cursor = event.seq;
      }
      if (!reply.data.nextCursor) break;
    }
    for (const event of subscription.buffer.sort((a, b) => a.seq - b.seq)) {
      if (!window.isDestroyed() && event.seq > subscription.afterSeq) {
        window.webContents.send('tapkit:event', event);
        subscription.afterSeq = event.seq;
      }
    }
    subscription.buffer = [];
    return true;
  } catch {
    return false;
    /* Keep lastSeq; the next Core generation replays persisted events. */
  } finally {
    subscription.replaying = false;
  }
}
function uuid7() {
  // Request IDs are public metadata. Business entity IDs are generated by Core.
  const random = randomUUID().replaceAll('-', '');
  const time = Date.now().toString(16).padStart(12, '0');
  return (
    time.slice(0, 8) +
    '-' +
    time.slice(8) +
    '-7' +
    random.slice(13, 16) +
    '-' +
    random.slice(16, 20) +
    '-' +
    random.slice(20)
  );
}
let nextWindowSlot = 0;
const windowSlots = new Map<number, string>();
const artifactProtocols = new Map<number, ArtifactProtocol>();
function createWindow(initialRoute?: string) {
  const slot = nextWindowSlot++;
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'TapKit',
    backgroundColor: '#f7f8fa',
    show: false,
    webPreferences: {
      partition: 'persist:tapkit-app-' + slot,
      preload: join(__dirname, '../preload/index.js'),
      additionalArguments: [
        '--tapkit-window-slot=' + slot,
        ...(initialRoute ? ['--tapkit-initial-route=' + initialRoute] : []),
      ],
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });
  windows.add(window);
  const assets = new ArtifactProtocol(
    async (asset) => {
      await ready;
      const reply = ReplySchema.parse(
        await forward({
          type: 'artifacts.read',
          requestId: uuid7(),
          windowId: String(slot),
          asset,
        }),
      );
      if (!reply.ok || !('artifactBytes' in reply.data)) throw new Error('PERMISSION_DENIED');
      return reply.data.artifactBytes;
    },
    () => !window.isDestroyed() && windows.has(window),
    process.env.ELECTRON_RENDERER_URL
      ? new URL(process.env.ELECTRON_RENDERER_URL).origin
      : 'file://',
  );
  artifactProtocols.set(window.webContents.id, assets);
  window.webContents.session.protocol.handle('tapkit-artifact', (request) =>
    assets.handle(request),
  );
  window.webContents.session.setPermissionRequestHandler((_w, _p, callback) => callback(false));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== trustedUrl) event.preventDefault();
  });
  const webContentsId = window.webContents.id;
  windowSlots.set(webContentsId, String(slot));
  window.on('closed', () => {
    assets.close();
    artifactProtocols.delete(webContentsId);
    core?.postMessage({ type: 'window.closed', windowId: String(slot) });
    windowSlots.delete(webContentsId);
    windows.delete(window);
    subscribers.delete(webContentsId);
  });
  window.once('ready-to-show', () => {
    window.show();
    console.info('TAPKIT_HOST_WINDOW', process.pid);
  });
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(rendererFile);
  return window;
}
function checkSender(event: IpcMainInvokeEvent) {
  return trustedSender(event, windows, trustedUrl);
}
function audit(requestId: string, command: string, reply: Reply) {
  // Deliberately records no payload, account label, ciphertext, plaintext or stack.
  mkdirSync(join(dataDir, 'logs'), { recursive: true });
  const log = join(dataDir, 'logs/ipc.jsonl');
  try {
    if (statSync(log).size > 1_048_576)
      renameSync(log, join(dataDir, 'logs', 'ipc-' + Date.now() + '.jsonl'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  for (const name of readdirSync(join(dataDir, 'logs'))) {
    const match = /^ipc-(\d+)\.jsonl$/.exec(name);
    if (match && Number(match[1]) < Date.now() - 14 * 86_400_000)
      unlinkSync(join(dataDir, 'logs', name));
  }
  appendFileSync(
    log,
    JSON.stringify({
      requestId,
      command,
      ok: reply.ok,
      ...(reply.ok ? {} : { code: reply.error.code }),
    }) + '\n',
  );
}
if (ownsLock) {
  app.on('second-instance', () => {
    const window = [...windows][0] ?? createWindow();
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    console.info('TAPKIT_SECOND_INSTANCE');
  });
  void app.whenReady().then(() => {
    startCore();
    ipcMain.handle('tapkit:ping', async (event, raw: unknown) => {
      if (!checkSender(event)) throw new Error('Untrusted IPC sender');
      const payload = PingRequestSchema.parse(raw);
      await ready;
      return forward({ type: 'ping', payload });
    });
    const allowed = new Set([
      ...HISTORY_COMMANDS,
      ...Object.keys(FileCommandSchemas),
      ...Object.keys(ArtifactCommandSchemas),
      'models.catalog',
      'models.preferences.get',
      'models.preferences.set',
      'models.preview',
      'models.diagnostic',
      'models.cancel',
      'usage.list',
      'app.bootstrap',
      'settings.get',
      'settings.set',
      'providers.saveApiKey',
      'providers.list',
      'providers.startLogin',
      'providers.loginStatus',
      'providers.answerLogin',
      'providers.cancelLogin',
      'providers.check',
      'providers.disconnect',
      'events.replay',
      'events.subscribe',
      'data.backup',
      'jobs.cancel',
      'desktop.workspace',
      'sessions.create',
      'sessions.pin',
      'projects.create',
      'messages.send',
      'messages.list',
      'messages.read',
      'drafts.get',
      'drafts.save',
      'inputs.list',
      'inputs.update',
      'inputs.cancel',
      'inputs.attach',
      'inputs.references',
      'runs.cancel',
      'chat.snippets.get',
      'chat.snippets.set',
    ]);
    ipcMain.handle('tapkit:new-window', (event) => {
      if (!checkSender(event)) throw new Error('PERMISSION_DENIED');
      createWindow();
    });
    ipcMain.handle('tapkit:open-entity', async (event, raw: unknown) => {
      if (!checkSender(event)) throw new Error('PERMISSION_DENIED');
      const entity = z
        .strictObject({ type: z.enum(['session', 'project']), id: IdSchema })
        .parse(raw);
      await ready;
      const reply = ReplySchema.parse(
        await forward({
          type: 'request',
          request: {
            protocolVersion: 1,
            requestId: uuid7(),
            command: entity.type === 'session' ? 'sessions.get' : 'search.locate',
            payload:
              entity.type === 'session'
                ? { sessionId: entity.id }
                : { type: 'project', id: entity.id },
          },
        }),
      );
      if (!reply.ok) throw new Error(reply.error.code);
      createWindow('/' + (entity.type === 'session' ? 'sessions' : 'projects') + '/' + entity.id);
    });
    ipcMain.handle('tapkit:open-public-link', async (event, raw: unknown) => {
      if (!checkSender(event)) throw new Error('PERMISSION_DENIED');
      const value = z.string().max(4096).parse(raw),
        url = new URL(value);
      if (!['https:', 'http:', 'mailto:'].includes(url.protocol) || url.username || url.password)
        throw new Error('PERMISSION_DENIED');
      await shell.openExternal(url.href);
    });
    ipcMain.handle('tapkit:save-conversation', async (event, raw: unknown) => {
      if (!checkSender(event)) throw new Error('PERMISSION_DENIED');
      const value = z
        .strictObject({ name: z.string().min(1).max(240), text: z.string().max(3_000_000) })
        .parse(raw);
      const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!, {
        defaultPath: value.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_'),
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (result.canceled || !result.filePath) return false;
      writeFileSync(result.filePath, value.text, { encoding: 'utf8', flag: 'wx' });
      return true;
    });
    ipcMain.handle('tapkit:choose-directory', async (event) => {
      if (!checkSender(event)) throw new Error('PERMISSION_DENIED');
      const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, {
        properties: ['openDirectory'],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    });
    async function grantFiles(event: IpcMainInvokeEvent, paths: string[], folder: boolean) {
      if (!checkSender(event)) throw new Error('PERMISSION_DENIED');
      const windowId = windowSlots.get(event.sender.id)!;
      await ready;
      if (!checkSender(event) || windowSlots.get(event.sender.id) !== windowId)
        throw new Error('PERMISSION_DENIED');
      return ReplySchema.parse(
        await forward({ type: 'files.select', requestId: uuid7(), windowId, paths, folder }),
      );
    }
    ipcMain.handle('tapkit:choose-files', async (event, raw: unknown) => {
      if (!checkSender(event)) throw new Error('PERMISSION_DENIED');
      const folder = z.boolean().parse(raw);
      const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, {
        properties: folder ? ['openDirectory'] : ['openFile', 'multiSelections'],
      });
      if (result.canceled || !result.filePaths.length)
        return ReplySchema.parse({ ok: true, requestId: uuid7(), data: { selections: [] } });
      return grantFiles(event, result.filePaths, folder);
    });
    ipcMain.handle('tapkit:artifact-url', async (event, raw: unknown) => {
      if (!checkSender(event)) throw new Error('PERMISSION_DENIED');
      const asset = ArtifactAssetSchema.parse(raw),
        windowId = windowSlots.get(event.sender.id)!;
      await ready;
      const reply = ReplySchema.parse(
        await forward({
          type: 'request',
          request: {
            protocolVersion: 1,
            requestId: uuid7(),
            command: 'files.get',
            payload: {
              fileId: asset.fileId,
              versionId: asset.versionId,
              ...(asset.owner ? { owner: asset.owner } : {}),
            },
            windowId,
          },
        }),
      );
      if (
        !reply.ok ||
        !('file' in reply.data) ||
        !checkSender(event) ||
        windowSlots.get(event.sender.id) !== windowId
      )
        throw new Error('PERMISSION_DENIED');
      if (asset.kind === 'preview' && reply.data.file.version.previewStatus !== 'ready')
        throw new Error('CONFLICT');
      const handler = artifactProtocols.get(event.sender.id);
      if (!handler) throw new Error('PERMISSION_DENIED');
      return handler.grant(asset);
    });
    ipcMain.handle('tapkit:open-artifact-external', async (event, raw: unknown) => {
      if (!checkSender(event)) throw new Error('PERMISSION_DENIED');
      const access = ArtifactAccessSchema.parse(raw),
        windowId = windowSlots.get(event.sender.id)!;
      await ready;
      const external = new ExternalArtifact(
        dataDir,
        async (file) => {
          const reply = ReplySchema.parse(
            await forward({
              type: 'request',
              request: {
                protocolVersion: 1,
                requestId: uuid7(),
                command: 'files.get',
                payload: file,
                windowId,
              },
            }),
          );
          if (!reply.ok) throw new Error(reply.error.code);
          if (!('file' in reply.data)) throw new Error('VALIDATION_ERROR');
          return reply.data.file;
        },
        async (file, targetPath) => {
          const reply = ReplySchema.parse(
            await forward({ type: 'files.export', requestId: uuid7(), windowId, file, targetPath }),
          );
          if (!reply.ok) throw new Error(reply.error.code);
        },
        (path) => shell.openPath(path),
        () => checkSender(event) && windowSlots.get(event.sender.id) === windowId,
      );
      await external.recover();
      await external.open(access);
    });
    ipcMain.handle('tapkit:copy-text', (event, raw: unknown) => {
      if (!checkSender(event)) throw new Error('PERMISSION_DENIED');
      clipboard.writeText(z.string().max(100000).parse(raw));
    });
    ipcMain.handle('tapkit:save-original', async (event, raw: unknown) => {
      if (!checkSender(event)) throw new Error('PERMISSION_DENIED');
      const file = FileGetSchema.parse(raw),
        requestId = uuid7();
      await ready;
      const metadata = ReplySchema.parse(
        await forward({
          type: 'request',
          request: {
            protocolVersion: 1,
            requestId,
            command: 'files.get',
            payload: file,
            windowId: windowSlots.get(event.sender.id)!,
          },
        }),
      );
      if (!metadata.ok) return metadata;
      if (!('file' in metadata.data)) throw new Error('VALIDATION_ERROR');
      const pinned = { ...file, versionId: metadata.data.file.version.id };
      const selected = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!, {
        defaultPath: metadata.data.file.version.name,
      });
      if (selected.canceled || !selected.filePath)
        return ReplySchema.parse({ ok: true, requestId, data: { changedIds: [] } });
      if (!checkSender(event)) throw new Error('PERMISSION_DENIED');
      return ReplySchema.parse(
        await forward({
          type: 'files.export',
          requestId: uuid7(),
          windowId: windowSlots.get(event.sender.id)!,
          file: pinned,
          targetPath: selected.filePath,
        }),
      );
    });
    ipcMain.handle('tapkit:select-dropped-files', async (event, raw: unknown) => {
      if (!checkSender(event)) throw new Error('PERMISSION_DENIED');
      const paths = z.array(z.string().min(1).max(32767)).min(1).max(20).parse(raw);
      return grantFiles(event, paths, false);
    });
    ipcMain.handle('tapkit:choose-avatar', async (event) => {
      if (!checkSender(event)) throw new Error('PERMISSION_DENIED');
      const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, {
        properties: ['openFile'],
        filters: [{ name: '头像', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      });
      const path = result.filePaths[0];
      if (result.canceled || !path) return null;
      try {
        const bytes = readAvatarFile(path);
        avatarDimensions(bytes);
        // NativeImage supports PNG/JPEG. WebP is decoded in the isolated
        // preload through Chromium and returned as a bounded static PNG.
        if (bytes.toString('ascii', 0, 4) === 'RIFF')
          return 'data:image/webp;base64,' + bytes.toString('base64');
        const image = nativeImage.createFromBuffer(bytes),
          size = image.getSize();
        if (image.isEmpty() || size.width > 4096 || size.height > 4096)
          throw new Error('头像无法解码');
        const thumbnail = image.resize({ width: 96, height: 96, quality: 'good' }).toDataURL();
        if (thumbnail.length > 65536) throw new Error('头像缩略图过大');
        return thumbnail;
      } catch {
        throw new Error('AVATAR_INVALID');
      }
    });
    ipcMain.handle('tapkit:request', async (event, raw: unknown) => {
      if (!checkSender(event)) return errorReply('', 'PERMISSION_DENIED');
      const parsed = RequestSchema.safeParse(raw);
      if (!parsed.success) return errorReply('', 'VALIDATION_ERROR');
      const request = parsed.data;
      request.windowId = windowSlots.get(event.sender.id)!;
      if (!allowed.has(request.command))
        return errorReply(request.requestId, 'FEATURE_NOT_AVAILABLE');
      let reply: Reply;
      try {
        if (request.command === 'providers.saveApiKey') {
          const secret = SaveApiKeySchema.parse(request.payload);
          await serializeSecrets(() => vault.save(request.requestId, secret));
          request.payload = {
            ...secret,
            providerId: secret.providerId,
            label: secret.label,
            credentialId: request.requestId,
            credentialHint: secret.key.slice(-4),
          };
          delete (request.payload as Record<string, unknown>).key;
          secret.key = ''; // Only the transformed request enters Core or audit.
        }
        await ready;
        if (request.command === 'events.subscribe') {
          const p = ReplaySchema.parse(request.payload);
          subscribers.set(event.sender.id, { afterSeq: p.afterSeq, replaying: false, buffer: [] });
          const window = [...windows].find((w) => w.webContents === event.sender)!;
          if (!(await replayTo(window, p.afterSeq))) throw new Error('Replay unavailable');
          reply = ReplySchema.parse({
            ok: true,
            requestId: request.requestId,
            data: { subscriptionId: request.requestId },
          });
        } else reply = ReplySchema.parse(await forward({ type: 'request', request }));
      } catch (error) {
        reply = errorReply(
          request.requestId,
          error instanceof VaultError
            ? error.code
            : error instanceof z.ZodError
              ? 'VALIDATION_ERROR'
              : storageUnavailable
                ? 'DATABASE_RECOVERY_REQUIRED'
                : 'INTERNAL_ERROR',
        );
      }
      audit(request.requestId, request.command, reply);
      return reply;
    });
    ipcMain.on('tapkit:unsubscribe', (event) => {
      if (trustedSender(event, windows, trustedUrl)) subscribers.delete(event.sender.id);
    });
    const icon = nativeImage.createFromBitmap(
      Buffer.from(Array.from({ length: 16 * 16 }, () => [220, 100, 40, 255]).flat()),
      { width: 16, height: 16 },
    );
    tray = new Tray(icon);
    tray.setToolTip('TapKit');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: strings.open,
          click: () => {
            const w = [...windows][0] ?? createWindow();
            w.show();
            w.focus();
          },
        },
        { label: strings.newWindow, click: () => createWindow() },
        { label: strings.quit, click: () => app.quit() },
      ]),
    );
    tray.on('double-click', () => {
      const w = [...windows][0] ?? createWindow();
      w.show();
      w.focus();
    });
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'TapKit',
          submenu: [
            { label: strings.newWindow, click: () => createWindow() },
            { label: strings.quit, click: () => app.quit() },
          ],
        },
      ]),
    );
    createWindow();
  });
}
app.on('window-all-closed', () => {
  /* Tray keeps jobs and the sole Core alive. */
});
app.on('before-quit', (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  void Promise.all([secretWork, vault.settled, authSecrets.settled]).finally(() => {
    const child = core;
    if (!child) {
      shutdownComplete = true;
      tray?.destroy();
      app.quit();
      return;
    }
    const timer = setTimeout(() => child.kill(), 10_000);
    child.once('exit', () => {
      clearTimeout(timer);
      shutdownComplete = true;
      tray?.destroy();
      app.quit();
    });
    child.postMessage({ type: 'shutdown' });
  });
});
