import {
  z,
  RequestSchema,
  ReplySchema,
  ProjectCommandSchemas,
  ProjectViewSchema,
  ProjectDefaultsSchema,
  ProjectScopeSchema,
  KnowledgeViewSchema,
  FILE_PARSER_VERSION,
  ParsedDocumentSchema,
  type Request,
  type Reply,
  type ProjectView,
  type KnowledgeView,
} from '@tapkit/contracts';
import { FileRepository, StorageError, failure, newId } from '@tapkit/storage';
import type { HistoryService } from './history-service';
import { fileMaterial } from './file-material';

type Link = {
  resource_id: string;
  pinned_version_id: string;
  pending_version_id: string | null;
  active_index_version: number;
  folder_id: string | null;
  tags_json: string;
  expires_at: number | null;
  revision: number;
};
export class ProjectService {
  readonly store;
  constructor(
    readonly files: FileRepository,
    readonly history?: HistoryService,
  ) {
    this.store = files.store;
  }
  get(id: string): ProjectView {
    const p = this.store.db
      .prepare('SELECT * FROM projects WHERE id=? AND profile_id=? AND deleted_at IS NULL')
      .get(id, this.store.profileId) as Record<string, unknown> | undefined;
    if (!p) throw new StorageError('PERMISSION_DENIED');
    return ProjectViewSchema.parse({
      id: p.id,
      name: p.name,
      icon: p.icon,
      color: p.color,
      description: p.description,
      instructions: p.instructions,
      allowGlobalMemory: !!p.allow_global_memory,
      allowGlobalHistory: !!p.allow_global_history,
      allowGlobalInstructions: !!p.allow_global_instructions,
      independentMemory: !!p.independent_memory,
      defaults: ProjectDefaultsSchema.parse(JSON.parse(String(p.defaults_json))),
      revision: p.revision,
      pinned: p.pinned_at !== null,
      archivedAt: p.archived_at,
      updatedAt: p.updated_at,
    });
  }
  private revision(r: Request, p: ProjectView) {
    if (r.expectedRevision === undefined) throw new StorageError('VALIDATION_ERROR');
    if (r.expectedRevision !== p.revision) throw new StorageError('CONFLICT', p.revision);
  }
  private changed(id: string) {
    this.store.db
      .prepare('UPDATE projects SET revision=revision+1,updated_at=? WHERE id=? AND profile_id=?')
      .run(this.store.now(), id, this.store.profileId);
    this.store.emit('workspace.updated', { kind: 'workspace', entityId: id });
  }
  private idle(projectId: string) {
    if (
      this.store.db
        .prepare(
          "SELECT 1 FROM runs r JOIN sessions s ON s.id=r.session_id WHERE s.project_id=? AND s.profile_id=? AND r.profile_id=s.profile_id AND r.status NOT IN('completed','partial','failed','cancelled','budget_stopped')",
        )
        .get(projectId, this.store.profileId)
    )
      throw new StorageError('CONFLICT');
    if (
      this.store.db
        .prepare(
          "SELECT 1 FROM title_jobs j JOIN sessions s ON s.id=j.session_id WHERE s.project_id=? AND s.profile_id=? AND j.status='running'",
        )
        .get(projectId, this.store.profileId)
    )
      throw new StorageError('CONFLICT');
  }
  links(projectId: string): Link[] {
    this.get(projectId);
    return this.store.db
      .prepare(
        "SELECT * FROM resource_links WHERE profile_id=? AND owner_type='project' AND owner_id=? AND resource_type='file' AND role='source' AND deleted_at IS NULL ORDER BY resource_id",
      )
      .all(this.store.profileId, projectId) as Link[];
  }
  materials(projectId: string) {
    return this.links(projectId).map((l) => {
      const file = this.files.get(l.resource_id, {
        versionId: l.pinned_version_id,
        owner: { type: 'project', id: projectId },
      });
      const pending = l.pending_version_id
        ? (this.store.db
            .prepare(
              'SELECT parse_status FROM file_versions WHERE id=? AND file_id=? AND profile_id=? AND deleted_at IS NULL',
            )
            .get(l.pending_version_id, l.resource_id, this.store.profileId) as
            { parse_status: string } | undefined)
        : undefined;
      const source = this.store.db
        .prepare('SELECT source_uri,source_type FROM files WHERE id=? AND profile_id=?')
        .get(file.id, this.store.profileId) as { source_uri: string | null; source_type: string };
      return {
        file,
        pendingVersionId: l.pending_version_id,
        pendingStatus: pending?.parse_status ?? null,
        indexVersion: l.active_index_version,
        folderId: l.folder_id,
        tags: JSON.parse(l.tags_json),
        expiresAt: l.expires_at,
        state:
          l.expires_at !== null && l.expires_at <= this.store.now()
            ? 'expired'
            : pending?.parse_status === 'failed' ||
                pending?.parse_status === 'unsupported' ||
                pending?.parse_status === 'cancelled'
              ? 'failed'
              : pending ||
                  !['ready', 'failed', 'unsupported', 'cancelled'].includes(
                    file.version.parseStatus,
                  )
                ? 'preparing'
                : file.version.parseStatus === 'ready' && l.active_index_version > 0
                  ? 'ready'
                  : 'failed',
        source: source.source_uri ?? source.source_type,
      };
    });
  }
  scope(sessionId: string) {
    const s = this.store.db
      .prepare(
        'SELECT project_id,settings_json,revision FROM sessions WHERE id=? AND profile_id=? AND deleted_at IS NULL',
      )
      .get(sessionId, this.store.profileId) as
      { project_id: string | null; settings_json: string; revision: number } | undefined;
    if (!s?.project_id) throw new StorageError('PERMISSION_DENIED');
    this.get(s.project_id);
    const document = JSON.parse(s.settings_json);
    return {
      projectId: s.project_id,
      scope: ProjectScopeSchema.parse(document.projectScope ?? {}),
      revision: s.revision,
      document,
    };
  }
  selection(sessionId: string) {
    const s = this.scope(sessionId),
      links = this.links(s.projectId);
    const ids = s.scope.selectedVersionIds ?? links.map((l) => l.pinned_version_id);
    if (ids.some((id) => !links.some((l) => l.pinned_version_id === id)))
      throw new StorageError('PERMISSION_DENIED');
    return { ...s, versionIds: [...new Set(ids)] };
  }
  async query(
    projectId: string,
    query: string,
    selectedVersionIds?: string[],
    limit = 10,
  ): Promise<KnowledgeView> {
    const links = this.links(projectId),
      selected = selectedVersionIds ?? links.map((l) => l.pinned_version_id);
    if (selected.some((id) => !links.some((l) => l.pinned_version_id === id)))
      throw new StorageError('PERMISSION_DENIED');
    const hits: KnowledgeView['hits'] = [],
      diagnostics: string[] = [];
    const fingerprint = JSON.stringify(links);
    for (const l of links.filter((l) => selected.includes(l.pinned_version_id))) {
      if (l.expires_at !== null && l.expires_at <= this.store.now()) {
        diagnostics.push('资料已过期：' + l.resource_id);
        continue;
      }
      const file = this.files.get(l.resource_id, {
        versionId: l.pinned_version_id,
        owner: { type: 'project', id: projectId },
      });
      if (file.version.parseStatus !== 'ready' || !l.active_index_version) {
        diagnostics.push('资料尚不可使用：' + file.name);
        continue;
      }
      const indexed = this.store.db
        .prepare(
          "SELECT index_version FROM parsed_documents WHERE file_version_id=? AND profile_id=? AND status='ready' AND deleted_at IS NULL",
        )
        .get(l.pinned_version_id, this.store.profileId) as { index_version: number } | undefined;
      const legacy =
        !indexed && file.version.parserVersion === null && l.active_index_version === 1;
      if (!legacy && indexed?.index_version !== l.active_index_version)
        throw new StorageError('CONFLICT');
      const text = legacy
        ? ((
            await fileMaterial(
              this.files,
              { kind: 'file', fileId: file.id, versionId: l.pinned_version_id },
              () => ({ id: projectId, project_id: projectId }),
            )
          ).text ?? '')
        : undefined;
      const doc = legacy
        ? {
            blocks: [
              { text: text!, locator: { kind: 'text' as const, start: 0, end: text!.length } },
            ],
          }
        : await this.files.parsed(file.id, {
            versionId: l.pinned_version_id,
            owner: { type: 'project', id: projectId },
          });
      for (const block of doc.blocks)
        if (block.text.includes(query) && hits.length < limit)
          hits.push({
            ref: {
              kind: 'file',
              fileId: file.id,
              versionId: l.pinned_version_id,
              locator: block.locator,
            },
            text: block.text.slice(0, 16000),
            indexVersion: l.active_index_version,
          });
      if (l.pending_version_id) diagnostics.push('新版处理中；仍使用完整旧版：' + file.name);
    }
    // Reject an asynchronous read across a revocation, version switch or classification change.
    if (JSON.stringify(this.links(projectId)) !== fingerprint) throw new StorageError('CONFLICT');
    if (!hits.length) diagnostics.push('当前资料无法支持结论；请补充材料。');
    return KnowledgeViewSchema.parse({ hits, diagnostics: diagnostics.slice(0, 100) });
  }
  impact(projectId: string, fileId?: string) {
    this.get(projectId);
    const links = this.links(projectId).filter((l) => !fileId || l.resource_id === fileId);
    if (fileId && !links.length) throw new StorageError('PERMISSION_DENIED');
    const fileIds = links.map((l) => l.resource_id),
      sharedFileIds = fileIds.filter(
        (id) =>
          !!this.store.db
            .prepare(
              "SELECT 1 FROM resource_links l WHERE l.resource_type='file' AND l.resource_id=? AND l.profile_id=? AND l.deleted_at IS NULL AND NOT(l.owner_type='project' AND l.owner_id=?) AND ((l.owner_type='project' AND EXISTS(SELECT 1 FROM projects p WHERE p.id=l.owner_id AND p.deleted_at IS NULL)) OR (l.owner_type='session' AND EXISTS(SELECT 1 FROM sessions s WHERE s.id=l.owner_id AND s.deleted_at IS NULL)) OR l.owner_type='task')",
            )
            .get(id, this.store.profileId, projectId),
      );
    const sessions = this.store.db
      .prepare('SELECT id FROM sessions WHERE project_id=? AND profile_id=? AND deleted_at IS NULL')
      .all(projectId, this.store.profileId) as { id: string }[];
    const tasks = this.store.db
      .prepare(
        'SELECT t.id FROM tasks t JOIN sessions s ON s.id=t.session_id WHERE s.project_id=? AND t.profile_id=? AND t.deleted_at IS NULL',
      )
      .all(projectId, this.store.profileId) as { id: string }[];
    return {
      sessionIds: sessions.map((s) => s.id),
      fileIds,
      sharedFileIds,
      exclusiveFileIds: fileIds.filter((id) => !sharedFileIds.includes(id)),
      taskIds: tasks.map((t) => t.id),
    };
  }
  exportPreview(projectId: string) {
    const project = this.get(projectId),
      files = this.links(projectId).map((l) => {
        const f = this.files.get(l.resource_id, {
          versionId: l.pinned_version_id,
          owner: { type: 'project', id: projectId },
        });
        return {
          fileId: f.id,
          versionId: f.version.id,
          name: f.version.name,
          sizeBytes: f.version.sizeBytes,
        };
      });
    return { project, files, totalBytes: files.reduce((n, f) => n + f.sizeBytes, 0) };
  }
  async dispatch(raw: unknown): Promise<Reply> {
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) return failure('', 'VALIDATION_ERROR');
    let r = parsed.data;
    const ok = (data: unknown) => ReplySchema.parse({ ok: true, requestId: r.requestId, data });
    try {
      if (!Object.hasOwn(ProjectCommandSchemas, r.command))
        throw new StorageError('FEATURE_NOT_AVAILABLE');
      r = {
        ...r,
        payload: ProjectCommandSchemas[r.command as keyof typeof ProjectCommandSchemas].parse(
          r.payload,
        ),
      };
      const previous = this.store.db
        .prepare('SELECT 1 FROM request_receipts WHERE profile_id=? AND request_id=?')
        .get(this.store.profileId, r.requestId);
      if (previous)
        return this.store.receipt(r, () => {
          throw new StorageError('CONFLICT');
        });
      if (r.command === 'projects.list') {
        const p = ProjectCommandSchemas['projects.list'].parse(r.payload);
        const ids = this.store.db
          .prepare(
            `SELECT id FROM projects WHERE profile_id=? AND deleted_at IS NULL AND (archived_at IS NOT NULL)=? AND (?=0 OR pinned_at IS NOT NULL) AND instr(lower(name||' '||description),lower(?))>0 ORDER BY pinned_at DESC,${p.sort === 'name' ? 'name COLLATE NOCASE' : 'updated_at DESC'},id LIMIT 101 OFFSET ?`,
          )
          .all(this.store.profileId, +p.archived, +p.favorite, p.query, p.offset) as {
          id: string;
        }[];
        return ok({
          projects: ids.slice(0, 100).map((p) => this.get(p.id)),
          nextOffset: ids.length > 100 ? p.offset + 100 : null,
        });
      }
      if (r.command === 'projects.sessionScope') {
        const p = ProjectCommandSchemas['projects.sessionScope'].parse(r.payload),
          s = this.scope(p.sessionId);
        if (!p.scope) return ok({ scope: s.scope, revision: s.revision });
        return this.store.receipt(r, () => {
          const current = this.scope(p.sessionId);
          if (current.revision !== r.expectedRevision)
            throw new StorageError('CONFLICT', current.revision);
          this.idle(current.projectId);
          if (
            p.scope!.selectedVersionIds?.some(
              (id) => !this.links(current.projectId).some((l) => l.pinned_version_id === id),
            )
          )
            throw new StorageError('PERMISSION_DENIED');
          this.store.db
            .prepare(
              'UPDATE sessions SET settings_json=?,revision=revision+1,updated_at=? WHERE id=?',
            )
            .run(
              JSON.stringify({ ...current.document, projectScope: p.scope }),
              this.store.now(),
              p.sessionId,
            );
          this.store.emit('workspace.updated', { kind: 'workspace', entityId: p.sessionId });
          return ok({ scope: p.scope, revision: current.revision + 1 });
        });
      }
      const projectId = (r.payload as { projectId: string }).projectId,
        project = this.get(projectId);
      if (r.command === 'projects.get') return ok({ project });
      if (r.command === 'projects.materials') return ok({ materials: this.materials(projectId) });
      if (r.command === 'knowledge.query') {
        const p = ProjectCommandSchemas['knowledge.query'].parse(r.payload);
        return ok(await this.query(projectId, p.query, p.selectedVersionIds, p.limit));
      }
      if (r.command === 'projects.deletePreview') return ok({ impact: this.impact(projectId) });
      if (r.command === 'projects.removeMaterialPreview')
        return ok({ impact: this.impact(projectId, (r.payload as { fileId: string }).fileId) });
      if (r.command === 'projects.exportPreview')
        return ok({ exportPreview: this.exportPreview(projectId) });
      if (r.command === 'projects.overview') {
        const sessions = this.store.db
          .prepare(
            "SELECT id,title,CASE WHEN mode='work' THEN 'draft' ELSE 'chat' END status FROM sessions WHERE project_id=? AND profile_id=? AND deleted_at IS NULL ORDER BY last_activity_at DESC LIMIT 2000",
          )
          .all(projectId, this.store.profileId);
        const tasks = this.store.db
          .prepare(
            "SELECT t.id,t.goal title,COALESCE((SELECT r.status FROM runs r WHERE r.task_id=t.id AND r.profile_id=t.profile_id AND r.deleted_at IS NULL ORDER BY r.created_at DESC,r.rowid DESC LIMIT 1),'draft') status FROM tasks t JOIN sessions s ON s.id=t.session_id WHERE s.project_id=? AND t.profile_id=? AND t.deleted_at IS NULL ORDER BY t.updated_at DESC LIMIT 2000",
          )
          .all(projectId, this.store.profileId);
        const materials = this.materials(projectId),
          entities = materials.map((m) => ({ id: m.file.id, title: m.file.name, status: m.state }));
        return ok({
          overview: {
            sessions,
            tasks,
            sources: entities,
            outputs: materials
              .filter((m) => m.file.kind === 'artifact' || m.file.kind === 'note')
              .map((m) => ({ id: m.file.id, title: m.file.name, status: m.state })),
          },
        });
      }
      this.revision(r, project);
      if (
        project.archivedAt !== null &&
        r.command !== 'projects.archive' &&
        r.command !== 'projects.trash' &&
        r.command !== 'projects.copy'
      )
        throw new StorageError('PERMISSION_DENIED');
      if (r.command === 'projects.addText') {
        const p = ProjectCommandSchemas['projects.addText'].parse(r.payload);
        if (p.url) {
          const u = new URL(p.url);
          if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password)
            throw new StorageError('VALIDATION_ERROR');
        }
        const blob = await this.files.blobs.put(Buffer.from(p.text), 'text/plain');
        const doc = ParsedDocumentSchema.parse({
          schemaVersion: 1,
          parserVersion: FILE_PARSER_VERSION,
          format: 'text',
          blocks: p.text.trim()
            ? [
                {
                  id: 'text',
                  kind: 'text',
                  text: p.text,
                  locator: { kind: 'text', start: 0, end: p.text.length },
                },
              ]
            : [],
          pages: [],
          sheets: [],
          slides: [],
          entries: [],
          quality: { needsOcr: false, warnings: [] },
        });
        const structure = p.text.trim()
          ? await this.files.blobs.put(
              Buffer.from(JSON.stringify(doc)),
              'application/vnd.tapkit.parsed+json',
            )
          : undefined;
        return this.store.receipt(r, () => {
          this.revision(r, this.get(projectId));
          const f = this.files.importBlob({
            blobId: blob.id,
            name: p.name.endsWith('.txt') ? p.name : p.name + '.txt',
            relativePath: 'note.txt',
            owner: { type: 'project', id: projectId },
          }).file;
          this.store.db
            .prepare('UPDATE files SET kind=?,source_type=?,source_uri=? WHERE id=?')
            .run(p.url ? 'input' : 'note', p.url ? 'url' : 'generated', p.url ?? null, f.id);
          // Text is the exact application-authored content; uploaded files still require the isolated parser.
          const jobs = this.store.db
            .prepare(
              "SELECT id FROM jobs WHERE kind='file.parse' AND json_extract(payload_json,'$.fileVersionId')=? AND status='queued'",
            )
            .all(f.version.id) as { id: string }[];
          for (const job of jobs) this.files.jobs.cancel(job.id);
          if (structure) {
            const now = this.store.now();
            this.store.db
              .prepare(
                "INSERT INTO parsed_documents(id,profile_id,created_at,updated_at,file_version_id,parser_version,structure_blob_id,page_count,quality_json,status) VALUES(?,?,?,?,?,?,?,0,?,'ready')",
              )
              .run(
                newId(),
                this.store.profileId,
                now,
                now,
                f.version.id,
                FILE_PARSER_VERSION,
                structure.id,
                JSON.stringify({ schemaVersion: 1, ...doc.quality }),
              );
            this.store.db
              .prepare('UPDATE blobs SET reference_count=reference_count+1 WHERE id=?')
              .run(structure.id);
            this.store.db
              .prepare('INSERT INTO file_search_documents VALUES(?,?,?,?)')
              .run(f.version.id, f.id, this.store.profileId, p.text);
            this.store.db
              .prepare("UPDATE file_versions SET parse_status='ready',parser_version=? WHERE id=?")
              .run(FILE_PARSER_VERSION, f.version.id);
            this.store.db.prepare("UPDATE files SET status='ready' WHERE id=?").run(f.id);
            this.files.link(f.id, f.version.id, { type: 'project', id: projectId });
          } else {
            this.store.db
              .prepare(
                "UPDATE file_versions SET parse_status='unsupported',error_code='INDEX_NOT_READY',error_reason='TEXT_REQUIRED' WHERE id=?",
              )
              .run(f.version.id);
          }
          this.changed(projectId);
          return ok({ project: this.get(projectId) });
        });
      }
      return this.store.receipt(r, () => {
        this.revision(r, this.get(projectId));
        switch (r.command) {
          case 'projects.update': {
            this.idle(projectId);
            const p = ProjectCommandSchemas['projects.update'].parse(r.payload),
              next = { ...project, ...p.patch };
            this.store.db
              .prepare(
                'UPDATE projects SET name=?,icon=?,color=?,description=?,instructions=?,allow_global_memory=?,allow_global_history=?,allow_global_instructions=?,independent_memory=?,defaults_json=? WHERE id=? AND profile_id=?',
              )
              .run(
                next.name,
                next.icon,
                next.color,
                next.description,
                next.instructions,
                +!!next.allowGlobalMemory,
                +!!next.allowGlobalHistory,
                +!!next.allowGlobalInstructions,
                +!!next.independentMemory,
                JSON.stringify(next.defaults),
                projectId,
                this.store.profileId,
              );
            break;
          }
          case 'projects.archive': {
            this.idle(projectId);
            const p = ProjectCommandSchemas['projects.archive'].parse(r.payload);
            this.store.db
              .prepare('UPDATE projects SET archived_at=? WHERE id=?')
              .run(p.archived ? this.store.now() : null, projectId);
            break;
          }
          case 'projects.linkMaterial':
          case 'projects.updateMaterial': {
            const p = ProjectCommandSchemas['projects.linkMaterial'].parse(r.payload);
            if (
              r.command === 'projects.updateMaterial' &&
              !this.links(projectId).some((l) => l.resource_id === p.fileId)
            )
              throw new StorageError('PERMISSION_DENIED');
            this.files.link(p.fileId, p.versionId, { type: 'project', id: projectId });
            break;
          }
          case 'projects.classifyMaterial': {
            const p = ProjectCommandSchemas['projects.classifyMaterial'].parse(r.payload);
            if (!this.links(projectId).some((l) => l.resource_id === p.fileId))
              throw new StorageError('PERMISSION_DENIED');
            if (
              p.folderId &&
              !this.store.db
                .prepare(
                  "SELECT 1 FROM folders WHERE id=? AND profile_id=? AND owner_kind='project' AND owner_id=? AND deleted_at IS NULL",
                )
                .get(p.folderId, this.store.profileId, projectId)
            )
              throw new StorageError('PERMISSION_DENIED');
            this.store.db
              .prepare(
                "UPDATE resource_links SET folder_id=?,tags_json=?,expires_at=?,revision=revision+1 WHERE resource_type='file' AND resource_id=? AND owner_type='project' AND owner_id=? AND profile_id=? AND deleted_at IS NULL",
              )
              .run(
                p.folderId,
                JSON.stringify([...new Set(p.tags)]),
                p.expiresAt,
                p.fileId,
                projectId,
                this.store.profileId,
              );
            break;
          }
          case 'projects.removeMaterial': {
            const p = ProjectCommandSchemas['projects.removeMaterial'].parse(r.payload);
            this.impact(projectId, p.fileId);
            this.files.unlink([p.fileId], { type: 'project', id: projectId });
            break;
          }
          case 'projects.trash': {
            this.idle(projectId);
            const p = ProjectCommandSchemas['projects.trash'].parse(r.payload),
              impact = this.impact(projectId),
              now = this.store.now();
            this.store.db
              .prepare(
                "UPDATE title_jobs SET status='cancelled' WHERE status='queued' AND session_id IN(SELECT id FROM sessions WHERE project_id=? AND profile_id=?)",
              )
              .run(projectId, this.store.profileId);
            this.store.db
              .prepare(
                'UPDATE sessions SET project_id=NULL,deleted_at=CASE WHEN ? THEN ? ELSE deleted_at END,revision=revision+1,updated_at=? WHERE project_id=? AND profile_id=? AND deleted_at IS NULL',
              )
              .run(+(p.sessionDisposition === 'trash'), now, now, projectId, this.store.profileId);
            this.files.unlink(impact.fileIds, { type: 'project', id: projectId });
            if (p.trashExclusiveFiles)
              for (const id of impact.exclusiveFileIds) this.files.trash([id]);
            this.store.db
              .prepare(
                "UPDATE folders SET deleted_at=?,revision=revision+1 WHERE owner_kind='project' AND owner_id=? AND profile_id=?",
              )
              .run(now, projectId, this.store.profileId);
            this.store.db
              .prepare('UPDATE projects SET deleted_at=? WHERE id=?')
              .run(now, projectId);
            this.changed(projectId);
            return ok({ impact });
          }
          case 'projects.copy': {
            this.idle(projectId);
            const p = ProjectCommandSchemas['projects.copy'].parse(r.payload),
              id = newId(),
              now = this.store.now();
            this.store.db
              .prepare(
                'INSERT INTO projects(id,profile_id,created_at,updated_at,name,icon,color,description,instructions,allow_global_memory,allow_global_history,allow_global_instructions,independent_memory,defaults_json) SELECT ?,profile_id,?,?,?,icon,color,description,instructions,allow_global_memory,allow_global_history,allow_global_instructions,independent_memory,defaults_json FROM projects WHERE id=?',
              )
              .run(id, now, now, project.name.slice(0, 75) + ' · 副本', projectId);
            if (p.includeFiles) {
              const folderMap = new Map<string, string>();
              const folders = this.store.db
                .prepare(
                  "SELECT id,parent_id,name,sort_key FROM folders WHERE profile_id=? AND owner_kind='project' AND owner_id=? AND deleted_at IS NULL",
                )
                .all(this.store.profileId, projectId) as {
                id: string;
                parent_id: string | null;
                name: string;
                sort_key: number;
              }[];
              while (folderMap.size < folders.length) {
                let progressed = false;
                for (const folder of folders)
                  if (
                    !folderMap.has(folder.id) &&
                    (!folder.parent_id || folderMap.has(folder.parent_id))
                  ) {
                    const copied = newId();
                    this.store.db
                      .prepare(
                        "INSERT INTO folders(id,profile_id,created_at,updated_at,owner_kind,owner_id,parent_id,name,sort_key) VALUES(?,?,?,?,'project',?,?,?,?)",
                      )
                      .run(
                        copied,
                        this.store.profileId,
                        now,
                        now,
                        id,
                        folder.parent_id ? folderMap.get(folder.parent_id) : null,
                        folder.name,
                        folder.sort_key,
                      );
                    folderMap.set(folder.id, copied);
                    progressed = true;
                  }
                if (!progressed) throw new StorageError('CONFLICT');
              }
              for (const l of this.links(projectId)) {
                this.files.link(l.resource_id, l.pinned_version_id, { type: 'project', id });
                this.store.db
                  .prepare(
                    "UPDATE resource_links SET folder_id=?,tags_json=?,expires_at=? WHERE owner_type='project' AND owner_id=? AND resource_type='file' AND resource_id=? AND role='source' AND profile_id=?",
                  )
                  .run(
                    l.folder_id ? (folderMap.get(l.folder_id) ?? null) : null,
                    l.tags_json,
                    l.expires_at,
                    id,
                    l.resource_id,
                    this.store.profileId,
                  );
              }
            }
            if (p.includeSessions) {
              if (!this.history) throw new StorageError('FEATURE_NOT_AVAILABLE');
              this.history.copyProjectSessions(projectId, id, p.includeFiles);
            }
            this.changed(id);
            return ok({ project: this.get(id) });
          }
          default:
            throw new StorageError('FEATURE_NOT_AVAILABLE');
        }
        this.changed(projectId);
        return ok({ project: this.get(projectId) });
      });
    } catch (e) {
      return failure(
        r.requestId,
        e instanceof StorageError
          ? e.code
          : e instanceof z.ZodError
            ? 'VALIDATION_ERROR'
            : 'INTERNAL_ERROR',
        e instanceof StorageError ? e.currentRevision : undefined,
      );
    }
  }
}
