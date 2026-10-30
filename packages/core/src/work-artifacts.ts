import {
  AnalysisResultSchema,
  WorkToolArgsSchema,
  type AnalysisResult,
  type ResourceRef,
  type WorkToolArgs,
} from '@tapkit/contracts';
import {
  BlobStore,
  DocumentRepository,
  SlideRepository,
  FileRepository,
  StorageError,
  WorkRepository,
  newId,
  type WorkRun,
} from '@tapkit/storage';
import { renderDocumentDraft, validateDocumentStructure } from '@tapkit/workflows';
import { createHash } from 'node:crypto';
import { DATA_PROGRAM } from '@tapkit/workflows';

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
  /** All files and the primary result receipt commit together; blobs may safely be orphaned on failure. */
  async publishAnalysis(
    run: WorkRun,
    raw: AnalysisResult,
    outputs: Array<{ name: string; bytes: Buffer; mime: string }>,
    guard: () => void,
    committed: (ref: ResourceRef) => void,
  ) {
    const result = AnalysisResultSchema.parse(raw),
      staged: Array<{
        name: string;
        mime: string;
        bytes: Buffer;
        fileId: string;
        versionId: string;
        blob: Awaited<ReturnType<BlobStore['put']>>;
      }> = [];
    for (const output of outputs) {
      if (output.bytes.length > 100 * 1024 * 1024 || !output.bytes.length)
        throw new StorageError('OUTPUT_LIMIT_REACHED');
      staged.push({
        ...output,
        fileId: newId(),
        versionId: newId(),
        blob: await this.blobs.put(output.bytes, output.mime),
      });
      guard();
    }
    result.exports = staged.map(({ name, fileId, versionId, blob }) => ({
      name,
      fileId,
      versionId,
      sha256: blob.sha256,
    }));
    const primaryBytes = Buffer.from(JSON.stringify(result));
    if (primaryBytes.length > 100 * 1024 * 1024) throw new StorageError('OUTPUT_LIMIT_REACHED');
    const primary = {
      name: '分析结果.json',
      fileId: newId(),
      versionId: newId(),
      mime: 'application/json',
      bytes: primaryBytes,
      blob: await this.blobs.put(primaryBytes, 'application/json'),
    };
    guard();
    return this.files.store.db.transaction(() => {
      guard();
      const used = (
        this.files.store.db
          .prepare(
            'SELECT coalesce(sum(v.size_bytes),0) n FROM file_versions v JOIN runs r ON r.id=v.created_by_run_id WHERE r.root_run_id=? AND v.deleted_at IS NULL',
          )
          .get(run.root_run_id) as { n: number }
      ).n;
      if (
        used + primaryBytes.length + staged.reduce((n, v) => n + v.bytes.length, 0) >
        2 * 1024 ** 3
      )
        throw new StorageError('BUDGET_EXCEEDED');
      for (const output of [...staged, primary]) {
        this.blobs.attach(output.blob.id, output.name, output);
        this.files.store.db
          .prepare("UPDATE files SET kind='artifact',source_type='generated' WHERE id=?")
          .run(output.fileId);
        const extension = output.name.split('.').at(-1)!;
        const parse = ['xlsx', 'csv', 'md'].includes(extension);
        this.files.store.db
          .prepare(
            'UPDATE file_versions SET created_by_run_id=?,display_name=?,extension=?,mime=?,parse_status=?,preview_status=? WHERE id=?',
          )
          .run(
            run.id,
            output.name,
            extension,
            output.mime,
            parse ? 'pending' : 'ready',
            parse ? 'pending' : 'ready',
            output.versionId,
          );
        this.files.link(output.fileId, output.versionId, { type: 'session', id: run.session_id });
        this.files.link(output.fileId, output.versionId, { type: 'task', id: run.task_id });
        if (parse) this.files.queueParse(output.versionId);
      }
      const ref = { kind: 'file' as const, fileId: primary.fileId, versionId: primary.versionId };
      committed(ref);
      this.repo.event(run, 'artifact.ready', '数据分析和导出已核验并保存');
      return ref;
    })();
  }
  /** Resolve the fixed source spec only for a PDF produced from a generated document. */
  documentSourceForPdf(run: WorkRun, pdfVersionId: string) {
    const call = this.files.store.db
      .prepare(
        `SELECT c.args_json FROM tool_calls c JOIN runs r ON r.id=c.run_id
       WHERE r.root_run_id=? AND c.profile_id=? AND c.tool_name='office.convert'
       AND c.status='succeeded' AND json_extract(c.result_ref,'$.versionId')=?
       ORDER BY c.created_at DESC LIMIT 1`,
      )
      .get(run.root_run_id, this.files.store.profileId, pdfVersionId) as
      { args_json: string } | undefined;
    if (!call) return undefined;
    const args = WorkToolArgsSchema.parse(JSON.parse(call.args_json));
    if (args.tool !== 'office.convert') throw new StorageError('CONFLICT');
    return this.documentSourceSpec(run, args.fileId, args.versionId);
  }
  /** Resolve a document spec only from the exact authorized source version. */
  documentSourceSpec(run: WorkRun, fileId: string, versionId: string) {
    const source = this.files.store.db
      .prepare(
        `SELECT f.kind,v.extension,r.root_run_id FROM file_versions v JOIN files f ON f.id=v.file_id
       LEFT JOIN runs r ON r.id=v.created_by_run_id WHERE v.id=? AND v.file_id=? AND v.profile_id=?`,
      )
      .get(versionId, fileId, this.files.store.profileId) as
      { kind: string; extension: string; root_run_id: string | null } | undefined;
    if (!source || source.kind !== 'artifact' || source.extension !== 'docx' || !source.root_run_id)
      return undefined;
    const repository = new DocumentRepository(this.files);
    if (source.root_run_id === run.root_run_id)
      return repository.read(fileId, versionId, { type: 'task', id: run.task_id });
    const selected = this.repo
      .state(this.repo.row(run.id))
      .definition.refs.some(
        (ref) => ref.kind === 'file' && ref.fileId === fileId && ref.versionId === versionId,
      );
    if (!selected) throw new StorageError('PERMISSION_DENIED');
    try {
      return repository.read(fileId, versionId, { type: 'session', id: run.session_id });
    } catch (error) {
      const projectId = this.repo.session(run.session_id).project_id;
      if (!(error instanceof StorageError) || error.code !== 'PERMISSION_DENIED' || !projectId)
        throw error;
      return repository.read(fileId, versionId, { type: 'project', id: projectId });
    }
  }
  async verify(
    run: WorkRun,
    refs: ResourceRef[],
    resolveImage?: (versionId: string) => Promise<Buffer>,
  ) {
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
        if (file.version.extension === 'pptx') {
          if (bytes.subarray(0, 2).toString() !== 'PK' || file.version.parseStatus !== 'ready')
            return false;
          const owner = { type: 'task' as const, id: run.task_id },
            record = new SlideRepository(this.files).read(ref.fileId, ref.versionId, owner),
            parsed = await this.files.parsed(ref.fileId, { versionId: ref.versionId, owner });
          if (
            parsed.format !== 'pptx' ||
            parsed.slides.length !== record.spec.slides.length ||
            record.quality.pages !== record.spec.slides.length
          )
            return false;
          const clean = (text: string) => text.normalize('NFKC').replace(/\s/g, '');
          if (
            !record.spec.slides.every((s, i) => {
              const text = clean(
                parsed.blocks
                  .filter(
                    (b) =>
                      b.locator.kind === 'slide' &&
                      b.locator.slideIndex === i &&
                      b.kind !== 'notes',
                  )
                  .map((b) => b.text)
                  .join(''),
              );
              return (
                text.includes(clean(s.title)) &&
                [
                  ...s.bullets,
                  ...s.rightBullets,
                  ...(s.table ? [...s.table.headers, ...s.table.rows.flat()] : []),
                ].every((part) => text.includes(clean(part))) &&
                clean(parsed.slides[i]!.notes).includes(clean(s.notes))
              );
            })
          )
            return false;
          const preview = this.files.get(record.preview.fileId, {
            versionId: record.preview.versionId,
            owner,
          });
          if (preview.version.extension !== 'pdf') return false;
          await this.files.original(record.preview.fileId, {
            versionId: record.preview.versionId,
            owner,
          });
        } else if (file.version.extension === 'docx') {
          if (bytes.subarray(0, 2).toString() !== 'PK' || file.version.parseStatus !== 'ready')
            return false;
          const owner = { type: 'task' as const, id: run.task_id };
          const spec = new DocumentRepository(this.files).read(ref.fileId, ref.versionId, owner);
          const parsed = await this.files.parsed(ref.fileId, { versionId: ref.versionId, owner });
          const images = spec.sections.flatMap((section) =>
            section.blocks.flatMap((block) =>
              block.type === 'image' ? [block.fileVersionId] : [],
            ),
          );
          let imageIntegrityChecked = false;
          if (images.length) {
            if (
              !resolveImage ||
              !parsed.embeddedPngHashes ||
              parsed.embeddedPngHashes.length !== images.length
            )
              return false;
            const hashes = await Promise.all(
              images.map(async (id) =>
                createHash('sha256')
                  .update(await resolveImage(id))
                  .digest('hex'),
              ),
            );
            if (hashes.some((hash, index) => hash !== parsed.embeddedPngHashes![index]))
              return false;
            imageIntegrityChecked = true;
          }
          if (!validateDocumentStructure(spec, parsed, 'docx', imageIntegrityChecked)) return false;
        } else if (file.version.extension === 'pdf') {
          if (
            bytes.subarray(0, 5).toString() !== '%PDF-' ||
            !bytes.subarray(-2048).includes(Buffer.from('%%EOF'))
          )
            return false;
          const source = this.documentSourceForPdf(run, ref.versionId);
          if (source) {
            if (file.version.parseStatus !== 'ready') return false;
            const parsed = await this.files.parsed(ref.fileId, {
              versionId: ref.versionId,
              owner: { type: 'task', id: run.task_id },
            });
            const images = source.sections.flatMap((section) =>
              section.blocks.flatMap((block) =>
                block.type === 'image' ? [block.fileVersionId] : [],
              ),
            );
            if (images.length) {
              if (!resolveImage || (parsed.paintedImages ?? 0) < images.length) return false;
              await Promise.all(images.map(resolveImage));
            }
            if (!validateDocumentStructure(source, parsed, 'pdf', images.length > 0)) return false;
          }
        } else {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          const json = file.version.extension === 'json' ? JSON.parse(text) : undefined;
          if (json?.kind === 'tapkit.analysis') {
            const result = AnalysisResultSchema.parse(json);
            const receipt = this.files.store.db
              .prepare(
                "SELECT 1 FROM tool_calls WHERE profile_id=? AND tool_name='data.analyze' AND status='succeeded' AND json_extract(result_ref,'$.versionId')=?",
              )
              .get(this.files.store.profileId, ref.versionId);
            if (
              !receipt ||
              result.scriptHash !== createHash('sha256').update(DATA_PROGRAM).digest('hex')
            )
              return false;
            for (const output of result.exports) {
              const outputFile = this.files.get(output.fileId, {
                versionId: output.versionId,
                owner: { type: 'task', id: run.task_id },
              });
              if (outputFile.version.sha256 !== output.sha256) return false;
              await this.files.original(output.fileId, {
                versionId: output.versionId,
                owner: { type: 'task', id: run.task_id },
              });
            }
          } else this.validate(file.version.name, text);
          if (
            file.version.extension === 'md' &&
            this.files.store.db
              .prepare('SELECT 1 FROM document_specs WHERE file_version_id=? AND profile_id=?')
              .get(ref.versionId, this.files.store.profileId)
          ) {
            if (file.version.parseStatus !== 'ready') return false;
            const parsed = await this.files.parsed(ref.fileId, {
              versionId: ref.versionId,
              owner: { type: 'task', id: run.task_id },
            });
            if (parsed.format !== 'markdown' || !parsed.blocks.some((block) => block.text.trim()))
              return false;
            const spec = new DocumentRepository(this.files).read(ref.fileId, ref.versionId, {
              type: 'task',
              id: run.task_id,
            });
            const rendered = await renderDocumentDraft(spec, async () => true);
            if (rendered.markdown !== text) return false;
          }
        }
      }
      return true;
    } catch {
      return false;
    }
  }
}
