import { localEmbedder, digest, CHUNK_POLICY } from '../../packages/retrieval/src';
import { emptyDocument } from '../../packages/retrieval/src/ingest/text';
import { newId } from '../../packages/storage/src';
import type { retrievalFixture } from '../integration/P04-01.fixture';

export async function seedPerformanceRetrieval(f: Awaited<ReturnType<typeof retrievalFixture>>) {
  const project = f.project('P11 资料检索'),
    bge = await localEmbedder();
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
  const samples = await Promise.all(
    prototypes.map(async (text) => {
      const vector = await bge.embed(text);
      const blob = Buffer.alloc(vector.length * 4);
      vector.forEach((value, index) => blob.writeFloatLE(value, index * 4));
      return { text, blob, hash: digest(text), tokens: bge.count(text) };
    }),
  );
  const documents = 2000,
    chunksPerDocument = 10;
  const parsedVersion = f.store.db.prepare(
    'SELECT id,index_version FROM parsed_documents WHERE file_version_id=?',
  );
  const insert = f.store.db.prepare(
    'INSERT INTO chunks(id,profile_id,document_id,file_version_id,index_version,policy_revision,ordinal,text,search_text,locator_json,context_json,text_hash,token_count) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
  );
  const embedding = f.store.db.prepare(
    "INSERT INTO embeddings(chunk_id,model_revision,dims,vector_blob,norm,status) VALUES(?,?,?,?,1,'ready')",
  );
  const putChunks = f.store.db.transaction((version: string, items: typeof samples) => {
    const parsed = parsedVersion.get(version) as { id: string; index_version: number };
    let offset = 0;
    for (const [ordinal, item] of items.entries()) {
      const id = newId();
      const locator = { kind: 'text', start: offset, end: offset + item.text.length };
      insert.run(
        id,
        f.store.profileId,
        parsed.id,
        version,
        parsed.index_version,
        CHUNK_POLICY,
        ordinal,
        item.text,
        item.text,
        JSON.stringify(locator),
        '[]',
        item.hash,
        item.tokens,
      );
      embedding.run(id, bge.revision, bge.dims, item.blob);
      offset = locator.end + 1;
    }
  });
  const seedStarted = performance.now();
  for (let i = 0; i < documents; i++) {
    const items = Array.from(
      { length: chunksPerDocument },
      (_, ordinal) => samples[(i + ordinal) % samples.length]!,
    );
    const doc = emptyDocument('text');
    let offset = 0;
    for (const [ordinal, { text }] of items.entries()) {
      doc.blocks.push({
        id: 'b' + ordinal,
        kind: 'text',
        text,
        locator: { kind: 'text', start: offset, end: offset + text.length },
      });
      offset += text.length + 1;
    }
    const file = await f.put(
      project,
      items.map(({ text }) => text).join('\n'),
      `资料-${i}.txt`,
      doc,
    );
    putChunks(file.currentVersionId, items);
  }
  const seedMs = performance.now() - seedStarted;
  return { project, bge, prototypes, documents, chunksPerDocument, seedMs };
}
