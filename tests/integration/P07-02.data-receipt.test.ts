import { test, expect } from 'vitest';
import { AnalysisResultSchema, type ResourceRef } from '../../packages/contracts/src';
import {
  BlobStore,
  FileRepository,
  WorkRepository,
  openStore,
  StorageError,
} from '../../packages/storage/src';
import { WorkArtifacts } from '../../packages/core/src/work-artifacts';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import type { WorkNativeTools } from '../../packages/core/src/work-native';
import { DATA_SCRIPT_HASH } from '../../packages/core/src/work-data';
import { fixture } from './P06.fixture';
import { salesCsv, salesAnalysis } from '../fixtures/P07-02.data';

async function setup() {
  const f = await fixture(),
    blob = await f.blobs.put(Buffer.from(salesCsv));
  const source = f.files.importBlob({
    blobId: blob.id,
    name: '源.csv',
    relativePath: '源.csv',
    owner: { type: 'session', id: f.sessionId },
  }).file;
  const view = await f.create({
    format: 'xlsx',
    refs: [{ kind: 'file', fileId: source.id, versionId: source.version.id }],
  });
  f.store.db.prepare("UPDATE runs SET status='running',lease_epoch=1 WHERE id=?").run(view.runId);
  const run = f.work.repo.row(view.runId),
    spec = salesAnalysis(source.id, source.version.id);
  spec.charts = [];
  const result = AnalysisResultSchema.parse({
    schemaVersion: 1,
    kind: 'tapkit.analysis',
    spec,
    scriptHash: DATA_SCRIPT_HASH,
    inputs: [{ fileId: source.id, versionId: source.version.id, sha256: source.version.sha256 }],
    profiles: [{ datasetId: 'sales', rows: 4, duplicates: 1, columns: [] }],
    spreadsheet: {
      schemaVersion: 1,
      sheets: [
        {
          id: 'detail',
          name: '数据',
          columns: [{ key: '值', label: '值', type: 'number' }],
          rows: [[123]],
        },
      ],
    },
    warnings: [],
  });
  return { f, source, view, run, spec, result };
}
test('P07-02 synthetic receipt survives a real store close/reopen without running a committed tool again', async () => {
  const { f, view, run, spec, result, source } = await setup();
  let closed = false,
    calls = 0;
  try {
    const native = {
      execute: async (
        r: typeof run,
        _args: unknown,
        guard: () => void,
        committed: (ref: ResourceRef) => void,
      ) => {
        calls++;
        return f.artifacts.publishAnalysis(
          r,
          result,
          [
            {
              name: '数据.xlsx',
              mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              bytes: Buffer.from('synthetic receipt fixture'),
            },
          ],
          guard,
          committed,
        );
      },
    } as unknown as WorkNativeTools;
    const gateway = new WorkToolGateway(f.artifacts, native),
      args = {
        tool: 'data.analyze' as const,
        fileId: source.id,
        versionId: source.version.id,
        spec,
      };
    const ref = await gateway.execute(run, view.steps[0]!.stepKey, args, () => {});
    expect(ref?.kind).toBe('file');
    expect(calls).toBe(1);
    await f.close();
    closed = true;
    const store = await openStore(f.dir);
    try {
      const blobs = new BlobStore(store),
        files = new FileRepository(store, blobs),
        artifacts = new WorkArtifacts(files, blobs);
      const fresh = new WorkToolGateway(artifacts, {
        execute: async () => {
          throw Error('must not replay committed data analysis');
        },
      } as unknown as WorkNativeTools);
      expect(
        await fresh.execute(
          new WorkRepository(store).row(run.id),
          view.steps[0]!.stepKey,
          args,
          () => {},
        ),
      ).toEqual(ref);
      expect(
        store.db
          .prepare("SELECT count(*) n FROM tool_calls WHERE run_id=? AND status='succeeded'")
          .get(run.id),
      ).toEqual({ n: 1 });
    } finally {
      store.close();
    }
  } finally {
    if (!closed) await f.close();
  }
});
test('P07-02 synthetic atomic publication rolls back all managed files when its receipt cannot commit', async () => {
  const { f, run, result } = await setup();
  try {
    await expect(
      f.artifacts.publishAnalysis(
        run,
        result,
        [{ name: '数据.xlsx', mime: 'application/octet-stream', bytes: Buffer.from('synthetic') }],
        () => {},
        () => {
          throw new StorageError('CANCELLED');
        },
      ),
    ).rejects.toThrow('CANCELLED');
    expect(
      f.store.db.prepare('SELECT 1 FROM file_versions WHERE created_by_run_id=?').get(run.id),
    ).toBeUndefined();
    expect(
      f.store.db
        .prepare("SELECT 1 FROM resource_links WHERE owner_type='task' AND owner_id=?")
        .get(run.task_id),
    ).toBeUndefined();
  } finally {
    await f.close();
  }
});
