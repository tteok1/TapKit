import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { HelperRequestSchema, OfficeRenderSchema, type HelperRequest } from '@tapkit/contracts';
import { prepareOfficeProfile, runtimePaths, SandboxError } from './index';
import { NativeSandboxExecutor } from './native-executor';

export type OfficeExecutor = {
  execute(
    request: HelperRequest,
    options?: { signal?: AbortSignal },
  ): Promise<{
    events: Array<{
      event: string;
      data: Record<string, unknown>;
    }>;
    exitCode: number | null;
  }>;
};
export type OfficeInput = {
  fileVersionId: string;
  inputRoot: string;
  filename: string;
  sha256: string;
  workspace: string;
  requestId: string;
  runId: string;
  leaseEpoch: number;
};
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Core resolves version IDs to immutable, private staged inputs. No path/argv from the model. */
export class OfficeWorker {
  private readonly executor: OfficeExecutor;

  constructor(
    private readonly root: string,
    executor?: OfficeExecutor,
  ) {
    this.executor = executor ?? new NativeSandboxExecutor(root);
  }

  async render(raw: unknown, input: OfficeInput, options: { signal?: AbortSignal } = {}) {
    const request = OfficeRenderSchema.parse(raw);
    if (
      request.fileVersionId !== input.fileVersionId ||
      !/^[0-9a-f]{64}$/.test(input.sha256) ||
      !/^[^/\\:<>"|?*\x00-\x1f~]+\.(docx|xlsx|pptx)$/i.test(input.filename) ||
      /[. ]$/.test(input.filename) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(input.filename) ||
      !isAbsolute(input.inputRoot) ||
      !isAbsolute(input.workspace)
    )
      throw new SandboxError('OFFICE_INPUT_INVALID');
    const source = join(input.inputRoot, input.filename);
    // These checks protect preparation mistakes; native handle pinning remains mandatory at launch.
    for (const path of [input.inputRoot, input.workspace, source]) {
      const info = await lstat(path);
      if (
        info.isSymbolicLink() ||
        (await realpath(path)).toLowerCase() !== resolve(path).toLowerCase()
      )
        throw new SandboxError('OFFICE_INPUT_REPARSE');
    }
    for (const [a, b] of [
      [input.inputRoot, input.workspace],
      [input.workspace, input.inputRoot],
    ]) {
      const rel = relative(a!, b!);
      if (
        !rel ||
        (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../'))
      )
        throw new SandboxError('OFFICE_SCOPE_OVERLAP');
    }
    const info = await lstat(source);
    if (!info.isFile() || info.size > 100 * 1024 * 1024)
      throw new SandboxError('OFFICE_INPUT_LIMIT');
    if (sha(await readFile(source)) !== input.sha256)
      throw new SandboxError('OFFICE_VERSION_CHANGED');
    const work = join(input.workspace, 'office-' + input.runId);
    // No reuse: a previous PDF or profile must never masquerade as this conversion's result.
    await mkdir(work);
    await prepareOfficeProfile(work);
    const runtime = await runtimePaths(this.root, 'libreoffice');
    const command = HelperRequestSchema.parse({
      protocolVersion: 1,
      operation: 'office.render',
      requestId: input.requestId,
      runId: input.runId,
      leaseEpoch: input.leaseEpoch,
      payload: {
        ...runtime,
        executable: join(runtime.runtimeRoot, 'program/python.exe'),
        inputRoot: input.inputRoot,
        workspace: work,
        args: [],
        timeoutMs: 120_000,
        terminal: false,
        office: { filename: input.filename },
      },
    });
    const result = await this.executor.execute(command, options);
    const started = result.events[0];
    const finished = result.events.at(-1);
    if (
      !started ||
      started.event !== 'started' ||
      started.data.appContainer !== true ||
      started.data.networkCapabilities !== 0 ||
      !finished ||
      finished.event !== 'finished' ||
      finished.data.status !== 'exited' ||
      finished.data.exitCode !== 0 ||
      finished.data.activeProcesses !== 0 ||
      result.exitCode !== 0
    )
      throw new SandboxError('OFFICE_EXECUTION_FAILED');
    if (sha(await readFile(source)) !== input.sha256)
      throw new SandboxError('OFFICE_SOURCE_MODIFIED');
    const pdfPath = join(work, input.filename.slice(0, -extname(input.filename).length) + '.pdf');
    const pdfInfo = await lstat(pdfPath);
    if (!pdfInfo.isFile() || pdfInfo.isSymbolicLink() || pdfInfo.size > 100 * 1024 * 1024)
      throw new SandboxError('OFFICE_OUTPUT_INVALID');
    const pdf = await readFile(pdfPath);
    if (pdf.length < 8 || pdf.subarray(0, 5).toString() !== '%PDF-')
      throw new SandboxError('OFFICE_OUTPUT_INVALID');
    return {
      fileVersionId: input.fileVersionId,
      format: 'pdf' as const,
      path: pdfPath,
      sha256: sha(pdf),
    };
  }
}
