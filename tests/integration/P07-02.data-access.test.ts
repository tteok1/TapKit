import { expect, test } from 'vitest';
import { resolve } from 'node:path';
import { AnalysisResultSchema } from '../../packages/contracts/src';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import { WorkNativeTools } from '../../packages/core/src/work-native';
import { dataSources, DATA_SCRIPT_HASH } from '../../packages/core/src/work-data';
import { fixture } from './P06.fixture';
import { salesAnalysis, salesCsv } from '../fixtures/P07-02.data';

async function setup() {
  const f = await fixture();
  const blob = await f.blobs.put(Buffer.from(salesCsv), 'text/csv');
  const source = f.files.importBlob({
    blobId: blob.id,
    name: '数据.csv',
    relativePath: '数据.csv',
    owner: { type: 'session', id: f.sessionId },
  }).file;
  const ref = { kind: 'file' as const, fileId: source.id, versionId: source.version.id };
  const view = await f.create({ refs: [ref], format: 'xlsx' });
  f.store.db.prepare("UPDATE runs SET status='running',lease_epoch=1 WHERE id=?").run(view.runId);
  return {
    ...f,
    source,
    ref,
    run: f.work.repo.row(view.runId),
    view,
    spec: salesAnalysis(source.id, source.version.id),
  };
}

test('P07-02 fixed inputs must be selected and keep their owner link; source revocation fails closed', async () => {
  const f = await setup();
  try {
    expect(dataSources(f.artifacts, f.run, f.spec)).toHaveLength(1);
    const other = await f.create({ refs: [] });
    expect(() => dataSources(f.artifacts, f.work.repo.row(other.runId), f.spec)).toThrow(
      'PERMISSION_DENIED',
    );
    f.files.unlink([f.source.id], { type: 'session', id: f.sessionId });
    expect(() => dataSources(f.artifacts, f.run, f.spec)).toThrow();
  } finally {
    await f.close();
  }
});
test('P07-02 unknown native state never publishes or blindly retries a partially written result', async () => {
  const f = await setup();
  try {
    let calls = 0;
    const gateway = new WorkToolGateway(
      f.artifacts,
      new WorkNativeTools(
        resolve('.'),
        f.artifacts,
        {
          nativeExecution: { status: 'available' },
          officeRender: { status: 'available' },
          terminal: { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason: 'unused' },
        },
        {
          execute: async () => {
            calls++;
            return {
              exitCode: null,
              events: [{ event: 'started', data: { appContainer: true, networkCapabilities: 0 } }],
            };
          },
        },
      ),
    );
    const args = {
      tool: 'data.analyze' as const,
      fileId: f.source.id,
      versionId: f.source.version.id,
      spec: f.spec,
    };
    await expect(gateway.execute(f.run, f.view.steps[0]!.stepKey, args, () => {})).rejects.toThrow(
      'SIDE_EFFECT_UNKNOWN',
    );
    expect(calls).toBe(1);
    expect(
      f.store.db.prepare('SELECT 1 FROM file_versions WHERE created_by_run_id=?').get(f.run.id),
    ).toBeUndefined();
    await expect(gateway.execute(f.run, f.view.steps[0]!.stepKey, args, () => {})).rejects.toThrow(
      'SIDE_EFFECT_UNKNOWN',
    );
    expect(calls).toBe(1);
  } finally {
    await f.close();
  }
});
test('P07-02 a JSON written by another tool cannot impersonate an accepted analysis receipt', async () => {
  const f = await setup();
  try {
    const result = AnalysisResultSchema.parse({
      schemaVersion: 1,
      kind: 'tapkit.analysis',
      spec: { ...f.spec, charts: [] },
      scriptHash: DATA_SCRIPT_HASH,
      inputs: [
        { fileId: f.source.id, versionId: f.source.version.id, sha256: f.source.version.sha256 },
      ],
      profiles: [{ datasetId: 'sales', rows: 4, duplicates: 1, columns: [] }],
      spreadsheet: {
        schemaVersion: 1,
        sheets: [
          {
            id: 'detail',
            name: '数据',
            columns: [{ key: 'a', label: 'a', type: 'number' }],
            rows: [[123]],
          },
        ],
      },
      warnings: [],
    });
    const ref = await f.artifacts.execute(
      f.run,
      'x',
      { tool: 'artifact.write', name: '伪造.json', content: JSON.stringify(result) },
      () => {},
    );
    expect(await f.gateway.verify(f.run, [ref])).toBe(false);
    await expect(
      f.gateway.dispatchCommand({
        protocolVersion: 1,
        requestId: f.source.id,
        command: 'runs.data',
        payload: {
          runId: f.run.id,
          fileId: ref.kind === 'file' ? ref.fileId : '',
          versionId: ref.kind === 'file' ? ref.versionId : '',
        },
      }),
    ).rejects.toThrow('PERMISSION_DENIED');
  } finally {
    await f.close();
  }
});
