import type { ParsedDocument, EvidenceRef, ResourceRef } from '@tapkit/contracts';
import { EvidenceRefSchema } from '@tapkit/contracts';
import { type Store, newId, StorageError } from '@tapkit/storage';
import { CHUNK_POLICY, chunkDocument, type Chunk, type ContextPart } from './chunking';
import { type Embedder } from './embedding';

export type Source = {
  fileId: string;
  versionId: string;
  indexVersion: number;
  documentId: string | null;
  document(): Promise<ParsedDocument>;
};
type Row = {
  id: string;
  file_version_id: string;
  index_version: number;
  ordinal: number;
  text: string;
  search_text: string;
  text_hash: string;
  locator_json: string;
  range_json: string | null;
  context_json: string;
  dims: number;
  vector_blob: Buffer;
  model_revision: string;
};
export function termsFor(query: string) {
  const parts = query.toLowerCase().match(/[a-z0-9_]+|[\p{Script=Han}]+/gu) ?? [];
  const terms = new Set<string>();
  for (const part of parts) {
    if (!/\p{Script=Han}/u.test(part) || part.length <= 3) terms.add(part);
    else for (let at = 0; at + 2 <= part.length; at++) terms.add(part.slice(at, at + 2));
  }
  return [...terms].slice(0, 100);
}
// Small, auditable Chinese lexical bridges complement BGE for common short queries.
// They change ranking only inside the caller's fixed scope, never authorization.
const conceptGroups = [
  ['文件', '资料', '文档'],
  ['删除', '回收站', '清理'],
  ['保存', '保留', '存储'],
  ['替换', '更换', '变更'],
  ['变化', '漂移', '改变'],
  ['原来', '旧', '原始'],
  ['休息', '休假', '请假'],
  ['审批', '批准'],
  ['居家', '在家', '远程办公'],
  ['上班', '工作', '办公'],
  ['款项', '钱', '金额'],
  ['口令', '密码'],
];
export function keywordCoverage(query: string, text: string, terms = termsFor(query)) {
  text = text.toLowerCase();
  const raw = terms.length ? terms.filter((t) => text.includes(t)).length / terms.length : 0;
  const groups = conceptGroups.filter((g) => g.some((term) => query.includes(term)));
  return groups.length
    ? 0.4 * raw +
        (0.6 * groups.filter((g) => g.some((term) => text.includes(term))).length) / groups.length
    : raw;
}
export function cosine(a: Float32Array, b: Float32Array) {
  if (a.length !== b.length) throw new StorageError('INDEX_NOT_READY');
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) throw new StorageError('INDEX_NOT_READY');
    dot += a[i]! * b[i]!;
    aa += a[i]! ** 2;
    bb += b[i]! ** 2;
  }
  if (!aa || !bb) throw new StorageError('INDEX_NOT_READY');
  return Math.max(-1, Math.min(1, dot / Math.sqrt(aa * bb)));
}
export function decodeVector(blob: Buffer, dims: number) {
  if (blob.length !== dims * 4) throw new StorageError('INDEX_NOT_READY');
  const out = new Float32Array(dims);
  for (let i = 0; i < dims; i++) out[i] = blob.readFloatLE(i * 4);
  return out;
}
function encodeVector(vector: Float32Array, dims: number) {
  if (vector.length !== dims) throw new StorageError('INDEX_NOT_READY');
  const out = Buffer.alloc(dims * 4);
  let norm = 0;
  vector.forEach((v, i) => {
    if (!Number.isFinite(v)) throw new StorageError('INDEX_NOT_READY');
    norm += v * v;
    out.writeFloatLE(v, i * 4);
  });
  if (Math.abs(Math.sqrt(norm) - 1) > 0.001) throw new StorageError('INDEX_NOT_READY');
  return out;
}
export class HybridIndex {
  constructor(
    readonly store: Store,
    readonly embedder: Embedder,
  ) {}
  needsIndex(source: Source) {
    const row = this.store.db
      .prepare(
        `SELECT count(*) AS total,sum(CASE WHEN c.policy_revision=? AND e.model_revision=? AND e.dims=? AND e.status='ready' THEN 1 ELSE 0 END) AS ready FROM chunks c LEFT JOIN embeddings e ON e.chunk_id=c.id WHERE c.profile_id=? AND c.file_version_id=? AND c.index_version=?`,
      )
      .get(
        CHUNK_POLICY,
        this.embedder.revision,
        this.embedder.dims,
        this.store.profileId,
        source.versionId,
        source.indexVersion,
      ) as { total: number; ready: number | null };
    return !row.total || row.ready !== row.total;
  }
  async ensure(source: Source, assertScope: () => void, signal?: AbortSignal) {
    if (!this.needsIndex(source)) return;
    assertScope();
    signal?.throwIfAborted();
    const doc = await source.document();
    assertScope();
    const chunks = chunkDocument(doc, this.embedder.count);
    const vectors: Buffer[] = [];
    for (const chunk of chunks) {
      signal?.throwIfAborted();
      assertScope();
      const text = [...chunk.context.map((c) => c.text), chunk.text].join('\n');
      vectors.push(
        encodeVector(await this.embedder.embed(text, false, signal), this.embedder.dims),
      );
    }
    signal?.throwIfAborted();
    assertScope();
    this.store.db.transaction(() => {
      assertScope();
      this.store.db
        .prepare('DELETE FROM chunks WHERE profile_id=? AND file_version_id=?')
        .run(this.store.profileId, source.versionId);
      const ids = chunks.map(() => newId());
      const insert = this.store.db.prepare(
        `INSERT INTO chunks(id,profile_id,document_id,file_version_id,index_version,policy_revision,ordinal,parent_chunk_id,previous_chunk_id,next_chunk_id,text,search_text,locator_json,range_json,context_json,text_hash,token_count,source_kind) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      const embed = this.store.db.prepare(
        "INSERT INTO embeddings(chunk_id,model_revision,dims,vector_blob,norm,status) VALUES(?,?,?,?,1,'ready')",
      );
      for (const chunk of chunks) {
        insert.run(
          ids[chunk.ordinal],
          this.store.profileId,
          source.documentId,
          source.versionId,
          source.indexVersion,
          CHUNK_POLICY,
          chunk.ordinal,
          chunk.parent === null ? null : ids[chunk.parent],
          chunk.previous === null ? null : ids[chunk.previous],
          chunk.next === null ? null : ids[chunk.next],
          chunk.text,
          [...chunk.context.map((c) => c.text), chunk.text].join('\n'),
          JSON.stringify(chunk.locator),
          chunk.range ? JSON.stringify(chunk.range) : null,
          JSON.stringify(chunk.context),
          chunk.hash,
          chunk.tokens,
          chunk.kind,
        );
        embed.run(
          ids[chunk.ordinal],
          this.embedder.revision,
          this.embedder.dims,
          vectors[chunk.ordinal],
        );
      }
    })();
  }
  async search(
    query: string,
    sources: Source[],
    assertScope: () => void,
    limit = 8,
    signal?: AbortSignal,
    trace?: (ranking: { chunkId: string; versionId: string }[]) => void,
  ) {
    for (const source of sources) await this.ensure(source, assertScope, signal);
    assertScope();
    signal?.throwIfAborted();
    if (!sources.length) return [];
    const q = await this.embedder.embed(query, true, signal);
    assertScope();
    signal?.throwIfAborted();
    const scope = JSON.stringify(
      sources.map((s) => ({ version: s.versionId, index: s.indexVersion })),
    );
    // Scope precedes both rankings and their LIMIT; no whole-library candidates leave SQLite.
    const where = `c.profile_id=? AND c.source_kind<>'heading' AND EXISTS(SELECT 1 FROM json_each(?) s WHERE json_extract(s.value,'$.version')=c.file_version_id AND json_extract(s.value,'$.index')=c.index_version)`;
    const rows = this.store.db
      .prepare(
        `SELECT c.*,e.dims,e.vector_blob,e.model_revision FROM chunks c JOIN embeddings e ON e.chunk_id=c.id WHERE ${where} AND e.status='ready' AND e.model_revision=? AND e.dims=?`,
      )
      .all(this.store.profileId, scope, this.embedder.revision, this.embedder.dims) as Row[];
    const expected = this.store.db
      .prepare(`SELECT count(*) AS count FROM chunks c WHERE ${where}`)
      .get(this.store.profileId, scope) as { count: number };
    if (rows.length !== expected.count) throw new StorageError('INDEX_NOT_READY');
    const terms = termsFor(query),
      entities = query.toLowerCase().match(/[a-z]+[_a-z0-9]*|\d+(?:\.\d+)?/g) ?? [];
    const coverage = new Map(rows.map((r) => [r.id, keywordCoverage(query, r.search_text, terms)]));
    const keyword = (row: Row) => coverage.get(row.id)!;
    const tie = (a: Row, b: Row) =>
      a.file_version_id.localeCompare(b.file_version_id) || a.ordinal - b.ordinal;
    const ftsTerms = [
      ...new Set(
        (query.toLowerCase().match(/[a-z0-9_]{3,}|[\p{Script=Han}]{3,}/gu) ?? []).flatMap((p) =>
          /\p{Script=Han}/u.test(p)
            ? Array.from({ length: p.length - 2 }, (_, i) => p.slice(i, i + 3))
            : [p],
        ),
      ),
    ].slice(0, 64);
    const ftsIds = ftsTerms.length
      ? (this.store.db
          .prepare(
            `SELECT c.id FROM chunk_fts JOIN chunks c ON c.rowid=chunk_fts.rowid WHERE chunk_fts MATCH ? AND ${where} ORDER BY bm25(chunk_fts),c.file_version_id,c.ordinal LIMIT 30`,
          )
          .all(
            ftsTerms.map((t) => '"' + t.replaceAll('"', '""') + '"').join(' OR '),
            this.store.profileId,
            scope,
          ) as { id: string }[])
      : [];
    const shortIds = rows
      .filter((r) => keyword(r) > 0)
      .sort((a, b) => keyword(b) - keyword(a) || tie(a, b))
      .slice(0, 30)
      .map((r) => r.id);
    const keywordIds = [...new Set([...ftsIds.map((r) => r.id), ...shortIds])].slice(0, 30);
    const sims = new Map(rows.map((r) => [r.id, cosine(q, decodeVector(r.vector_blob, r.dims))]));
    const vectorIds = [...rows]
      .sort((a, b) => sims.get(b.id)! - sims.get(a.id)! || tie(a, b))
      .slice(0, 30)
      .map((r) => r.id);
    const rrf = new Map<string, number>();
    for (const ranking of [keywordIds, vectorIds])
      ranking.forEach((id, rank) => rrf.set(id, (rrf.get(id) ?? 0) + 1 / (60 + rank + 1)));
    const rowById = new Map(rows.map((r) => [r.id, r]));
    const candidates = [...rrf]
      .sort((a, b) => b[1] - a[1] || tie(rowById.get(a[0])!, rowById.get(b[0])!))
      .slice(0, 30)
      .map(([id]) => rowById.get(id)!);
    // BGE's observed similarities occupy a narrow positive band. Normalize that
    // band within this authorized candidate set so semantic evidence retains its weight.
    const low = Math.min(...candidates.map((r) => sims.get(r.id)!));
    const high = Math.max(...candidates.map((r) => sims.get(r.id)!));
    const normalizedCosine = (r: Row) => (high > low ? (sims.get(r.id)! - low) / (high - low) : 1);
    const score = (r: Row) =>
      0.55 * normalizedCosine(r) +
      0.3 * keyword(r) +
      0.15 *
        (entities.length
          ? entities.filter((t) => r.search_text.toLowerCase().includes(t)).length / entities.length
          : 0);
    candidates.sort((a, b) => score(b) - score(a) || tie(a, b));
    trace?.(
      candidates
        .filter(
          (row) =>
            !entities.some((e) => !row.search_text.toLowerCase().includes(e)) &&
            (keyword(row) > 0 || sims.get(row.id)! >= 0.65),
        )
        .slice(0, 20)
        .map((r) => ({ chunkId: r.id, versionId: r.file_version_id })),
    );
    const result: EvidenceRef[] = [],
      counts = new Map<string, number>(),
      seen = new Set<string>();
    let tokens = 0;
    for (const row of candidates) {
      // An exact error code/number cannot be replaced by a semantically nearby unrelated value.
      if (entities.some((e) => !row.search_text.toLowerCase().includes(e))) continue;
      if (keyword(row) === 0 && sims.get(row.id)! < 0.65) continue;
      if (
        (counts.get(row.file_version_id) ?? 0) >= 3 ||
        seen.has(row.file_version_id + row.text_hash)
      )
        continue;
      const source = sources.find((s) => s.versionId === row.file_version_id)!;
      const context = JSON.parse(row.context_json) as ContextPart[];
      const size = this.embedder.count(row.text + context.map((c) => c.text).join('\n'));
      if (tokens + size > 12000) continue;
      const ref: ResourceRef = {
        kind: 'file',
        fileId: source.fileId,
        versionId: source.versionId,
        locator: JSON.parse(row.locator_json),
        selection: {
          selectedTextHash: row.text_hash,
          ...(row.range_json ? { textRange: JSON.parse(row.range_json) } : {}),
        },
      };
      result.push(
        EvidenceRefSchema.parse({
          id: newId(),
          ref,
          sourceVersion: source.versionId,
          chunkId: row.id,
          indexVersion: row.index_version,
          modelRevision: this.embedder.revision,
          hash: row.text_hash,
          text: row.text,
          score: score(row),
          status: 'supported',
          context: context.map((c) => ({
            ref: {
              kind: 'file',
              fileId: source.fileId,
              versionId: source.versionId,
              locator: c.locator,
            },
            text: c.text,
            hash: c.hash,
          })),
        }),
      );
      tokens += size;
      counts.set(source.versionId, (counts.get(source.versionId) ?? 0) + 1);
      seen.add(source.versionId + row.text_hash);
      if (result.length >= Math.min(8, limit)) break;
    }
    assertScope();
    return result;
  }
}
export function chunkRow(row: Row): Chunk {
  return {
    kind: 'text',
    ordinal: row.ordinal,
    parent: null,
    previous: null,
    next: null,
    text: row.text,
    locator: JSON.parse(row.locator_json),
    range: row.range_json ? JSON.parse(row.range_json) : null,
    hash: row.text_hash,
    tokens: 0,
    context: JSON.parse(row.context_json),
  };
}
