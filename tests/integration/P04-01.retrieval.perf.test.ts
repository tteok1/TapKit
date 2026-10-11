import { expect, test } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { retrievalFixture } from './P04-01.fixture';
import { localEmbedder, digest, CHUNK_POLICY } from '../../packages/retrieval/src';
import { emptyDocument } from '../../packages/retrieval/src/ingest/text';
import { newId } from '../../packages/storage/src';
test('P04-01 T09 20000 real-vector scoped chunks hybrid retrieval P95 <=2 seconds', async () => {
  const f = await retrievalFixture();
  try {
    const project = f.project(),
      bge = await localEmbedder(),
      doc = emptyDocument('text');
    const prototypes = [
      '退款期限：7天，退款退回原支付账户。',
      '备份保留七份快照。',
      '研发门禁需要员工卡。',
      '图书馆周一闭馆。',
      '员工休假由主管批准。',
      '模型升级需要重建旧向量。',
      '索引取消必须丢弃未提交结果。',
      '网络代理用于本地转发。',
    ];
    const vectors = await Promise.all(prototypes.map((t) => bge.embed(t))),
      count = 20000;
    let offset = 0;
    for (let i = 0; i < count; i++) {
      const text = prototypes[i % prototypes.length]!;
      doc.blocks.push({
        id: 'b' + i,
        kind: 'text',
        text,
        locator: { kind: 'text', start: offset, end: offset + text.length },
      });
      offset += text.length + 1;
    }
    const file = await f.put(project, doc.blocks.map((b) => b.text).join('\n'), '20k.txt', doc);
    const parsed = f.store.db
      .prepare('SELECT id,index_version FROM parsed_documents WHERE file_version_id=?')
      .get(file.currentVersionId) as { id: string; index_version: number };
    const insert = f.store.db.prepare(
      'INSERT INTO chunks(id,profile_id,document_id,file_version_id,index_version,policy_revision,ordinal,text,search_text,locator_json,context_json,text_hash,token_count) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    const embedding = f.store.db.prepare(
      "INSERT INTO embeddings(chunk_id,model_revision,dims,vector_blob,norm,status) VALUES(?,?,?,?,1,'ready')",
    );
    f.store.db.transaction(() => {
      for (let i = 0; i < count; i++) {
        const id = newId(),
          block = doc.blocks[i]!,
          v = vectors[i % vectors.length]!,
          blob = Buffer.alloc(v.length * 4);
        v.forEach((value, index) => blob.writeFloatLE(value, index * 4));
        insert.run(
          id,
          f.store.profileId,
          parsed.id,
          file.currentVersionId,
          parsed.index_version,
          CHUNK_POLICY,
          i,
          block.text,
          block.text,
          JSON.stringify(block.locator),
          '[]',
          digest(block.text),
          bge.count(block.text),
        );
        embedding.run(id, bge.revision, bge.dims, blob);
      }
    })();
    expect(f.store.db.prepare('SELECT count(*) AS n FROM chunks').get()).toEqual({ n: count });
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
      expect(r.hits.length).toBeLessThanOrEqual(3);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
    await mkdir('docs/evidence/P04-01', { recursive: true });
    await writeFile(
      'docs/evidence/P04-01/perf-report.json',
      JSON.stringify(
        {
          schemaVersion: 1,
          chunks: count,
          dims: bge.dims,
          modelRevision: bge.revision,
          distinctRealVectorPrototypes: prototypes.length,
          fixture:
            '20k repeated parsed paragraphs; each vector is the actual BGE output of its identical source text; no model indexing in hot timing',
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
}, 120000);
