import {
  FileNameSchema,
  FileRelativePathSchema,
  FileListSchema,
  FileViewSchema,
  FileVersionViewSchema,
  FolderViewSchema,
  FileUsageSchema,
  FileStorageSchema,
  ParsedDocumentSchema,
  FileOwnerSchema,
  FILE_PARSER_VERSION,
  IdSchema,
  type FileOwner,
  type ParsedDocument,
} from '@tapkit/contracts';
import { Store, newId, StorageError } from './foundation';
import { BlobStore } from './blobs';
import { JobQueue, type Job } from './jobs';
import { statfs } from 'node:fs/promises';

export { FILE_PARSER_VERSION } from '@tapkit/contracts';
const RETENTION_MS = 30 * 86400000;
// Prefer the explicit FileRepository source link; keep one deterministic file
// card even when historical attachment roles also reference this owner.
const scopedVersionSql = `(SELECT l.pinned_version_id FROM resource_links l
  WHERE l.resource_type='file' AND l.resource_id=f.id AND l.profile_id=f.profile_id
  AND l.owner_type=? AND l.owner_id=? AND l.deleted_at IS NULL
  ORDER BY CASE l.role WHEN 'source' THEN 0 ELSE 1 END,l.updated_at DESC,l.id LIMIT 1)`;
type FileRow = {
  id: string;
  profile_id: string;
  display_name: string;
  extension: string;
  mime: string;
  kind: string;
  source_type: string;
  revision: number;
  status: string;
  folder_id: string | null;
  current_version_id: string;
  favorite: number;
  relative_path: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  purge_after: number | null;
};
type VersionRow = {
  id: string;
  file_id: string;
  version: number;
  blob_id: string;
  sha256: string;
  size_bytes: number;
  display_name: string;
  extension: string;
  mime: string;
  created_at: number;
  parser_version: string | null;
  parse_status: string;
  preview_status: string;
  error_code: string | null;
  error_reason: string | null;
};
type FolderRow = {
  id: string;
  name: string;
  owner_kind: string;
  owner_id: string;
  parent_id: string | null;
  revision: number;
};

// Only trusted Core callers supply blob IDs. Host paths never enter this repository or its DTOs.
export class FileRepository {
  readonly jobs: JobQueue;
  constructor(
    readonly store: Store,
    readonly blobs: BlobStore,
  ) {
    this.jobs = new JobQueue(store);
  }
  private row(id: string, trash = false) {
    IdSchema.parse(id);
    const row = this.store.db
      .prepare('SELECT * FROM files WHERE id=? AND profile_id=?')
      .get(id, this.store.profileId) as FileRow | undefined;
    if (!row || (!trash && row.deleted_at !== null) || this.permanentlyDeleted(id))
      throw new StorageError('NOT_FOUND');
    return row;
  }
  private permanentlyDeleted(id: string) {
    return !!this.store.db
      .prepare(
        "SELECT 1 FROM deletion_tombstones WHERE profile_id=? AND entity_type='file' AND entity_id=?",
      )
      .get(this.store.profileId, id);
  }
  private version(fileId: string, id: string) {
    IdSchema.parse(id);
    const row = this.store.db
      .prepare(
        'SELECT * FROM file_versions WHERE id=? AND file_id=? AND profile_id=? AND deleted_at IS NULL',
      )
      .get(id, fileId, this.store.profileId) as VersionRow | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    return row;
  }
  private owner(owner: FileOwner) {
    owner = FileOwnerSchema.parse(owner);
    if (owner.type === 'library') return;
    const table = owner.type === 'project' ? 'projects' : 'sessions';
    if (
      !this.store.db
        .prepare(`SELECT id FROM ${table} WHERE id=? AND profile_id=? AND deleted_at IS NULL`)
        .get(owner.id, this.store.profileId)
    )
      throw new StorageError('PERMISSION_DENIED');
  }
  private checkScope(fileId: string, owner?: FileOwner, versionId?: string) {
    if (!owner) return;
    this.owner(owner);
    if (
      owner.type !== 'library' &&
      !this.store.db
        .prepare(
          "SELECT id FROM resource_links WHERE resource_type='file' AND resource_id=? AND owner_type=? AND owner_id=? AND profile_id=? AND deleted_at IS NULL AND (? IS NULL OR pinned_version_id=?)",
        )
        .get(
          fileId,
          owner.type,
          owner.id,
          this.store.profileId,
          versionId ?? null,
          versionId ?? null,
        )
    )
      throw new StorageError('PERMISSION_DENIED');
  }
  private changed(id: string) {
    this.store.db
      .prepare('UPDATE files SET revision=revision+1,updated_at=? WHERE id=?')
      .run(this.store.now(), id);
    this.store.emit('workspace.updated', { kind: 'workspace', entityId: id });
  }
  private checkRevision(row: FileRow | FolderRow, revision?: number) {
    if (revision === undefined) throw new StorageError('VALIDATION_ERROR');
    if (row.revision !== revision) throw new StorageError('CONFLICT', row.revision);
  }
  private folder(id: string, owner?: FileOwner) {
    IdSchema.parse(id);
    const row = this.store.db
      .prepare('SELECT * FROM folders WHERE id=? AND profile_id=? AND deleted_at IS NULL')
      .get(id, this.store.profileId) as FolderRow | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    const actual: FileOwner =
      row.owner_kind === 'project' ? { type: 'project', id: row.owner_id } : { type: 'library' };
    this.owner(actual);
    if (owner && JSON.stringify(actual) !== JSON.stringify(owner))
      throw new StorageError('PERMISSION_DENIED');
    return row;
  }
  private versionView(v: VersionRow, fallback: FileRow) {
    return FileVersionViewSchema.parse({
      id: v.id,
      version: v.version,
      name: v.display_name || fallback.display_name,
      extension: v.display_name ? v.extension : fallback.extension,
      mime: v.display_name ? v.mime : fallback.mime,
      sha256: v.sha256,
      sizeBytes: v.size_bytes,
      createdAt: v.created_at,
      parserVersion: v.parser_version,
      parseStatus: v.parse_status,
      previewStatus: v.preview_status,
      errorCode: v.error_code,
      errorReason: v.error_reason,
    });
  }
  // A linked file keeps its physical shared parent. In a different owner's
  // tree it appears at root, rather than under an inaccessible foreign folder.
  private folderProjection(owner?: FileOwner): { sql: string; args: string[] } {
    if (!owner) return { sql: 'f.folder_id', args: [] };
    if (owner.type === 'session') return { sql: 'NULL', args: [] };
    return {
      sql: `CASE WHEN EXISTS(SELECT 1 FROM folders d WHERE d.id=f.folder_id
        AND d.profile_id=f.profile_id AND d.deleted_at IS NULL
        AND d.owner_kind=? AND d.owner_id=?) THEN f.folder_id ELSE NULL END`,
      args: owner.type === 'project' ? ['project', owner.id] : ['file', this.store.profileId],
    };
  }
  get(id: string, options: { versionId?: string; owner?: FileOwner; trash?: boolean } = {}) {
    const row = this.row(id, options.trash);
    let versionId = options.versionId ?? row.current_version_id;
    if (!options.versionId && options.owner && options.owner.type !== 'library') {
      this.owner(options.owner);
      const linked = this.store.db
        .prepare(
          `SELECT ${scopedVersionSql} version_id FROM files f WHERE f.id=? AND f.profile_id=?`,
        )
        .get(options.owner.type, options.owner.id, id, this.store.profileId) as
        | {
            version_id: string | null;
          }
        | undefined;
      if (!linked?.version_id) throw new StorageError('PERMISSION_DENIED');
      versionId = linked.version_id;
    }
    const v = this.version(id, versionId);
    this.checkScope(id, options.owner, v.id);
    const projection = this.folderProjection(options.owner);
    const folderId = options.owner
      ? (
          this.store.db
            .prepare(
              `SELECT ${projection.sql} folder_id FROM files f WHERE f.id=? AND f.profile_id=?`,
            )
            .get(...projection.args, id, this.store.profileId) as { folder_id: string | null }
        ).folder_id
      : row.folder_id;
    const version = this.versionView(v, row);
    const historicalStatus =
      v.parse_status === 'ready'
        ? 'ready'
        : v.parse_status === 'parsing'
          ? 'parsing'
          : v.parse_status === 'pending'
            ? 'imported'
            : 'failed';
    const links = this.store.db
      .prepare(
        "SELECT DISTINCT owner_type,owner_id FROM resource_links WHERE resource_type='file' AND resource_id=? AND profile_id=? AND deleted_at IS NULL AND owner_type IN ('project','session') LIMIT 2001",
      )
      .all(id, this.store.profileId) as { owner_type: 'project' | 'session'; owner_id: string }[];
    return FileViewSchema.parse({
      id,
      name: row.display_name,
      extension: version.extension,
      mime: version.mime,
      kind: row.kind,
      source: row.source_type,
      revision: row.revision,
      status: v.id === row.current_version_id ? row.status : historicalStatus,
      folderId,
      currentVersionId: row.current_version_id,
      version,
      favorite: !!row.favorite,
      relativePath: row.relative_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      purgeAfter: row.purge_after,
      owners: [{ type: 'library' }, ...links.map((l) => ({ type: l.owner_type, id: l.owner_id }))],
    });
  }
  list(raw: unknown) {
    const p = FileListSchema.parse(raw);
    if (p.owner) this.owner(p.owner);
    if (p.folderId) this.folder(p.folderId, p.owner);
    const conditions = [
      'f.profile_id=?',
      p.trash ? 'f.deleted_at IS NOT NULL' : 'f.deleted_at IS NULL',
      "NOT EXISTS(SELECT 1 FROM deletion_tombstones t WHERE t.profile_id=f.profile_id AND t.entity_type='file' AND t.entity_id=f.id)",
    ];
    const args: (string | number | null)[] = [this.store.profileId];
    const scopedOwner = p.owner && p.owner.type !== 'library' ? p.owner : undefined;
    const joinArgs = scopedOwner ? [scopedOwner.type, scopedOwner.id] : [];
    if (p.owner && p.owner.type !== 'library') {
      conditions.push(
        "EXISTS(SELECT 1 FROM resource_links l WHERE l.resource_type='file' AND l.resource_id=f.id AND l.profile_id=f.profile_id AND l.owner_type=? AND l.owner_id=? AND l.deleted_at IS NULL)",
      );
      args.push(p.owner.type, p.owner.id);
    }
    if (p.folderId !== undefined) {
      const projection = this.folderProjection(p.owner);
      conditions.push(`(${projection.sql}) IS ?`);
      args.push(...projection.args, p.folderId);
    }
    if (p.type) {
      conditions.push("CASE WHEN v.display_name='' THEN f.extension ELSE v.extension END=?");
      args.push(p.type.toLowerCase());
    }
    if (p.source) {
      conditions.push('f.source_type=?');
      args.push(p.source);
    }
    if (p.updatedAfter !== undefined) {
      conditions.push('f.updated_at>=?');
      args.push(p.updatedAfter);
    }
    if (p.updatedBefore !== undefined) {
      conditions.push('f.updated_at<=?');
      args.push(p.updatedBefore);
    }
    if (p.favorite) conditions.push('f.favorite=1');
    if (p.query) {
      // instr is literal and also supports one/two-character Chinese terms that trigram MATCH cannot.
      conditions.push(
        '(instr(lower(f.display_name),lower(?))>0 OR EXISTS(SELECT 1 FROM file_search_documents s WHERE s.file_version_id=v.id AND s.profile_id=f.profile_id AND instr(lower(s.body),lower(?))>0))',
      );
      args.push(p.query, p.query);
    }
    let offset = 0;
    if (p.cursor) {
      try {
        const c = JSON.parse(Buffer.from(p.cursor, 'base64url').toString()) as {
          offset?: unknown;
          filter?: unknown;
        };
        if (
          !Number.isSafeInteger(c.offset) ||
          Number(c.offset) < 0 ||
          Number(c.offset) > 1000000 ||
          c.filter !== JSON.stringify({ ...p, cursor: undefined })
        )
          throw new Error();
        offset = Number(c.offset);
      } catch {
        throw new StorageError('VALIDATION_ERROR');
      }
    }
    const order =
      p.sort === 'name'
        ? 'f.display_name COLLATE NOCASE,f.id'
        : p.sort === 'size'
          ? 'v.size_bytes DESC,f.id'
          : 'f.updated_at DESC,f.id';
    const rows = this.store.db
      .prepare(
        `SELECT f.id FROM files f JOIN file_versions v ON v.id=${scopedOwner ? scopedVersionSql : 'f.current_version_id'} AND v.file_id=f.id AND v.profile_id=f.profile_id AND v.deleted_at IS NULL WHERE ${conditions.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`,
      )
      .all(...joinArgs, ...args, p.limit + 1, offset) as { id: string }[];
    return {
      files: rows
        .slice(0, p.limit)
        .map((r) => this.get(r.id, { trash: p.trash, ...(p.owner ? { owner: p.owner } : {}) })),
      nextCursor:
        rows.length > p.limit
          ? Buffer.from(
              JSON.stringify({
                offset: offset + p.limit,
                filter: JSON.stringify({ ...p, cursor: undefined }),
              }),
            ).toString('base64url')
          : null,
    };
  }
  // Called after the immutable bytes are durably stored; the DB operation is atomic.
  validateImportTarget(owner: FileOwner, folderId?: string, replacements: string[] = []) {
    this.owner(owner);
    if (folderId) this.folder(folderId, owner);
    return replacements.map((id) => {
      const row = this.row(id);
      this.checkScope(id, owner);
      return { id, revision: row.revision };
    });
  }
  importBlob(input: {
    blobId: string;
    name: string;
    relativePath: string;
    owner: FileOwner;
    folderId?: string;
    replaceId?: string;
    skip?: boolean;
  }) {
    const name = FileNameSchema.parse(input.name),
      relativePath = FileRelativePathSchema.parse(input.relativePath);
    this.owner(input.owner);
    if (input.folderId) this.folder(input.folderId, input.owner);
    return this.store.db.transaction(() => {
      const blob = this.store.db
        .prepare(
          "SELECT * FROM blobs WHERE id=? AND profile_id=? AND state='ready' AND deleted_at IS NULL",
        )
        .get(IdSchema.parse(input.blobId), this.store.profileId) as
        { id: string; sha256: string; size_bytes: number; media_type: string } | undefined;
      if (!blob) throw new StorageError('NOT_FOUND');
      if (input.skip) {
        const existing = this.list({ owner: input.owner, query: name, limit: 100 }).files.find(
          (f) => f.name === name && f.version.sha256 === blob.sha256,
        );
        if (existing) return { file: existing, skipped: true };
      }
      const now = this.store.now(),
        extension = name.includes('.') ? name.split('.').at(-1)!.toLowerCase() : '';
      let id: string;
      if (input.replaceId) {
        const row = this.row(input.replaceId);
        this.checkScope(row.id, input.owner);
        id = row.id;
      } else {
        id = newId();
        this.store.db
          .prepare(
            "INSERT INTO files(id,profile_id,created_at,updated_at,display_name,extension,mime,kind,status,source_type,folder_id,relative_path) VALUES(?,?,?,?,?,?,?,'input','imported','import',?,?)",
          )
          .run(
            id,
            this.store.profileId,
            now,
            now,
            name,
            extension,
            blob.media_type,
            input.folderId ?? null,
            relativePath,
          );
      }
      const v = newId(),
        number = (
          this.store.db
            .prepare('SELECT coalesce(max(version),0)+1 n FROM file_versions WHERE file_id=?')
            .get(id) as { n: number }
        ).n;
      this.store.db
        .prepare(
          "INSERT INTO file_versions(id,profile_id,created_at,updated_at,file_id,version,blob_id,size_bytes,sha256,parse_status,preview_status,display_name,extension,mime) VALUES(?,?,?,?,?,?,?,?,?,'pending','pending',?,?,?)",
        )
        .run(
          v,
          this.store.profileId,
          now,
          now,
          id,
          number,
          blob.id,
          blob.size_bytes,
          blob.sha256,
          name,
          extension,
          blob.media_type,
        );
      this.store.db
        .prepare('UPDATE blobs SET reference_count=reference_count+1 WHERE id=?')
        .run(blob.id);
      this.store.db
        .prepare(
          "UPDATE files SET current_version_id=?,display_name=?,extension=?,mime=?,relative_path=?,status='imported' WHERE id=?",
        )
        .run(v, name, extension, blob.media_type, relativePath, id);
      this.link(id, v, input.owner);
      this.queueParse(v);
      this.changed(id);
      return { file: this.get(id), skipped: false };
    })();
  }
  link(id: string, versionId: string | undefined, owner: FileOwner) {
    const row = this.row(id);
    this.owner(owner);
    const v = this.version(id, versionId ?? row.current_version_id);
    if (owner.type === 'library') return;
    const now = this.store.now();
    let index = this.store.db
      .prepare(
        "SELECT index_version FROM parsed_documents WHERE file_version_id=? AND profile_id=? AND deleted_at IS NULL AND status='ready'",
      )
      .get(v.id, this.store.profileId) as { index_version: number } | undefined;
    if (
      !index &&
      v.parser_version === null &&
      v.parse_status === 'ready' &&
      this.store.db
        .prepare('SELECT 1 FROM file_search_documents WHERE file_version_id=? AND profile_id=?')
        .get(v.id, this.store.profileId)
    )
      index = { index_version: 1 };
    if (owner.type === 'project') {
      const old = this.store.db
        .prepare(
          "SELECT pinned_version_id FROM resource_links WHERE resource_type='file' AND resource_id=? AND owner_type='project' AND owner_id=? AND role='source' AND profile_id=? AND deleted_at IS NULL",
        )
        .get(id, owner.id, this.store.profileId) as
        { pinned_version_id: string | null } | undefined;
      const validOld =
        old?.pinned_version_id &&
        this.store.db
          .prepare(
            'SELECT 1 FROM file_versions WHERE id=? AND file_id=? AND profile_id=? AND deleted_at IS NULL',
          )
          .get(old.pinned_version_id, id, this.store.profileId);
      if (
        old &&
        validOld &&
        old.pinned_version_id !== v.id &&
        (v.parse_status !== 'ready' || !index)
      ) {
        this.store.db
          .prepare(
            "UPDATE resource_links SET pending_version_id=?,updated_at=?,revision=revision+1 WHERE resource_type='file' AND resource_id=? AND owner_type='project' AND owner_id=? AND role='source' AND profile_id=? AND deleted_at IS NULL",
          )
          .run(v.id, now, id, owner.id, this.store.profileId);
        return;
      }
    }
    this.store.db
      .prepare(
        "INSERT INTO resource_links(id,profile_id,created_at,updated_at,resource_type,resource_id,owner_type,owner_id,role,pinned_version_id) VALUES(?,?,?,?,'file',?,?,?,'source',?) ON CONFLICT(resource_type,resource_id,owner_type,owner_id,role) DO UPDATE SET deleted_at=NULL,pinned_version_id=excluded.pinned_version_id,updated_at=excluded.updated_at,revision=resource_links.revision+1",
      )
      .run(newId(), this.store.profileId, now, now, id, owner.type, owner.id, v.id);
    this.store.db
      .prepare(
        "UPDATE resource_links SET active_index_version=?,pending_version_id=NULL WHERE resource_type='file' AND resource_id=? AND owner_type=? AND owner_id=? AND role='source' AND profile_id=? AND deleted_at IS NULL",
      )
      .run(
        v.parse_status === 'ready' ? (index?.index_version ?? 0) : 0,
        id,
        owner.type,
        owner.id,
        this.store.profileId,
      );
  }
  unlink(ids: string[], owner: FileOwner) {
    this.owner(owner);
    if (owner.type === 'library') throw new StorageError('VALIDATION_ERROR');
    return this.store.db.transaction(() => {
      for (const id of ids) {
        this.row(id);
        this.checkScope(id, owner);
      }
      for (const id of ids) {
        this.store.db
          .prepare(
            "UPDATE resource_links SET deleted_at=?,revision=revision+1 WHERE resource_type='file' AND resource_id=? AND profile_id=? AND owner_type=? AND owner_id=? AND deleted_at IS NULL",
          )
          .run(this.store.now(), id, this.store.profileId, owner.type, owner.id);
        this.changed(id);
      }
      return ids;
    })();
  }
  rename(id: string, name: string, revision?: number) {
    name = FileNameSchema.parse(name);
    return this.store.db.transaction(() => {
      const row = this.row(id);
      this.checkRevision(row, revision);
      // Display rename never changes the format of the immutable version.
      this.store.db.prepare('UPDATE files SET display_name=? WHERE id=?').run(name, id);
      this.changed(id);
      return this.get(id);
    })();
  }
  move(id: string, folderId: string | null, revision?: number) {
    return this.store.db.transaction(() => {
      const row = this.row(id);
      this.checkRevision(row, revision);
      if (folderId) {
        const f = this.folder(folderId);
        if (f.owner_kind === 'project') this.checkScope(id, { type: 'project', id: f.owner_id });
      }
      this.store.db.prepare('UPDATE files SET folder_id=? WHERE id=?').run(folderId, id);
      this.changed(id);
      return this.get(id);
    })();
  }
  favorite(id: string, favorite: boolean, revision?: number) {
    return this.store.db.transaction(() => {
      const row = this.row(id);
      this.checkRevision(row, revision);
      this.store.db.prepare('UPDATE files SET favorite=? WHERE id=?').run(+favorite, id);
      this.changed(id);
      return this.get(id);
    })();
  }
  copy(
    id: string,
    versionId: string | undefined,
    name: string,
    owner: FileOwner,
    folderId?: string,
  ) {
    const row = this.row(id),
      v = this.version(id, versionId ?? row.current_version_id);
    // Shared immutable bytes, independent file ID and future versions; keep the original format.
    const extension = name.includes('.') ? name.split('.').at(-1)!.toLowerCase() : '';
    if (extension !== (v.display_name ? v.extension : row.extension))
      throw new StorageError('FORMAT_UNSUPPORTED');
    return this.importBlob({
      blobId: v.blob_id,
      name,
      relativePath: name,
      owner,
      ...(folderId ? { folderId } : {}),
    }).file;
  }
  restoreVersion(id: string, versionId: string, revision?: number) {
    return this.store.db.transaction(() => {
      const row = this.row(id);
      this.checkRevision(row, revision);
      const v = this.version(id, versionId);
      const restored = this.importBlob({
        blobId: v.blob_id,
        name: v.display_name || row.display_name,
        relativePath: v.display_name || row.display_name,
        owner: { type: 'library' },
        replaceId: id,
      });
      this.store.db
        .prepare('UPDATE file_versions SET restored_from_version_id=? WHERE id=?')
        .run(v.id, restored.file.currentVersionId);
      return restored.file;
    })();
  }
  versions(id: string, trash = false) {
    const row = this.row(id, trash);
    return (
      this.store.db
        .prepare(
          'SELECT * FROM file_versions WHERE file_id=? AND profile_id=? AND deleted_at IS NULL ORDER BY version DESC LIMIT 1001',
        )
        .all(id, this.store.profileId) as VersionRow[]
    ).map((v) => this.versionView(v, row));
  }
  usage(id: string, trash = false) {
    this.row(id, trash);
    const links = this.store.db
      .prepare(
        `SELECT l.id,l.owner_type,l.owner_id,l.pinned_version_id,l.role,
        substr(CASE WHEN l.owner_type='project' THEN p.name ELSE s.title END,1,240) owner_name
        FROM resource_links l
        LEFT JOIN projects p ON l.owner_type='project' AND p.id=l.owner_id AND p.profile_id=l.profile_id AND p.deleted_at IS NULL
        LEFT JOIN sessions s ON l.owner_type='session' AND s.id=l.owner_id AND s.profile_id=l.profile_id AND s.deleted_at IS NULL
        WHERE l.resource_type='file' AND l.resource_id=? AND l.profile_id=? AND l.deleted_at IS NULL
        AND (p.id IS NOT NULL OR s.id IS NOT NULL)
        ORDER BY l.created_at DESC,l.id DESC LIMIT 2001`,
      )
      .all(id, this.store.profileId) as {
      id: string;
      owner_type: 'project' | 'session';
      owner_id: string;
      pinned_version_id: string | null;
      role: string;
      owner_name: string;
    }[];
    // Accepted run attachments are the source of usage history. A saved link or queued input alone
    // is not a task usage. No second task state or mutable link backfill is needed for old profiles.
    const records = this.store.db
      .prepare(
        `
      WITH refs AS (
        SELECT r.id runId,r.task_id taskId,r.task_version taskVersion,r.session_id sessionId,
          substr(s.title,1,240) sessionTitle,substr(tv.goal,1,160) taskTitle,
          r.created_at createdAt,r.status,
          CASE WHEN a.type='object' THEN a.value ELSE '{}' END ref
        FROM runs r JOIN tasks t ON t.id=r.task_id AND t.profile_id=r.profile_id AND t.session_id=r.session_id
        JOIN task_versions tv ON tv.task_id=t.id AND tv.version=r.task_version AND tv.profile_id=r.profile_id
        JOIN sessions s ON s.id=r.session_id AND s.profile_id=r.profile_id
        JOIN messages m ON m.id=r.user_message_id AND m.session_id=r.session_id AND m.profile_id=r.profile_id
        JOIN json_each(CASE WHEN json_valid(m.chat_json) THEN m.chat_json ELSE '{}' END,'$.attachments') a
        WHERE r.profile_id=? AND r.deleted_at IS NULL AND t.deleted_at IS NULL
          AND s.deleted_at IS NULL AND m.deleted_at IS NULL AND m.role='user'
      )
      SELECT DISTINCT refs.runId,refs.taskId,refs.taskVersion,refs.sessionId,refs.sessionTitle,
        refs.taskTitle,v.id versionId,refs.createdAt,refs.status
      FROM refs JOIN file_versions v ON v.id=json_extract(refs.ref,'$.versionId')
        AND v.file_id=? AND v.profile_id=? AND v.deleted_at IS NULL
      WHERE json_extract(refs.ref,'$.kind')='file' AND json_extract(refs.ref,'$.fileId')=v.file_id
      ORDER BY refs.createdAt DESC,refs.runId DESC,v.id DESC LIMIT 101
    `,
      )
      .all(this.store.profileId, id, this.store.profileId) as {
      taskTitle: string;
      sessionTitle: string;
    }[];
    const sizes = this.store.db
      .prepare(
        'SELECT count(*) n,coalesce(sum(size_bytes),0) bytes FROM file_versions WHERE file_id=? AND profile_id=? AND deleted_at IS NULL',
      )
      .get(id, this.store.profileId) as { n: number; bytes: number };
    return FileUsageSchema.parse({
      fileId: id,
      links: links.map((l) => ({
        id: l.id,
        owner: { type: l.owner_type, id: l.owner_id },
        ownerName: l.owner_name.slice(0, 240),
        versionId: l.pinned_version_id,
        role: l.role,
      })),
      records: records.slice(0, 100).map((record) => ({
        ...record,
        taskTitle: record.taskTitle.slice(0, 160),
        sessionTitle: record.sessionTitle.slice(0, 240),
      })),
      recordsTruncated: records.length > 100,
      versionCount: sizes.n,
      retainedBytes: sizes.bytes,
    });
  }
  async parsed(id: string, options: { versionId?: string; owner?: FileOwner } = {}) {
    const file = this.get(id, options);
    const bytes = await this.blobs.readDerivedVersion(file.version.id, 'structure');
    // Recheck scope after I/O so deletion or unlinking cannot expose a stale result.
    const after = this.get(id, { ...options, versionId: file.version.id });
    if (
      !options.versionId &&
      (!options.owner || options.owner.type === 'library') &&
      after.currentVersionId !== file.version.id
    )
      throw new StorageError('CONFLICT');
    return ParsedDocumentSchema.parse(JSON.parse(bytes.toString('utf8')));
  }
  async original(id: string, options: { versionId?: string; owner?: FileOwner } = {}) {
    const file = this.get(id, options);
    const bytes = await this.blobs.readVersion(file.version.id);
    const current = this.get(id, { ...options, versionId: file.version.id });
    if (
      !options.versionId &&
      (!options.owner || options.owner.type === 'library') &&
      current.currentVersionId !== file.currentVersionId
    )
      throw new StorageError('CONFLICT');
    return { file, bytes };
  }
  deletePreviews(ids: string[]) {
    return this.store.db.transaction(() => {
      if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length)
        throw new StorageError('VALIDATION_ERROR');
      for (const id of ids) this.row(id);
      for (const id of ids) {
        const versions = this.store.db
          .prepare(
            'SELECT id,preview_blob_id FROM file_versions WHERE file_id=? AND profile_id=? AND deleted_at IS NULL AND preview_blob_id IS NOT NULL',
          )
          .all(id, this.store.profileId) as { id: string; preview_blob_id: string }[];
        for (const v of versions) {
          this.store.db
            .prepare('UPDATE blobs SET reference_count=max(0,reference_count-1) WHERE id=?')
            .run(v.preview_blob_id);
          this.store.db
            .prepare(
              "UPDATE file_versions SET preview_blob_id=NULL,preview_status='pending' WHERE id=?",
            )
            .run(v.id);
        }
        if (versions.length) this.changed(id);
      }
      return ids;
    })();
  }
  async storage() {
    const snapshot = this.store.db.transaction(() => {
      const originals = this.store.db
        .prepare(
          `SELECT DISTINCT b.sha256,b.size_bytes FROM blobs b JOIN file_versions v ON v.blob_id=b.id
        JOIN files f ON f.id=v.file_id WHERE f.profile_id=? AND v.deleted_at IS NULL AND b.deleted_at IS NULL AND b.state='ready'`,
        )
        .all(this.store.profileId) as { sha256: string; size_bytes: number }[];
      const derived = this.store.db
        .prepare(
          `SELECT DISTINCT b.sha256,b.size_bytes FROM blobs b WHERE b.deleted_at IS NULL AND b.state='ready' AND b.id IN (
        SELECT v.preview_blob_id FROM file_versions v JOIN files f ON f.id=v.file_id WHERE f.profile_id=? AND v.deleted_at IS NULL AND v.preview_blob_id IS NOT NULL
        UNION SELECT p.structure_blob_id FROM parsed_documents p JOIN file_versions v ON v.id=p.file_version_id JOIN files f ON f.id=v.file_id
        WHERE f.profile_id=? AND v.deleted_at IS NULL AND p.deleted_at IS NULL AND p.status='ready')`,
        )
        .all(this.store.profileId, this.store.profileId) as {
        sha256: string;
        size_bytes: number;
      }[];
      const counts = this.store.db
        .prepare(
          `SELECT count(*) total,coalesce(sum(f.deleted_at IS NOT NULL),0) trash FROM files f
        WHERE f.profile_id=? AND NOT EXISTS(SELECT 1 FROM deletion_tombstones t WHERE t.profile_id=f.profile_id AND t.entity_type='file' AND t.entity_id=f.id)`,
        )
        .get(this.store.profileId) as { total: number; trash: number };
      return { originals, derived, counts };
    })();
    const live = new Set(snapshot.originals.map((b) => b.sha256));
    let derivedBytes = 0;
    for (const blob of snapshot.derived)
      if (!live.has(blob.sha256)) {
        live.add(blob.sha256);
        derivedBytes += blob.size_bytes;
      }
    let backupRetainedBytes = 0;
    for (const [sha, size] of await this.blobs.backupReferencedBlobs())
      if (!live.has(sha)) backupRetainedBytes += size;
    return FileStorageSchema.parse({
      originalBytes: snapshot.originals.reduce((n, b) => n + b.size_bytes, 0),
      derivedBytes,
      backupRetainedBytes,
      fileCount: snapshot.counts.total - snapshot.counts.trash,
      trashCount: snapshot.counts.trash,
    });
  }
  async availableBytes() {
    const disk = await statfs(this.store.dataDir, { bigint: true });
    const available = disk.bavail * disk.bsize;
    return Number(
      available < 0n
        ? 0n
        : available > BigInt(Number.MAX_SAFE_INTEGER)
          ? BigInt(Number.MAX_SAFE_INTEGER)
          : available,
    );
  }
  trash(ids: string[]) {
    return this.store.db.transaction(() => {
      for (const id of ids) this.row(id);
      for (const id of ids) {
        const now = this.store.now();
        this.store.db
          .prepare('UPDATE files SET deleted_at=?,purge_after=? WHERE id=?')
          .run(now, now + RETENTION_MS, id);
        for (const j of this.store.db
          .prepare(
            "SELECT id FROM jobs WHERE kind='file.parse' AND json_extract(payload_json,'$.fileVersionId') IN(SELECT id FROM file_versions WHERE file_id=?) AND status IN('queued','running')",
          )
          .all(id) as { id: string }[])
          this.jobs.cancel(j.id);
        this.changed(id);
      }
      return ids;
    })();
  }
  restore(ids: string[]) {
    return this.store.db.transaction(() => {
      for (const id of ids) {
        const row = this.row(id, true);
        if (row.deleted_at === null) throw new StorageError('CONFLICT');
      }
      for (const id of ids) {
        this.store.db
          .prepare('UPDATE files SET deleted_at=NULL,purge_after=NULL WHERE id=?')
          .run(id);
        this.changed(id);
      }
      return ids;
    })();
  }
  purge(ids: string[]) {
    // The fsynced deletion journal survives backup restoration. Never erase a live file implicitly.
    for (const id of ids)
      if (this.row(id, true).deleted_at === null) throw new StorageError('CONFLICT');
    for (const id of ids) this.blobs.trash(id, true);
    return ids;
  }
  cancelParse(versionId: string) {
    return this.store.db.transaction(() => {
      const version = this.store.db
        .prepare(
          'SELECT file_id FROM file_versions WHERE id=? AND profile_id=? AND deleted_at IS NULL',
        )
        .get(IdSchema.parse(versionId), this.store.profileId) as { file_id: string } | undefined;
      if (!version) throw new StorageError('NOT_FOUND');
      this.row(version.file_id);
      const jobs = this.store.db
        .prepare(
          "SELECT id FROM jobs WHERE profile_id=? AND kind='file.parse' AND json_extract(payload_json,'$.fileVersionId')=? AND status IN('queued','running') AND deleted_at IS NULL",
        )
        .all(this.store.profileId, versionId) as { id: string }[];
      for (const job of jobs) this.jobs.cancel(job.id);
      if (jobs.length) this.changed(version.file_id);
      return jobs.map((job) => job.id);
    })();
  }
  queueParse(versionId: string) {
    const v = this.store.db
      .prepare(
        'SELECT file_id FROM file_versions WHERE id=? AND profile_id=? AND deleted_at IS NULL',
      )
      .get(IdSchema.parse(versionId), this.store.profileId) as { file_id: string } | undefined;
    if (!v) throw new StorageError('NOT_FOUND');
    this.row(v.file_id);
    const id = this.jobs.enqueue(
      {
        schemaVersion: 1,
        kind: 'file.parse',
        fileVersionId: versionId,
        parserVersion: FILE_PARSER_VERSION,
      },
      `parse:${versionId}:${FILE_PARSER_VERSION}`,
    );
    const job = this.store.db.prepare('SELECT status FROM jobs WHERE id=?').get(id) as {
      status: string;
    };
    if (job.status === 'failed' || job.status === 'cancelled') {
      this.store.db
        .prepare(
          "UPDATE jobs SET status='queued',lease_epoch=lease_epoch+1,lease_owner=NULL,lease_expires_at=NULL,cancel_requested_at=NULL,error_code=NULL,next_attempt_at=?,revision=revision+1 WHERE id=?",
        )
        .run(this.store.now(), id);
      this.store.db
        .prepare(
          "UPDATE file_versions SET parse_status='pending',error_code=NULL,error_reason=NULL WHERE id=?",
        )
        .run(versionId);
    }
    return id;
  }
  private validLease(job: Job) {
    if (
      !this.store.db
        .prepare(
          "SELECT id FROM jobs WHERE id=? AND lease_owner=? AND lease_epoch=? AND status='running' AND cancel_requested_at IS NULL AND lease_expires_at>?",
        )
        .get(job.id, job.lease_owner, job.lease_epoch, this.store.now())
    )
      throw new StorageError('CANCELLED');
  }
  beginParse(job: Job, versionId: string) {
    return this.store.db.transaction(() => {
      this.validLease(job);
      const v = this.store.db
        .prepare('SELECT file_id FROM file_versions WHERE id=? AND profile_id=?')
        .get(versionId, this.store.profileId) as { file_id: string } | undefined;
      if (!v) throw new StorageError('NOT_FOUND');
      this.row(v.file_id);
      this.store.db
        .prepare(
          "UPDATE file_versions SET parse_status='parsing',error_code=NULL,error_reason=NULL WHERE id=?",
        )
        .run(versionId);
      this.store.db
        .prepare("UPDATE files SET status='parsing' WHERE id=? AND current_version_id=?")
        .run(v.file_id, versionId);
      this.changed(v.file_id);
      return this.get(v.file_id, { versionId });
    })();
  }
  async completeParse(job: Job, versionId: string, raw: ParsedDocument, signal: AbortSignal) {
    const doc = ParsedDocumentSchema.parse(raw);
    if (doc.parserVersion !== FILE_PARSER_VERSION) throw new StorageError('PARSE_FAILED');
    signal.throwIfAborted();
    this.validLease(job);
    const blob = await this.blobs.put(
      Buffer.from(JSON.stringify(doc)),
      'application/vnd.tapkit.parsed+json',
    );
    return this.store.db.transaction(() => {
      signal.throwIfAborted();
      this.validLease(job);
      const v = this.store.db
        .prepare(
          'SELECT file_id FROM file_versions WHERE id=? AND profile_id=? AND deleted_at IS NULL',
        )
        .get(versionId, this.store.profileId) as { file_id: string } | undefined;
      if (!v) throw new StorageError('NOT_FOUND');
      this.row(v.file_id);
      const previous = this.store.db
        .prepare('SELECT structure_blob_id FROM parsed_documents WHERE file_version_id=?')
        .get(versionId) as { structure_blob_id: string } | undefined;
      const now = this.store.now();
      this.store.db
        .prepare(
          "INSERT INTO parsed_documents(id,profile_id,created_at,updated_at,file_version_id,parser_version,structure_blob_id,page_count,quality_json,status) VALUES(?,?,?,?,?,?,?,?,?,'ready') ON CONFLICT(file_version_id) DO UPDATE SET structure_blob_id=excluded.structure_blob_id,parser_version=excluded.parser_version,page_count=excluded.page_count,quality_json=excluded.quality_json,status='ready',deleted_at=NULL,updated_at=excluded.updated_at,index_version=parsed_documents.index_version+1",
        )
        .run(
          newId(),
          this.store.profileId,
          now,
          now,
          versionId,
          doc.parserVersion,
          blob.id,
          doc.pages.length,
          JSON.stringify({ schemaVersion: 1, ...doc.quality }),
        );
      if (previous?.structure_blob_id !== blob.id) {
        this.store.db
          .prepare('UPDATE blobs SET reference_count=reference_count+1 WHERE id=?')
          .run(blob.id);
        if (previous)
          this.store.db
            .prepare('UPDATE blobs SET reference_count=max(0,reference_count-1) WHERE id=?')
            .run(previous.structure_blob_id);
      }
      const body = doc.blocks.map((b) => b.text).join('\n');
      this.store.db
        .prepare(
          'INSERT INTO file_search_documents VALUES(?,?,?,?) ON CONFLICT(file_version_id) DO UPDATE SET body=excluded.body',
        )
        .run(versionId, v.file_id, this.store.profileId, body);
      if (!doc.quality.needsOcr) {
        // The structure, searchable text and project index pointer commit together.
        this.store.db
          .prepare(
            `UPDATE resource_links SET pinned_version_id=?,pending_version_id=NULL,active_index_version=(SELECT index_version FROM parsed_documents WHERE file_version_id=?),updated_at=?,revision=revision+1
          WHERE profile_id=? AND resource_type='file' AND resource_id=? AND owner_type='project' AND deleted_at IS NULL
          AND (pending_version_id=? OR (pinned_version_id=? AND pending_version_id IS NULL))
          AND EXISTS(SELECT 1 FROM projects p WHERE p.id=owner_id AND p.profile_id=resource_links.profile_id AND p.deleted_at IS NULL)`,
          )
          .run(versionId, versionId, now, this.store.profileId, v.file_id, versionId, versionId);
      }
      this.store.db
        .prepare(
          'UPDATE file_versions SET parse_status=?,parser_version=?,error_code=?,error_reason=? WHERE id=?',
        )
        .run(
          doc.quality.needsOcr ? 'unsupported' : 'ready',
          doc.parserVersion,
          doc.quality.needsOcr ? 'FORMAT_UNSUPPORTED' : null,
          doc.quality.needsOcr ? 'OCR_REQUIRED' : null,
          versionId,
        );
      this.store.db
        .prepare('UPDATE files SET status=? WHERE id=? AND current_version_id=?')
        .run(doc.quality.needsOcr ? 'imported' : 'ready', v.file_id, versionId);
      this.changed(v.file_id);
      return versionId;
    })();
  }
  failParse(job: Job, versionId: string, code: string, reason: string) {
    this.store.db.transaction(() => {
      this.validLease(job);
      const v = this.store.db
        .prepare('SELECT file_id FROM file_versions WHERE id=? AND profile_id=?')
        .get(versionId, this.store.profileId) as { file_id: string } | undefined;
      if (!v) throw new StorageError('NOT_FOUND');
      this.row(v.file_id);
      this.store.db
        .prepare('UPDATE file_versions SET parse_status=?,error_code=?,error_reason=? WHERE id=?')
        .run(
          code === 'FORMAT_UNSUPPORTED' ? 'unsupported' : 'failed',
          code.slice(0, 80),
          reason.slice(0, 80),
          versionId,
        );
      this.store.db
        .prepare("UPDATE files SET status='failed' WHERE id=? AND current_version_id=?")
        .run(v.file_id, versionId);
      this.changed(v.file_id);
    })();
  }
  createFolder(name: string, parentId: string | null, owner: FileOwner) {
    name = FileNameSchema.parse(name);
    this.owner(owner);
    if (owner.type === 'session') throw new StorageError('FORMAT_UNSUPPORTED');
    if (parentId) this.folder(parentId, owner);
    return this.store.db.transaction(() => {
      const id = newId(),
        now = this.store.now();
      this.store.db
        .prepare(
          'INSERT INTO folders(id,profile_id,created_at,updated_at,owner_kind,owner_id,parent_id,name) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          this.store.profileId,
          now,
          now,
          owner.type === 'project' ? 'project' : 'file',
          owner.type === 'project' ? owner.id : this.store.profileId,
          parentId,
          name,
        );
      this.store.emit('workspace.updated', { kind: 'workspace', entityId: id });
      return this.folderView(this.folder(id));
    })();
  }
  private folderView(f: FolderRow) {
    return FolderViewSchema.parse({
      id: f.id,
      name: f.name,
      parentId: f.parent_id,
      revision: f.revision,
      owner: f.owner_kind === 'project' ? { type: 'project', id: f.owner_id } : { type: 'library' },
    });
  }
  folders(owner: FileOwner) {
    this.owner(owner);
    if (owner.type === 'session') return [];
    return (
      this.store.db
        .prepare(
          'SELECT * FROM folders WHERE profile_id=? AND owner_kind=? AND owner_id=? AND deleted_at IS NULL ORDER BY sort_key,name,id LIMIT 2001',
        )
        .all(
          this.store.profileId,
          owner.type === 'project' ? 'project' : 'file',
          owner.type === 'project' ? owner.id : this.store.profileId,
        ) as FolderRow[]
    ).map((f) => this.folderView(f));
  }
  changeFolder(id: string, patch: { name?: string; parentId?: string | null }, revision?: number) {
    return this.store.db.transaction(() => {
      const f = this.folder(id);
      this.checkRevision(f, revision);
      const owner: FileOwner =
        f.owner_kind === 'project' ? { type: 'project', id: f.owner_id } : { type: 'library' };
      if (patch.parentId) {
        let parent: FolderRow | undefined = this.folder(patch.parentId, owner);
        const visited = new Set<string>([id]);
        while (parent) {
          if (visited.has(parent.id)) throw new StorageError('VALIDATION_ERROR');
          visited.add(parent.id);
          parent = parent.parent_id ? this.folder(parent.parent_id, owner) : undefined;
        }
      }
      this.store.db
        .prepare(
          'UPDATE folders SET name=?,parent_id=?,updated_at=?,revision=revision+1 WHERE id=?',
        )
        .run(
          patch.name === undefined ? f.name : FileNameSchema.parse(patch.name),
          patch.parentId === undefined ? f.parent_id : patch.parentId,
          this.store.now(),
          id,
        );
      this.store.emit('workspace.updated', { kind: 'workspace', entityId: id });
      return this.folderView(this.folder(id));
    })();
  }
}
