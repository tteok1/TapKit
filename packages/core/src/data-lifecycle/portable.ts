import { createHash } from 'node:crypto';
import { lstat, open, realpath, unlink } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path';
import {
  DataCategoriesSchema,
  DataDigestSchema,
  FILE_LIMITS,
  FileNameSchema,
  IdSchema,
  MessageContentDocumentSchema,
  z,
  type DataCategory,
} from '@tapkit/contracts';
import { BoundedArchive } from '@tapkit/retrieval';
import { managedZip } from '@tapkit/tools';
import { BlobStore, newId, StorageError, type Store } from '@tapkit/storage';

const Format = 'tapkit-portable-data';
const Limit = 100 * 1024 * 1024;
const MemoryValue = z.string().max(2000);
const MemoryLabel = z.string().max(160);
const Label = z.string().trim().min(1).max(240);
const version = z.strictObject({
  id: IdSchema,
  hash: DataDigestSchema,
  name: FileNameSchema,
  size: z.number().int().nonnegative().max(Limit),
});
const payloadSchema = z.strictObject({
  projects: z
    .array(z.strictObject({ id: IdSchema, name: Label.max(80), description: z.string().max(8000) }))
    .max(2000),
  sessions: z
    .array(
      z.strictObject({
        id: IdSchema,
        title: Label,
        projectId: IdSchema.nullable(),
        activeBranchId: IdSchema,
        branches: z
          .array(z.strictObject({ id: IdSchema, label: Label, headId: IdSchema.nullable() }))
          .min(1)
          .max(1000),
        messages: z
          .array(
            z.strictObject({
              id: IdSchema,
              branchId: IdSchema,
              parentId: IdSchema.nullable(),
              role: z.enum(['user', 'assistant', 'tool', 'system_note']),
              content: MessageContentDocumentSchema,
            }),
          )
          .max(10000),
      }),
    )
    .max(2000),
  files: z
    .array(
      z.strictObject({
        id: IdSchema,
        name: FileNameSchema,
        current: IdSchema,
        versions: z.array(version).min(1).max(1000),
      }),
    )
    .max(2000),
  memories: z
    .array(z.strictObject({ subject: MemoryLabel, predicate: MemoryLabel, value: MemoryValue }))
    .max(5000),
  links: z
    .array(
      z.strictObject({
        ownerType: z.enum(['session', 'project']),
        ownerId: IdSchema,
        fileId: IdSchema,
        versionId: IdSchema.nullable(),
        role: z.enum(['input', 'output', 'source']),
      }),
    )
    .max(10000),
});
const manifestSchema = z.strictObject({
  schema_version: z.literal(1),
  format: z.literal(Format),
  categories: DataCategoriesSchema,
  data_hash: DataDigestSchema,
  files: z
    .array(
      z.strictObject({ hash: DataDigestSchema, size: z.number().int().nonnegative().max(Limit) }),
    )
    .max(1998),
});
type Payload = z.infer<typeof payloadSchema>;
const counts = (data: Payload) => ({
  projects: data.projects.length,
  sessions: data.sessions.length,
  files: data.files.length,
  memories: data.memories.length,
});
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const objectName = (digest: string) => 'objects/' + digest;
const archiveLimits = {
  ...FILE_LIMITS,
  maxArchiveBytes: Limit,
  maxExpandedBytes: Limit,
  maxArchiveEntries: 2000,
};
function invalid(): never {
  throw new StorageError('VALIDATION_ERROR');
}
function memoryValue(json: string) {
  const value = JSON.parse(json) as unknown;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'value' in value && typeof value.value === 'string')
    return value.value;
  return json;
}
function unique<T extends { id: string }>(rows: T[]) {
  const entries = new Map(rows.map((row) => [row.id, row]));
  if (entries.size !== rows.length) invalid();
  return entries;
}
function validateReferences(data: Payload, categories: DataCategory[]) {
  const projects = unique(data.projects),
    sessions = unique(data.sessions),
    files = unique(data.files);
  for (const category of ['projects', 'sessions', 'files', 'memories'] as const)
    if (!categories.includes(category) && data[category].length) invalid();
  for (const session of data.sessions) {
    const branches = unique(session.branches),
      messages = unique(session.messages);
    if (
      (session.projectId && !projects.has(session.projectId)) ||
      !branches.has(session.activeBranchId)
    )
      invalid();
    const ancestors = new Set<string>();
    for (const message of session.messages) {
      if (!branches.has(message.branchId) || (message.parentId && !ancestors.has(message.parentId)))
        invalid();
      ancestors.add(message.id);
    }
    for (const branch of branches.values())
      if (branch.headId && !messages.has(branch.headId)) invalid();
  }
  const versions = unique(data.files.flatMap((file) => file.versions));
  for (const file of data.files)
    if (!file.versions.some((item) => item.id === file.current)) invalid();
  const links = new Set<string>();
  for (const link of data.links) {
    const key = [link.ownerType, link.ownerId, link.fileId, link.role].join(':');
    const file = files.get(link.fileId);
    if (
      !file ||
      links.has(key) ||
      !(link.ownerType === 'project' ? projects : sessions).has(link.ownerId) ||
      (link.versionId && !file.versions.some((item) => item.id === link.versionId))
    )
      invalid();
    links.add(key);
  }
  const objects = new Map<string, number>();
  for (const item of versions.values()) {
    if (objects.has(item.hash) && objects.get(item.hash) !== item.size) invalid();
    objects.set(item.hash, item.size);
  }
  return objects;
}

export class PortableData {
  constructor(
    readonly store: Store,
    readonly blobs: BlobStore,
  ) {}
  private read(categories: DataCategory[]) {
    const db = this.store.db,
      profile = this.store.profileId;
    const projects = categories.includes('projects')
      ? (db
          .prepare(
            'SELECT id,name,description FROM projects WHERE profile_id=? AND deleted_at IS NULL ORDER BY id LIMIT 2001',
          )
          .all(profile) as Payload['projects'])
      : [];
    const projectIds = new Set(projects.map((row) => row.id));
    type Branch = Payload['sessions'][number]['branches'][number];
    type Message = Payload['sessions'][number]['messages'][number];
    const branches = db.prepare(
      'SELECT id,label,head_message_id AS headId FROM branches WHERE profile_id=? AND session_id=? AND deleted_at IS NULL ORDER BY id LIMIT 1001',
    );
    const messages = db.prepare(
      "SELECT id,branch_id AS branchId,parent_message_id AS parentId,role,content_json FROM messages WHERE profile_id=? AND session_id=? AND deleted_at IS NULL AND status IN ('final','interrupted') ORDER BY rowid LIMIT 10001",
    );
    const sessions = categories.includes('sessions')
      ? (
          db
            .prepare(
              'SELECT id,title,project_id,active_branch_id FROM sessions WHERE profile_id=? AND deleted_at IS NULL ORDER BY id LIMIT 2001',
            )
            .all(profile) as {
            id: string;
            title: string;
            project_id: string | null;
            active_branch_id: string | null;
          }[]
        ).map((row) => {
          const visible = branches.all(profile, row.id) as Branch[];
          if (!visible.length && !row.active_branch_id)
            visible.push({ id: row.id, label: '主分支', headId: null });
          const ids = new Set(visible.map((branch) => branch.id)),
            seen = new Set<string>();
          const heads = new Map<string, string>();
          const items = (
            messages.all(profile, row.id) as (Omit<Message, 'content'> & { content_json: string })[]
          )
            .filter((message) => ids.has(message.branchId))
            .map(({ content_json, ...message }) => {
              const parentId =
                message.parentId && seen.has(message.parentId) ? message.parentId : null;
              seen.add(message.id);
              heads.set(message.branchId, message.id);
              return {
                ...message,
                parentId,
                content: MessageContentDocumentSchema.parse(JSON.parse(content_json)),
              };
            });
          return {
            id: row.id,
            title: row.title,
            projectId: row.project_id && projectIds.has(row.project_id) ? row.project_id : null,
            activeBranchId:
              row.active_branch_id && ids.has(row.active_branch_id)
                ? row.active_branch_id
                : visible[0]?.id,
            branches: visible.map((branch) => ({
              ...branch,
              headId:
                branch.headId && seen.has(branch.headId)
                  ? branch.headId
                  : (heads.get(branch.id) ?? null),
            })),
            messages: items,
          };
        })
      : [];
    const versions = db.prepare(
      "SELECT v.id,v.sha256 AS hash,v.size_bytes AS size,COALESCE(NULLIF(v.display_name,''),f.display_name) AS name FROM file_versions v JOIN files f ON f.id=v.file_id JOIN blobs b ON b.id=v.blob_id WHERE v.profile_id=? AND v.file_id=? AND v.deleted_at IS NULL AND b.deleted_at IS NULL AND b.state='ready' ORDER BY v.version LIMIT 1001",
    );
    const files = categories.includes('files')
      ? (
          db
            .prepare(
              'SELECT id,display_name AS name,current_version_id AS current FROM files WHERE profile_id=? AND deleted_at IS NULL AND current_version_id IS NOT NULL ORDER BY id LIMIT 2001',
            )
            .all(profile) as Omit<Payload['files'][number], 'versions'>[]
        ).map((file) => ({
          ...file,
          versions: versions.all(profile, file.id),
        }))
      : [];
    const fileIds = new Map(files.map((row) => [row.id, row])),
      sessionIds = new Set(sessions.map((row) => row.id));
    const links =
      files.length && (sessions.length || projects.length)
        ? (
            db
              .prepare(
                "SELECT owner_type AS ownerType,owner_id AS ownerId,resource_id AS fileId,pinned_version_id AS versionId,role FROM resource_links WHERE profile_id=? AND resource_type='file' AND owner_type IN ('project','session') AND deleted_at IS NULL ORDER BY id",
              )
              .all(profile) as Payload['links']
          )
            .filter(
              (link) =>
                fileIds.has(link.fileId) &&
                (link.ownerType === 'project' ? projectIds : sessionIds).has(link.ownerId),
            )
            .map((link) => {
              const file = fileIds.get(link.fileId);
              return {
                ...link,
                versionId: file?.versions.some((v) => (v as { id: string }).id === link.versionId)
                  ? link.versionId
                  : null,
              };
            })
        : [];
    const memories = categories.includes('memories')
      ? (
          db
            .prepare(
              "SELECT subject,predicate,value_json FROM memories WHERE profile_id=? AND (status='active' OR imported=1) AND deleted_at IS NULL ORDER BY id LIMIT 5001",
            )
            .all(profile) as { subject: string; predicate: string; value_json: string }[]
        ).map((row) => ({
          subject: row.subject,
          predicate: row.predicate,
          value: memoryValue(row.value_json),
        }))
      : [];
    return payloadSchema.parse({ projects, sessions, files, memories, links });
  }
  async build(selection: DataCategory[], signal?: AbortSignal) {
    const categories = DataCategoriesSchema.parse(selection);
    const data = this.store.db.transaction(() => this.read(categories))();
    const objects = validateReferences(data, categories);
    const json = Buffer.from(JSON.stringify(data));
    if (
      objects.size > 1998 ||
      json.length + [...objects.values()].reduce((n, v) => n + v, 0) > Limit - 1024 * 1024
    )
      throw new StorageError('FILE_TOO_LARGE');
    const manifest = manifestSchema.parse({
      schema_version: 1,
      format: Format,
      categories,
      data_hash: hash(json),
      files: [...objects].map(([hash, size]) => ({ hash, size })),
    });
    const entries: { name: string; bytes: Buffer }[] = [
      { name: 'manifest.json', bytes: Buffer.from(JSON.stringify(manifest, null, 2)) },
      { name: 'data.json', bytes: json },
    ];
    const seen = new Set<string>();
    for (const file of data.files)
      for (const version of file.versions) {
        signal?.throwIfAborted();
        if (seen.has(version.hash)) continue;
        const bytes = await this.blobs.readVersion(version.id);
        if (bytes.length !== version.size || hash(bytes) !== version.hash)
          throw new StorageError('CONFLICT');
        entries.push({ name: objectName(version.hash), bytes });
        seen.add(version.hash);
      }
    const bytes = await managedZip(entries);
    if (bytes.length > Limit) throw new StorageError('FILE_TOO_LARGE');
    const verify = () => {
      signal?.throwIfAborted();
      if (
        hash(
          Buffer.from(JSON.stringify(this.store.db.transaction(() => this.read(categories))())),
        ) !== manifest.data_hash
      )
        throw new StorageError('CONFLICT');
    };
    verify();
    return { bytes, verify, counts: counts(data) };
  }
  async export(selection: DataCategory[], target: string, signal?: AbortSignal) {
    const path = await this.checkPath(target);
    if (extname(path).toLowerCase() !== '.zip') invalid();
    const result = await this.build(selection, signal);
    const handle = await open(path, 'wx');
    let owned: { dev: number; ino: number } | undefined,
      complete = false;
    try {
      owned = await handle.stat();
      await this.checkPath(path);
      for (let offset = 0; offset < result.bytes.length; offset += 256 * 1024) {
        signal?.throwIfAborted();
        await handle.writeFile(result.bytes.subarray(offset, offset + 256 * 1024));
      }
      await handle.sync();
      result.verify();
      complete = true;
      return result.counts;
    } finally {
      await handle.close();
      if (!complete && owned) {
        const current = await lstat(path).catch(() => undefined);
        if (current?.isFile() && current.dev === owned.dev && current.ino === owned.ino)
          await unlink(path);
      }
    }
  }
  async importFile(source: string, signal?: AbortSignal) {
    const path = await this.checkPath(source),
      meta = await lstat(path);
    if (!meta.isFile() || meta.isSymbolicLink() || meta.size > Limit) invalid();
    const fd = await open(path, 'r');
    try {
      const pinned = await fd.stat();
      if (pinned.dev !== meta.dev || pinned.ino !== meta.ino || pinned.size !== meta.size)
        invalid();
      const bytes = Buffer.alloc(pinned.size);
      let offset = 0;
      while (offset < bytes.length) {
        signal?.throwIfAborted();
        const r = await fd.read(bytes, offset, bytes.length - offset, offset);
        if (!r.bytesRead) invalid();
        offset += r.bytesRead;
      }
      const last = await fd.stat();
      if (last.size !== pinned.size || last.mtimeMs !== pinned.mtimeMs) invalid();
      return await this.importBytes(bytes, signal);
    } finally {
      await fd.close();
    }
  }
  async importBytes(bytes: Buffer, signal?: AbortSignal) {
    let checked: { data: Payload; bodies: Map<string, Buffer> };
    try {
      const archive = await BoundedArchive.open(bytes, archiveLimits);
      try {
        const manifest = manifestSchema.parse(
          JSON.parse((await archive.read('manifest.json')).toString('utf8')),
        );
        const json = await archive.read('data.json');
        if (hash(json) !== manifest.data_hash) invalid();
        const data = payloadSchema.parse(JSON.parse(json.toString('utf8')));
        const expected = validateReferences(data, manifest.categories);
        if (manifest.files.length !== expected.size || archive.entries.size !== expected.size + 2)
          invalid();
        const bodies = new Map<string, Buffer>();
        for (const entry of manifest.files) {
          signal?.throwIfAborted();
          if (bodies.has(entry.hash) || expected.get(entry.hash) !== entry.size) invalid();
          const body = await archive.read(objectName(entry.hash));
          if (body.length !== entry.size || hash(body) !== entry.hash) invalid();
          bodies.set(entry.hash, body);
        }
        checked = { data, bodies };
      } finally {
        archive.close();
      }
    } catch (error) {
      signal?.throwIfAborted();
      throw new StorageError(error instanceof StorageError ? error.code : 'VALIDATION_ERROR');
    }
    const registered = new Map<string, string>();
    for (const [hash, body] of checked.bodies) {
      signal?.throwIfAborted();
      registered.set(hash, (await this.blobs.put(body)).id);
    }
    signal?.throwIfAborted();
    return this.store.db.transaction(() => this.insert(checked.data, registered))();
  }
  private async checkPath(raw: string) {
    if (!isAbsolute(raw)) invalid();
    const path = resolve(raw),
      parent = dirname(path),
      meta = await lstat(parent);
    FileNameSchema.parse(basename(path));
    if (
      !meta.isDirectory() ||
      meta.isSymbolicLink() ||
      (await realpath(parent)).toLowerCase() !== parent.toLowerCase()
    )
      throw new StorageError('PERMISSION_DENIED');
    return path;
  }
  private insert(data: Payload, objects: Map<string, string>) {
    const db = this.store.db,
      now = this.store.now(),
      profile = this.store.profileId;
    const projects = new Map<string, string>(),
      sessions = new Map<string, string>();
    const files = new Map<string, string>(),
      versions = new Map<string, string>();
    for (const project of data.projects) {
      const id = newId();
      db.prepare(
        'INSERT INTO projects(id,profile_id,created_at,updated_at,name,description) VALUES(?,?,?,?,?,?)',
      ).run(id, profile, now, now, project.name, project.description);
      projects.set(project.id, id);
    }
    for (const session of data.sessions) {
      const id = newId();
      const branches = new Map(session.branches.map((branch) => [branch.id, newId()]));
      const messages = new Map<string, string>();
      db.prepare(
        'INSERT INTO sessions(id,profile_id,created_at,updated_at,title,mode,active_branch_id,settings_json,project_id,last_activity_at) VALUES(?,?,?,?,?,\'chat\',?,\'{"schemaVersion":1,"values":{}}\',?,?)',
      ).run(
        id,
        profile,
        now,
        now,
        session.title,
        branches.get(session.activeBranchId),
        session.projectId ? projects.get(session.projectId) : null,
        now,
      );
      for (const branch of session.branches)
        db.prepare(
          'INSERT INTO branches(id,profile_id,created_at,updated_at,session_id,label) VALUES(?,?,?,?,?,?)',
        ).run(branches.get(branch.id), profile, now, now, id, branch.label);
      for (const message of session.messages) {
        const mid = newId();
        const prefix =
          message.role === 'user' ? '用户：' : message.role === 'assistant' ? '助手：' : null;
        const content =
          prefix && message.content.blocks.length < 100
            ? {
                schemaVersion: 1,
                blocks: [{ kind: 'text', text: prefix }, ...message.content.blocks],
              }
            : message.content;
        db.prepare(
          "INSERT INTO messages(id,profile_id,created_at,updated_at,session_id,branch_id,parent_message_id,role,content_json,status) VALUES(?,?,?,?,?,?,?,'system_note',?,'final')",
        ).run(
          mid,
          profile,
          now,
          now,
          id,
          branches.get(message.branchId),
          message.parentId ? messages.get(message.parentId) : null,
          JSON.stringify(content),
        );
        messages.set(message.id, mid);
      }
      for (const branch of session.branches)
        db.prepare('UPDATE branches SET head_message_id=? WHERE id=?').run(
          branch.headId ? messages.get(branch.headId) : null,
          branches.get(branch.id),
        );
      sessions.set(session.id, id);
    }
    for (const file of data.files) {
      const id = newId(),
        current = newId(),
        extension = basename(file.name).split('.').slice(1).at(-1)?.toLowerCase() ?? '';
      db.prepare(
        "INSERT INTO files(id,profile_id,created_at,updated_at,display_name,extension,mime,kind,status,source_type,current_version_id) VALUES(?,?,?,?,?,?,'application/octet-stream','input','imported','import',?)",
      ).run(id, profile, now, now, file.name, extension, current);
      let n = 0;
      for (const version of file.versions) {
        const vid = version.id === file.current ? current : newId(),
          blob = objects.get(version.hash);
        if (
          !db
            .prepare(
              "UPDATE blobs SET reference_count=reference_count+1 WHERE id=? AND profile_id=? AND deleted_at IS NULL AND state='ready'",
            )
            .run(blob, profile).changes
        )
          throw new StorageError('CONFLICT');
        db.prepare(
          "INSERT INTO file_versions(id,profile_id,created_at,updated_at,file_id,version,blob_id,size_bytes,sha256,parse_status,preview_status,display_name,extension) VALUES(?,?,?,?,?,?,?,?,?,'pending','pending',?,?)",
        ).run(
          vid,
          profile,
          now,
          now,
          id,
          ++n,
          blob,
          version.size,
          version.hash,
          version.name,
          extension,
        );
        versions.set(version.id, vid);
      }
      files.set(file.id, id);
    }
    for (const link of data.links)
      db.prepare(
        "INSERT INTO resource_links(id,profile_id,created_at,updated_at,resource_type,resource_id,owner_type,owner_id,role,pinned_version_id) VALUES(?,?,?,?,'file',?,?,?,?,?)",
      ).run(
        newId(),
        profile,
        now,
        now,
        files.get(link.fileId),
        link.ownerType,
        (link.ownerType === 'project' ? projects : sessions).get(link.ownerId),
        link.role,
        link.versionId ? versions.get(link.versionId) : null,
      );
    // Imported memories stay readable as inactive records and do not enter model context.
    for (const item of data.memories) {
      const id = newId();
      db.prepare(
        "INSERT INTO memories(id,profile_id,created_at,updated_at,subject,predicate,value_json,scope_type,scope_id,status,valid_from,content_hash,imported) VALUES(?,?,?,?,?,?,?,'profile',?,'superseded',?,?,1)",
      ).run(
        id,
        profile,
        now,
        now,
        item.subject,
        item.predicate,
        JSON.stringify(item.value),
        profile,
        now,
        hash(Buffer.from(item.value)),
      );
      db.prepare('INSERT INTO memory_search_documents VALUES(?,?,?)').run(
        id,
        profile,
        item.predicate + ' ' + item.value,
      );
    }
    this.store.emit('workspace.updated', { kind: 'workspace', entityId: profile });
    return counts(data);
  }
}
