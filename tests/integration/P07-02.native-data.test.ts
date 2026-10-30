import { expect, test } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AnalysisResultSchema, type ResourceRef } from '../../packages/contracts/src';
import { readExecutionCapabilities } from '../../packages/tools/src';
import { WorkNativeTools } from '../../packages/core/src/work-native';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import { fixture } from './P06.fixture';
import { salesCsv, salesAnalysis } from '../fixtures/P07-02.data';

test('P07-02 native isolated data pipeline recalculates decimal formula caches, publishes exports atomically and preserves its source', async () => {
  const f = await fixture();
  try {
    const blob = await f.blobs.put(Buffer.from(salesCsv), 'text/csv');
    const source = f.files.importBlob({
      blobId: blob.id,
      name: '销售.csv',
      relativePath: '销售.csv',
      owner: { type: 'session', id: f.sessionId },
    }).file;
    const ref: ResourceRef = { kind: 'file', fileId: source.id, versionId: source.version.id };
    const view = await f.create({ format: 'xlsx', refs: [ref] });
    f.store.db.prepare("UPDATE runs SET status='running',lease_epoch=1 WHERE id=?").run(view.runId);
    const run = f.work.repo.row(view.runId),
      caps = await readExecutionCapabilities(resolve('.'));
    expect(caps.nativeExecution.status).toBe('available');
    expect(caps.officeRender.status).toBe('available');
    const gateway = new WorkToolGateway(
      f.artifacts,
      new WorkNativeTools(resolve('.'), f.artifacts, caps),
    );
    const resultRef = await gateway.execute(
      run,
      view.steps[0]!.stepKey,
      {
        tool: 'data.analyze',
        fileId: source.id,
        versionId: source.version.id,
        spec: salesAnalysis(source.id, source.version.id),
      },
      () => {},
    );
    expect(resultRef?.kind).toBe('file');
    if (resultRef?.kind !== 'file') throw Error('result');
    const original = await f.files.original(source.id, { versionId: source.version.id });
    expect(original.bytes.toString()).toBe(salesCsv);
    const raw = await f.files.original(resultRef.fileId, { versionId: resultRef.versionId });
    const result = AnalysisResultSchema.parse(JSON.parse(raw.bytes.toString()));
    expect(result.profiles[0]?.duplicates).toBe(1);
    expect(result.spreadsheet.sheets[1]?.rows).toEqual([
      ['华东', 0.7],
      ['华南', 1.05],
    ]);
    expect(result.spreadsheet.sheets[1]?.columns[1]?.unit).toBe('元');
    expect(result.spreadsheet.sheets[0]?.formulas).toHaveLength(3);
    expect(result.exports.some((e) => e.name.endsWith('.xlsx'))).toBe(true);
    expect(result.exports.some((e) => e.name.endsWith('.png'))).toBe(true);
    expect(await gateway.verify(run, [resultRef])).toBe(true);
    const receipt = await gateway.dispatchCommand({
      protocolVersion: 1,
      requestId: source.id,
      command: 'runs.data',
      payload: { runId: run.id, fileId: resultRef.fileId, versionId: resultRef.versionId },
    });
    expect(receipt.ok).toBe(true);
    await mkdir('docs/evidence/P07-02/native-data', { recursive: true });
    await writeFile('docs/evidence/P07-02/native-data/result.json', raw.bytes);
    for (const output of result.exports) {
      const saved = await f.files.original(output.fileId, { versionId: output.versionId });
      await writeFile(resolve('docs/evidence/P07-02/native-data', output.name), saved.bytes);
    }
    f.files.unlink([source.id], { type: 'session', id: f.sessionId });
    expect(await gateway.verify(run, [resultRef])).toBe(false);
  } finally {
    await f.close();
  }
}, 360000);
