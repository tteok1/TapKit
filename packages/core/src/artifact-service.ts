import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  ArtifactCommandSchemas,
  ArtifactViewSchema,
  ArtifactAssetSchema,
  RequestSchema,
  ReplySchema,
  type ArtifactAccess,
  type ArtifactView,
  type ExecutionCapabilities,
  type Request,
  type Reply,
  type ParsedDocument,
  type z,
} from '@tapkit/contracts';
import {
  ArtifactRepository,
  locatedText,
  sheetRange,
  StorageError,
  failure,
  newId,
  type FileRepository,
} from '@tapkit/storage';
import { OfficeWorker, type OfficeExecutor } from '@tapkit/tools';
import { artifactDiff } from './artifact-diff';
import { PreviewStaging } from './preview-staging';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const OFFICE_PREVIEW_VERSION = 'P03-02-office-1';
type Conversion = { controller: AbortController; windows: Set<string>; promise: Promise<void> };
const format = (extension: string): ArtifactView['format'] => {
  const ext = extension.toLowerCase();
  if (['pdf', 'docx', 'pptx'].includes(ext)) return ext as 'pdf' | 'docx' | 'pptx';
  if (['xlsx', 'csv', 'tsv'].includes(ext)) return 'sheet';
  if (['md', 'markdown'].includes(ext)) return 'markdown';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg'].includes(ext)) return 'image';
  if (ext === 'zip') return 'zip';
  if (['txt', 'json', 'yaml', 'yml', 'xml', 'html', 'htm', 'log'].includes(ext)) return 'text';
  if (
    [
      'js',
      'ts',
      'tsx',
      'jsx',
      'py',
      'java',
      'c',
      'cpp',
      'cs',
      'rs',
      'go',
      'css',
      'sql',
      'sh',
      'ps1',
      'rb',
      'php',
      'swift',
      'kt',
      'toml',
      'ini',
    ].includes(ext)
  )
    return 'code';
  return 'unsupported';
};
export class ArtifactService {
  readonly repository: ArtifactRepository;
  readonly staging: PreviewStaging;
  private readonly conversions = new Map<string, Conversion>();
  private readonly office: OfficeWorker;
  constructor(
    readonly root: string,
    readonly files: FileRepository,
    readonly capabilities: ExecutionCapabilities,
    executor?: OfficeExecutor,
  ) {
    this.repository = new ArtifactRepository(files);
    this.office = new OfficeWorker(root, executor);
    this.staging = new PreviewStaging(files.store);
  }
  closeWindow(windowId: string) {
    for (const conversion of this.conversions.values()) {
      conversion.windows.delete(windowId);
      if (!conversion.windows.size) conversion.controller.abort();
    }
  }
  async stop() {
    for (const c of this.conversions.values()) c.controller.abort();
    await Promise.allSettled([...this.conversions.values()].map((c) => c.promise));
    await this.staging.stop();
  }
  private reply(request: Request, data: unknown): Reply {
    return ReplySchema.parse({ ok: true, requestId: request.requestId, data });
  }
  async dispatch(raw: unknown): Promise<Reply> {
    const request = RequestSchema.safeParse(raw);
    if (!request.success) return failure('', 'VALIDATION_ERROR');
    const r = request.data;
    try {
      if (!Object.hasOwn(ArtifactCommandSchemas, r.command))
        return failure(r.requestId, 'FEATURE_NOT_AVAILABLE');
      switch (r.command) {
        case 'artifacts.open':
          return this.reply(r, {
            artifact: await this.open(
              ArtifactCommandSchemas['artifacts.open'].parse(r.payload),
              r.windowId ?? '',
              r,
            ),
          });
        case 'artifacts.cancel': {
          const access = ArtifactCommandSchemas['artifacts.cancel'].parse(r.payload);
          this.repository.access(access);
          const c = this.conversions.get(access.versionId);
          c?.windows.delete(r.windowId ?? '');
          if (c && !c.windows.size) c.controller.abort();
          return this.reply(r, { changedIds: [] });
        }
        case 'artifacts.reading':
          return this.reply(r, {
            changedIds: [
              await this.repository.savePosition(
                ArtifactCommandSchemas['artifacts.reading'].parse(r.payload),
                r,
              ),
            ],
          });
        case 'artifacts.blocks': {
          const p = ArtifactCommandSchemas['artifacts.blocks'].parse(r.payload);
          const doc = await this.repository.document(p);
          let blocks =
            p.pageIndex === undefined
              ? doc.blocks
              : doc.blocks.filter(
                  (b) => b.locator.kind === 'pdf' && b.locator.pageIndex === p.pageIndex,
                );
          if (p.query)
            blocks = blocks.filter((b) =>
              b.text.toLocaleLowerCase().includes(p.query.toLocaleLowerCase()),
            );
          let offset = p.offset;
          if (p.locator) {
            locatedText(doc, p.locator);
            const locator = p.locator;
            const match = blocks.findIndex((b) => {
              const l = b.locator;
              return (
                l.kind === locator.kind &&
                (l.kind === 'text' && locator.kind === 'text'
                  ? locator.start >= l.start && locator.start <= l.end
                  : l.kind === 'code' && locator.kind === 'code'
                    ? locator.lineStart >= l.lineStart && locator.lineStart <= l.lineEnd
                    : l.kind === 'pdf' && locator.kind === 'pdf'
                      ? l.pageIndex === locator.pageIndex
                      : l.kind === 'slide' && locator.kind === 'slide'
                        ? l.slideIndex === locator.slideIndex
                        : false)
              );
            });
            if (match >= 0) offset = Math.floor(match / p.limit) * p.limit;
          }
          this.repository.access(p);
          return this.reply(r, {
            blocks: blocks.slice(offset, offset + p.limit),
            total: blocks.length,
            offset,
          });
        }
        case 'artifacts.sheet':
          return this.reply(r, {
            grid: await this.grid(ArtifactCommandSchemas['artifacts.sheet'].parse(r.payload)),
          });
        case 'artifacts.diff': {
          const p = ArtifactCommandSchemas['artifacts.diff'].parse(r.payload),
            other = { ...p, versionId: p.otherVersionId };
          const [current, old] = await Promise.all([
            this.repository.document(p),
            this.repository.document(other),
          ]);
          const diff = artifactDiff(old, current);
          this.repository.access(p);
          this.repository.access(other);
          return this.reply(r, {
            diff: diff.slice(p.offset, p.offset + p.limit),
            offset: p.offset,
            total: diff.length,
            otherVersionId: p.otherVersionId,
          });
        }
        case 'artifacts.locate': {
          const p = ArtifactCommandSchemas['artifacts.locate'].parse(r.payload);
          locatedText(await this.repository.document(p), p.locator);
          return this.reply(r, {
            artifact: await this.open({ ...p, retry: false }, r.windowId ?? ''),
          });
        }
        case 'artifacts.selection':
          return this.reply(r, {
            selection: await this.repository.selection(
              ArtifactCommandSchemas['artifacts.selection'].parse(r.payload),
            ),
          });
        case 'annotations.list': {
          const p = ArtifactCommandSchemas['annotations.list'].parse(r.payload);
          return this.reply(r, {
            annotations: this.repository.annotations(p.fileVersionId, p.owner),
          });
        }
        case 'annotations.upsert':
          return this.reply(r, {
            annotation: await this.repository.upsert(
              ArtifactCommandSchemas['annotations.upsert'].parse(r.payload),
              r,
            ),
          });
        case 'annotations.delete':
          return this.reply(r, {
            changedIds: this.repository.deleteAnnotations(
              ArtifactCommandSchemas['annotations.delete'].parse(r.payload),
              r,
            ),
          });
        default:
          return failure(r.requestId, 'FEATURE_NOT_AVAILABLE');
      }
    } catch (error) {
      return failure(
        r.requestId,
        error instanceof StorageError
          ? error.code
          : error && typeof error === 'object' && 'name' in error && error.name === 'ZodError'
            ? 'VALIDATION_ERROR'
            : 'INTERNAL_ERROR',
      );
    }
  }
  async open(
    input: z.infer<(typeof ArtifactCommandSchemas)['artifacts.open']>,
    windowId: string,
    request?: Request,
  ): Promise<ArtifactView> {
    let file = this.files.get(input.fileId, {
      ...(input.versionId ? { versionId: input.versionId } : {}),
      ...(input.owner ? { owner: input.owner } : {}),
    });
    const access = {
      fileId: file.id,
      versionId: file.version.id,
      ...(input.owner ? { owner: input.owner } : {}),
    };
    let kind = format(file.version.extension);
    if (
      input.retry &&
      ['failed', 'cancelled'].includes(file.version.parseStatus) &&
      !['image', 'unsupported'].includes(kind) &&
      file.version.errorReason !== 'OCR_REQUIRED'
    ) {
      const enqueue = () =>
        this.files.store.db.transaction(() => {
          this.repository.access(access);
          this.files.queueParse(access.versionId);
          this.files.store.emit('workspace.updated', {
            kind: 'workspace',
            entityId: access.fileId,
          });
          return { changedIds: [access.versionId] };
        })();
      if (request)
        this.files.store.receipt(
          { ...request, command: 'artifacts.retryParse', payload: access },
          () => this.reply(request, enqueue()),
        );
      else enqueue();
      file = this.repository.access(access);
    }
    let doc: ParsedDocument | undefined;
    if (file.version.parseStatus === 'ready' || file.version.errorReason === 'OCR_REQUIRED') {
      try {
        doc = await this.repository.document(access);
      } catch (error) {
        if (file.version.parseStatus === 'ready') throw error;
      }
    }
    if (input.locator) {
      if (!doc) throw new StorageError('INDEX_NOT_READY');
      locatedText(doc, input.locator);
    }
    if (doc) kind = doc.format;
    let status: ArtifactView['status'] =
      kind === 'unsupported'
        ? 'unsupported'
        : doc || kind === 'pdf' || kind === 'image'
          ? 'ready'
          : file.version.parseStatus === 'pending' || file.version.parseStatus === 'parsing'
            ? 'pending'
            : 'failed';
    let errorCode: string | null =
      status === 'failed'
        ? (file.version.errorCode ?? 'PARSE_FAILED')
        : status === 'unsupported'
          ? 'FORMAT_UNSUPPORTED'
          : null;
    let asset: ArtifactView['asset'] = kind === 'pdf' || kind === 'image' ? 'original' : 'none';
    if (kind === 'docx' || kind === 'pptx') {
      asset = 'preview';
      if (doc) {
        try {
          const manifest = this.files.store.db
            .prepare(
              'SELECT preview_renderer_version FROM file_versions WHERE id=? AND profile_id=?',
            )
            .get(access.versionId, this.files.store.profileId) as {
            preview_renderer_version: string | null;
          };
          if (
            input.retry ||
            file.version.previewStatus !== 'ready' ||
            manifest.preview_renderer_version !== OFFICE_PREVIEW_VERSION
          )
            await this.convert(access, windowId);
          else await this.files.blobs.readDerivedVersion(access.versionId, 'preview');
          status = 'ready';
          errorCode = null;
        } catch (error) {
          status = 'failed';
          errorCode =
            error instanceof StorageError
              ? error.code
              : error instanceof Error && error.name === 'AbortError'
                ? 'CANCELLED'
                : 'PARSE_FAILED';
          this.repository.access(access);
          this.files.store.db
            .prepare(
              "UPDATE file_versions SET preview_status='failed' WHERE id=? AND profile_id=? AND deleted_at IS NULL AND preview_status<>'ready'",
            )
            .run(access.versionId, this.files.store.profileId);
        }
      }
    }
    file = this.repository.access(access);
    return ArtifactViewSchema.parse({
      file,
      format: kind,
      status,
      errorCode,
      pageCount: doc?.pages.length ?? 0,
      blockCount: doc?.blocks.length ?? 0,
      outline:
        doc?.blocks
          .filter((b) => b.kind === 'heading')
          .slice(0, 2000)
          .map((b) => ({ id: b.id, title: b.text.slice(0, 2000), locator: b.locator })) ?? [],
      sheets:
        doc?.sheets.map((s) => ({ id: s.id, name: s.name, rows: s.rows, columns: s.columns })) ??
        [],
      slides: doc?.slides ?? [],
      entries: doc?.entries ?? [],
      position: this.repository.position(access),
      asset: status === 'ready' ? asset : 'none',
      versionChanged: file.currentVersionId !== access.versionId,
      ...(input.locator ? { locator: input.locator } : {}),
    });
  }
  private async convert(access: ArtifactAccess, windowId: string) {
    if (
      this.capabilities.nativeExecution.status !== 'available' ||
      this.capabilities.officeRender.status !== 'available'
    )
      throw new StorageError('SANDBOX_UNAVAILABLE');
    let existing = this.conversions.get(access.versionId);
    if (existing) {
      existing.windows.add(windowId);
      return existing.promise;
    }
    if (this.conversions.size >= 2) throw new StorageError('CONFLICT');
    const controller = new AbortController();
    existing = { controller, windows: new Set([windowId]), promise: Promise.resolve() };
    this.conversions.set(access.versionId, existing);
    existing.promise = this.renderOffice(access, controller.signal).finally(() => {
      this.conversions.delete(access.versionId);
    });
    return existing.promise;
  }
  private async renderOffice(access: ArtifactAccess, signal: AbortSignal) {
    const { file, bytes } = await this.files.original(access.fileId, {
      versionId: access.versionId,
      ...(access.owner ? { owner: access.owner } : {}),
    });
    const directory = await this.staging.create(access.versionId);
    try {
      const inputRoot = join(directory, 'input'),
        workspace = join(directory, 'workspace');
      await mkdir(inputRoot);
      await mkdir(workspace);
      const filename = 'document.' + file.version.extension.toLowerCase();
      await writeFile(join(inputRoot, filename), bytes, { flag: 'wx' });
      signal.throwIfAborted();
      const rendered = await this.office.render(
        { fileVersionId: access.versionId, format: 'pdf' },
        {
          fileVersionId: access.versionId,
          inputRoot,
          filename,
          sha256: hash(bytes),
          workspace,
          requestId: newId(),
          runId: newId(),
          leaseEpoch: 1,
        },
        { signal },
      );
      const pdf = await readFile(rendered.path);
      signal.throwIfAborted();
      if (hash(pdf) !== rendered.sha256) throw new StorageError('CONFLICT');
      const blob = await this.files.blobs.put(pdf, 'application/pdf');
      signal.throwIfAborted();
      this.repository.access(access);
      this.files.store.db.transaction(() => {
        const previous = this.files.store.db
          .prepare(
            'SELECT preview_blob_id FROM file_versions WHERE id=? AND profile_id=? AND deleted_at IS NULL',
          )
          .get(access.versionId, this.files.store.profileId) as
          { preview_blob_id: string | null } | undefined;
        if (!previous) throw new StorageError('NOT_FOUND');
        if (previous.preview_blob_id !== blob.id) {
          if (previous.preview_blob_id)
            this.files.store.db
              .prepare('UPDATE blobs SET reference_count=max(0,reference_count-1) WHERE id=?')
              .run(previous.preview_blob_id);
          this.files.store.db
            .prepare('UPDATE blobs SET reference_count=reference_count+1 WHERE id=?')
            .run(blob.id);
        }
        if (
          !this.files.store.db
            .prepare(
              "UPDATE file_versions SET preview_blob_id=?,preview_status='ready',preview_renderer_version=? WHERE id=? AND profile_id=? AND sha256=? AND deleted_at IS NULL",
            )
            .run(
              blob.id,
              OFFICE_PREVIEW_VERSION,
              access.versionId,
              this.files.store.profileId,
              file.version.sha256,
            ).changes
        )
          throw new StorageError('CONFLICT');
        this.files.store.emit('workspace.updated', { kind: 'workspace', entityId: access.fileId });
      })();
    } catch (error) {
      if (signal.aborted) throw new StorageError('CANCELLED');
      throw error;
    } finally {
      // This directory was created by this invocation; never delete caller-supplied paths.
      if (!(await this.staging.release(directory)))
        console.warn('FILE_PREVIEW_STAGING_CLEANUP_PENDING');
    }
  }
  async readAsset(raw: unknown) {
    const input = ArtifactAssetSchema.parse(raw);
    const file = this.repository.access(input),
      kind = format(file.version.extension);
    let bytes: Buffer, mime: string;
    if (input.kind === 'preview') {
      const manifest = this.files.store.db
        .prepare('SELECT preview_renderer_version FROM file_versions WHERE id=? AND profile_id=?')
        .get(input.versionId, this.files.store.profileId) as {
        preview_renderer_version: string | null;
      };
      if (
        !['docx', 'pptx'].includes(kind) ||
        file.version.previewStatus !== 'ready' ||
        manifest.preview_renderer_version !== OFFICE_PREVIEW_VERSION
      )
        throw new StorageError('CONFLICT');
      bytes = await this.files.blobs.readDerivedVersion(input.versionId, 'preview');
      mime = 'application/pdf';
    } else {
      if (kind !== 'pdf' && kind !== 'image') throw new StorageError('PERMISSION_DENIED');
      ({ bytes } = await this.files.original(input.fileId, {
        versionId: input.versionId,
        ...(input.owner ? { owner: input.owner } : {}),
      }));
      const mimes: Record<string, string> = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        gif: 'image/gif',
        bmp: 'image/bmp',
        avif: 'image/avif',
        svg: 'image/svg+xml',
      };
      mime = mimes[file.version.extension.toLowerCase()]!;
    }
    this.repository.access(input);
    if (mime === 'application/pdf' && bytes.subarray(0, 5).toString() !== '%PDF-')
      throw new StorageError('PARSE_FAILED');
    return { mime, base64: bytes.toString('base64') };
  }
  private async grid(p: z.infer<(typeof ArtifactCommandSchemas)['artifacts.sheet']>) {
    const doc = await this.repository.document(p),
      sheet = doc.sheets.find((s) => s.id === p.sheetId);
    if (doc.format !== 'sheet' || !sheet) throw new StorageError('CONFLICT');
    if (
      (p.sort && p.sort.column > sheet.columns) ||
      p.filters.some((f) => f.column > sheet.columns)
    )
      throw new StorageError('VALIDATION_ERROR');
    const byRow = new Map<number, Map<number, (typeof sheet.cells)[number]>>();
    const columnTypes: ('empty' | 'text' | 'number' | 'boolean' | 'mixed')[] = Array.from(
      { length: sheet.columns },
      () => 'empty',
    );
    for (const cell of sheet.cells) {
      let row = byRow.get(cell.row);
      if (!row) {
        row = new Map();
        byRow.set(cell.row, row);
      }
      row.set(cell.column, cell);
      if (cell.value !== null) {
        const type =
          typeof cell.value === 'string'
            ? 'text'
            : typeof cell.value === 'number'
              ? 'number'
              : 'boolean';
        const previous = columnTypes[cell.column - 1]!;
        columnTypes[cell.column - 1] = previous === 'empty' || previous === type ? type : 'mixed';
      }
    }
    let rows = Array.from({ length: sheet.rows }, (_, i) => i + 1);
    if (p.filters.length)
      rows = rows.filter((row) =>
        p.filters.every((f) =>
          String(byRow.get(row)?.get(f.column)?.value ?? '')
            .toLocaleLowerCase()
            .includes(f.query.toLocaleLowerCase()),
        ),
      );
    if (p.sort) {
      const sort = p.sort;
      rows.sort((a, b) => {
        const x = byRow.get(a)?.get(sort.column)?.value ?? '',
          y = byRow.get(b)?.get(sort.column)?.value ?? '';
        const order =
          typeof x === 'number' && typeof y === 'number'
            ? x - y
            : String(x).localeCompare(String(y), 'zh-CN', { numeric: true });
        return (sort.direction === 'asc' ? order : -order) || a - b;
      });
    }
    const totalRows = rows.length;
    rows = rows.slice(p.offset, p.offset + p.limit);
    const visible = new Set(rows),
      anchors = new Set<string>();
    if (!p.sort && !p.filters.length)
      for (const range of sheet.mergedRanges ?? []) {
        const { start, end } = sheetRange(range);
        if (rows.some((row) => row >= start.row && row <= end.row))
          anchors.add(start.row + ':' + start.column);
      }
    const cells = sheet.cells.filter((c) => visible.has(c.row)),
      mergedAnchors = sheet.cells.filter(
        (c) => !visible.has(c.row) && anchors.has(c.row + ':' + c.column),
      );
    if (cells.length > 20000 || mergedAnchors.length > 200)
      throw new StorageError('OUTPUT_LIMIT_REACHED');
    this.repository.access(p);
    return {
      sheetId: sheet.id,
      rows,
      totalRows,
      columns: sheet.columns,
      columnTypes,
      cells,
      mergedAnchors,
      mergedRanges: sheet.mergedRanges ?? [],
    };
  }
}
