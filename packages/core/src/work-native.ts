import { mkdir, writeFile, lstat, realpath, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  HelperRequestSchema,
  type ExecutionCapabilities,
  type WorkToolArgs,
  type ResourceRef,
  NativeWorkIdentitySchema,
  type DocumentSpec,
  type SlideDeckSpec,
} from '@tapkit/contracts';
import {
  validateDocumentContent,
  validateDocumentPdfLayout,
  validateSlidePdf,
} from '@tapkit/workflows';
import { newId, StorageError, type WorkRun } from '@tapkit/storage';
import {
  NativeSandboxExecutor,
  OfficeWorker,
  runtimePaths,
  readExecutionCapabilities,
  type OfficeExecutor,
} from '@tapkit/tools';
import { PreviewStaging } from './preview-staging';
import { WorkArtifacts } from './work-artifacts';
import { FileParser } from './file-parser';
import { executeData } from './work-data';

// Fixed program; the model cannot supply Python, argv, paths or network destinations.
const analyzeCsv = String.raw`import csv,json,math,os,statistics,sys
source=sys.argv[1]
destination=sys.argv[2]
with open(source,encoding='utf-8-sig',newline='') as f:
 reader=csv.reader(f); headers=next(reader); columns=[[] for _ in headers]; rows=0
 if len(headers)>200: raise ValueError('COLUMN_LIMIT')
 for row in reader:
  rows+=1
  if rows>200000 or rows*max(1,len(headers))>2000000: raise ValueError('ROW_LIMIT')
  if len(row)!=len(headers): raise ValueError('RAGGED_CSV')
  for i,value in enumerate(row):
   try:
    number=float(value)
    if math.isfinite(number): columns[i].append(number)
   except ValueError: pass
 result={'schemaVersion':1,'rows':rows,'columns':[{'name':name,'numericCount':len(values),'min':min(values) if values else None,'max':max(values) if values else None,'mean':statistics.fmean(values) if values else None} for name,values in zip(headers,columns)]}
 with open(destination,'x',encoding='utf-8') as output: json.dump(result,output,ensure_ascii=False,allow_nan=False)
`;
export class WorkNativeTools {
  readonly staging: PreviewStaging;
  constructor(
    readonly root: string,
    readonly artifacts: WorkArtifacts,
    readonly capabilities: ExecutionCapabilities,
    readonly executor?: OfficeExecutor,
  ) {
    this.staging = new PreviewStaging(artifacts.files.store, 'work');
  }
  async renderSlidesCandidate(
    run: WorkRun,
    bytes: Buffer,
    spec: SlideDeckSpec,
    guard: () => void,
    signal: AbortSignal,
    identity?: Parameters<WorkNativeTools['execute']>[5],
  ) {
    const caps = this.executor ? this.capabilities : await readExecutionCapabilities(this.root);
    if (caps.nativeExecution.status !== 'available' || caps.officeRender.status !== 'available')
      throw new StorageError('SANDBOX_UNAVAILABLE');
    signal = AbortSignal.any([signal, AbortSignal.timeout(240000)]);
    const versionId = newId(),
      directory = await this.staging.create(versionId),
      inputRoot = join(directory, 'input'),
      workspace = join(directory, 'workspace');
    await mkdir(inputRoot);
    await mkdir(workspace);
    await writeFile(join(inputRoot, 'source.pptx'), bytes, { flag: 'wx' });
    let settled = true,
      helperInstanceId = newId(),
      nativeRunId = newId();
    const report = (state: string) =>
      identity?.({
        schemaVersion: 1,
        helperInstanceId,
        nativeRunId,
        directoryId: directory.split(/[\\/]/).at(-1)!,
        leaseEpoch: run.lease_epoch,
        fileVersionId: versionId,
        state,
        pid: null,
        appContainerSid: null,
      });
    const base = this.executor ?? new NativeSandboxExecutor(this.root);
    const executor: OfficeExecutor = {
      execute: async (request, options) => {
        helperInstanceId = request.requestId;
        nativeRunId = request.runId;
        report('running');
        const result = await base.execute(request, options);
        if (result.events.at(-1)?.event === 'finished') {
          settled = true;
          report('running');
        }
        return result;
      },
    };
    try {
      guard();
      signal.throwIfAborted();
      report('prepared');
      settled = false;
      const output = await new OfficeWorker(this.root, executor).render(
        { fileVersionId: versionId, format: 'pdf' },
        {
          fileVersionId: versionId,
          inputRoot,
          workspace,
          filename: 'source.pptx',
          sha256: createHash('sha256').update(bytes).digest('hex'),
          requestId: helperInstanceId,
          runId: nativeRunId,
          leaseEpoch: run.lease_epoch,
        },
        { signal },
      );
      settled = true;
      const pdf = await this.readOutput(output.path, 100 * 1024 * 1024);
      const images = spec.slides.filter((s) => s.imageVersionId).length;
      const parsed = await new FileParser(
        this.root,
        this.artifacts.files,
        caps,
        executor,
      ).inspectWorkPdf(directory, versionId, pdf, images > 0, guard, signal, {
        started: () => {
          settled = false;
          report('running');
        },
        settled: () => {
          settled = true;
          report('running');
        },
      });
      if (!validateSlidePdf(spec, parsed) || (images > 0 && (parsed.paintedImages ?? 0) < images))
        throw new StorageError('PARSE_FAILED');
      guard();
      signal.throwIfAborted();
      report('finished');
      return { pdf, pages: parsed.pages.length, parsed };
    } catch (error) {
      if (!settled) {
        report('unknown');
        throw new StorageError('SIDE_EFFECT_UNKNOWN');
      }
      throw error instanceof StorageError
        ? error
        : new StorageError(signal.aborted ? 'CANCELLED' : 'PARSE_FAILED');
    } finally {
      if (settled) await this.staging.release(directory);
    }
  }
  async execute(
    run: WorkRun,
    args: Extract<WorkToolArgs, { tool: 'python.analyze' | 'office.convert' | 'data.analyze' }>,
    guard: () => void,
    committed: (ref: ResourceRef) => void,
    signal: AbortSignal,
    identity?: (value: {
      schemaVersion: 1;
      helperInstanceId: string;
      nativeRunId: string;
      directoryId: string;
      leaseEpoch: number;
      fileVersionId: string;
      state: string;
      pid: number | null;
      appContainerSid: string | null;
    }) => void,
    repair?: { spec: DocumentSpec; candidate(attempt: 1 | 2): Promise<Buffer> },
  ): Promise<ResourceRef> {
    const capabilities = this.executor
      ? this.capabilities
      : await readExecutionCapabilities(this.root);
    if (
      capabilities.nativeExecution.status !== 'available' ||
      ((args.tool === 'office.convert' || args.tool === 'data.analyze') &&
        capabilities.officeRender.status !== 'available')
    )
      throw new StorageError('SANDBOX_UNAVAILABLE');
    if (args.tool === 'data.analyze')
      return executeData(
        this.root,
        this.artifacts,
        this.staging,
        run,
        args,
        guard,
        committed,
        signal,
        capabilities,
        identity,
        this.executor,
      );
    guard();
    const file = this.artifacts.files.get(args.fileId, { versionId: args.versionId }),
      original = await this.artifacts.files.original(args.fileId, { versionId: args.versionId });
    guard();
    if (args.tool === 'python.analyze' && file.version.extension !== 'csv')
      throw new StorageError('FORMAT_UNSUPPORTED');
    if (
      args.tool === 'office.convert' &&
      !['docx', 'xlsx', 'pptx'].includes(file.version.extension)
    )
      throw new StorageError('FORMAT_UNSUPPORTED');
    const directory = await this.staging.create(args.versionId),
      firstInputRoot = join(directory, 'input'),
      workspace = join(directory, 'workspace');
    await mkdir(firstInputRoot);
    await mkdir(workspace);
    const filename = 'source.' + file.version.extension;
    await writeFile(join(firstInputRoot, filename), original.bytes, { flag: 'wx' });
    let settled = false;
    let nativeRunId = newId(),
      helperInstanceId = newId();
    let processId: number | null = null,
      processSid: string | null = null;
    const report = (
      state: string,
      pid: number | null = null,
      appContainerSid: string | null = null,
    ) => {
      processId = pid ?? processId;
      processSid = appContainerSid ?? processSid;
      identity?.({
        schemaVersion: 1,
        helperInstanceId,
        nativeRunId,
        directoryId: directory.split(/[\\/]/).at(-1)!,
        leaseEpoch: run.lease_epoch,
        fileVersionId: args.versionId,
        state,
        pid: processId,
        appContainerSid: processSid,
      });
    };
    report('prepared');
    try {
      const base =
        this.executor ??
        new NativeSandboxExecutor(this.root, (_request, event) =>
          report(
            'running',
            typeof event.data.pid === 'number' ? event.data.pid : null,
            typeof event.data.appContainerSid === 'string' ? event.data.appContainerSid : null,
          ),
        );
      const executor: OfficeExecutor = {
        execute: async (request, options) => {
          const result = await base.execute(request, options);
          const last = result.events.at(-1);
          if (last?.event === 'finished' && last.data.activeProcesses === 0) {
            settled = true;
            report(repair ? 'running' : 'finished');
          }
          return result;
        },
      };
      let bytes: Buffer, name: string, mime: string;
      if (args.tool === 'office.convert') {
        let sourceBytes = original.bytes;
        let inputRoot = firstInputRoot;
        const images =
          repair?.spec.sections.flatMap((section) =>
            section.blocks.filter((block) => block.type === 'image'),
          ).length ?? 0;
        for (let attempt = 0; ; attempt++) {
          guard();
          signal.throwIfAborted();
          settled = false;
          const result = await new OfficeWorker(this.root, executor).render(
            { fileVersionId: args.versionId, format: 'pdf' },
            {
              fileVersionId: args.versionId,
              inputRoot,
              workspace,
              filename,
              sha256: createHash('sha256').update(sourceBytes).digest('hex'),
              requestId: helperInstanceId,
              runId: nativeRunId,
              leaseEpoch: run.lease_epoch,
            },
            { signal },
          );
          settled = true;
          bytes = await this.readOutput(result.path, 100 * 1024 * 1024);
          if (!repair) break;
          const parsed = await new FileParser(
            this.root,
            this.artifacts.files,
            capabilities,
            this.executor,
          ).inspectWorkPdf(directory, args.versionId, bytes, images > 0, guard, signal, {
            started: () => {
              settled = false;
              report('running');
            },
            settled: () => {
              settled = true;
              report('running');
            },
          });
          if (
            (images > 0 && (parsed.paintedImages ?? 0) < images) ||
            !validateDocumentContent(repair.spec, parsed, 'pdf', images > 0)
          )
            throw new StorageError('PARSE_FAILED');
          if (validateDocumentPdfLayout(parsed)) {
            guard();
            signal.throwIfAborted();
            report('finished');
            break;
          }
          if (attempt >= 2) throw new StorageError('PARSE_FAILED');
          sourceBytes = await repair.candidate((attempt + 1) as 1 | 2);
          guard();
          inputRoot = join(directory, 'input-' + (attempt + 1));
          await mkdir(inputRoot);
          await writeFile(join(inputRoot, filename), sourceBytes, { flag: 'wx' });
          nativeRunId = newId();
          helperInstanceId = newId();
          processId = null;
          processSid = null;
          report('prepared');
        }
        name = '转换成果.pdf';
        mime = 'application/pdf';
      } else {
        const inputRoot = firstInputRoot;
        await writeFile(join(inputRoot, 'analyze.py'), analyzeCsv, { flag: 'wx' });
        const runtime = await runtimePaths(this.root, 'python');
        const result = await executor.execute(
          HelperRequestSchema.parse({
            protocolVersion: 1,
            requestId: helperInstanceId,
            runId: nativeRunId,
            leaseEpoch: run.lease_epoch,
            operation: 'diagnostic.execute',
            payload: {
              ...runtime,
              inputRoot,
              workspace,
              args: [
                '-I',
                join(inputRoot, 'analyze.py'),
                join(inputRoot, filename),
                join(workspace, 'result.json'),
              ],
              timeoutMs: 120000,
              memoryBytes: 256 * 1024 * 1024,
              processLimit: 2,
              outputBytes: 65536,
              terminal: false,
            },
          }),
          { signal },
        );
        settled = true;
        const done = result.events.at(-1);
        if (
          result.exitCode !== 0 ||
          done?.event !== 'finished' ||
          done.data.exitCode !== 0 ||
          done.data.status !== 'exited' ||
          done.data.activeProcesses !== 0
        )
          throw new StorageError('PARSE_FAILED');
        bytes = await this.readOutput(join(workspace, 'result.json'), 64000);
        const value = JSON.parse(bytes.toString('utf8'));
        if (
          value.schemaVersion !== 1 ||
          !Number.isSafeInteger(value.rows) ||
          !Array.isArray(value.columns)
        )
          throw new StorageError('PARSE_FAILED');
        name = '分析成果.json';
        mime = 'application/json';
      }
      guard();
      signal.throwIfAborted();
      return await this.artifacts.publishBytes(run, name, bytes, mime, guard, committed);
    } catch (error) {
      if (!settled) {
        report('unknown');
        throw new StorageError('SIDE_EFFECT_UNKNOWN');
      }
      throw error instanceof StorageError
        ? error
        : new StorageError(signal.aborted ? 'CANCELLED' : 'PARSE_FAILED');
    } finally {
      if (settled)
        await this.staging.release(
          directory,
        ); /* Unknown helper cleanup is retained for reconciliation. */
    }
  }
  private async readOutput(path: string, maxBytes: number) {
    const meta = await lstat(path);
    if (
      !meta.isFile() ||
      meta.isSymbolicLink() ||
      meta.size > maxBytes ||
      (await realpath(path)).toLowerCase() !== resolve(path).toLowerCase()
    )
      throw new StorageError('PERMISSION_DENIED');
    const handle = await open(path, 'r');
    try {
      const pinned = await handle.stat();
      if (pinned.ino !== meta.ino || pinned.dev !== meta.dev || pinned.size !== meta.size)
        throw new StorageError('CONFLICT');
      const bytes = await handle.readFile();
      if (bytes.length !== meta.size) throw new StorageError('CONFLICT');
      return bytes;
    } finally {
      await handle.close();
    }
  }
  async recoverOutput(
    run: WorkRun,
    args: Extract<WorkToolArgs, { tool: 'python.analyze' | 'office.convert' | 'data.analyze' }>,
    raw: unknown,
    guard: () => void,
    committed: (ref: ResourceRef) => void,
  ) {
    if (args.tool === 'data.analyze') throw new StorageError('SIDE_EFFECT_UNKNOWN');
    const identity = NativeWorkIdentitySchema.parse(raw);
    if (identity.state !== 'finished' || identity.fileVersionId !== args.versionId)
      throw new StorageError('SIDE_EFFECT_UNKNOWN');
    const directory = join(this.staging.base, identity.directoryId),
      marker = JSON.parse(
        (await this.readOutput(join(directory, '.tapkit-preview.json'), 4096)).toString('utf8'),
      );
    if (
      marker.profileId !== this.artifacts.files.store.profileId ||
      marker.directoryId !== identity.directoryId ||
      marker.fileVersionId !== args.versionId
    )
      throw new StorageError('PERMISSION_DENIED');
    const path =
      args.tool === 'python.analyze'
        ? join(directory, 'workspace/result.json')
        : join(
            directory,
            'workspace',
            'office-' + identity.nativeRunId,
            'source.' +
              this.artifacts.files
                .get(args.fileId, { versionId: args.versionId })
                .version.extension.replace(/(docx|xlsx|pptx)$/, 'pdf'),
          );
    guard();
    const bytes = await this.readOutput(
      path,
      args.tool === 'python.analyze' ? 64000 : 100 * 1024 * 1024,
    );
    guard();
    const ref = await this.artifacts.publishBytes(
      run,
      args.tool === 'python.analyze' ? '分析成果.json' : '转换成果.pdf',
      bytes,
      args.tool === 'python.analyze' ? 'application/json' : 'application/pdf',
      guard,
      committed,
    );
    await this.staging.release(directory);
    return ref;
  }
}
