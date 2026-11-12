import {
  CanvasSnapshotSchema,
  CanvasSourceSchema,
  type CanvasSnapshot,
  type CanvasSourceSchema as SourceSchema,
  type CanvasView,
  type z,
} from '@tapkit/contracts';
import { newId, StorageError, type Store } from '@tapkit/storage';

type Source = z.infer<typeof SourceSchema>;
type VersionRow = {
  id: string;
  revision: number;
  parent_version_id: string | null;
  created_at: number;
  snapshot_json: string;
};

export class CanvasRepository {
  constructor(readonly store: Store) {}

  private row(id: string) {
    const row = this.store.db
      .prepare(
        'SELECT current_version_id, revision, source_json FROM canvas_documents WHERE id=? AND profile_id=?',
      )
      .get(id, this.store.profileId) as
      { current_version_id: string; revision: number; source_json: string } | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    return row;
  }

  get(id: string, versionId?: string): CanvasView {
    const row = this.row(id);
    const version = this.store.db
      .prepare('SELECT * FROM canvas_versions WHERE document_id=? AND id=?')
      .get(id, versionId ?? row.current_version_id) as VersionRow | undefined;
    if (!version) throw new StorageError('NOT_FOUND');
    return {
      ...CanvasSnapshotSchema.parse(JSON.parse(version.snapshot_json)),
      documentId: id,
      versionId: version.id,
      revision: version.revision,
      createdAt: version.created_at,
      source: CanvasSourceSchema.parse(JSON.parse(row.source_json)),
    };
  }

  list() {
    return this.store.db
      .prepare(
        `SELECT d.id documentId,d.updated_at updatedAt,json_extract(v.snapshot_json,'$.title') title
       FROM canvas_documents d JOIN canvas_versions v ON v.id=d.current_version_id
       WHERE d.profile_id=? ORDER BY d.updated_at DESC,d.id LIMIT 100`,
      )
      .all(this.store.profileId);
  }

  history(id: string, before?: number) {
    this.row(id);
    return this.store.db
      .prepare(
        `SELECT id versionId,revision,created_at createdAt,parent_version_id parentVersionId
       FROM canvas_versions WHERE document_id=? AND revision<? ORDER BY revision DESC LIMIT 50`,
      )
      .all(id, before ?? Number.MAX_SAFE_INTEGER);
  }

  assertBase(input: { documentId: string; baseVersion: string; revision: number }) {
    const current = this.get(input.documentId);
    if (input.baseVersion !== current.versionId || input.revision !== current.revision)
      throw new StorageError('CONFLICT', current.revision);
    return current;
  }

  create(snapshot: CanvasSnapshot, source: Source) {
    const id = newId();
    const version = newId();
    const now = this.store.now();
    const serialized = this.serialize(snapshot);
    return this.store.db.transaction(() => {
      this.store.db
        .prepare('INSERT INTO canvas_documents VALUES(?,?,?,?,?,?,?)')
        .run(
          id,
          this.store.profileId,
          version,
          1,
          now,
          now,
          JSON.stringify(CanvasSourceSchema.parse(source)),
        );
      this.store.db
        .prepare('INSERT INTO canvas_versions VALUES(?,?,?,?,?,?)')
        .run(version, id, null, 1, now, serialized);
      return this.get(id);
    })();
  }

  commit(previous: CanvasView, snapshot: CanvasSnapshot) {
    const serialized = this.serialize(snapshot);
    const id = newId();
    const now = this.store.now();
    return this.store.db.transaction(() => {
      const changed = this.store.db
        .prepare(
          `UPDATE canvas_documents SET current_version_id=?,revision=revision+1,updated_at=?
         WHERE id=? AND profile_id=? AND current_version_id=? AND revision=?`,
        )
        .run(
          id,
          now,
          previous.documentId,
          this.store.profileId,
          previous.versionId,
          previous.revision,
        );
      if (!changed.changes) throw new StorageError('CONFLICT');
      this.store.db
        .prepare('INSERT INTO canvas_versions VALUES(?,?,?,?,?,?)')
        .run(id, previous.documentId, previous.versionId, previous.revision + 1, now, serialized);
      return this.get(previous.documentId);
    })();
  }

  private serialize({ title, content, style, threads }: CanvasSnapshot) {
    const snapshot = CanvasSnapshotSchema.parse({
      title,
      content,
      ...(style ? { style } : {}),
      threads,
    });
    const json = JSON.stringify(snapshot);
    if (Buffer.byteLength(json) > 2_000_000) throw new StorageError('OUTPUT_LIMIT_REACHED');
    return json;
  }
}
