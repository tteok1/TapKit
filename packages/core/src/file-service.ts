import { createHash } from 'node:crypto';
import {
  z,
  RequestSchema,
  ReplySchema,
  FileCommandSchemas,
  FileImportSchema,
  FileImportControlSchema,
  FileCancelImportSchema,
  FileListSchema,
  FileGetSchema,
  FileRenameSchema,
  FileMoveSchema,
  FileFavoriteSchema,
  FileCopySchema,
  FileLinkSchema,
  FileBatchSchema,
  FileRestoreVersionSchema,
  FileRetrySchema,
  FolderCreateSchema,
  FolderChangeSchema,
  FileImportViewSchema,
  FILE_LIMITS,
  type Request,
  type Reply,
  type FileOwner,
  type ErrorCode,
} from '@tapkit/contracts';
import { FileRepository, StorageError, failure } from '@tapkit/storage';
import { FileSelections } from './file-selections';

type ImportView = z.infer<typeof FileImportViewSchema>;
type ImportItem = ImportView['items'][number];
type ActiveImport = {
  windowId: string;
  fingerprint: string;
  controller: AbortController;
  cancelledTokens: Set<string>;
  currentItem?: { token: string; controller: AbortController };
  view: ImportView;
  promise: Promise<Reply>;
};
function code(error: unknown): ErrorCode {
  if (error instanceof StorageError) return error.code;
  if (error instanceof z.ZodError || error instanceof SyntaxError) return 'VALIDATION_ERROR';
  if (error && typeof error === 'object' && 'code' in error) {
    if (error.code === 'ENOSPC') return 'DISK_FULL';
    if (error.code === 'EACCES' || error.code === 'EPERM') return 'PERMISSION_DENIED';
  }
  return 'INTERNAL_ERROR';
}
function itemId(requestId: string, token: string) {
  const hash = createHash('sha256').update(`files.import.item:${requestId}:${token}`).digest();
  hash[6] = (hash[6]! & 15) | 112;
  hash[8] = (hash[8]! & 63) | 128;
  const hex = hash.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export class FileService {
  private readonly imports = new Map<string, ActiveImport>();
  constructor(
    readonly files: FileRepository,
    readonly selections: FileSelections,
  ) {}
  private ok(r: Request, data: unknown, revision?: number): Reply {
    return ReplySchema.parse({
      ok: true,
      requestId: r.requestId,
      data,
      ...(revision === undefined ? {} : { revision }),
    });
  }
  private previous(r: Request) {
    if (
      this.files.store.db
        .prepare('SELECT 1 FROM request_receipts WHERE profile_id=? AND request_id=?')
        .get(this.files.store.profileId, r.requestId)
    )
      return this.files.store.receipt(r, () => {
        throw new StorageError('CONFLICT');
      });
    return undefined;
  }
  private importRequest(r: Request): Request {
    if (!r.windowId) throw new StorageError('PERMISSION_DENIED');
    return { ...r, payload: { arguments: r.payload, selectionWindowId: r.windowId } };
  }
  private checkpointRequest(r: Request): Request {
    return { ...r, requestId: itemId(r.requestId, 'batch-start'), command: 'files.import.start' };
  }
  private savedImport(requestId: string, command: string): ImportView | undefined {
    const row = this.files.store.db
      .prepare(
        "SELECT reply_json FROM request_receipts WHERE profile_id=? AND request_id=? AND command=? AND state='completed'",
      )
      .get(this.files.store.profileId, requestId, command) as { reply_json: string } | undefined;
    if (!row) return undefined;
    const reply = ReplySchema.parse(JSON.parse(row.reply_json).reply);
    return reply.ok && 'import' in reply.data
      ? FileImportViewSchema.parse(reply.data.import)
      : undefined;
  }
  private recoveredImport(start: ImportView): ImportView {
    const completed = this.savedImport(start.requestId, 'files.import');
    if (completed) return completed;
    return FileImportViewSchema.parse({
      ...start,
      status: 'interrupted',
      items: start.items.map((item) => {
        const saved = this.savedImport(itemId(start.requestId, item.token), 'files.import.item');
        return saved?.items[0]
          ? { ...item, ...saved.items[0] }
          : { ...item, status: 'failed', errorCode: 'PERMISSION_DENIED' };
      }),
    });
  }
  async dispatch(raw: unknown): Promise<Reply> {
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) return failure('', 'VALIDATION_ERROR');
    let r = parsed.data;
    try {
      if (!Object.hasOwn(FileCommandSchemas, r.command))
        return failure(r.requestId, 'FEATURE_NOT_AVAILABLE');
      const schema = FileCommandSchemas[r.command as keyof typeof FileCommandSchemas];
      r = { ...r, payload: schema.parse(r.payload) };
      const receipt = (work: () => Reply) => this.files.store.receipt(r, work);
      if (r.command === 'files.import') return await this.importFiles(r);
      const previous = this.previous(r);
      if (previous) return previous;
      switch (r.command) {
        case 'files.releaseSelection': {
          if (!r.windowId) throw new StorageError('PERMISSION_DENIED');
          const p = FileCommandSchemas['files.releaseSelection'].parse(r.payload);
          return this.ok(r, {
            changedIds: await this.selections.discard(r.windowId, p.selectionTokens),
          });
        }
        case 'files.importStatus':
        case 'files.cancelImport': {
          const control =
            r.command === 'files.cancelImport'
              ? FileCancelImportSchema.parse(r.payload)
              : FileImportControlSchema.parse(r.payload);
          const { importRequestId } = control;
          const selectionToken =
            r.command === 'files.cancelImport'
              ? FileCancelImportSchema.parse(r.payload).selectionToken
              : undefined;
          const active = this.imports.get(importRequestId);
          if (active) {
            if (active.windowId !== r.windowId) throw new StorageError('PERMISSION_DENIED');
            if (r.command === 'files.cancelImport') {
              if (selectionToken) {
                const item = active.view.items.find((i) => i.token === selectionToken);
                if (!item) throw new StorageError('NOT_FOUND');
                if (item.status === 'waiting' || item.status === 'reading') {
                  active.cancelledTokens.add(selectionToken);
                  if (active.currentItem?.token === selectionToken)
                    active.currentItem.controller.abort();
                }
              } else active.controller.abort();
            }
            return this.ok(r, { import: FileImportViewSchema.parse(active.view) });
          }
          // Durable metadata can be recovered without reopening expired source grants.
          const completed = this.savedImport(importRequestId, 'files.import');
          const start = this.savedImport(
            itemId(importRequestId, 'batch-start'),
            'files.import.start',
          );
          if (!completed && !start) throw new StorageError('NOT_FOUND');
          if (
            selectionToken &&
            !(completed ?? start)!.items.some((i) => i.token === selectionToken)
          )
            throw new StorageError('NOT_FOUND');
          return this.ok(r, { import: completed ?? this.recoveredImport(start!) });
        }
        case 'files.importHistory': {
          const rows = this.files.store.db
            .prepare(
              "SELECT reply_json FROM request_receipts WHERE profile_id=? AND command='files.import.start' AND state='completed' ORDER BY expires_at DESC,request_id DESC LIMIT 100",
            )
            .all(this.files.store.profileId) as { reply_json: string }[];
          const imports = rows.flatMap((row) => {
            const reply = ReplySchema.parse(JSON.parse(row.reply_json).reply);
            if (!reply.ok || !('import' in reply.data)) return [];
            const start = FileImportViewSchema.parse(reply.data.import);
            if (this.imports.has(start.requestId)) return [];
            if (
              this.files.store.db
                .prepare(
                  "SELECT 1 FROM request_receipts WHERE profile_id=? AND request_id=? AND command='files.import.dismiss'",
                )
                .get(this.files.store.profileId, itemId(start.requestId, 'dismiss'))
            )
              return [];
            const recovered = this.recoveredImport(start);
            return recovered.status === 'interrupted' ? [recovered] : [];
          });
          return this.ok(r, { imports });
        }
        case 'files.dismissImport': {
          const { importRequestId } = FileImportControlSchema.parse(r.payload);
          if (this.imports.get(importRequestId)?.view.status === 'running')
            throw new StorageError('CONFLICT');
          if (!this.savedImport(itemId(importRequestId, 'batch-start'), 'files.import.start'))
            throw new StorageError('NOT_FOUND');
          const marker: Request = {
            protocolVersion: 1,
            requestId: itemId(importRequestId, 'dismiss'),
            command: 'files.import.dismiss',
            payload: { importRequestId },
          };
          this.files.store.receipt(marker, () =>
            this.ok(marker, { changedIds: [importRequestId] }),
          );
          return this.ok(r, { changedIds: [importRequestId] });
        }
        case 'files.list':
          return this.ok(r, this.files.list(FileListSchema.parse(r.payload)));
        case 'files.get': {
          const p = FileGetSchema.parse(r.payload),
            file = this.files.get(p.fileId, {
              ...(p.versionId ? { versionId: p.versionId } : {}),
              ...(p.owner ? { owner: p.owner } : {}),
            });
          return this.ok(r, { file }, file.revision);
        }
        case 'files.storage':
          return this.ok(r, { storage: await this.files.storage() });
        case 'files.impact': {
          const p = FileBatchSchema.parse(r.payload);
          return this.ok(r, {
            impact: p.fileIds.map((id) =>
              this.files.get(id, { ...(p.owner ? { owner: p.owner } : {}), trash: true }),
            ),
          });
        }
        case 'files.importInfo':
          return this.ok(r, {
            importInfo: { limits: FILE_LIMITS, availableBytes: await this.files.availableBytes() },
          });
        case 'files.versions': {
          const p = FileCommandSchemas['files.versions'].parse(r.payload);
          return this.ok(r, { versions: this.files.versions(p.fileId, p.trash) });
        }
        case 'files.usage': {
          const p = FileCommandSchemas['files.usage'].parse(r.payload);
          return this.ok(r, { usage: this.files.usage(p.fileId, p.trash) });
        }
        case 'files.rename': {
          const p = FileRenameSchema.parse(r.payload);
          return receipt(() => {
            const file = this.files.rename(p.fileId, p.name, r.expectedRevision);
            return this.ok(r, { file }, file.revision);
          });
        }
        case 'files.move': {
          const p = FileMoveSchema.parse(r.payload);
          return receipt(() => {
            const file = this.files.move(p.fileId, p.folderId, r.expectedRevision);
            return this.ok(r, { file }, file.revision);
          });
        }
        case 'files.favorite': {
          const p = FileFavoriteSchema.parse(r.payload);
          return receipt(() => {
            const file = this.files.favorite(p.fileId, p.favorite, r.expectedRevision);
            return this.ok(r, { file }, file.revision);
          });
        }
        case 'files.copy': {
          const p = FileCopySchema.parse(r.payload);
          return receipt(() =>
            this.ok(r, {
              file: this.files.copy(
                p.fileId,
                p.versionId,
                p.name,
                p.owner ?? { type: 'library' },
                p.folderId ?? undefined,
              ),
            }),
          );
        }
        case 'files.link': {
          const p = FileLinkSchema.parse(r.payload);
          return receipt(() => {
            this.files.link(p.fileId, p.versionId, p.owner);
            return this.ok(r, { changedIds: [p.fileId] });
          });
        }
        case 'files.unlink': {
          const p = FileBatchSchema.parse(r.payload);
          if (!p.owner) throw new StorageError('VALIDATION_ERROR');
          return receipt(() => this.ok(r, { changedIds: this.files.unlink(p.fileIds, p.owner!) }));
        }
        case 'files.trash':
        case 'files.restore':
        case 'files.purge':
        case 'files.deletePreview': {
          const p = FileBatchSchema.parse(r.payload);
          for (const id of p.fileIds)
            this.files.get(id, { ...(p.owner ? { owner: p.owner } : {}), trash: true });
          return receipt(() =>
            this.ok(r, {
              changedIds:
                r.command === 'files.trash'
                  ? this.files.trash(p.fileIds)
                  : r.command === 'files.restore'
                    ? this.files.restore(p.fileIds)
                    : r.command === 'files.purge'
                      ? this.files.purge(p.fileIds)
                      : this.files.deletePreviews(p.fileIds),
            }),
          );
        }
        case 'files.restoreVersion': {
          const p = FileRestoreVersionSchema.parse(r.payload);
          return receipt(() => {
            const file = this.files.restoreVersion(p.fileId, p.versionId, r.expectedRevision);
            return this.ok(r, { file }, file.revision);
          });
        }
        case 'files.retryParse': {
          const p = FileRetrySchema.parse(r.payload);
          return receipt(() => {
            this.files.queueParse(p.fileVersionId);
            return this.ok(r, { changedIds: [p.fileVersionId] });
          });
        }
        case 'files.cancelParse': {
          const p = FileRetrySchema.parse(r.payload);
          return receipt(() => this.ok(r, { changedIds: this.files.cancelParse(p.fileVersionId) }));
        }
        case 'folders.list': {
          const p = FileCommandSchemas['folders.list'].parse(r.payload);
          return this.ok(r, { folders: this.files.folders(p.owner) });
        }
        case 'folders.create': {
          const p = FolderCreateSchema.parse(r.payload);
          return receipt(() =>
            this.ok(r, { folder: this.files.createFolder(p.name, p.parentId, p.owner) }),
          );
        }
        case 'folders.change': {
          const p = FolderChangeSchema.parse(r.payload);
          return receipt(() =>
            this.ok(r, {
              folder: this.files.changeFolder(
                p.folderId,
                {
                  ...(p.name === undefined ? {} : { name: p.name }),
                  ...(p.parentId === undefined ? {} : { parentId: p.parentId }),
                },
                r.expectedRevision,
              ),
            }),
          );
        }
        default:
          return failure(r.requestId, 'FEATURE_NOT_AVAILABLE');
      }
    } catch (error) {
      return failure(
        r.requestId,
        code(error),
        error instanceof StorageError ? error.currentRevision : undefined,
      );
    }
  }

  private async importFiles(r: Request): Promise<Reply> {
    const p = FileImportSchema.parse(r.payload),
      internal = this.importRequest(r);
    const previous = this.previous(internal);
    if (previous) return previous;
    const fingerprint = JSON.stringify(internal.payload),
      old = this.imports.get(r.requestId);
    if (old) {
      if (old.fingerprint !== fingerprint) throw new StorageError('CONFLICT');
      return old.promise;
    }
    const checkpoint = this.previous(this.checkpointRequest(internal));
    if (checkpoint?.ok && 'import' in checkpoint.data) {
      const recovered = this.recoveredImport(FileImportViewSchema.parse(checkpoint.data.import));
      return this.files.store.receipt(internal, () => this.ok(internal, { import: recovered }));
    }
    if ([...this.imports.values()].filter((i) => i.view.status === 'running').length >= 2)
      throw new StorageError('QUOTA_EXHAUSTED');
    // Full authorization/selection validation before any source read or destination write.
    const revisions = this.files.validateImportTarget(
      p.destination,
      p.folderId,
      p.replacements.map((t) => t.fileId),
    );
    const selected = this.selections.inspect(r.windowId!, p.selectionTokens);
    for (const [id, entry] of this.imports) {
      if (this.imports.size < 100) break;
      if (entry.view.status !== 'running') this.imports.delete(id);
    }
    const controller = new AbortController();
    const view: ImportView = {
      requestId: r.requestId,
      status: 'running',
      items: selected.map((s) => ({
        token: s.token,
        name: s.name,
        status: 'waiting',
        readBytes: 0,
        totalBytes: s.sizeBytes,
        fileId: null,
        versionId: null,
        errorCode: null,
      })),
    };
    const active: ActiveImport = {
      cancelledTokens: new Set(),
      windowId: r.windowId!,
      fingerprint,
      controller,
      view,
      promise: Promise.resolve(failure(r.requestId, 'INTERNAL_ERROR')),
    };
    const start = this.checkpointRequest(internal);
    this.files.store.receipt(start, () => this.ok(start, { import: view }));
    this.imports.set(r.requestId, active);
    active.promise = this.performImport(internal, p, revisions, active).catch((error) => {
      if (this.imports.get(r.requestId) === active) this.imports.delete(r.requestId);
      throw error;
    });
    return active.promise;
  }
  private async performImport(
    r: Request,
    p: z.infer<typeof FileImportSchema>,
    revisions: { id: string; revision: number }[],
    active: ActiveImport,
  ): Promise<Reply> {
    const timer = setTimeout(() => active.controller.abort(), 120000);
    timer.unref();
    try {
      for (const item of active.view.items) {
        const sub: Request = {
          ...r,
          requestId: itemId(r.requestId, item.token),
          command: 'files.import.item',
          payload: { batch: r.payload, token: item.token },
        };
        const previous = this.previous(sub);
        if (previous?.ok && 'import' in previous.data) {
          Object.assign(item, previous.data.import.items[0]);
          continue;
        }
        if (active.controller.signal.aborted || active.cancelledTokens.has(item.token)) {
          item.status = 'cancelled';
          item.errorCode = 'CANCELLED';
          this.files.store.receipt(sub, () =>
            this.ok(sub, {
              import: { requestId: sub.requestId, status: 'completed', items: [item] },
            }),
          );
          continue;
        }
        const itemController = new AbortController();
        active.currentItem = { token: item.token, controller: itemController };
        const signal = AbortSignal.any([active.controller.signal, itemController.signal]);
        item.status = 'reading';
        try {
          const source = await this.selections.take(active.windowId, item.token, signal, (read) => {
            item.readBytes = read;
          });
          const blob = await this.files.blobs.put(source.bytes);
          signal.throwIfAborted();
          const target = p.replacements.find((t) => t.token === item.token)?.fileId;
          if (
            target &&
            this.files.get(target).revision !== revisions.find((v) => v.id === target)!.revision
          )
            throw new StorageError('CONFLICT');
          const result = this.files.store.receipt(sub, () => {
            this.files.validateImportTarget(p.destination, p.folderId, target ? [target] : []);
            const folderId = this.importFolder(
              p.destination,
              p.folderId,
              source.selection.relativePath,
            );
            const imported = this.files.importBlob({
              blobId: blob.id,
              name: source.selection.name,
              relativePath: source.selection.relativePath,
              owner: p.destination,
              ...(folderId ? { folderId } : {}),
              ...(target ? { replaceId: target } : {}),
              skip: p.duplicate === 'skip',
            });
            const done: ImportItem = {
              ...item,
              status: imported.skipped ? 'skipped' : 'imported',
              fileId: imported.file.id,
              versionId: imported.file.currentVersionId,
            };
            return this.ok(sub, {
              import: { requestId: sub.requestId, status: 'completed', items: [done] },
            });
          });
          if (result.ok && 'import' in result.data)
            Object.assign(item, result.data.import.items[0]);
        } catch (error) {
          item.status = signal.aborted ? 'cancelled' : 'failed';
          item.errorCode = signal.aborted ? 'CANCELLED' : code(error);
          this.files.store.receipt(sub, () =>
            this.ok(sub, {
              import: { requestId: sub.requestId, status: 'completed', items: [item] },
            }),
          );
        } finally {
          delete active.currentItem;
        }
      }
      active.view.status = active.controller.signal.aborted ? 'cancelled' : 'completed';
      return this.files.store.receipt(r, () => this.ok(r, { import: active.view }));
    } finally {
      clearTimeout(timer);
      if (active.view.status === 'running') active.view.status = 'cancelled';
      await this.selections.discard(active.windowId, p.selectionTokens);
    }
  }
  private importFolder(owner: FileOwner, folderId: string | undefined, relativePath: string) {
    if (owner.type === 'session') return folderId;
    for (const name of relativePath.split('/').slice(0, -1)) {
      const existing = this.files
        .folders(owner)
        .find((f) => f.name === name && f.parentId === (folderId ?? null));
      folderId = existing?.id ?? this.files.createFolder(name, folderId ?? null, owner).id;
    }
    return folderId;
  }
  async closeWindow(windowId: string) {
    for (const active of this.imports.values())
      if (active.windowId === windowId) active.controller.abort();
    await this.selections.closeWindow(windowId);
  }
  async stop() {
    for (const active of this.imports.values()) active.controller.abort();
    await Promise.allSettled([...this.imports.values()].map((active) => active.promise));
    await this.selections.close();
  }
}
