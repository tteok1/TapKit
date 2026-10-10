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
import { HistoryService } from './history-service';
import { TemporaryService } from './temporary-service';
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
      const timer = setTimeout(() => {
        vaultWaiters.delete(id);
        reject(new Error('AUTH_REQUIRED'));
      }, 30_000);
      vaultWaiters.set(id, { resolve, reject, timer });
      port!.postMessage({ type: 'vault.request', id, operation, accountId, payload });
    });
  const providers = new ProviderService(store, vault);
  const models = new ModelService(store, providers);
  if (__TAPKIT_TEST_BUILD__ && process.env.TAPKIT_CHAT_FIXTURE === 'P02-02') {
    const { installChatFixture } = await import('./chat-fixture');
    installChatFixture(models);
  }
  const chat = new ChatService(store, blobs, models);
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
  const temporary = new TemporaryService(store, models, providers, (target) => {
    if (__TAPKIT_TEST_BUILD__ && process.env.TAPKIT_CHAT_FIXTURE === 'P02-02') {
      target.catalog = models.catalog;
      target.router.deps.adapter = models.router.deps.adapter;
    }
  });
  chat.onCompleted = (sessionId, runId) => history.queueTitle(sessionId, runId);
  await history.maintain();
  store.db.prepare("UPDATE title_jobs SET status='failed' WHERE status='running'").run();
  const titleTimer = setInterval(() => void history.titles(), 500);
  const files = new FileRepository(store, blobs);
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
    (job, signal) => parser.execute(job, signal),
  );
  let closing = false;
  port!.on('message', ({ data }: { data: unknown }) => {
    const result = CoreCommandSchema.safeParse(data);
    if (!result.success || (closing && result.data.type !== 'vault.reply')) return;
    const command = result.data;
    if (command.type === 'window.closed') {
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
      clearInterval(stagingTimer);
      void Promise.all([
        worker.stop(),
        chat.stop(),
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
        }
      }
      const result = Object.hasOwn(ProjectCommandSchemas, command.request.command)
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
                    : /^(messages\.|drafts\.|inputs\.|runs\.cancel$|chat\.snippets\.)/.test(
                          command.request.command,
                        )
                      ? chat.dispatch(command.request)
                      : Promise.resolve(service.dispatch(command.request));
      void result.then((reply) => {
        if (!closing) port!.postMessage({ type: 'reply', id: command.id, reply });
      });
    }
  });
  port!.postMessage({ type: 'ready', protocolVersion: 1, schemaVersion: 11 });
  worker.start();
  sweepStaging();
  chat.start();
}
void start().catch(() => {
  console.error('TAPKIT_DATABASE_RECOVERY_REQUIRED');
  port!.postMessage({ type: 'unavailable', code: 'DATABASE_RECOVERY_REQUIRED' });
  setTimeout(() => process.exit(1), 20);
});
