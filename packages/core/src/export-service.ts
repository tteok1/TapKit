import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import {
  ExportCommandSchemas,
  ExportDocumentSchema,
  ExportPreviewSchema,
  ExportStatusSchema,
  RequestSchema,
  ReplySchema,
  ErrorCodeSchema,
  FileRelativePathSchema,
  FileNameSchema,
  z,
  type ExportTarget,
  type ExportOptions,
  type ExportDocument,
  type ExportMessageSchema,
  type Request,
  type Reply,
} from '@tapkit/contracts';
import {
  Store,
  BlobStore,
  FileRepository,
  JobQueue,
  StorageError,
  failure,
  newId,
  type Job,
} from '@tapkit/storage';
import { managedZip } from '@tapkit/tools';
import { redactExport, renderExport } from '@tapkit/workflows';
import { ProjectService } from './project-service';
import type { ChatService } from './chat-service';
import type { WebService } from './web-service';
import { writeExportTarget } from './export-target';
import fontLock from '../../../export-font-lock.json';
type Message = z.infer<typeof ExportMessageSchema>;
type Preview = {
  id: string;
  target: ExportTarget;
  options: ExportOptions;
  document: ExportDocument;
  fingerprint: string;
  version: string;
  expiresAt: number;
  windowId: string;
};
type Row = {
  id: string;
  job_id: string;
  state: string;
  progress: number;
  name: string;
  error_code: string | null;
};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const publicTools: Record<string, string> = {
  'web.read': '读取公开网页',
  'web.search': '搜索公开网页',
  'knowledge.query': '检索项目资料',
  'files.read': '读取已授权文件',
  'history.search': '查找已授权历史',
};
const publicStates: Record<string, string> = {
  succeeded: '已完成',
  failed: '失败',
  interrupted: '已中断',
  dispatched: '处理中',
  planned: '准备中',
  skipped: '已跳过',
};
export class ExportService {
  readonly queue: JobQueue;
  private previews = new Map<string, Preview>();
  private grants = new Map<string, { preview: Preview; targetPath: string; windowId: string }>();
  constructor(
    readonly store: Store,
    readonly blobs: BlobStore,
    readonly chat: ChatService,
    readonly web: WebService,
    readonly pdf: (html: string, signal: AbortSignal) => Promise<Buffer>,
    readonly font: () => Promise<string> = async () => {
      const bytes = await readFile(
        join(
          process.env.TAPKIT_APP_ROOT ?? process.cwd(),
          'packages/core/dist/fonts/NotoSansCJKsc-Regular.otf',
        ),
      );
      if (
        createHash('sha256').update(bytes).digest('hex') !==
        fontLock.files['NotoSansCJKsc-Regular.otf'].sha256
      )
        throw new StorageError('CONFLICT');
      return bytes.toString('base64');
    },
  ) {
    this.queue = new JobQueue(store);
    store.db
      .prepare(
        "UPDATE exports SET error_code=CASE WHEN progress>=85 THEN 'SIDE_EFFECT_UNKNOWN' ELSE 'STREAM_INTERRUPTED' END WHERE job_id IN(SELECT id FROM jobs WHERE kind='snapshot.export' AND (status IN('queued','running') OR (status='cancelled' AND progress>=85)))",
      )
      .run();
    store.db
      .prepare(
        "UPDATE jobs SET status='failed',lease_owner=NULL,lease_expires_at=NULL WHERE kind='snapshot.export' AND status IN('queued','running')",
      )
      .run();
  }
  private selection(target: ExportTarget, includeFiles = true, requireFiles = false) {
    const files = new FileRepository(this.store, this.blobs),
      projects = new ProjectService(files);
    let title = '',
      messages: Message[] = [],
      references: {
        ref: { kind: string; fileId?: string; versionId?: string; sourceId?: string };
        sessionId: string;
      }[] = [];
    const selected: z.infer<typeof import('@tapkit/contracts').FileGetSchema>[] = [];
    const revisions: unknown[] = [];
    if (target.kind === 'session' || target.kind === 'outputs') {
      const session = this.store.db
        .prepare(
          'SELECT id,title,revision,active_branch_id,project_id FROM sessions WHERE id=? AND profile_id=? AND deleted_at IS NULL',
        )
        .get(target.sessionId, this.store.profileId) as
        | {
            id: string;
            title: string;
            revision: number;
            active_branch_id: string;
            project_id: string | null;
          }
        | undefined;
      if (!session) throw new StorageError('NOT_FOUND');
      title = session.title;
      revisions.push(session);
      if (target.kind === 'outputs') {
        const rows = this.store.db
          .prepare(
            "SELECT f.id,l.pinned_version_id FROM resource_links l JOIN files f ON f.id=l.resource_id WHERE l.owner_type='session' AND l.owner_id=? AND l.deleted_at IS NULL AND f.profile_id=? AND f.deleted_at IS NULL AND f.kind IN('note','artifact')",
          )
          .all(session.id, this.store.profileId) as { id: string; pinned_version_id: string }[];
        selected.push(
          ...rows.map((row) => ({
            fileId: row.id,
            versionId: row.pinned_version_id,
            owner: { type: 'session' as const, id: session.id },
          })),
        );
        if (!selected.length) throw new StorageError('NOT_FOUND');
      } else {
        const rows = this.store.db
          .prepare(
            "SELECT id,role,content_json,chat_json,status,revision FROM messages WHERE session_id=? AND branch_id=? AND profile_id=? AND deleted_at IS NULL AND role IN('user','assistant') ORDER BY rowid LIMIT 1001",
          )
          .all(session.id, session.active_branch_id, this.store.profileId) as {
          id: string;
          role: Message['role'];
          content_json: string;
          chat_json: string;
          status: string;
          revision: number;
        }[];
        if (rows.length > 1000) throw new StorageError('OUTPUT_LIMIT_REACHED');
        if (target.messageIds?.some((id) => !rows.some((row) => row.id === id)))
          throw new StorageError('PERMISSION_DENIED');
        for (const row of rows.filter(
          (row) => !target.messageIds || target.messageIds.includes(row.id),
        )) {
          if (['queued', 'streaming'].includes(row.status)) {
            if (target.messageIds) throw new StorageError('CONFLICT');
            else continue;
          }
          revisions.push({ id: row.id, revision: row.revision, status: row.status });
          const blocks = JSON.parse(row.content_json).blocks as { text: string }[];
          const text = redactExport(blocks.map((block) => block.text).join('\n'));
          messages.push({ id: row.id, role: row.role, text, status: row.status });
          const refs = (JSON.parse(row.chat_json).attachments ??
            []) as (typeof references)[number]['ref'][];
          references.push(...refs.map((ref) => ({ ref, sessionId: session.id })));
          for (const ref of refs)
            if (ref.kind === 'file' && ref.fileId && ref.versionId) {
              let owner: { type: 'session' | 'project'; id: string } = {
                type: 'session',
                id: session.id,
              };
              try {
                files.get(ref.fileId, { versionId: ref.versionId, owner });
              } catch (error) {
                if (!session.project_id) {
                  if (requireFiles) throw error;
                  continue;
                }
                owner = { type: 'project', id: session.project_id };
                try {
                  files.get(ref.fileId, { versionId: ref.versionId, owner });
                } catch (projectError) {
                  if (requireFiles) throw projectError;
                  continue;
                }
              }
              selected.push({ fileId: ref.fileId, versionId: ref.versionId, owner });
            }
        }
      }
    } else if (target.kind === 'project') {
      const project = projects.get(target.projectId);
      title = project.name;
      revisions.push(project.id, project.revision);
      messages = [
        { id: project.id, role: 'user', text: redactExport(project.description), status: 'final' },
      ];
      selected.push(
        ...projects.links(project.id).map((link) => ({
          fileId: link.resource_id,
          versionId: link.pinned_version_id,
          owner: { type: 'project' as const, id: project.id },
        })),
      );
    } else {
      selected.push(...target.files);
      title = '文件分享副本';
    }
    const unique = includeFiles
      ? [
          ...new Map(
            selected.map((file) => [file.fileId + ':' + (file.versionId ?? ''), file]),
          ).values(),
        ]
      : [];
    const names = new Set<string>();
    const fileViews = unique.map((file) => {
      const view = files.get(file.fileId, {
        ...(file.versionId ? { versionId: file.versionId } : {}),
        ...(file.owner ? { owner: file.owner } : {}),
      });
      revisions.push({
        fileId: view.id,
        revision: view.revision,
        versionId: view.version.id,
        hash: view.version.sha256,
      });
      let relativePath = view.relativePath ?? view.version.name;
      const segments = relativePath.split('/').map((segment) => redactExport(segment));
      segments[segments.length - 1] = redactExport(view.version.name);
      relativePath = FileRelativePathSchema.parse(segments.join('/'));
      if (names.has(relativePath.toLowerCase())) {
        const base = redactExport(view.version.name),
          dot = base.lastIndexOf('.');
        relativePath =
          (segments.length > 1 ? segments.slice(0, -1).join('/') + '/' : '') +
          (dot > 0 ? base.slice(0, dot) : base) +
          '-' +
          view.version.version +
          '-' +
          names.size +
          (dot > 0 ? base.slice(dot) : '');
      }
      names.add(relativePath.toLowerCase());
      return {
        ...file,
        versionId: view.version.id,
        name: redactExport(view.version.name),
        relativePath,
        sizeBytes: view.version.sizeBytes,
        sha256: view.version.sha256,
      };
    });
    return {
      title: redactExport(title),
      messages,
      references,
      files: fileViews,
      fingerprint: digest(revisions),
    };
  }
  async preview(request: Request, target: ExportTarget, options: ExportOptions) {
    if (!request.windowId) throw new StorageError('PERMISSION_DENIED');
    if (
      (target.kind === 'files' || target.kind === 'outputs' || options.includeAttachments) &&
      options.format !== 'zip'
    )
      throw new StorageError('FORMAT_UNSUPPORTED');
    if ((target.kind === 'files' || target.kind === 'outputs') && !options.includeAttachments)
      throw new StorageError('VALIDATION_ERROR');
    const selected = this.selection(
        target,
        options.includeAttachments || options.includeSources,
        options.includeAttachments,
      ),
      sources: ExportDocument['sources'] = [],
      sourceIds = new Map<string, number>();
    if (options.includeSources)
      for (const { ref, sessionId } of selected.references) {
        const key = JSON.stringify(ref);
        if (sourceIds.has(key)) continue;
        if (ref.kind === 'web' && ref.sourceId) {
          const source = await this.web.source(sessionId, ref.sourceId),
            number = sources.length + 1;
          sourceIds.set(key, number);
          sourceIds.set('web:' + source.sourceId, number);
          sources.push({
            number,
            title: redactExport(source.title),
            detail:
              '网页快照 v' + source.revision + ' · ' + new Date(source.fetchedAt).toISOString(),
            url: new URL(redactExport(source.url)).href,
            excerpt: redactExport(source.text.slice(0, 20000)),
            available: true,
          });
        }
        if (ref.kind === 'file' && ref.fileId && ref.versionId) {
          const file = selected.files.find(
            (file) => file.fileId === ref.fileId && file.versionId === ref.versionId,
          );
          if (!file) {
            const number = sources.length + 1;
            sourceIds.set(key, number);
            sources.push({
              number,
              title: '原件不可用',
              detail: '来源已删除或授权失效，可排除来源/附件后重试。',
              url: null,
              excerpt: '',
              available: false,
            });
            continue;
          }
          const number = sources.length + 1;
          sourceIds.set(key, number);
          sources.push({
            number,
            title: file.name,
            detail: '固定文件版本 · ' + file.relativePath,
            url: null,
            excerpt: '',
            available: true,
          });
        }
      }
    const messages = selected.messages.map((message) => {
      const citations = this.store.db
        .prepare(
          'SELECT evidence_json,file_version_id,web_source_id FROM citations WHERE message_id=? AND profile_id=? AND verified=1',
        )
        .all(message.id, this.store.profileId) as {
        evidence_json: string;
        file_version_id: string | null;
        web_source_id: string | null;
      }[];
      const markers = new Map<string, number>();
      for (const citation of citations) {
        if (citation.web_source_id) {
          const number = sourceIds.get('web:' + citation.web_source_id);
          if (number) markers.set('web:' + citation.web_source_id, number);
        } else {
          const evidence = JSON.parse(citation.evidence_json) as {
            id: string;
            text: string;
            ref: unknown;
          };
          const number = sourceIds.get(JSON.stringify(evidence.ref));
          if (number) {
            markers.set('evidence:' + evidence.id, number);
            if (sources[number - 1]!.available)
              sources[number - 1]!.excerpt = redactExport(evidence.text).slice(0, 20000);
          }
        }
      }
      return {
        ...message,
        text: message.text.replace(
          /\[\[(web|evidence):([^\]]+)\]\]/g,
          (_marker, kind: string, id: string) => {
            const number = markers.get(kind + ':' + id);
            return number ? `[来源 ${number}](#source-${number})` : '（来源未包含或未核验）';
          },
        ),
      };
    });
    const process =
      options.includeProcess && (target.kind === 'session' || target.kind === 'outputs')
        ? (
            this.store.db
              .prepare(
                'SELECT t.tool_name,t.status FROM tool_calls t JOIN runs r ON r.id=t.run_id WHERE r.session_id=? AND r.profile_id=? ORDER BY t.rowid LIMIT 200',
              )
              .all(target.sessionId, this.store.profileId) as {
              tool_name: string;
              status: string;
            }[]
          ).map(
            (row) =>
              (publicTools[row.tool_name] ?? '未识别工具') +
              ' · ' +
              (publicStates[row.status] ?? '状态不可用'),
          )
        : [];
    const document = ExportDocumentSchema.parse({
      title: selected.title,
      messages,
      sources,
      files: options.includeAttachments ? selected.files : [],
      process,
    });
    const rendered = renderExport(document);
    if (rendered.text.length > 3000000 || rendered.html.length > 6000000)
      throw new StorageError('FILE_TOO_LARGE');
    const totalBytes = document.files.reduce((sum, file) => sum + file.sizeBytes, 0);
    if (
      totalBytes +
        (options.format === 'zip'
          ? 24 * 1024 * 1024 +
            Buffer.byteLength(rendered.html) +
            Buffer.byteLength(rendered.markdown) +
            Buffer.byteLength(rendered.text)
          : 0) >
      200 * 1024 * 1024
    )
      throw new StorageError('FILE_TOO_LARGE');
    const id = newId(),
      version = digest({ target, options, document, fingerprint: selected.fingerprint }),
      expiresAt = this.store.now() + 30 * 60000;
    for (const [key, value] of this.previews)
      if (value.expiresAt < this.store.now() || value.windowId === request.windowId)
        this.previews.delete(key);
    if (this.previews.size >= 20) throw new StorageError('QUOTA_EXHAUSTED');
    this.previews.set(id, {
      id,
      target,
      options,
      document,
      fingerprint: selected.fingerprint,
      version,
      expiresAt,
      windowId: request.windowId,
    });
    return ExportPreviewSchema.parse({
      previewId: id,
      snapshotVersion: version,
      title: document.title,
      options,
      messages: document.messages,
      fileNames: document.files.map((file) => file.relativePath),
      totalBytes,
      text: rendered.text,
      html: rendered.html,
      expiresAt,
    });
  }
  getPreview(windowId: string, id: string, version: string) {
    const preview = this.previews.get(id);
    if (
      !preview ||
      preview.windowId !== windowId ||
      preview.version !== version ||
      preview.expiresAt < this.store.now()
    )
      throw new StorageError('CONFLICT');
    this.validate(preview);
    return preview;
  }
  destination(windowId: string, id: string, version: string) {
    const preview = this.getPreview(windowId, id, version);
    return { name: this.name(preview), format: preview.options.format };
  }
  private name(preview: Preview) {
    const value =
      (preview.document.title || '分享副本')
        .slice(0, 180)
        .replace(/\p{Surrogate}/gu, '_')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/[. ]+$/, '') +
      '.' +
      preview.options.format;
    return FileNameSchema.safeParse(value).success ? value : '分享副本.' + preview.options.format;
  }
  private validate(preview: Preview) {
    if (
      this.selection(
        preview.target,
        preview.options.includeAttachments || preview.options.includeSources,
        preview.options.includeAttachments,
      ).fingerprint !== preview.fingerprint
    )
      throw new StorageError('CONFLICT');
  }
  async write(windowId: string, previewId: string, version: string, targetPath: string) {
    const preview = this.getPreview(windowId, previewId, version),
      exportId = newId();
    if (extname(targetPath).toLowerCase() !== '.' + preview.options.format)
      throw new StorageError('VALIDATION_ERROR');
    this.validate(preview);
    const name = FileNameSchema.parse(redactExport(basename(targetPath)));
    const sourceId =
      preview.target.kind === 'project'
        ? preview.target.projectId
        : preview.target.kind === 'files'
          ? preview.target.files[0]!.fileId
          : preview.target.sessionId;
    this.store.db.transaction(() => {
      const jobId = this.queue.enqueue(
        { schemaVersion: 1, kind: 'snapshot.export', exportId },
        'export:' + exportId,
      );
      this.store.db
        .prepare(
          "INSERT INTO exports(id,profile_id,created_at,updated_at,source_kind,source_id,snapshot_version,format,options_json,job_id,name,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,'queued')",
        )
        .run(
          exportId,
          this.store.profileId,
          this.store.now(),
          this.store.now(),
          preview.target.kind,
          sourceId,
          version,
          preview.options.format,
          JSON.stringify(preview.options),
          jobId,
          name,
        );
    })();
    this.grants.set(exportId, { preview, targetPath, windowId });
    this.previews.delete(previewId);
    return this.status(exportId);
  }
  status(id: string) {
    const row = this.store.db
      .prepare('SELECT * FROM exports WHERE id=? AND profile_id=?')
      .get(id, this.store.profileId) as Row | undefined;
    if (!row) throw new StorageError('NOT_FOUND');
    return ExportStatusSchema.parse({
      exportId: row.id,
      jobId: row.job_id,
      state: row.state,
      progress: row.progress,
      name: row.name,
      errorCode: row.error_code,
    });
  }
  async execute(job: Job, signal: AbortSignal) {
    const payload = JSON.parse(job.payload_json) as { exportId: string },
      grant = this.grants.get(payload.exportId);
    const progress = (value: number) =>
      this.store.db
        .prepare('UPDATE exports SET progress=?,updated_at=? WHERE id=? AND profile_id=?')
        .run(value, this.store.now(), payload.exportId, this.store.profileId);
    let saved = false;
    try {
      if (!grant) throw new StorageError('PERMISSION_DENIED');
      const alive = () => {
        signal.throwIfAborted();
        const row = this.store.db
          .prepare(
            'SELECT status,lease_epoch,lease_owner,lease_expires_at,cancel_requested_at FROM jobs WHERE id=? AND profile_id=?',
          )
          .get(job.id, this.store.profileId) as
          | {
              status: string;
              lease_epoch: number;
              lease_owner: string;
              lease_expires_at: number;
              cancel_requested_at: number | null;
            }
          | undefined;
        if (
          !row ||
          row.status !== 'running' ||
          row.cancel_requested_at !== null ||
          row.lease_epoch !== job.lease_epoch ||
          row.lease_owner !== job.lease_owner ||
          row.lease_expires_at <= this.store.now()
        )
          throw new StorageError('CANCELLED');
      };
      const validate = () => {
        alive();
        this.validate(grant.preview);
      };
      validate();
      progress(5);
      const preview = grant.preview,
        document = preview.document,
        format = preview.options.format;
      const font = ['html', 'pdf', 'zip'].includes(format) ? await this.font() : '';
      validate();
      const rendered = renderExport(document, font);
      progress(20);
      let bytes: Buffer;
      if (format === 'pdf') bytes = await this.pdf(rendered.html, signal);
      else if (format === 'zip') {
        const entries: { name: string; bytes: Buffer }[] = [
          { name: 'index.html', bytes: Buffer.from(rendered.html) },
          { name: 'conversation.md', bytes: Buffer.from(rendered.markdown) },
          { name: 'conversation.txt', bytes: Buffer.from(rendered.text) },
          {
            name: 'README.txt',
            bytes: Buffer.from(
              '这是不可变本地分享副本。发送后不能撤销收件人持有的副本。index.html 无脚本/远程资源。附件为显式选入的固定原始版本；Office/公式/图表未转换。',
            ),
          },
        ];
        const files = new FileRepository(this.store, this.blobs);
        for (let i = 0; i < document.files.length; i++) {
          validate();
          const file = document.files[i]!,
            source = await files.original(file.fileId, {
              versionId: file.versionId,
              ...(file.owner ? { owner: file.owner } : {}),
            });
          if (source.file.version.sha256 !== file.sha256) throw new StorageError('CONFLICT');
          entries.push({ name: 'attachments/' + file.relativePath, bytes: source.bytes });
          progress(20 + Math.floor(((i + 1) * 60) / Math.max(1, document.files.length)));
        }
        bytes = await managedZip(entries);
      } else
        bytes = Buffer.from(
          format === 'html' ? rendered.html : format === 'md' ? rendered.markdown : rendered.text,
        );
      validate();
      progress(85);
      if (
        bytes.length > 250 * 1024 * 1024 ||
        (format === 'pdf' && bytes.subarray(0, 5).toString() !== '%PDF-')
      )
        throw new StorageError('OUTPUT_LIMIT_REACHED');
      await writeExportTarget(grant.targetPath, bytes, signal, validate, alive);
      saved = true;
      progress(99);
      return payload.exportId;
    } catch (error) {
      const classified =
        error instanceof Error && ErrorCodeSchema.safeParse(error.message).success
          ? error.message
          : 'INTERNAL_ERROR';
      const code =
        saved || classified === 'SIDE_EFFECT_UNKNOWN'
          ? 'SIDE_EFFECT_UNKNOWN'
          : signal.aborted
            ? 'CANCELLED'
            : classified;
      this.store.db
        .prepare(
          'UPDATE exports SET error_code=?,progress=CASE WHEN ? THEN progress ELSE 0 END WHERE id=? AND profile_id=?',
        )
        .run(code, code === 'SIDE_EFFECT_UNKNOWN' ? 1 : 0, payload.exportId, this.store.profileId);
      throw error;
    } finally {
      this.grants.delete(payload.exportId);
    }
  }
  closeWindow(windowId: string) {
    for (const [id, grant] of this.grants)
      if (grant.windowId === windowId) {
        const row = this.store.db
          .prepare('SELECT job_id FROM exports WHERE id=? AND profile_id=?')
          .get(id, this.store.profileId) as { job_id: string } | undefined;
        if (row) this.queue.cancel(row.job_id);
        this.grants.delete(id);
      }
    for (const [id, preview] of this.previews)
      if (preview.windowId === windowId) this.previews.delete(id);
  }
  async dispatch(raw: unknown): Promise<Reply> {
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) return failure('', 'VALIDATION_ERROR');
    const request = parsed.data;
    try {
      const command = request.command as keyof typeof ExportCommandSchemas,
        schema = ExportCommandSchemas[command];
      if (!schema || !request.windowId) throw new StorageError('PERMISSION_DENIED');
      schema.parse(request.payload);
      if (command === 'exports.recent') {
        const { target } = ExportCommandSchemas[command].parse(request.payload);
        const sourceId =
          target.kind === 'project'
            ? target.projectId
            : target.kind === 'files'
              ? target.files[0]!.fileId
              : target.sessionId;
        const rows = this.store.db
          .prepare(
            'SELECT id FROM exports WHERE source_kind=? AND source_id=? AND profile_id=? ORDER BY created_at DESC,id DESC LIMIT 20',
          )
          .all(target.kind, sourceId, this.store.profileId) as { id: string }[];
        return ReplySchema.parse({
          ok: true,
          requestId: request.requestId,
          data: { exportHistory: rows.map((row) => this.status(row.id)) },
        });
      }
      if (command === 'exports.preview') {
        const p = ExportCommandSchemas[command].parse(request.payload);
        return ReplySchema.parse({
          ok: true,
          requestId: request.requestId,
          data: { exportPreview: await this.preview(request, p.target, p.options) },
        });
      }
      const p = ExportCommandSchemas[command].parse(request.payload) as { exportId: string };
      if (command === 'exports.cancel') {
        this.queue.cancel(this.status(p.exportId).jobId);
        this.grants.delete(p.exportId);
      }
      return ReplySchema.parse({
        ok: true,
        requestId: request.requestId,
        data: { exportStatus: this.status(p.exportId) },
      });
    } catch (error) {
      return failure(
        request.requestId,
        error instanceof z.ZodError
          ? 'VALIDATION_ERROR'
          : error instanceof Error && ErrorCodeSchema.safeParse(error.message).success
            ? ErrorCodeSchema.parse(error.message)
            : 'INTERNAL_ERROR',
      );
    }
  }
}
