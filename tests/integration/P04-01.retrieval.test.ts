import { expect, test, afterEach, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import gold from '../evals/retrieval/gold.json';
import { retrievalFixture } from './P04-01.fixture';
import {
  CitationLedger,
  HybridIndex,
  localEmbedder,
  type Source,
} from '../../packages/retrieval/src';
import { selectedMaterial, migrate, type Store } from '../../packages/storage/src';
import { emptyDocument } from '../../packages/retrieval/src/ingest/text';
const stores: Store[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const s of stores.splice(0)) if (s.db.open) s.close();
});
test('P04-01 T09 real BGE gold set has Recall@20 >=90%, locatable sources 100%, no-answer sources zero', async () => {
  const f = await retrievalFixture();
  stores.push(f.store);
  const project = f.project(),
    foreign = f.project('隔离乙'),
    versions = new Map<string, string>();
  for (const c of gold.cases.filter((c) => c.expected))
    versions.set(c.id, (await f.put(project, c.text, c.id + '.txt')).currentVersionId);
  await f.put(
    foreign,
    '跨项目唯一标记PRIVATE_OTHER_PROJECT 888887777元，土星环的主要化学成分是冰。',
  );
  // Topic distractors are independently authored; exact gold IDs are never part of query or source text.
  for (let i = 0; i < 12; i++)
    await f.put(project, '食堂第' + i + '号窗口今天供应面条和米饭。', 'noise' + i + '.txt');
  const results: {
    id: string;
    expected: boolean;
    recalled: boolean;
    recalledAt20: boolean;
    topCitationSupported: boolean | null;
    hits: number;
    located: number;
  }[] = [];
  const bge = await localEmbedder(),
    index = new HybridIndex(f.store, bge);
  const sources: Source[] = f.projects.links(project).map((l) => {
    const d = f.store.db
      .prepare('SELECT id FROM parsed_documents WHERE file_version_id=?')
      .get(l.pinned_version_id) as { id: string };
    return {
      fileId: l.resource_id,
      versionId: l.pinned_version_id,
      indexVersion: l.active_index_version,
      documentId: d.id,
      document: () =>
        f.files.parsed(l.resource_id, {
          versionId: l.pinned_version_id,
          owner: { type: 'project', id: project },
        }),
    };
  });
  let locatable = 0,
    total = 0;
  for (const c of gold.cases) {
    const r = await f.projects.query(project, c.query);
    expect(JSON.stringify(r)).not.toContain('PRIVATE_OTHER_PROJECT');
    for (const h of r.hits) {
      const e = h.evidence!;
      expect(e).toBeDefined();
      expect(e.ref.kind).toBe('file');
      if (e.ref.kind !== 'file') throw new Error('unexpected resource');
      const doc = await f.files.parsed(e.ref.fileId, {
        versionId: e.sourceVersion,
        owner: { type: 'project', id: project },
      });
      expect(selectedMaterial(doc, e.ref.locator!, e.ref.selection?.textRange)).toMatchObject({
        hash: e.hash,
        text: e.text,
      });
      locatable++;
      total++;
    }
    const recalled = r.hits.some((h) => h.evidence!.sourceVersion === versions.get(c.id));
    let ranking: { chunkId: string; versionId: string }[] = [];
    await index.search(
      c.query,
      sources,
      () => {},
      8,
      undefined,
      (top20) => {
        ranking = top20;
      },
    );
    if (!c.expected) expect(r.hits, c.id).toHaveLength(0);
    results.push({
      id: c.id,
      expected: c.expected,
      recalled,
      recalledAt20: ranking.some((r) => r.versionId === versions.get(c.id)),
      topCitationSupported:
        c.expected && r.hits.length
          ? r.hits[0]!.evidence!.sourceVersion === versions.get(c.id)
          : null,
      hits: r.hits.length,
      located: r.hits.length,
    });
  }
  const answered = results.filter((r) => r.expected),
    recall = answered.filter((r) => r.recalled).length / answered.length;
  await mkdir('docs/evidence/P04-01', { recursive: true });
  const recallAt20 = answered.filter((r) => r.recalledAt20).length / answered.length;
  const cited = answered.filter((r) => r.topCitationSupported !== null);
  const citationSupportRate = cited.filter((r) => r.topCitationSupported).length / cited.length;
  await writeFile(
    'docs/evidence/P04-01/gold-report.json',
    JSON.stringify(
      {
        schemaVersion: 1,
        fixtureHash: createHash('sha256').update(JSON.stringify(gold)).digest('hex'),
        modelRevision: (await localEmbedder()).revision,
        sampleSize: answered.length,
        recallAt8: recall,
        recallAt20,
        citationSupportRate,
        citedClaims: cited.length,
        supportScorer:
          'Independent gold expected document versus first returned citation; deterministic quotation harness, no model service called',
        locatable,
        total,
        locatableRate: locatable / total,
        noAnswerInventedSources: 0,
        results,
      },
      null,
      2,
    ) + '\n',
  );
  expect(
    recall,
    JSON.stringify(results.filter((r) => r.expected && !r.recalled)),
  ).toBeGreaterThanOrEqual(0.9);
  expect(recallAt20).toBeGreaterThanOrEqual(0.9);
  expect(citationSupportRate).toBeGreaterThanOrEqual(0.95);
  expect(locatable / total).toBe(1);
}, 120000);
test('P04-01 T09 actual returned citations reject unknown/hash/version IDs and persist verified references', async () => {
  const f = await retrievalFixture();
  stores.push(f.store);
  const project = f.project(),
    file = await f.put(project, '退款期限：7天');
  const r = await f.projects.query(project, '退款'),
    e = r.hits[0]!.evidence!;
  const ledger = new CitationLedger(f.files, (value) =>
    f.projects.authorizeEvidence(project, undefined, value),
  );
  ledger.add([e]);
  await expect(
    ledger.validateAnswer('伪造 [[evidence:00000000-0000-7000-8000-000000000000]]'),
  ).rejects.toThrow('VALIDATION_ERROR');
  expect(await ledger.validateAnswer('退款期限为7天 [[evidence:' + e.id + ']]')).toHaveLength(1);
  expect(await ledger.validateAnswer('退款期限为7天。 [[evidence:' + e.id + ']]')).toHaveLength(1);
  const supported = '退款期限为7天 [[evidence:' + e.id + ']]';
  await expect(ledger.validateAnswer(supported + '。配送时效为999天。')).rejects.toThrow(
    'VALIDATION_ERROR',
  );
  await expect(ledger.validateAnswer('配送时效为999天。' + supported)).rejects.toThrow(
    'VALIDATION_ERROR',
  );
  expect(
    await ledger.validateAnswer('### 依据\n' + supported + '。资料不足，无法支持其他结论。'),
  ).toHaveLength(1);
  expect(await ledger.validateAnswer('根据当前资料，无法确定配送时效。')).toHaveLength(0);
  const otherFile = await f.put(project, '退款期限：30天', 'conflicting-refund.txt');
  const other = (await f.projects.query(project, '退款期限')).hits.find(
    (hit) => hit.evidence!.sourceVersion === otherFile.currentVersionId,
  )!.evidence!;
  ledger.add([other]);
  expect(
    await ledger.validateAnswer(
      '退款期限分别为7天和30天，两份资料存在冲突 [[evidence:' +
        e.id +
        ']] [[evidence:' +
        other.id +
        ']]',
    ),
  ).toHaveLength(2);
  await expect(ledger.validateAnswer('退款期限为999天 [[evidence:' + e.id + ']]')).rejects.toThrow(
    'VALIDATION_ERROR',
  );
  await expect(ledger.validateAnswer('“不存在的原文” [[evidence:' + e.id + ']]')).rejects.toThrow(
    'VALIDATION_ERROR',
  );
  const saved = e.hash;
  e.hash = '0'.repeat(64);
  await expect(ledger.verify(e.id)).rejects.toThrow('CONFLICT');
  e.hash = saved;
  f.files.unlink([file.id], { type: 'project', id: project });
  await expect(ledger.verify(e.id)).rejects.toThrow('PERMISSION_DENIED');
}, 30000);
test('P04-01 T09 sheet rows keep header units, code symbols keep line locators and conflict/expiry remain explicit', async () => {
  const f = await retrievalFixture();
  stores.push(f.store);
  const project = f.project();
  const doc = emptyDocument('sheet'),
    rows = Array.from({ length: 100 }, (_, i) => [
      i ? '产品' + i : '产品名称',
      i ? '数量' + i : '库存数量（单位：件）',
    ]);
  doc.sheets = [
    {
      id: 's',
      name: '库存',
      rows: 100,
      columns: 2,
      cells: rows.flatMap((r, i) =>
        r.map((value, j) => ({ row: i + 1, column: j + 1, value, calculated: true })),
      ),
    },
  ];
  doc.blocks = rows.map((r, i) => ({
    id: 'r' + i,
    kind: 'table',
    text: r.join('\t'),
    locator: { kind: 'sheet', sheetId: 's', range: 'A' + (i + 1) + ':B' + (i + 1) },
  }));
  await f.put(project, 'synthetic workbook structure', 'sheet.txt', doc);
  const hits = (await f.projects.query(project, '产品99 库存 件')).hits;
  expect(hits.length).toBeGreaterThan(0);
  const h = hits.find((h) => h.text.includes('产品99'))!;
  expect(h.evidence!.context.some((c) => c.text.includes('单位：件'))).toBe(true);
  expect(h.ref.kind === 'file' && h.ref.locator?.kind).toBe('sheet');
  await f.put(project, '退款期限：7天', 'refund-a.txt');
  await f.put(project, '退款期限：30天', 'refund-b.txt');
  const conflict = await f.projects.query(project, '退款期限');
  expect(conflict.hits.filter((h) => h.evidence!.status === 'conflicting')).toHaveLength(2);
  expect(conflict.diagnostics.join('')).toContain('矛盾');
  const file = await f.put(project, '独有过期资料XYZ_EXPIRED', 'expired.txt');
  f.store.db
    .prepare('UPDATE resource_links SET expires_at=1 WHERE resource_id=? AND owner_id=?')
    .run(file.id, project);
  const expired = await f.projects.query(project, 'XYZ_EXPIRED');
  expect(expired.hits).toHaveLength(0);
  expect(expired.diagnostics.join('')).toContain('已过期');
  const code = emptyDocument('code'),
    lines = [
      'function refund() {',
      '  return 7;',
      '}',
      'function cancel() {',
      '  return false;',
      '}',
    ];
  code.blocks = lines.map((text, i) => ({
    id: 'c' + i,
    kind: 'code',
    text,
    locator: { kind: 'code', path: 'service.ts', lineStart: i + 1, lineEnd: i + 1 },
  }));
  await f.put(project, lines.join('\n'), 'service.ts', code);
  const found = (await f.projects.query(project, 'refund')).hits.find((h) =>
    h.text.includes('return 7'),
  )!;
  expect(found.ref).toMatchObject({
    locator: { kind: 'code', path: 'service.ts', lineStart: 1, lineEnd: 3 },
  });
}, 30000);
test('P04-01 T09 new model dimensions rebuild atomically; cancelled or revoked index cannot commit', async () => {
  const f = await retrievalFixture();
  stores.push(f.store);
  const project = f.project(),
    file = await f.put(project, '退款期限：7天');
  await f.projects.query(project, '退款');
  const parsed = f.store.db
    .prepare('SELECT id,index_version FROM parsed_documents WHERE file_version_id=?')
    .get(file.currentVersionId) as { id: string; index_version: number };
  const source: Source = {
    fileId: file.id,
    versionId: file.currentVersionId,
    indexVersion: parsed.index_version,
    documentId: parsed.id,
    document: () => f.files.parsed(file.id, { versionId: file.currentVersionId }),
  };
  const index = new HybridIndex(f.store, {
    revision: 'synthetic-upgrade',
    dims: 2,
    count: (s) => s.length,
    embed: async () => new Float32Array([0.6, 0.8]),
  });
  await index.ensure(source, () => {});
  expect(f.store.db.prepare('SELECT DISTINCT dims,model_revision FROM embeddings').all()).toEqual([
    { dims: 2, model_revision: 'synthetic-upgrade' },
  ]);
  await f.projects.query(project, '退款');
  expect(f.store.db.prepare('SELECT DISTINCT dims FROM embeddings').all()).toEqual([{ dims: 512 }]);
  const controller = new AbortController();
  controller.abort();
  const newer = new HybridIndex(f.store, {
    revision: 'cancelled-upgrade',
    dims: 2,
    count: (s) => s.length,
    embed: async () => new Float32Array([0.6, 0.8]),
  });
  await expect(newer.ensure(source, () => {}, controller.signal)).rejects.toThrow();
  expect(f.store.db.prepare('SELECT DISTINCT dims FROM embeddings').all()).toEqual([{ dims: 512 }]);
  await expect(
    newer.ensure(source, () => {
      throw new Error('PERMISSION_DENIED');
    }),
  ).rejects.toThrow('PERMISSION_DENIED');
  await migrate(f.store.db, resolve(f.root, 'repeat-backup'));
  expect(f.files.get(file.id).currentVersionId).toBe(file.currentVersionId);
}, 30000);
