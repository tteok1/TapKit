import { WorkToolArgsSchema, type ResourceRef, type WorkToolArgs } from '@tapkit/contracts';
import {
  BlobStore,
  FileRepository,
  StorageError,
  WorkRepository,
  type WorkRun,
} from '@tapkit/storage';

/** Fixed data serialization only. No scripts, untrusted paths or native execution on Core. */
export class WorkArtifacts {
  readonly repo: WorkRepository;
  constructor(
    readonly files: FileRepository,
    readonly blobs: BlobStore,
  ) {
    this.repo = new WorkRepository(files.store);
  }
  validate(name: string, content: string) {
    if (content.includes('\0') || Buffer.byteLength(content) > 400000)
      throw new StorageError('OUTPUT_LIMIT_REACHED');
    const ext = name.split('.').at(-1);
    if (!['md', 'txt', 'json', 'csv'].includes(ext ?? ''))
      throw new StorageError('FORMAT_UNSUPPORTED');
    if (ext === 'json') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new StorageError('PARSE_FAILED');
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new StorageError('PARSE_FAILED');
    }
    if (!content.trim()) throw new StorageError('PARSE_FAILED');
    return {
      extension: ext!,
      mime:
        ext === 'json'
          ? 'application/json'
          : ext === 'csv'
            ? 'text/csv'
            : ext === 'md'
              ? 'text/markdown'
              : 'text/plain',
    };
  }
  async execute(
    run: WorkRun,
    _step: string,
    raw: WorkToolArgs,
    guard: () => void,
    committed?: (ref: ResourceRef) => void,
  ): Promise<ResourceRef> {
    const args = WorkToolArgsSchema.parse(raw);
    if (args.tool !== 'artifact.write') throw new StorageError('PERMISSION_DENIED');
    guard();
    const { mime } = this.validate(args.name, args.content);
    return this.publishBytes(
      run,
      args.name,
      Buffer.from(args.content, 'utf8'),
      mime,
      guard,
      committed,
    );
  }
  async publishBytes(
    run: WorkRun,
    name: string,
    bytes: Buffer,
    mime: string,
    guard: () => void,
    committed?: (ref: ResourceRef) => void,
  ): Promise<ResourceRef> {
    const pdf = mime === 'application/pdf';
    if (pdf) {
      if (
        bytes.subarray(0, 5).toString() !== '%PDF-' ||
        !bytes.subarray(-2048).includes(Buffer.from('%%EOF')) ||
        bytes.length > 100 * 1024 * 1024
      )
        throw new StorageError('PARSE_FAILED');
    } else this.validate(name, new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const blob = await this.blobs.put(bytes, mime);
    guard();
    return this.files.store.db.transaction(() => {
      guard();
      const output = this.blobs.attach(blob.id, name);
      this.files.store.db
        .prepare("UPDATE files SET kind='artifact',source_type='generated' WHERE id=?")
        .run(output.id);
      this.files.store.db
        .prepare(
          "UPDATE file_versions SET created_by_run_id=?,parse_status='ready',preview_status='ready',display_name=?,extension=?,mime=? WHERE id=?",
        )
        .run(run.id, name, name.split('.').at(-1), mime, output.versionId);
      if (pdf) {
        this.files.store.db
          .prepare("UPDATE file_versions SET parse_status='pending' WHERE id=?")
          .run(output.versionId);
        this.files.queueParse(output.versionId);
      }
      this.files.link(output.id, output.versionId, { type: 'session', id: run.session_id });
      this.files.link(output.id, output.versionId, { type: 'task', id: run.task_id });
      this.repo.event(run, 'artifact.ready', '成果已保存并校验：' + name);
      const ref = { kind: 'file' as const, fileId: output.id, versionId: output.versionId };
      committed?.(ref);
      return ref;
    })();
  }
  async verify(run: WorkRun, refs: ResourceRef[]) {
    if (!refs.length) return false;
    try {
      for (const ref of refs) {
        if (ref.kind !== 'file') return false;
        const file = this.files.get(ref.fileId, {
          versionId: ref.versionId,
          owner: { type: 'task', id: run.task_id },
        });
        const origin = this.files.store.db
          .prepare(
            'SELECT r.root_run_id FROM file_versions v JOIN runs r ON r.id=v.created_by_run_id WHERE v.id=?',
          )
          .get(ref.versionId) as { root_run_id: string } | undefined;
        if (!origin || origin.root_run_id !== run.root_run_id || file.kind !== 'artifact')
          return false;
        const { bytes } = await this.files.original(ref.fileId, {
          versionId: ref.versionId,
          owner: { type: 'task', id: run.task_id },
        });
        if (file.version.extension === 'pdf') {
          if (
            bytes.subarray(0, 5).toString() !== '%PDF-' ||
            !bytes.subarray(-2048).includes(Buffer.from('%%EOF'))
          )
            return false;
        } else
          this.validate(file.version.name, new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      }
      return true;
    } catch {
      return false;
    }
  }
}
