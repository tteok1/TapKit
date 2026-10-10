import { createHash } from 'node:crypto';
import {
  ArtifactAccessSchema,
  ArtifactCommandSchemas,
  AnnotationViewSchema,
  ReadingPositionSchema,
  LocatorSchema,
  TextRangeSchema,
  IdSchema,
  type ArtifactAccess,
  type AnnotationView,
  type Locator,
  type ParsedDocument,
  ReplySchema,
  pdfRectsIntersect,
  type Request,
  type FileOwner,
  type z,
} from '@tapkit/contracts';
import { FileRepository } from './files';
import { newId, StorageError } from './foundation';

const digest = (text: string) => createHash('sha256').update(text).digest('hex');
export function documentText(doc: ParsedDocument) {
  return doc.blocks.map((block) => block.text).join('\n');
}
export function sheetRange(value: string) {
  const address = (v: string) => {
    const match = /^([A-Z]+)([1-9]\d*)$/.exec(v);
    if (!match) throw new StorageError('VALIDATION_ERROR');
    const column = [...match[1]!].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
    return { column, row: Number(match[2]) };
  };
  const parts = value.split(':');
  const start = address(parts[0]!),
    end = address(parts[1] ?? parts[0]!);
  if (end.column < start.column || end.row < start.row) throw new StorageError('VALIDATION_ERROR');
  return { start, end };
}
export function locatedText(doc: ParsedDocument, raw: Locator): string {
  const locator = LocatorSchema.parse(raw);
  switch (locator.kind) {
    case 'pdf':
      if (doc.format !== 'pdf' || locator.pageIndex >= doc.pages.length)
        throw new StorageError('CONFLICT');
      return doc.blocks
        .filter(
          (b) =>
            b.locator.kind === 'pdf' &&
            b.locator.pageIndex === locator.pageIndex &&
            (!locator.rects?.length ||
              b.locator.rects?.some((r) =>
                locator.rects!.some((picked) => pdfRectsIntersect(r, picked)),
              )),
        )
        .map((b) => b.text)
        .join('\n');
    case 'text': {
      if (!['text', 'markdown', 'code', 'docx'].includes(doc.format))
        throw new StorageError('CONFLICT');
      if (
        locator.paragraphId &&
        !doc.blocks.some(
          (b) =>
            b.locator.kind === 'text' &&
            b.locator.paragraphId === locator.paragraphId &&
            locator.start >= b.locator.start &&
            locator.end <= b.locator.end,
        )
      )
        throw new StorageError('CONFLICT');
      const text = documentText(doc);
      if (locator.end > text.length) throw new StorageError('CONFLICT');
      return text.slice(locator.start, locator.end);
    }
    case 'sheet': {
      const sheet = doc.sheets.find((s) => s.id === locator.sheetId);
      if (doc.format !== 'sheet' || !sheet) throw new StorageError('CONFLICT');
      const { start, end } = sheetRange(locator.range);
      if (end.row > sheet.rows || end.column > sheet.columns) throw new StorageError('CONFLICT');
      return sheet.cells
        .filter(
          (c) =>
            c.row >= start.row &&
            c.row <= end.row &&
            c.column >= start.column &&
            c.column <= end.column,
        )
        .sort((a, b) => a.row - b.row || a.column - b.column)
        .map((c) => String(c.value ?? (c.formula ? '未计算' : '')))
        .join('\t');
    }
    case 'slide': {
      const slide = doc.slides.find((s) => s.index === locator.slideIndex);
      if (doc.format !== 'pptx' || !slide) throw new StorageError('CONFLICT');
      const blocks = doc.blocks.filter(
        (b) =>
          b.locator.kind === 'slide' &&
          b.locator.slideIndex === locator.slideIndex &&
          (!locator.shapeId || b.locator.shapeId === locator.shapeId),
      );
      if (locator.shapeId && !blocks.length) throw new StorageError('CONFLICT');
      return blocks.map((b) => b.text).join('\n');
    }
    case 'code': {
      if (
        doc.format !== 'code' ||
        !doc.blocks.some((b) => b.locator.kind === 'code' && b.locator.path === locator.path)
      )
        throw new StorageError('CONFLICT');
      const lines = documentText(doc).split('\n');
      if (locator.lineEnd > lines.length) throw new StorageError('CONFLICT');
      return lines.slice(locator.lineStart - 1, locator.lineEnd).join('\n');
    }
    default:
      throw new StorageError('CONFLICT');
  }
}
export function selectedMaterial(
  doc: ParsedDocument,
  locator: Locator,
  range?: z.infer<typeof TextRangeSchema>,
) {
  let text = locatedText(doc, locator);
  if (range) {
    range = TextRangeSchema.parse(range);
    if (range.end > text.length) throw new StorageError('CONFLICT');
    text = text.slice(range.start, range.end);
  }
  if (text.length > 100_000) throw new StorageError('OUTPUT_LIMIT_REACHED');
  return { text, hash: digest(text) };
}

/** Version and scope checks apply on every operation and again after file I/O. */
export class ArtifactRepository {
  constructor(readonly files: FileRepository) {}
  get store() {
    return this.files.store;
  }
  access(raw: ArtifactAccess) {
    const access = ArtifactAccessSchema.parse({
      fileId: raw.fileId,
      versionId: raw.versionId,
      ...(raw.owner ? { owner: raw.owner } : {}),
    });
    return this.files.get(access.fileId, {
      versionId: access.versionId,
      ...(access.owner ? { owner: access.owner } : {}),
    });
  }
  forVersion(versionId: string, owner?: FileOwner): ArtifactAccess {
    IdSchema.parse(versionId);
    const row = this.store.db
      .prepare(
        'SELECT file_id FROM file_versions WHERE id=? AND profile_id=? AND deleted_at IS NULL',
      )
      .get(versionId, this.store.profileId) as { file_id: string } | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    const access = { fileId: row.file_id, versionId, ...(owner ? { owner } : {}) };
    this.access(access);
    return access;
  }
  document(access: ArtifactAccess) {
    this.access(access);
    return this.files.parsed(access.fileId, {
      versionId: access.versionId,
      ...(access.owner ? { owner: access.owner } : {}),
    });
  }
  position(access: ArtifactAccess) {
    this.access(access);
    const row = this.store.db
      .prepare(
        'SELECT position_json FROM reading_positions WHERE profile_id=? AND file_version_id=?',
      )
      .get(this.store.profileId, access.versionId) as { position_json: string } | undefined;
    return ReadingPositionSchema.parse(row ? JSON.parse(row.position_json) : {});
  }
  async savePosition(
    raw: z.infer<(typeof ArtifactCommandSchemas)['artifacts.reading']>,
    request?: Request,
  ) {
    const { position, ...access } = ArtifactCommandSchemas['artifacts.reading'].parse(raw);
    if (position.locator) locatedText(await this.document(access), position.locator);
    const commit = () => {
      this.access(access);
      this.store.db
        .prepare(
          'INSERT INTO reading_positions(profile_id,file_version_id,position_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(profile_id,file_version_id) DO UPDATE SET position_json=excluded.position_json,updated_at=excluded.updated_at',
        )
        .run(this.store.profileId, access.versionId, JSON.stringify(position), this.store.now());
    };
    if (request)
      this.store.receipt(request, () => {
        commit();
        return ReplySchema.parse({
          ok: true,
          requestId: request.requestId,
          data: { changedIds: [access.versionId] },
        });
      });
    else commit();
    return access.versionId;
  }
  async selection(raw: z.infer<(typeof ArtifactCommandSchemas)['artifacts.selection']>) {
    const { locator, textRange, expectedTextHash, ...access } =
      ArtifactCommandSchemas['artifacts.selection'].parse(raw);
    const selected = selectedMaterial(await this.document(access), locator, textRange);
    this.access(access);
    if (expectedTextHash && selected.hash !== expectedTextHash) throw new StorageError('CONFLICT');
    return {
      ref: {
        kind: 'file' as const,
        fileId: access.fileId,
        versionId: access.versionId,
        locator,
        selection: { selectedTextHash: selected.hash, ...(textRange ? { textRange } : {}) },
      },
      selectedText: selected.text,
      selectedTextHash: selected.hash,
      ...(textRange ? { textRange } : {}),
    };
  }
  annotations(versionId: string, owner?: FileOwner): AnnotationView[] {
    this.forVersion(versionId, owner);
    return (
      this.store.db
        .prepare(
          'SELECT annotation_json FROM pdf_annotations WHERE profile_id=? AND file_version_id=? AND deleted_at IS NULL ORDER BY created_at,id',
        )
        .all(this.store.profileId, versionId) as { annotation_json: string }[]
    ).map((row) => AnnotationViewSchema.parse(JSON.parse(row.annotation_json)));
  }
  async upsert(
    raw: z.infer<(typeof ArtifactCommandSchemas)['annotations.upsert']>,
    request?: Request,
  ) {
    const input = ArtifactCommandSchemas['annotations.upsert'].parse(raw);
    const access = this.forVersion(input.fileVersionId, input.owner);
    const selected = selectedMaterial(await this.document(access), input.locator, input.textRange);
    if (selected.hash !== input.selectedTextHash) throw new StorageError('CONFLICT');
    const commit = () =>
      this.store.db.transaction(() => {
        this.access(access);
        const old = input.id
          ? this.annotations(input.fileVersionId, input.owner).find((a) => a.id === input.id)
          : undefined;
        if (input.id && !old) throw new StorageError('NOT_FOUND');
        if (old && old.revision !== input.expectedRevision) throw new StorageError('CONFLICT');
        if (!old && this.annotations(input.fileVersionId, input.owner).length >= 10000)
          throw new StorageError('OUTPUT_LIMIT_REACHED');
        const now = this.store.now();
        const view = AnnotationViewSchema.parse({
          id: old?.id ?? newId(),
          fileVersionId: input.fileVersionId,
          locator: input.locator,
          ...(input.textRange ? { textRange: input.textRange } : {}),
          selectedTextHash: selected.hash,
          body: input.body,
          color: input.color,
          revision: (old?.revision ?? 0) + 1,
          updatedAt: now,
        });
        this.store.db
          .prepare(
            'INSERT INTO pdf_annotations(id,profile_id,file_version_id,created_at,updated_at,revision,annotation_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,revision=excluded.revision,annotation_json=excluded.annotation_json',
          )
          .run(
            view.id,
            this.store.profileId,
            view.fileVersionId,
            now,
            now,
            view.revision,
            JSON.stringify(view),
          );
        this.store.emit('workspace.updated', { kind: 'workspace', entityId: access.fileId });
        return view;
      })();
    if (!request) return commit();
    const reply = this.store.receipt(request, () =>
      ReplySchema.parse({ ok: true, requestId: request.requestId, data: { annotation: commit() } }),
    );
    if (!reply.ok || !('annotation' in reply.data)) throw new StorageError('CONFLICT');
    return reply.data.annotation;
  }
  deleteAnnotations(
    raw: z.infer<(typeof ArtifactCommandSchemas)['annotations.delete']>,
    request?: Request,
  ) {
    const input = ArtifactCommandSchemas['annotations.delete'].parse(raw);
    const access = this.forVersion(input.fileVersionId, input.owner);
    const commit = () =>
      this.store.db.transaction(() => {
        this.access(access);
        const permitted = new Set(
          this.annotations(input.fileVersionId, input.owner).map((a) => a.id),
        );
        if (input.ids.some((id) => !permitted.has(id))) throw new StorageError('PERMISSION_DENIED');
        for (const id of input.ids)
          this.store.db
            .prepare(
              'UPDATE pdf_annotations SET deleted_at=?,updated_at=?,revision=revision+1 WHERE id=? AND profile_id=? AND file_version_id=?',
            )
            .run(this.store.now(), this.store.now(), id, this.store.profileId, input.fileVersionId);
        this.store.emit('workspace.updated', { kind: 'workspace', entityId: access.fileId });
        return input.ids;
      })();
    if (!request) return commit();
    const reply = this.store.receipt(request, () =>
      ReplySchema.parse({ ok: true, requestId: request.requestId, data: { changedIds: commit() } }),
    );
    if (!reply.ok || !('changedIds' in reply.data)) throw new StorageError('CONFLICT');
    return reply.data.changedIds;
  }
}
