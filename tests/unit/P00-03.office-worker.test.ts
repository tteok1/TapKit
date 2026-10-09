import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  OfficeWorker,
  type OfficeInput,
  type OfficeExecutor,
} from '../../packages/tools/src/execution/office-worker';
import { type HelperEvent, type HelperRequest } from '../../packages/contracts/src';
import { readExecutionCapabilities } from '../../packages/tools/src/execution';

async function fixture() {
  const base = await mkdtemp(resolve('.test-data/P00-03 worker '));
  const inputRoot = join(base, 'input'),
    workspace = join(base, 'work');
  await Promise.all([mkdir(inputRoot), mkdir(workspace)]);
  const bytes = Buffer.from('fixture - conversion is deliberately not performed in this unit test');
  await writeFile(join(inputRoot, '中文.docx'), bytes);
  const input: OfficeInput = {
    inputRoot,
    workspace,
    filename: '中文.docx',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    fileVersionId: '00000000-0000-7000-8000-000000000001',
    requestId: '00000000-0000-7000-8000-000000000002',
    runId: '00000000-0000-7000-8000-000000000003',
    leaseEpoch: 1,
  };
  return { input, request: { fileVersionId: input.fileVersionId, format: 'pdf' } };
}

test('P00-03 OfficeWorker rejects extra arguments and changed versions before dispatch', async () => {
  let called = false;
  const executor: OfficeExecutor = {
    execute: async () => {
      called = true;
      throw new Error('unexpected dispatch');
    },
  };
  const worker = new OfficeWorker(resolve('.'), executor);
  const { input, request } = await fixture();
  await expect(worker.render({ ...request, args: ['--accept=socket'] }, input)).rejects.toThrow();
  await writeFile(join(input.inputRoot, input.filename), 'changed source');
  await expect(worker.render(request, input)).rejects.toThrow('OFFICE_VERSION_CHANGED');
  expect(called).toBe(false);
});

test('P00-03 OfficeWorker propagates unavailable isolation without a host conversion fallback', async () => {
  const { input, request } = await fixture();
  const worker = new OfficeWorker(resolve('.'), {
    execute: async (command: HelperRequest) => {
      expect(command.operation).toBe('office.render');
      expect(command.payload.executable).toMatch(/program[\\/]python\.exe$/i);
      expect(command.payload.args).toHaveLength(0);
      expect(command.payload.office).toEqual({ filename: input.filename });
      const profile = await readFile(
        join(command.payload.workspace, 'office-profile/user/registrymodifications.xcu'),
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
      throw new Error('HELPER_START_FAILED');
    },
  });
  await expect(worker.render(request, input)).rejects.toThrow('HELPER_START_FAILED');
});

test('P00-03 OfficeWorker rejects a success response with a surviving process tree', async () => {
  const { input, request } = await fixture();
  const worker = new OfficeWorker(resolve('.'), {
    execute: async () => ({
      events: [
        {
          protocolVersion: 1,
          requestId: input.requestId,
          runId: input.runId,
          leaseEpoch: input.leaseEpoch,
          event: 'started',
          data: { appContainer: true, networkCapabilities: 0 },
        },
        {
          protocolVersion: 1,
          requestId: input.requestId,
          runId: input.runId,
          leaseEpoch: input.leaseEpoch,
          event: 'finished',
          data: { status: 'exited', exitCode: 0, activeProcesses: 1 },
        },
      ] satisfies HelperEvent[],
      exitCode: 0,
    }),
  });
  await expect(worker.render(request, input)).rejects.toThrow('OFFICE_EXECUTION_FAILED');
});

test('P00-03 old execution policies cannot enable the current AppContainer LOK policy', async () => {
  const base = await mkdtemp(resolve('.test-data/P00-03 old report '));
  await mkdir(join(base, 'resources/runtime'), { recursive: true });
  for (const executionPolicy of ['dedicated-account-v1', 'appcontainer-v1']) {
    await writeFile(
      join(base, 'resources/runtime/capabilities.json'),
      JSON.stringify({
        standardUser: true,
        executionPolicy,
        capabilities: Object.fromEntries(
          ['nativeExecution', 'officeRender', 'terminal'].map((key) => [
            key,
            { status: 'available' },
          ]),
        ),
      }),
    );
    expect((await readExecutionCapabilities(base)).officeRender).toMatchObject({
      status: 'failed',
      reason: 'EXECUTION_POLICY_CHANGED',
    });
  }
});
