import { copyFile, lstat, mkdir, open, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import {
  z,
  FILE_LIMITS,
  FILE_PARSER_VERSION,
  FileParseReasonSchema,
  IngestInputSchema,
  DocumentSpecSchema,
  SlideRecordSchema,
  IdSchema,
  JobPayloadSchema,
  HelperRequestSchema,
  ParsedDocumentSchema,
  FileRelativePathSchema,
  type FileParseReason,
  type ErrorCode,
  type ExecutionCapabilities,
  type HelperRequest,
} from '@tapkit/contracts';
import { NativeSandboxExecutor, runtimePaths, SandboxError } from '@tapkit/tools';
import { FileRepository, StorageError, newId, type Job } from '@tapkit/storage';
import { FileStaging } from './file-staging';

const OutputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  fileVersionId: z.string(),
  parserVersion: z.literal(FILE_PARSER_VERSION),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  document: ParsedDocumentSchema,
});
const PdfAssetsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  pdfjsVersion: z.literal('6.3.289'),
  files: z
    .array(
      z.strictObject({
        path: FileRelativePathSchema.refine((p) =>
          /^(?:pdf(?:\.worker)?\.mjs|(?:cmaps|standard_fonts)\/[\w.-]+)$/.test(p),
        ),
        sizeBytes: z.number().int().min(0).max(FILE_LIMITS.maxFileBytes),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .min(2)
    .max(2000),
});
export type ParserExecutor = {
  execute(
    request: HelperRequest,
    options: { signal: AbortSignal },
  ): Promise<{
    exitCode: number | null;
    events: { event: string; data: Record<string, unknown> }[];
  }>;
};
class WorkerFailure extends Error {
  constructor(readonly reason: FileParseReason) {
    super(reason);
  }
}
function errorCode(reason: FileParseReason): ErrorCode {
  if (reason === 'SANDBOX_UNAVAILABLE') return 'SANDBOX_UNAVAILABLE';
  if (reason === 'PARSE_TIMEOUT') return 'TOOL_TIMEOUT';
  if (reason === 'FORMAT_UNSUPPORTED' || reason === 'MACRO_FORMAT') return 'FORMAT_UNSUPPORTED';
  if (reason === 'CANCELLED') return 'CANCELLED';
  if (reason === 'OUTPUT_LIMIT') return 'OUTPUT_LIMIT_REACHED';
  return 'PARSE_FAILED';
}
/** Trusted Core orchestration. Only the fixed bundled adapter reads untrusted format bytes. */
export class FileParser {
  private readonly executor: ParserExecutor;
  readonly staging: FileStaging;
  constructor(
    readonly root: string,
    readonly files: FileRepository,
    readonly capabilities: ExecutionCapabilities,
    executor?: ParserExecutor,
  ) {
    this.executor = executor ?? new NativeSandboxExecutor(root);
    this.staging = new FileStaging(files.store);
  }
  /** Inspect a staged PDF without registering a file or publishing a receipt. */
  async inspectWorkPdf(
    directory: string,
    versionId: string,
    bytes: Buffer,
    inspectDocumentImages: boolean,
    guard: () => void,
    signal: AbortSignal,
    lifecycle?: { started(): void; settled(): void },
  ) {
    guard();
    if (this.capabilities.nativeExecution.status !== 'available')
      throw new StorageError('SANDBOX_UNAVAILABLE');
    const base = resolve(this.files.store.dataDir, 'tmp/work'),
      path = resolve(directory),
      id = relative(base, path);
    if (
      !IdSchema.safeParse(id).success ||
      (await realpath(path)).toLowerCase() !== path.toLowerCase()
    )
      throw new StorageError('PERMISSION_DENIED');
    const markerPath = join(path, '.tapkit-preview.json'),
      markerStat = await lstat(markerPath);
    if (!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.size > 4096)
      throw new StorageError('PERMISSION_DENIED');
    const marker = z
      .strictObject({
        schemaVersion: z.literal(1),
        directoryId: IdSchema,
        profileId: IdSchema,
        fileVersionId: IdSchema,
      })
      .parse(JSON.parse(await readFile(markerPath, 'utf8')));
    if (
      marker.directoryId !== id ||
      marker.profileId !== this.files.store.profileId ||
      marker.fileVersionId !== versionId
    )
      throw new StorageError('PERMISSION_DENIED');
    if (bytes.length > FILE_LIMITS.maxFileBytes || bytes.subarray(0, 5).toString() !== '%PDF-')
      throw new StorageError('PARSE_FAILED');
    const candidate = join(path, 'inspect-' + newId()),
      inputRoot = join(candidate, 'input'),
      workspace = join(candidate, 'workspace');
    await mkdir(candidate);
    await mkdir(inputRoot);
    await mkdir(workspace);
    const input = IngestInputSchema.parse({
      schemaVersion: 1,
      fileVersionId: versionId,
      relativePath: 'candidate.pdf',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      parserVersion: FILE_PARSER_VERSION,
      ...(inspectDocumentImages ? { inspectDocumentImages: true } : {}),
    });
    await writeFile(join(inputRoot, 'original'), bytes, { flag: 'wx' });
    await writeFile(join(inputRoot, 'input.json'), JSON.stringify(input), { flag: 'wx' });
    const adapter = resolve(this.root, 'packages/retrieval/dist/parse.cjs'),
      adapterStat = await lstat(adapter);
    if (
      !adapterStat.isFile() ||
      adapterStat.isSymbolicLink() ||
      (await realpath(adapter)).toLowerCase() !== adapter.toLowerCase()
    )
      throw new StorageError('SANDBOX_UNAVAILABLE');
    await copyFile(adapter, join(inputRoot, 'parse.cjs'));
    await this.stagePdfAssets(inputRoot);
    guard();
    signal.throwIfAborted();
    const runtime = await runtimePaths(this.root, 'node');
    let result: Awaited<ReturnType<ParserExecutor['execute']>>;
    try {
      lifecycle?.started();
      result = await this.executor.execute(
        HelperRequestSchema.parse({
          protocolVersion: 1,
          requestId: newId(),
          runId: newId(),
          leaseEpoch: 1,
          operation: 'diagnostic.execute',
          payload: {
            ...runtime,
            inputRoot,
            workspace,
            args: [
              '--preserve-symlinks',
              '--preserve-symlinks-main',
              join(inputRoot, 'parse.cjs'),
              inputRoot,
              workspace,
            ],
            timeoutMs: FILE_LIMITS.parseTimeoutMs,
            terminal: false,
            processLimit: 2,
            outputBytes: 65536,
          },
        }),
        { signal },
      );
    } catch {
      throw new StorageError('SIDE_EFFECT_UNKNOWN');
    }
    const started = result.events[0],
      limits = started?.data.job as Record<string, unknown> | undefined,
      finished = result.events.at(-1);
    if (finished?.event !== 'finished' || finished.data.activeProcesses !== 0)
      throw new StorageError('SIDE_EFFECT_UNKNOWN');
    lifecycle?.settled();
    if (
      started?.event !== 'started' ||
      started.data.appContainer !== true ||
      started.data.networkCapabilities !== 0 ||
      typeof started.data.appContainerSid !== 'string' ||
      started.data.identitySid !== started.data.appContainerSid ||
      limits?.killOnClose !== true ||
      limits.breakaway !== false
    )
      throw new StorageError('SANDBOX_UNAVAILABLE');
    if (result.exitCode !== 0 || finished.data.exitCode !== 0 || finished.data.status !== 'exited')
      throw new StorageError('PARSE_FAILED');
    guard();
    signal.throwIfAborted();
    const outputPath = join(workspace, 'parsed.json'),
      outputStat = await lstat(outputPath);
    if (
      !outputStat.isFile() ||
      outputStat.isSymbolicLink() ||
      outputStat.size > FILE_LIMITS.maxFileBytes ||
      (await realpath(outputPath)).toLowerCase() !== resolve(outputPath).toLowerCase()
    )
      throw new StorageError('PERMISSION_DENIED');
    const handle = await open(outputPath, 'r');
    let outputBytes: Buffer;
    try {
      const pinned = await handle.stat();
      if (
        pinned.ino !== outputStat.ino ||
        pinned.dev !== outputStat.dev ||
        pinned.size !== outputStat.size
      )
        throw new StorageError('CONFLICT');
      outputBytes = await handle.readFile();
      if (outputBytes.length !== pinned.size) throw new StorageError('CONFLICT');
    } finally {
      await handle.close();
    }
    const output = OutputSchema.parse(JSON.parse(outputBytes.toString('utf8')));
    if (
      output.fileVersionId !== versionId ||
      output.sourceSha256 !== input.sha256 ||
      !(await readFile(join(inputRoot, 'original'))).equals(bytes)
    )
      throw new StorageError('CONFLICT');
    guard();
    return output.document;
  }
  async execute(job: Job, signal: AbortSignal): Promise<string> {
    const payload = JobPayloadSchema.parse(JSON.parse(job.payload_json));
    if (payload.kind !== 'file.parse') throw new StorageError('VALIDATION_ERROR');
    const versionId = payload.fileVersionId;
    let directory: string | undefined;
    try {
      signal.throwIfAborted();
      // Deferred media are metadata-only originals, even when native parsing is unavailable.
      // This check never opens or decodes the uploaded bytes.
      const file = this.files.beginParse(job, versionId);
      if (/^(doc|xls|ppt)$/i.test(file.version.extension))
        throw new WorkerFailure('FORMAT_UNSUPPORTED');
      if (/^(docm|dotm|xlsm|xltm|pptm|potm|ppsm)$/i.test(file.version.extension))
        throw new WorkerFailure('MACRO_FORMAT');
      if (
        /^(?:png|jpe?g|gif|webp|bmp|tiff?|svg|heic|heif|avif|ico|mp3|wav|m4a|aac|flac|ogg|opus|wma|mp4|mov|avi|mkv|webm|mpe?g|m4v|3gp)$/i.test(
          file.version.extension,
        )
      )
        throw new WorkerFailure('FORMAT_UNSUPPORTED');
      if (this.capabilities.nativeExecution.status !== 'available')
        throw new WorkerFailure('SANDBOX_UNAVAILABLE');
      if (payload.parserVersion !== FILE_PARSER_VERSION)
        throw new WorkerFailure('FORMAT_UNSUPPORTED');
      const specRow = this.files.store.db
        .prepare(
          `SELECT spec_json FROM document_specs WHERE profile_id=? AND file_version_id=?
         UNION ALL
         SELECT d.spec_json FROM tool_calls c JOIN document_specs d ON d.file_version_id=json_extract(c.args_json,'$.versionId') AND d.profile_id=c.profile_id
         WHERE c.profile_id=? AND c.tool_name='office.convert' AND c.status='succeeded' AND json_extract(c.result_ref,'$.versionId')=?
         LIMIT 1`,
        )
        .get(this.files.store.profileId, versionId, this.files.store.profileId, versionId) as
        { spec_json: string } | undefined;
      const slideRecord =
        specRow && JSON.parse(specRow.spec_json).kind === 'tapkit.slides'
          ? SlideRecordSchema.parse(JSON.parse(specRow.spec_json))
          : undefined;
      const documentSpec =
        specRow && !slideRecord
          ? DocumentSpecSchema.parse(JSON.parse(specRow.spec_json))
          : undefined;
      const inspectDocumentImages =
        documentSpec?.sections.some((section) =>
          section.blocks.some((block) => block.type === 'image'),
        ) ?? false;
      const input = IngestInputSchema.parse({
        schemaVersion: 1,
        fileVersionId: versionId,
        relativePath: file.version.name,
        sha256: file.version.sha256,
        parserVersion: payload.parserVersion,
        ...(inspectDocumentImages ? { inspectDocumentImages: true } : {}),
        ...(file.version.extension === 'pptx' && slideRecord ? { inspectSlideCharts: true } : {}),
      });
      const bytes = await this.files.blobs.readVersion(versionId);
      signal.throwIfAborted();
      const base = resolve(this.files.store.dataDir, 'tmp/ingest');
      await mkdir(base, { recursive: true });
      if ((await realpath(base)).toLowerCase() !== base.toLowerCase())
        throw new WorkerFailure('SANDBOX_UNAVAILABLE');
      directory = join(base, newId());
      await mkdir(directory);
      await this.staging.mark(directory, job, versionId);
      const inputRoot = join(directory, 'input'),
        workspace = join(directory, 'workspace');
      await mkdir(inputRoot);
      await mkdir(workspace);
      await writeFile(join(inputRoot, 'original'), bytes, { flag: 'wx' });
      await writeFile(join(inputRoot, 'input.json'), JSON.stringify(input), { flag: 'wx' });
      const adapter = resolve(this.root, 'packages/retrieval/dist/parse.cjs');
      if (
        (await lstat(adapter)).isSymbolicLink() ||
        (await realpath(adapter)).toLowerCase() !== adapter.toLowerCase()
      )
        throw new WorkerFailure('SANDBOX_UNAVAILABLE');
      await copyFile(adapter, join(inputRoot, 'parse.cjs'));
      if (/\.pdf$/i.test(input.relativePath)) {
        try {
          await this.stagePdfAssets(inputRoot);
        } catch (error) {
          if (error instanceof WorkerFailure) throw error;
          throw new WorkerFailure('SANDBOX_UNAVAILABLE');
        }
      }
      const runtime = await runtimePaths(this.root, 'node');
      const request = HelperRequestSchema.parse({
        protocolVersion: 1,
        requestId: newId(),
        runId: job.id,
        leaseEpoch: job.lease_epoch,
        operation: 'diagnostic.execute',
        payload: {
          ...runtime,
          inputRoot,
          workspace,
          args: [
            '--preserve-symlinks',
            '--preserve-symlinks-main',
            join(inputRoot, 'parse.cjs'),
            inputRoot,
            workspace,
          ],
          timeoutMs: FILE_LIMITS.parseTimeoutMs,
          terminal: false,
          processLimit: 2,
          outputBytes: 65536,
        },
      });
      const result = await this.executor.execute(request, { signal });
      signal.throwIfAborted();
      const started = result.events[0],
        jobLimits = started?.data.job as Record<string, unknown> | undefined;
      if (
        started?.event !== 'started' ||
        started.data.appContainer !== true ||
        started.data.networkCapabilities !== 0 ||
        typeof started.data.appContainerSid !== 'string' ||
        started.data.identitySid !== started.data.appContainerSid ||
        jobLimits?.killOnClose !== true ||
        jobLimits.breakaway !== false
      )
        throw new WorkerFailure('SANDBOX_UNAVAILABLE');
      const finished = result.events.at(-1);
      if (finished?.data.status === 'timed_out') throw new WorkerFailure('PARSE_TIMEOUT');
      if (
        result.exitCode !== 0 ||
        finished?.event !== 'finished' ||
        finished.data.exitCode !== 0 ||
        finished.data.status !== 'exited' ||
        finished.data.activeProcesses !== 0
      ) {
        // A loader/process failure without a parser report is an execution failure,
        // not evidence that the immutable original is corrupt.
        let reason: FileParseReason = 'SANDBOX_UNAVAILABLE';
        if (typeof finished?.data.stdout === 'string')
          for (const line of finished.data.stdout.split(/\r?\n/).slice(-20)) {
            try {
              const value = JSON.parse(line);
              if (value.stage === 'parser_failed') {
                const parsed = FileParseReasonSchema.safeParse(value.reason);
                if (parsed.success) reason = parsed.data;
              }
            } catch {
              /* no raw worker diagnostics in public state */
            }
          }
        throw new WorkerFailure(reason);
      }
      // Bounded regular-file output only. Renderer never receives the workspace path.
      const path = join(workspace, 'parsed.json'),
        meta = await lstat(path);
      if (
        !meta.isFile() ||
        meta.isSymbolicLink() ||
        meta.size > FILE_LIMITS.maxFileBytes ||
        (await realpath(path)).toLowerCase() !== resolve(path).toLowerCase()
      )
        throw new WorkerFailure('OUTPUT_LIMIT');
      const handle = await open(path, 'r');
      let json: Buffer;
      try {
        const pinned = await handle.stat();
        if (pinned.size > FILE_LIMITS.maxFileBytes) throw new WorkerFailure('OUTPUT_LIMIT');
        json = Buffer.alloc(pinned.size);
        let offset = 0;
        while (offset < json.length) {
          const r = await handle.read(json, offset, json.length - offset, offset);
          if (!r.bytesRead) throw new WorkerFailure('CORRUPT_FILE');
          offset += r.bytesRead;
        }
        if ((await handle.stat()).size !== json.length) throw new WorkerFailure('CORRUPT_FILE');
      } finally {
        await handle.close();
      }
      const output = OutputSchema.parse(JSON.parse(json.toString('utf8')));
      if (output.fileVersionId !== versionId || output.sourceSha256 !== input.sha256)
        throw new WorkerFailure('SOURCE_CHANGED');
      if (!(await readFile(join(inputRoot, 'original'))).equals(bytes))
        throw new WorkerFailure('SOURCE_CHANGED');
      return await this.files.completeParse(job, versionId, output.document, signal);
    } catch (error) {
      if (!signal.aborted) {
        const reason =
          error instanceof WorkerFailure
            ? error.reason
            : error instanceof SandboxError
              ? 'SANDBOX_UNAVAILABLE'
              : 'CORRUPT_FILE';
        this.files.failParse(job, versionId, errorCode(reason), reason);
      }
      throw error;
    } finally {
      if (directory) {
        const base = resolve(this.files.store.dataDir, 'tmp/ingest'),
          path = resolve(directory),
          r = relative(base, path);
        // Verify the exact generated child before recursively cleaning its staging workspace.
        try {
          if (
            r &&
            !isAbsolute(r) &&
            !r.startsWith('..') &&
            (await realpath(path)).toLowerCase() === path.toLowerCase()
          )
            await rm(path, { recursive: true, force: true });
        } catch {
          console.warn('FILE_PARSE_STAGING_CLEANUP_PENDING');
        }
      }
    }
  }
  private async stagePdfAssets(inputRoot: string) {
    const source = resolve(this.root, 'packages/retrieval/dist/pdf'),
      manifest = join(source, 'assets.json');
    const meta = await lstat(manifest);
    if (
      !meta.isFile() ||
      meta.isSymbolicLink() ||
      meta.size > 1_000_000 ||
      (await realpath(manifest)).toLowerCase() !== manifest.toLowerCase()
    )
      throw new WorkerFailure('SANDBOX_UNAVAILABLE');
    const assets = PdfAssetsSchema.parse(JSON.parse(await readFile(manifest, 'utf8')));
    const paths = new Set(assets.files.map((f) => f.path));
    if (
      paths.size !== assets.files.length ||
      !paths.has('pdf.mjs') ||
      !paths.has('pdf.worker.mjs') ||
      assets.files.reduce((n, f) => n + f.sizeBytes, 0) > FILE_LIMITS.maxFileBytes
    )
      throw new WorkerFailure('SANDBOX_UNAVAILABLE');
    const target = join(inputRoot, 'pdf');
    await mkdir(target);
    await mkdir(join(target, 'cmaps'));
    await mkdir(join(target, 'standard_fonts'));
    for (const file of assets.files) {
      const path = resolve(source, file.path),
        info = await lstat(path);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.size !== file.sizeBytes ||
        (await realpath(path)).toLowerCase() !== path.toLowerCase()
      )
        throw new WorkerFailure('SANDBOX_UNAVAILABLE');
      const bytes = await readFile(path);
      if (
        bytes.length !== file.sizeBytes ||
        createHash('sha256').update(bytes).digest('hex') !== file.sha256
      )
        throw new WorkerFailure('SOURCE_CHANGED');
      await writeFile(join(target, file.path), bytes, { flag: 'wx' });
    }
  }
}
