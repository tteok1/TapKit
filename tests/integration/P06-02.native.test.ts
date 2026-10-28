import { test, expect, vi } from 'vitest';
import { appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture } from './P06.fixture';
import { NativeSandboxExecutor } from '../../packages/tools/src';
import { WorkNativeTools } from '../../packages/core/src/work-native';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import { docxFixture, officeZip } from '../fixtures/P03-office';
import type { ExecutionCapabilities, HelperRequest } from '../../packages/contracts/src';
const available: ExecutionCapabilities = {
  nativeExecution: { status: 'available' },
  officeRender: { status: 'available' },
  terminal: { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason: 'not used' },
};
test.each(['python.analyze', 'office.convert'] as const)(
  'P06-02 T19 real AppContainer %s uses fixed program and immutable input',
  async (tool) => {
    vi.useRealTimers();
    const f = await fixture();
    await mkdir('docs/evidence/P06-02', { recursive: true });
    try {
      const view = await f.create(),
        bytes =
          tool === 'python.analyze'
            ? Buffer.from('项目,金额\nA,10\nB,30\n')
            : await officeZip(docxFixture()),
        name = tool === 'python.analyze' ? '数据.csv' : '参考.docx',
        blob = await f.blobs.put(bytes),
        file = f.files.importBlob({
          blobId: blob.id,
          name,
          relativePath: name,
          owner: { type: 'session', id: f.sessionId },
        }).file;
      let run = f.work.repo.row(view.runId);
      const state = f.work.repo.state(run);
      state.definition.refs = [{ kind: 'file', fileId: file.id, versionId: file.version.id }];
      f.store.db.transaction(() => {
        f.work.repo.save(run, state);
        f.store.db
          .prepare(
            "UPDATE runs SET status='running',lease_epoch=1,lease_owner='native',lease_expires_at=? WHERE id=?",
          )
          .run(Date.now() + 120000, run.id);
      })();
      run = f.work.repo.row(run.id);
      const observer = new NativeSandboxExecutor(resolve('.'));
      let observed = 0;
      const executor = {
        execute: async (request: HelperRequest, options?: { signal?: AbortSignal }) => {
          const result = await observer.execute(request, options);
          observed++;
          const first = result.events[0]!,
            last = result.events.at(-1)!;
          expect(first.data.networkCapabilities).toBe(0);
          expect(first.data.appContainer).toBe(true);
          expect(last.data.activeProcesses).toBe(0);
          await appendFile(
            'docs/evidence/P06-02/native-cases.jsonl',
            JSON.stringify({
              tool,
              runId: request.runId,
              appContainer: first.data.appContainer,
              networkCapabilities: first.data.networkCapabilities,
              activeProcesses: last.data.activeProcesses,
              exitCode: result.exitCode,
            }) + '\n',
          );
          return result;
        },
      };
      const gateway = new WorkToolGateway(
          f.artifacts,
          new WorkNativeTools(resolve('.'), f.artifacts, available, executor),
        ),
        ref = await gateway.execute(
          run,
          'native',
          { tool, fileId: file.id, versionId: file.version.id },
          () => f.work.repo.guard(run, 'native'),
        );
      expect(observed).toBe(1);
      if (!ref || ref.kind !== 'file') throw Error('artifact');
      expect(await gateway.verify(run, [ref])).toBe(true);
      const output = (await f.files.original(ref.fileId, { versionId: ref.versionId })).bytes;
      if (tool === 'python.analyze') {
        const json = JSON.parse(output.toString());
        expect(json.rows).toBe(2);
        expect(json.columns[1].mean).toBe(20);
      } else {
        expect(output.subarray(0, 5).toString()).toBe('%PDF-');
        expect(output.subarray(-2048).toString()).toContain('%%EOF');
      }
      expect((await f.files.original(file.id, { versionId: file.version.id })).bytes).toEqual(
        bytes,
      );
    } finally {
      await f.close();
    }
  },
  180000,
);
