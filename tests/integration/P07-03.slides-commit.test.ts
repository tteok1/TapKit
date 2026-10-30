import { expect, test } from 'vitest';
import { fixture } from './P06.fixture';
import { sampleDeck } from '../fixtures/P07-03.slides';
import {
  publishWorkSlides,
  resolveSlideChart,
  slidePage,
} from '../../packages/core/src/work-slides';
import { ChatService } from '../../packages/core/src/chat-service';
import type { WorkNativeTools } from '../../packages/core/src/work-native';
import { newId, SlideRepository } from '../../packages/storage/src';
import { slideHashes } from '../../packages/workflows/src';
import { pdfFixture } from '../fixtures/P03-pdf';
import { solidPng } from '../fixtures/P07-01.images';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import { AnalysisResultSchema } from '../../packages/contracts/src';
import { salesAnalysis, salesCsv } from '../fixtures/P07-02.data';
import { DATA_SCRIPT_HASH } from '../../packages/core/src/work-data';
const syntheticNative = {
  renderSlidesCandidate: async (_run: unknown, _bytes: Buffer, spec: { slides: unknown[] }) => ({
    pdf: pdfFixture('synthetic receipt fixture'),
    pages: spec.slides.length,
  }),
} as unknown as WorkNativeTools;

test('P07-03 reusing a trusted analysis chart rechecks the original selected source after revocation', async () => {
  const f = await fixture();
  try {
    const blob = await f.blobs.put(Buffer.from(salesCsv), 'text/csv'),
      source = f.files.importBlob({
        blobId: blob.id,
        name: '源.csv',
        relativePath: '源.csv',
        owner: { type: 'session', id: f.sessionId },
      }).file,
      view = await f.create({
        format: 'pptx',
        refs: [{ kind: 'file', fileId: source.id, versionId: source.version.id }],
      });
    f.store.db.prepare("UPDATE runs SET status='running',lease_epoch=1 WHERE id=?").run(view.runId);
    const run = f.work.repo.row(view.runId),
      spec = salesAnalysis(source.id, source.version.id),
      value = AnalysisResultSchema.parse({
        schemaVersion: 1,
        kind: 'tapkit.analysis',
        spec,
        scriptHash: DATA_SCRIPT_HASH,
        inputs: [
          { fileId: source.id, versionId: source.version.id, sha256: source.version.sha256 },
        ],
        profiles: [{ datasetId: 'sales', rows: 4, duplicates: 1, columns: [] }],
        spreadsheet: {
          schemaVersion: 1,
          sheets: [
            {
              id: 'summary',
              name: '汇总',
              columns: [
                { key: '地区', label: '地区', type: 'string' },
                { key: '销售额', label: '销售额', type: 'number', unit: '元' },
              ],
              rows: [
                ['华东', 0.7],
                ['华南', 1.05],
              ],
            },
          ],
        },
        warnings: [],
      });
    const ref = await f.gateway.execute(
      run,
      view.steps[0]!.stepKey,
      { tool: 'artifact.write', name: '已分析.json', content: JSON.stringify(value) },
      () => {},
    );
    if (ref?.kind !== 'file') throw Error('file');
    // Synthetic trusted receipt isolates authorization at chart reuse; this is
    // not a native analysis quality test (covered by P07-02 native suites).
    f.store.db
      .prepare(
        "UPDATE tool_calls SET tool_name='data.analyze' WHERE run_id=? AND status='succeeded'",
      )
      .run(run.id);
    const chartRef = { fileId: ref.fileId, versionId: ref.versionId, chartId: 'revenue' };
    expect((await resolveSlideChart(f.artifacts, run, chartRef)).series[0]!.values).toEqual([
      0.7, 1.05,
    ]);
    f.files.unlink([source.id], { type: 'session', id: f.sessionId });
    await expect(resolveSlideChart(f.artifacts, run, chartRef)).rejects.toThrow();
  } finally {
    await f.close();
  }
});
test('P07-03 a slide revision requires a concrete review and creates a bound grant without dispatching early', async () => {
  const f = await fixture();
  try {
    const view = await f.create({ format: 'pptx' });
    f.store.db.prepare("UPDATE runs SET status='running',lease_epoch=1 WHERE id=?").run(view.runId);
    const run = f.work.repo.row(view.runId),
      chat = new ChatService(f.store, f.blobs, {} as never),
      spec = sampleDeck();
    const ref = await publishWorkSlides(
      f.artifacts,
      chat,
      syntheticNative,
      run,
      { tool: 'slides.create', name: '审批.pptx', spec },
      () => {},
      () => {},
      new AbortController().signal,
    );
    if (ref.kind !== 'file') throw Error('file');
    let calls = 0;
    const native = {
      renderSlidesCandidate: async () => {
        calls++;
        throw Error('must await approval');
      },
    } as unknown as WorkNativeTools;
    const gateway = new WorkToolGateway(f.artifacts, native, chat),
      file = f.files.get(ref.fileId),
      args = {
        tool: 'slides.revise' as const,
        fileId: ref.fileId,
        versionId: ref.versionId,
        revision: file.revision,
        actions: [
          {
            op: 'replace' as const,
            slideId: 'page-2',
            slide: { ...spec.slides[1]!, title: '审批后才修改' },
          },
        ],
      };
    expect(await gateway.execute(run, view.steps[0]!.stepKey, args, () => {})).toBeNull();
    expect(calls).toBe(0);
    expect(f.files.get(ref.fileId).currentVersionId).toBe(ref.versionId);
    const approval = f.store.db
      .prepare('SELECT id,args_hash,content_version_hash,preview_json FROM approvals')
      .get() as {
      id: string;
      args_hash: string;
      content_version_hash: string;
      preview_json: string;
    };
    expect(approval.preview_json).toContain('审批后才修改');
    const result = await gateway.dispatchCommand({
      protocolVersion: 1,
      requestId: newId(),
      command: 'approvals.decide',
      expectedRevision: f.work.repo.view(run.id).revision,
      payload: {
        approvalId: approval.id,
        decision: 'approved',
        argsHash: approval.args_hash,
        contentVersionHash: approval.content_version_hash,
        scope: 'once',
      },
    });
    expect(result.ok).toBe(true);
    expect(calls).toBe(0);
    const grant = f.store.db
      .prepare('SELECT tool_names_json,resource_rules_json FROM grants')
      .get() as { tool_names_json: string; resource_rules_json: string };
    expect(grant.tool_names_json).toContain('slides.revise');
    expect(grant.resource_rules_json).toContain(ref.fileId);
  } finally {
    await f.close();
  }
});
test('P07-03 PPTX/PDF/spec/receipt publication rolls back together, then revisions preserve unrelated slide hashes', async () => {
  const f = await fixture();
  try {
    const view = await f.create({ format: 'pptx' }),
      run = f.work.repo.row(view.runId),
      chat = new ChatService(f.store, f.blobs, {} as never),
      spec = sampleDeck(),
      args = { tool: 'slides.create' as const, name: '演示.pptx', spec };
    const receipt = f.store.db.prepare('SELECT count(*) AS n FROM files').get();
    await expect(
      publishWorkSlides(
        f.artifacts,
        chat,
        syntheticNative,
        run,
        args,
        () => {},
        () => {
          throw Error('ROLLBACK');
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('ROLLBACK');
    expect(f.store.db.prepare('SELECT count(*) AS n FROM files').get()).toEqual(receipt);
    expect(f.store.db.prepare('SELECT count(*) AS n FROM document_specs').get()).toEqual({ n: 0 });
    let inTransaction = false;
    const ref = await publishWorkSlides(
      f.artifacts,
      chat,
      syntheticNative,
      run,
      args,
      () => {},
      () => {
        inTransaction = f.store.db.inTransaction;
      },
      new AbortController().signal,
    );
    expect(inTransaction).toBe(true);
    if (ref.kind !== 'file') throw Error('file');
    const owner = { type: 'task' as const, id: run.task_id },
      repository = new SlideRepository(f.files),
      old = repository.read(ref.fileId, ref.versionId, owner),
      file = f.files.get(ref.fileId, { owner });
    const next = await publishWorkSlides(
      f.artifacts,
      chat,
      syntheticNative,
      run,
      {
        tool: 'slides.revise',
        fileId: ref.fileId,
        versionId: ref.versionId,
        revision: file.revision,
        actions: [
          {
            op: 'replace',
            slideId: 'page-2',
            slide: { ...spec.slides[1]!, title: '定点修改', notes: '新的备注' },
          },
        ],
      },
      () => {},
      () => {},
      new AbortController().signal,
    );
    if (next.kind !== 'file') throw Error('file');
    expect(next.fileId).toBe(ref.fileId);
    expect(next.versionId).not.toBe(ref.versionId);
    const current = repository.read(next.fileId, next.versionId, owner),
      before = slideHashes(old.spec),
      after = slideHashes(current.spec);
    for (const s of old.spec.slides.filter((s) => s.id !== 'page-2'))
      expect(after[s.id]).toBe(before[s.id]);
    expect(repository.read(ref.fileId, ref.versionId, owner).spec).toEqual(old.spec);
    expect(slidePage(f.artifacts, run, ref.fileId, ref.versionId).current).toBe(false);
    expect(slidePage(f.artifacts, run, next.fileId, next.versionId).current).toBe(true);
    await expect(
      publishWorkSlides(
        f.artifacts,
        chat,
        syntheticNative,
        run,
        {
          tool: 'slides.revise',
          fileId: ref.fileId,
          versionId: ref.versionId,
          revision: file.revision,
          actions: [{ op: 'delete', slideId: 'page-1' }],
        },
        () => {},
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toThrow('CONFLICT');
  } finally {
    await f.close();
  }
});
test('P07-03 unauthorized image and forged analysis chart cannot reach native rendering', async () => {
  const f = await fixture();
  try {
    const view = await f.create({ format: 'pptx' }),
      run = f.work.repo.row(view.runId),
      chat = new ChatService(f.store, f.blobs, {} as never),
      spec = sampleDeck();
    spec.slides[0]!.imageVersionId = newId();
    let nativeCalls = 0;
    const native = {
      renderSlidesCandidate: async () => {
        nativeCalls++;
        throw Error('UNREACHABLE');
      },
    } as unknown as WorkNativeTools;
    await expect(
      publishWorkSlides(
        f.artifacts,
        chat,
        native,
        run,
        { tool: 'slides.create', name: 'a.pptx', spec },
        () => {},
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toThrow('PERMISSION_DENIED');
    expect(nativeCalls).toBe(0);
    const blob = await f.blobs.put(solidPng());
    const file = f.files.importBlob({
      blobId: blob.id,
      name: 'fake.json',
      relativePath: 'fake.json',
      generatedByRunId: run.id,
      owner: { type: 'session', id: run.session_id },
    }).file;
    await expect(
      resolveSlideChart(f.artifacts, run, {
        fileId: file.id,
        versionId: file.version.id,
        chartId: 'fake',
      }),
    ).rejects.toThrow('FORMAT_UNSUPPORTED');
  } finally {
    await f.close();
  }
});
