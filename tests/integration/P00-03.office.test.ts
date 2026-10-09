import { test, expect } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { HelperRequestSchema } from '../../packages/contracts/src';
import {
  helperPath,
  prepareOfficeProfile,
  runtimePaths,
  runDiagnostic,
} from '../../packages/tools/src/execution';
import {
  OfficeWorker,
  type OfficeExecutor,
  type OfficeInput,
} from '../../packages/tools/src/execution/office-worker';
import { NativeSandboxExecutor } from '../../packages/tools/src/execution/native-executor';
import { officeFixtures } from '../../scripts/fixtures-office.mjs';
import {
  officeSecurityFixtures,
  securityMarkers,
} from '../../scripts/fixtures-office-security.mjs';
import { officeControl, pdfText, recordOfficePdf } from './office-security-control';
import { startNativeHelper } from './native-helper';

const root = resolve('.');
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const output = (value: unknown, testRoot: string) =>
  typeof value === 'string'
    ? value.replaceAll(testRoot, '<test-data>').replaceAll(root, '<repo>').slice(0, 3000)
    : undefined;
function id() {
  const value = randomUUID();
  return value.slice(0, 14) + '7' + value.slice(15);
}

test('P00-03 T07 OfficeWorker converts DOCX, XLSX and PPTX in the current AppContainer route', async () => {
  const base = await mkdtemp(join(root, '.test-data/P00-03 OfficeWorker 中文 '));
  const inputRoot = join(base, 'input');
  const workspace = join(base, 'workspace');
  await Promise.all([mkdir(inputRoot), mkdir(workspace)]);
  await officeFixtures(inputRoot);
  const nativeExecutor = new NativeSandboxExecutor(root);
  const diagnosticExecutor: OfficeExecutor = {
    async execute(request, options) {
      let result: Awaited<ReturnType<NativeSandboxExecutor['execute']>>;
      try {
        result = await nativeExecutor.execute(request, options);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'non-Error rejection';
        console.error('[P00-03 Office helper rejected]', message);
        throw error;
      }
      await appendFile(
        join(root, 'docs/evidence/P00-03/native-cases.jsonl'),
        JSON.stringify({
          case: 'office-render',
          requestId: request.requestId,
          runId: request.runId,
          events: result.events,
        }) + '\n',
      );
      const started = result.events[0];
      const finished = result.events.at(-1);
      const failedChecks: string[] = [];
      if (!started || started.event !== 'started') failedChecks.push('started event');
      if (started?.data.appContainer !== true) failedChecks.push('AppContainer');
      if (started?.data.networkCapabilities !== 0) failedChecks.push('network capabilities');
      if (!finished || finished.event !== 'finished') failedChecks.push('finished event');
      if (finished?.data.status !== 'exited') failedChecks.push('execution status');
      if (finished?.data.exitCode !== 0) failedChecks.push('payload exit code');
      if (finished?.data.activeProcesses !== 0) failedChecks.push('active process cleanup');
      if (result.exitCode !== 0) failedChecks.push('helper exit code');
      if (failedChecks.length) {
        console.error(
          '[P00-03 Office helper diagnostic]',
          JSON.stringify({
            failedChecks,
            helperExitCode: result.exitCode,
            status: finished?.data.status,
            payloadExitCode: finished?.data.exitCode,
            activeProcesses: finished?.data.activeProcesses,
            peakActiveProcesses: finished?.data.peakActiveProcesses,
            totalProcesses: finished?.data.totalProcesses,
            outputBytes: finished?.data.outputBytes,
            stdout: output(finished?.data.stdout, base),
            stderr: output(finished?.data.stderr, base),
          }),
        );
      }
      return result;
    },
  };
  const worker = new OfficeWorker(root, diagnosticExecutor);

  for (const extension of ['docx', 'xlsx', 'pptx'] as const) {
    const filename = 'sample.' + extension;
    const sourcePath = join(inputRoot, filename);
    const sourceHash = sha(await readFile(sourcePath));
    const input: OfficeInput = {
      fileVersionId: id(),
      requestId: id(),
      runId: id(),
      leaseEpoch: 1,
      inputRoot,
      workspace,
      filename,
      sha256: sourceHash,
    };
    const output = await worker.render(
      { fileVersionId: input.fileVersionId, format: 'pdf' },
      input,
    );
    const pdf = await readFile(output.path);
    await recordOfficePdf(root, 'sample-' + extension, pdf);
    expect(output.format).toBe('pdf');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
    expect(await pdfText(root, pdf)).toContain('TapKit 隔离转换验收');
    expect(output.sha256).toBe(sha(pdf));
    expect(sha(await readFile(sourcePath))).toBe(sourceHash);
  }
}, 450_000);

test('P00-03 T08 T19 OfficeWorker blocks an executable embedded macro with an isolated positive control', async () => {
  const base = await mkdtemp(join(root, '.test-data/P00-03 Office security policy 中文 '));
  const inputRoot = join(base, 'input');
  const workspace = join(base, 'workspace');
  await Promise.all([mkdir(inputRoot), mkdir(workspace)]);
  await officeFixtures(inputRoot);
  await officeSecurityFixtures(inputRoot);

  const nativeExecutor = new NativeSandboxExecutor(root);
  let dispatchCount = 0;
  const checkedExecutor: OfficeExecutor = {
    async execute(request, options) {
      dispatchCount += 1;
      const profile = await readFile(
        join(String(request.payload.workspace), 'office-profile/user/registrymodifications.xcu'),
        'utf8',
      );
      expect(profile).toContain(
        '<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item>',
      );
      expect(profile).toContain(
        '<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>1</value></prop></item>',
      );
      expect(profile).toContain(
        '<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>',
      );
      const lokWorker = await readFile(
        join(root, 'native/windows-helper/src/lok_worker.py'),
        'utf8',
      );
      expect(lokWorker).toContain('b"MacroSecurityLevel=3,EnableMacrosExecution=false"');

      const result = await nativeExecutor.execute(request, options);
      await appendFile(
        join(root, 'docs/evidence/P00-03/native-cases.jsonl'),
        JSON.stringify({
          case: 'office-macro-blocked',
          requestId: request.requestId,
          runId: request.runId,
          events: result.events,
        }) + '\n',
      );
      expect(result.events[0]).toMatchObject({
        event: 'started',
        data: { appContainer: true, networkCapabilities: 0 },
      });
      expect(result.events.at(-1)).toMatchObject({
        event: 'finished',
        data: { status: 'exited', exitCode: 0, activeProcesses: 0 },
      });
      return result;
    },
  };

  const filename = 'macro-content.xlsx';
  const sourcePath = join(inputRoot, filename);
  const sourceHash = sha(await readFile(sourcePath));
  const fileVersionId = id();
  const worker = new OfficeWorker(root, checkedExecutor);
  const officeInput: OfficeInput = {
    fileVersionId,
    requestId: id(),
    runId: id(),
    leaseEpoch: 1,
    inputRoot,
    workspace,
    filename,
    sha256: sourceHash,
  };

  const macroFilename = 'macro-enabled.xlsm';
  const macroPath = join(inputRoot, macroFilename);
  await writeFile(macroPath, await readFile(sourcePath));
  await expect(
    worker.render(
      { fileVersionId, format: 'pdf' },
      { ...officeInput, filename: macroFilename, sha256: sha(await readFile(macroPath)) },
    ),
  ).rejects.toThrow('OFFICE_INPUT_INVALID');
  expect(dispatchCount).toBe(0);

  const rendered = await worker.render({ fileVersionId, format: 'pdf' }, officeInput);
  expect(dispatchCount).toBe(1);
  const pdf = await readFile(rendered.path);
  await recordOfficePdf(root, 'macro-blocked', pdf);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(1000);
  const text = await pdfText(root, pdf);
  expect(text).toContain(securityMarkers.macroBlocked);
  expect(text).not.toContain(securityMarkers.macroExecuted);
  await expect(
    readFile(join(workspace, 'office-' + officeInput.runId, 'macro-ran.txt')),
  ).rejects.toMatchObject({ code: 'ENOENT' });
  const controlWorkspace = join(base, 'macro-control');
  await mkdir(controlWorkspace);
  const controlPdf = await officeControl(root, inputRoot, controlWorkspace, filename, 'macro');
  await recordOfficePdf(root, 'macro-control', controlPdf);
  expect(await pdfText(root, controlPdf)).toContain(securityMarkers.macroExecuted);
  expect(await readFile(join(controlWorkspace, 'macro-ran.txt'), 'utf8')).toContain(
    securityMarkers.macroExecuted,
  );
  expect(sha(await readFile(sourcePath))).toBe(sourceHash);
  await appendFile(
    join(root, 'docs/evidence/P00-03/native-cases.jsonl'),
    JSON.stringify({
      case: 'office-macro-behavior',
      sourceSha256: sourceHash,
      blockedPdfSha256: sha(pdf),
      controlPdfSha256: sha(controlPdf),
      blockedMarker: securityMarkers.macroBlocked,
      enabledMarker: securityMarkers.macroExecuted,
      blockedFileAbsent: true,
      enabledFilePresent: true,
      sourceUnchanged: true,
    }) + '\n',
  );
}, 300_000);

test('P00-03 T19 OfficeWorker preserves cached external-link data with an isolated refresh control', async () => {
  const base = await mkdtemp(join(root, '.test-data/P00-03 external-link 中文 '));
  const inputRoot = join(base, 'input');
  const workspace = join(base, 'workspace');
  const controlWorkspace = join(base, 'link-control');
  await Promise.all([mkdir(inputRoot), mkdir(workspace), mkdir(controlWorkspace)]);
  await officeSecurityFixtures(inputRoot);
  const filename = 'external-link.xlsx';
  const sourcePath = join(inputRoot, filename);
  const sourceHash = sha(await readFile(sourcePath));
  const targetPath = join(inputRoot, 'external-source.xlsx');
  const targetHash = sha(await readFile(targetPath));
  const native = new NativeSandboxExecutor(root);
  const worker = new OfficeWorker(root, {
    async execute(request, options) {
      const result = await native.execute(request, options);
      await appendFile(
        join(root, 'docs/evidence/P00-03/native-cases.jsonl'),
        JSON.stringify({
          case: 'office-link-blocked',
          runId: request.runId,
          events: result.events,
        }) + '\n',
      );
      return result;
    },
  });
  const fileVersionId = id();
  const rendered = await worker.render(
    { fileVersionId, format: 'pdf' },
    {
      fileVersionId,
      requestId: id(),
      runId: id(),
      leaseEpoch: 1,
      inputRoot,
      workspace,
      filename,
      sha256: sourceHash,
    },
  );
  const linkedPdf = await readFile(rendered.path);
  await recordOfficePdf(root, 'link-blocked', linkedPdf);
  const text = await pdfText(root, linkedPdf);
  expect(text).toContain(securityMarkers.linkCached);
  expect(text).not.toContain(securityMarkers.linkUpdated);
  const controlPdf = await officeControl(root, inputRoot, controlWorkspace, filename, 'links');
  await recordOfficePdf(root, 'link-control', controlPdf);
  const controlText = await pdfText(root, controlPdf);
  expect(controlText).toContain(securityMarkers.linkUpdated);
  expect(controlText).not.toContain(securityMarkers.linkCached);
  expect(sha(await readFile(sourcePath))).toBe(sourceHash);
  expect(sha(await readFile(targetPath))).toBe(targetHash);
  await appendFile(
    join(root, 'docs/evidence/P00-03/native-cases.jsonl'),
    JSON.stringify({
      case: 'office-link-behavior',
      sourceSha256: sourceHash,
      targetSha256: targetHash,
      blockedPdfSha256: rendered.sha256,
      controlPdfSha256: sha(controlPdf),
      blockedMarker: securityMarkers.linkCached,
      enabledMarker: securityMarkers.linkUpdated,
      sourceUnchanged: true,
      targetUnchanged: true,
    }) + '\n',
  );
}, 300_000);

test('P00-03 T08 OfficeWorker fails closed on a corrupt document and remains usable', async () => {
  const base = await mkdtemp(join(root, '.test-data/P00-03 corrupt Office 中文 '));
  const inputRoot = join(base, 'input');
  const workspace = join(base, 'workspace');
  await Promise.all([mkdir(inputRoot), mkdir(workspace)]);
  await officeFixtures(inputRoot);
  const filename = 'corrupt.docx';
  const corrupt = Buffer.from('PK\x03\x04corrupt OOXML');
  await writeFile(join(inputRoot, filename), corrupt);
  const native = new NativeSandboxExecutor(root);
  const worker = new OfficeWorker(root, {
    async execute(request, options) {
      const result = await native.execute(request, options);
      await appendFile(
        join(root, 'docs/evidence/P00-03/native-cases.jsonl'),
        JSON.stringify({ case: 'office-corrupt', runId: request.runId, events: result.events }) +
          '\n',
      );
      return result;
    },
  });
  const fileVersionId = id();
  const input = {
    fileVersionId,
    requestId: id(),
    runId: id(),
    leaseEpoch: 1,
    inputRoot,
    workspace,
    filename,
    sha256: sha(corrupt),
  };
  await expect(worker.render({ fileVersionId, format: 'pdf' }, input)).rejects.toThrow(
    'OFFICE_EXECUTION_FAILED',
  );
  expect(sha(await readFile(join(inputRoot, filename)))).toBe(sha(corrupt));
  const valid = await readFile(join(inputRoot, 'sample.docx'));
  const rendered = await worker.render(
    { fileVersionId, format: 'pdf' },
    {
      ...input,
      requestId: id(),
      runId: id(),
      filename: 'sample.docx',
      sha256: sha(valid),
    },
  );
  expect(await pdfText(root, await readFile(rendered.path))).toContain('TapKit 隔离转换验收');
}, 300_000);

test('P00-03 Office hard kill recovers only its recorded mapped drives on the next helper run', async () => {
  const base = await mkdtemp(join(root, '.test-data/P00-03 Office crash recovery 中文 '));
  const inputRoot = join(base, 'input');
  const workspace = join(base, 'workspace');
  await Promise.all([mkdir(inputRoot), mkdir(workspace)]);
  await officeFixtures(inputRoot);

  const firstRunId = id();
  const firstWorkspace = join(workspace, 'office-' + firstRunId);
  await mkdir(firstWorkspace);
  await prepareOfficeProfile(firstWorkspace);
  const runtime = await runtimePaths(root, 'libreoffice');
  const first = HelperRequestSchema.parse({
    protocolVersion: 1,
    requestId: id(),
    runId: firstRunId,
    leaseEpoch: 1,
    operation: 'office.render',
    payload: {
      ...runtime,
      executable: join(runtime.runtimeRoot, 'program/python.exe'),
      inputRoot,
      workspace: firstWorkspace,
      args: [],
      timeoutMs: 120_000,
      terminal: false,
      office: { filename: 'sample.docx' },
    },
  });
  const localAppData = process.env.LOCALAPPDATA;
  expect(localAppData).toBeTruthy();
  const journalPath = join(localAppData!, 'TapKit', 'office-device-leases', `${firstRunId}.json`);
  const executionLeasePath = join(
    localAppData!,
    'TapKit',
    'execution-leases',
    `${firstRunId}.json`,
  );

  const raw = startNativeHelper(helperPath(root), first);
  const started = await raw.started;
  expect(started.data.appContainer).toBe(true);
  expect(started.data.networkCapabilities).toBe(0);
  const lease = JSON.parse(await readFile(journalPath, 'utf8')) as {
    runId: string;
    mappings: Array<{ drive: string; target: string }>;
  };
  expect(lease.runId).toBe(firstRunId);
  expect(lease.mappings).toHaveLength(3);
  expect(new Set(lease.mappings.map(({ drive }) => drive.toUpperCase())).size).toBe(3);
  for (const mapping of lease.mappings) {
    expect(await readdir(`${mapping.drive}\\`)).not.toHaveLength(0);
  }

  expect(raw.child.kill()).toBe(true);
  await raw.closed;
  await expect(readFile(journalPath, 'utf8')).resolves.toContain(firstRunId);
  await expect(readFile(executionLeasePath, 'utf8')).resolves.toContain(firstRunId);
  for (const mapping of lease.mappings) {
    expect(await readdir(`${mapping.drive}\\`)).not.toHaveLength(0);
  }

  const recoveryBase = await mkdtemp(
    join(root, '.test-data/P00-03 Office recovery invocation 中文 '),
  );
  const recoveryInput = join(recoveryBase, 'input');
  const recoveryWorkspace = join(recoveryBase, 'workspace');
  await Promise.all([mkdir(recoveryInput), mkdir(recoveryWorkspace)]);
  const nodeRuntime = await runtimePaths(root, 'node');
  const recoveryRequest = HelperRequestSchema.parse({
    protocolVersion: 1,
    requestId: id(),
    runId: id(),
    leaseEpoch: 1,
    operation: 'diagnostic.execute',
    payload: {
      ...nodeRuntime,
      inputRoot: recoveryInput,
      workspace: recoveryWorkspace,
      args: ['-e', 'process.stdout.write("office recovery ran\\n")'],
      timeoutMs: 10_000,
      terminal: false,
    },
  });
  const recovered = await runDiagnostic(helperPath(root), recoveryRequest);
  expect(recovered.exitCode).toBe(0);
  expect(recovered.events[0]?.event).toBe('started');
  expect(recovered.events[0]?.data.appContainer).toBe(true);
  const finished = recovered.events.at(-1);
  expect(finished?.event).toBe('finished');
  if (finished?.event !== 'finished') throw new Error('Office recovery invocation did not finish');
  expect(finished.data.status).toBe('exited');
  expect(finished.data.activeProcesses).toBe(0);
  await expect(readFile(journalPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(readFile(executionLeasePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  for (const mapping of lease.mappings) {
    await expect(readdir(`${mapping.drive}\\`)).rejects.toMatchObject({ code: 'ENOENT' });
  }
}, 60_000);
