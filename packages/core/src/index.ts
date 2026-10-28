import { readExecutionCapabilities } from '@tapkit/tools';
import {
  CoreCommandSchema,
  PingReplySchema,
  AccountIdSchema,
  HISTORY_COMMANDS,
  ReplySchema,
  FileCommandSchemas,
  ArtifactCommandSchemas,
  ProjectCommandSchemas,
  WebCommandSchemas,
  ExportCommandSchemas,
  z,
} from '@tapkit/contracts';
import { openStore, BlobStore, FileRepository, StorageError, failure } from '@tapkit/storage';
import { CoreService } from './service';
import { FoundationWorker } from './worker';
import { FileParser } from './file-parser';
import { FileSelections } from './file-selections';
import { FileService } from './file-service';
import { FileExporter } from './file-exporter';
import { ProjectService } from './project-service';
import { ProjectExporter } from './project-exporter';
import { ArtifactService } from './artifact-service';
import { isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ProviderService, type PrivateVault } from './provider-service';
import { ModelService } from './model-service';
import { ChatService } from './chat-service';
import { WebService } from './web-service';
import { ExportService } from './export-service';
import { WorkService } from './work-service';
import { WorkArtifacts } from './work-artifacts';
import { WorkToolGateway } from './work-gateway';
import { WorkNativeTools } from './work-native';
import { modelWorkDriver } from './work-driver';
import { WebTools } from '@tapkit/tools';
import { NetworkPolicyService } from '@tapkit/network';
import { resolveNetworkProxy } from '@tapkit/providers';
import { HistoryService } from './history-service';
import { TemporaryService } from './temporary-service';
import { createToolTraceWriter } from './tool-trace';
const port = process.parentPort;
declare const __TAPKIT_TEST_BUILD__: boolean;
if (!port) throw new Error('Core requires Electron utilityProcess parentPort');
const dataDir = process.env.TAPKIT_CORE_DATA_DIR;
if (!dataDir || !isAbsolute(dataDir)) throw new Error('Core requires a Host data directory');
async function start() {
  const store = await openStore(dataDir!);
  const blobs = new BlobStore(store);
  await blobs.dailyBackup();
  await blobs.gc();
  const service = new CoreService(
    store,
    await readExecutionCapabilities(process.env.TAPKIT_APP_ROOT ?? ''),
  );
  const vaultWaiters = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const vault: PrivateVault = (operation, accountId, payload) =>
    new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(
        () => {
          vaultWaiters.delete(id);
          reject(new Error('AUTH_REQUIRED'));
        },
        operation === 'export.pdf' ? 60_000 : 30_000,
      );
      vaultWaiters.set(id, { resolve, reject, timer });
      port!.postMessage({ type: 'vault.request', id, operation, accountId, payload });
    });
  const providers = new ProviderService(
    store,
    vault,
    async (url) =>
      z
        .strictObject({ proxyURL: z.string().max(2048) })
        .parse(await vault('network.proxy.resolve', store.profileId, { url })).proxyURL,
    createToolTraceWriter(dataDir!, store.profileId),
  );
  const models = new ModelService(store, providers);
  if (__TAPKIT_TEST_BUILD__ && process.env.TAPKIT_CHAT_FIXTURE === 'P02-02') {
    const { installChatFixture } = await import('./chat-fixture');
    installChatFixture(models);
  }
  let webTools = new WebTools(
    new NetworkPolicyService({
      proxy: (url, signal) =>
        resolveNetworkProxy(
          store.settings.values.network,
          url,
          async (value) =>
            z
              .strictObject({ proxyURL: z.string().max(2048) })
              .parse(await vault('network.proxy.resolve', store.profileId, { url: value }))
              .proxyURL,
          signal,
        ),
    }),
    undefined,
    async (url, signal, remainingBytes) => {
      const token = randomUUID();
      const cancel = () => {
        void vault('web.cancel', store.profileId, { token }).catch(() => {});
      };
      signal.throwIfAborted();
      signal.addEventListener('abort', cancel, { once: true });
      try {
        const proxyURL = await resolveNetworkProxy(
          store.settings.values.network,
          new URL(url),
          async (value) =>
            z
              .strictObject({ proxyURL: z.string().max(2048) })
              .parse(await vault('network.proxy.resolve', store.profileId, { url: value }))
              .proxyURL,
          signal,
        );
        signal.throwIfAborted();
        return z
          .strictObject({ url: z.string().url().max(4096), html: z.string().max(50 * 1024 * 1024) })
          .parse(
            await vault('web.read', store.profileId, { token, url, proxyURL, remainingBytes }),
          );
      } finally {
        signal.removeEventListener('abort', cancel);
      }
    },
  );
  if (
    __TAPKIT_TEST_BUILD__ &&
    process.env.TAPKIT_CHAT_FIXTURE === 'P02-02' &&
    process.env.TAPKIT_WEB_FIXTURE === 'P05-01'
  ) {
    const { installWebFixture } = await import('./web-fixture');
    webTools = installWebFixture(store, webTools);
  }
  const web = new WebService(store, blobs, webTools, models);
  const chat = new ChatService(store, blobs, models, web);
  const exports = new ExportService(store, blobs, chat, web, async (html, signal) => {
    const token = randomUUID(),
      cancel = () => {
        void vault('export.cancelPdf', store.profileId, { token }).catch(() => {});
      };
    signal.throwIfAborted();
    signal.addEventListener('abort', cancel, { once: true });
    try {
      return Buffer.from(
        z
          .string()
          .max(140000000)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/)
          .parse(await vault('export.pdf', store.profileId, { token, html })),
        'base64',
      );
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  });
  const history = new HistoryService(store, blobs, chat, false, async (sessionId) => {
    const refs = store.db
      .prepare(
        'SELECT o.id,o.account_id,o.branch_id FROM opaque_states o JOIN branches b ON b.id=o.branch_id WHERE b.session_id=? AND o.profile_id=?',
      )
      .all(sessionId, store.profileId) as { id: string; account_id: string; branch_id: string }[];
    for (const account of new Set(refs.map((r) => r.account_id)))
      await providers.vault('native.purge', account, {
        refs: refs
          .filter((r) => r.account_id === account)
          .map((r) => ({ ref: r.id, branchId: r.branch_id })),
      });
  });
  const temporary = new TemporaryService(
    store,
    models,
    providers,
    (target) => {
      if (__TAPKIT_TEST_BUILD__ && process.env.TAPKIT_CHAT_FIXTURE === 'P02-02') {
        target.catalog = models.catalog;
        target.router.deps.adapter = models.router.deps.adapter;
      }
    },
    webTools,
  );
  chat.onCompleted = (sessionId, runId) => {
    history.queueTitle(sessionId, runId);
    store.db.transaction(() => chat.memories.enqueue(sessionId, runId))();
  };
  chat.memories.extractor = (sessionId, runId, input, signal) =>
    chat.extractMemory(sessionId, runId, input.text, signal);
  await history.maintain();
  store.db.prepare("UPDATE title_jobs SET status='failed' WHERE status='running'").run();
  const titleTimer = setInterval(() => void history.titles(), 500);
  const files = new FileRepository(store, blobs);
  const workArtifacts = new WorkArtifacts(files, blobs);
  const work = new WorkService(
    store,
    modelWorkDriver(models, chat),
    new WorkToolGateway(
      workArtifacts,
      new WorkNativeTools(
        process.env.TAPKIT_APP_ROOT ?? '',
        workArtifacts,
        service.executionCapabilities,
      ),
    ),
    (ref, sessionId) => chat.material(ref, sessionId),
    models.claimRoot,
  );
  const notificationTimer = setInterval(() => {
    try {
      for (const notification of work.notifications.claimDesktop())
        port!.postMessage({ type: 'desktop.notification', notification });
    } catch {
      console.warn('TAPKIT_NOTIFICATION_SYNC_PENDING');
    }
  }, 1000);
  const selections = new FileSelections();
  const fileService = new FileService(files, selections);
  const fileExporter = new FileExporter(files);
  const projects = new ProjectService(files, history);
  const projectExporter = new ProjectExporter(projects);
  const artifacts = new ArtifactService(
    process.env.TAPKIT_APP_ROOT ?? '',
    files,
    service.executionCapabilities,
  );
  const recoveredPreview = await artifacts.staging.sweep();
  if (recoveredPreview.retained) console.warn('FILE_PREVIEW_STAGING_CLEANUP_PENDING');
  const parser = new FileParser(
    process.env.TAPKIT_APP_ROOT ?? '',
    files,
    service.executionCapabilities,
  );
  const sweepStaging = () => {
    void artifacts.staging.sweep().then(({ retained }) => {
      if (retained) console.warn('FILE_PREVIEW_STAGING_CLEANUP_PENDING');
    });
    void parser.staging.sweep().then(({ retained }) => {
      if (retained) console.warn('FILE_PARSE_STAGING_CLEANUP_PENDING');
    });
  };
  const stagingTimer = setInterval(sweepStaging, 60000);
  const worker = new FoundationWorker(
    store,
    blobs,
    (event) => port!.postMessage({ type: 'event', event }),
    (job, signal) =>
      job.kind === 'snapshot.export'
        ? exports.execute(job, signal)
        : job.kind === 'memory.extract'
          ? chat.memories.execute(job, signal)
          : parser.execute(job, signal),
  );
  let closing = false;
  port!.on('message', ({ data }: { data: unknown }) => {
    const result = CoreCommandSchema.safeParse(data);
    if (!result.success || (closing && result.data.type !== 'vault.reply')) return;
    const command = result.data;
    if (command.type === 'lifecycle') {
      void (command.action === 'suspend' ? work.suspend() : work.wake());
      return;
    }
    if (command.type === 'window.closed') {
      exports.closeWindow(command.windowId);
      void temporary.closeWindow(command.windowId);
      void fileService.closeWindow(command.windowId);
      fileExporter.closeWindow(command.windowId);
      projectExporter.closeWindow(command.windowId);
      artifacts.closeWindow(command.windowId);
      return;
    }
    if (command.type === 'artifacts.read') {
      void artifacts.readAsset(command.asset).then(
        (artifactBytes) => {
          if (!closing)
            port!.postMessage({
              type: 'reply',
              id: command.id,
              reply: ReplySchema.parse({
                ok: true,
                requestId: command.requestId,
                data: { artifactBytes },
              }),
            });
        },
        (error) => {
          if (!closing)
            port!.postMessage({
              type: 'reply',
              id: command.id,
              reply: failure(
                command.requestId,
                error instanceof StorageError ? error.code : 'INTERNAL_ERROR',
              ),
            });
        },
      );
      return;
    }
    if (command.type === 'files.export') {
      void fileExporter.export(command.windowId, command.file, command.targetPath).then(
        (fileId) => {
          if (!closing)
            port!.postMessage({
              type: 'reply',
              id: command.id,
              reply: ReplySchema.parse({
                ok: true,
                requestId: command.requestId,
                data: { changedIds: [fileId] },
              }),
            });
        },
        (error) => {
          if (!closing)
            port!.postMessage({
              type: 'reply',
              id: command.id,
              reply: failure(
                command.requestId,
                error instanceof StorageError
                  ? error.code
                  : error && error.code === 'ENOSPC'
                    ? 'DISK_FULL'
                    : error && error.code === 'EEXIST'
                      ? 'CONFLICT'
                      : 'INTERNAL_ERROR',
              ),
            });
        },
      );
      return;
    }
    if (command.type === 'exports.inspect' || command.type === 'exports.write') {
      const work = async () => {
        const data =
          command.type === 'exports.inspect'
            ? {
                exportDestination: exports.destination(
                  command.windowId,
                  command.previewId,
                  command.snapshotVersion,
                ),
              }
            : {
                exportStatus: await exports.write(
                  command.windowId,
                  command.previewId,
                  command.snapshotVersion,
                  command.targetPath,
                ),
              };
        return ReplySchema.parse({ ok: true, requestId: command.requestId, data });
      };
      void work().then(
        (reply) => {
          if (!closing) port!.postMessage({ type: 'reply', id: command.id, reply });
        },
        (error) => {
          if (!closing)
            port!.postMessage({
              type: 'reply',
              id: command.id,
              reply: failure(
                command.requestId,
                error instanceof StorageError ? error.code : 'INTERNAL_ERROR',
              ),
            });
        },
      );
      return;
    }
    if (command.type === 'projects.export') {
      void projectExporter
        .export(command.windowId, command.projectId, command.revision, command.targetPath)
        .then(
          (id) => {
            if (!closing)
              port!.postMessage({
                type: 'reply',
                id: command.id,
                reply: ReplySchema.parse({
                  ok: true,
                  requestId: command.requestId,
                  data: { changedIds: [id] },
                }),
              });
          },
          (error) => {
            if (!closing)
              port!.postMessage({
                type: 'reply',
                id: command.id,
                reply: failure(
                  command.requestId,
                  error instanceof StorageError
                    ? error.code
                    : error?.code === 'EEXIST'
                      ? 'CONFLICT'
                      : error?.code === 'ENOSPC'
                        ? 'DISK_FULL'
                        : 'INTERNAL_ERROR',
                ),
              });
          },
        );
      return;
    }
    if (command.type === 'files.select') {
      void selections.select(command.windowId, command.paths, command.folder).then(
        (views) => {
          if (!closing)
            port!.postMessage({
              type: 'reply',
              id: command.id,
              reply: ReplySchema.parse({
                ok: true,
                requestId: command.requestId,
                data: { selections: views },
              }),
            });
        },
        (error) => {
          if (!closing)
            port!.postMessage({
              type: 'reply',
              id: command.id,
              reply: failure(
                command.requestId,
                error instanceof StorageError ? error.code : 'VALIDATION_ERROR',
              ),
            });
        },
      );
      return;
    }
    if (command.type === 'shutdown') {
      closing = true;
      clearInterval(titleTimer);
      clearInterval(notificationTimer);
      clearInterval(stagingTimer);
      void Promise.all([
        worker.stop(),
        chat.stop(),
        work.stop(),
        history.stop(),
        temporary.stop(),
        fileService.stop(),
        fileExporter.stop(),
        projectExporter.stop(),
        artifacts.stop(),
        parser.staging.stop(),
      ]).then(async () => {
        await Promise.all([providers.stop(), models.stop()]);
        store.close();
        process.exit(0);
      });
      return;
    }
    if (command.type === 'vault.reply') {
      const waiter = vaultWaiters.get(command.id);
      if (!waiter) return;
      clearTimeout(waiter.timer);
      vaultWaiters.delete(command.id);
      if (command.ok) waiter.resolve(command.value);
      else
        waiter.reject(
          new Error(typeof command.value === 'string' ? command.value : 'AUTH_REQUIRED'),
        );
      return;
    }
    if (command.type === 'ping') {
      const version = store.db.prepare('SELECT sqlite_version() AS version').get() as {
        version: string;
      };
      port!.postMessage({
        type: 'pong',
        id: command.id,
        payload: PingReplySchema.parse({
          nonce: command.payload.nonce,
          process: 'core',
          sqliteVersion: version.version,
          electronVersion: process.versions.electron,
          nodeAbi: process.versions.modules,
          corePid: process.pid,
        }),
      });
    } else {
      if (command.request.command === 'providers.disconnect') {
        const account = AccountIdSchema.safeParse(command.request.payload);
        if (account.success) {
          models.cancelAccount(account.data.accountId);
          chat.cancelAccount(account.data.accountId);
          temporary.cancelAccount(account.data.accountId);
          work.cancelAccount(account.data.accountId);
        }
      }
      const result = work.handles(command.request.command, command.request.payload)
        ? work.dispatch(command.request)
        : Object.hasOwn(ExportCommandSchemas, command.request.command)
          ? exports.dispatch(command.request)
          : Object.hasOwn(WebCommandSchemas, command.request.command) &&
              !temporary.target(command.request.payload)
            ? web.dispatch(command.request)
            : Object.hasOwn(ProjectCommandSchemas, command.request.command)
              ? projects.dispatch(command.request)
              : Object.hasOwn(ArtifactCommandSchemas, command.request.command)
                ? artifacts.dispatch(command.request)
                : Object.hasOwn(FileCommandSchemas, command.request.command)
                  ? fileService.dispatch(command.request)
                  : command.request.command === 'sessions.temporary' ||
                      command.request.command === 'sessions.closeTemporary' ||
                      temporary.target(command.request.payload)
                    ? temporary.dispatch(command.request)
                    : (HISTORY_COMMANDS as readonly string[]).includes(command.request.command)
                      ? history.dispatch(command.request)
                      : command.request.command.startsWith('models.') ||
                          command.request.command === 'usage.list'
                        ? models.dispatch(command.request)
                        : command.request.command.startsWith('providers.') &&
                            command.request.command !== 'providers.saveApiKey'
                          ? providers.dispatch(command.request)
                          : /^(memory\.|messages\.|drafts\.|inputs\.|runs\.cancel$|context\.|chat\.snippets\.)/.test(
                                command.request.command,
                              )
                            ? chat.dispatch(command.request)
                            : Promise.resolve(service.dispatch(command.request));
      void result.then((reply) => {
        if (!closing) port!.postMessage({ type: 'reply', id: command.id, reply });
      });
    }
  });
  port!.postMessage({ type: 'ready', protocolVersion: 1, schemaVersion: 17 });
  worker.start();
  sweepStaging();
  chat.start();
  await work.start();
}
void start().catch(() => {
  console.error('TAPKIT_DATABASE_RECOVERY_REQUIRED');
  port!.postMessage({ type: 'unavailable', code: 'DATABASE_RECOVERY_REQUIRED' });
  setTimeout(() => process.exit(1), 20);
});
