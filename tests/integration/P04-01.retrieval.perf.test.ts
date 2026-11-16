import { expect, test } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { retrievalFixture } from './P04-01.fixture';
import { seedPerformanceRetrieval } from '../fixtures/P11-01.retrieval';
test('P04-01 P11-01 T09 2000 documents and 20000 scoped chunks have hybrid retrieval P95 <=2 seconds', async () => {
  const f = await retrievalFixture();
  try {
    const { project, bge, prototypes, documents, chunksPerDocument, seedMs } =
      await seedPerformanceRetrieval(f);
    expect(f.store.db.prepare('SELECT count(*) AS n FROM parsed_documents').get()).toEqual({
      n: documents,
    });
    expect(f.store.db.prepare('SELECT count(*) AS n FROM chunks').get()).toEqual({
      n: documents * chunksPerDocument,
    });
    console.info('P11-01 retrieval fixture ready', { documents, seedMs });
    const queries = [
      '退款',
      '备份',
      '门禁',
      '图书馆',
      '员工休假',
      '模型升级',
      '索引取消',
      '网络代理',
    ];
    await f.projects.query(project, '退款');
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now(),
        r = await f.projects.query(project, queries[i % queries.length]!);
      times.push(performance.now() - start);
      expect(r.hits.length).toBeGreaterThan(0);
      expect(r.hits.length).toBeLessThanOrEqual(8);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
    await mkdir('test-results/P11-01', { recursive: true });
    await writeFile(
      'test-results/P11-01/retrieval-perf.json',
      JSON.stringify(
        {
          schemaVersion: 1,
          documents,
          chunks: documents * chunksPerDocument,
          dims: bge.dims,
          modelRevision: bge.revision,
          distinctRealVectorPrototypes: prototypes.length,
          fixture:
            '2,000 project documents with 20,000 parsed paragraphs; identical text uses the same actual BGE output; no indexing in hot timing',
          seedMs,
          samples: times.length,
          p50Ms: times[Math.floor(times.length / 2)],
          p95Ms: p95,
          maxMs: times.at(-1),
          budgetMs: 2000,
          times,
        },
        null,
        2,
      ) + '\n',
    );
    expect(p95).toBeLessThanOrEqual(2000);
  } finally {
    f.store.close();
  }
}, 480_000);
