import { verifySourceClaims, type ClaimSource } from './claim-support';
import { ParsedDocumentSchema, type EvidenceRef } from '@tapkit/contracts';
import { type FileRepository, selectedMaterial, StorageError, newId } from '@tapkit/storage';
import { digest } from './chunking';

/** IDs are scoped to the current run's actual tool outputs, never supplied by the model. */
export class CitationLedger {
  readonly returned = new Map<string, EvidenceRef>();
  private queried = false;
  constructor(
    readonly files: FileRepository,
    readonly authorize: (e: EvidenceRef) => void,
  ) {}
  add(evidence: EvidenceRef[]) {
    this.queried = true;
    for (const e of evidence) this.returned.set(e.id, e);
  }
  async verify(id: string) {
    const e = this.returned.get(id);
    if (!e) throw new StorageError('VALIDATION_ERROR');
    this.authorize(e);
    if (e.ref.kind !== 'file' || !e.ref.locator || e.sourceVersion !== e.ref.versionId)
      throw new StorageError('VALIDATION_ERROR');
    const file = this.files.get(e.ref.fileId, { versionId: e.sourceVersion });
    let doc;
    if (file.version.parserVersion === null) {
      if (
        !/^(txt|md|markdown|csv|tsv|json|log|py|js|ts|tsx|jsx|html|css|yaml|yml|xml|sql)$/.test(
          file.version.extension,
        )
      )
        throw new StorageError('FORMAT_UNSUPPORTED');
      const original = await this.files.original(e.ref.fileId, { versionId: e.sourceVersion });
      const text = new TextDecoder('utf-8', { fatal: true }).decode(original.bytes);
      doc = ParsedDocumentSchema.parse({
        schemaVersion: 1,
        parserVersion: 'legacy-text',
        format: 'text',
        blocks: [
          {
            id: 'legacy',
            kind: 'text',
            text,
            locator: { kind: 'text', start: 0, end: text.length },
          },
        ],
        pages: [],
        sheets: [],
        slides: [],
        entries: [],
        quality: { needsOcr: false, warnings: [] },
      });
    } else doc = await this.files.parsed(e.ref.fileId, { versionId: e.sourceVersion });
    this.authorize(e);
    const selected = selectedMaterial(doc, e.ref.locator, e.ref.selection?.textRange);
    if (selected.hash !== e.hash || selected.text !== e.text || digest(e.text) !== e.hash)
      throw new StorageError('CONFLICT');
    for (const c of e.context) {
      if (c.ref.kind !== 'file' || c.ref.versionId !== e.sourceVersion || !c.ref.locator)
        throw new StorageError('VALIDATION_ERROR');
      if (selectedMaterial(doc, c.ref.locator).hash !== c.hash) throw new StorageError('CONFLICT');
    }
    const row = this.files.store.db
      .prepare(
        'SELECT index_version,text_hash FROM chunks WHERE id=? AND profile_id=? AND file_version_id=?',
      )
      .get(e.chunkId, this.files.store.profileId, e.sourceVersion) as
      { index_version: number; text_hash: string } | undefined;
    if (!row || row.index_version !== e.indexVersion || row.text_hash !== e.hash)
      throw new StorageError('CONFLICT');
    return e;
  }
  async validateAnswer(text: string, messageId?: string, external: ClaimSource[] = []) {
    const evidence = new Map<string, EvidenceRef>();
    for (const marker of text.matchAll(/\[\[evidence:([^\]]+)\]\]/g))
      evidence.set(marker[1]!, await this.verify(marker[1]!));
    const claims = verifySourceClaims(
      text,
      [
        ...external,
        ...[...evidence.values()].map((e) => ({
          key: 'evidence:' + e.id,
          text: [e.text, ...e.context.map((c) => c.text)].join('\n'),
        })),
      ],
      this.queried || external.length > 0,
    );
    const verified = claims
      .filter((claim) => claim.key.startsWith('evidence:'))
      .map((claim) => ({ ...claim, e: evidence.get(claim.key.slice(9))! }));
    if (messageId)
      this.files.store.db.transaction(() => {
        for (const { e, start, end } of verified) {
          this.authorize(e);
          this.files.store.db
            .prepare(
              'INSERT INTO citations(id,profile_id,message_id,file_version_id,chunk_id,locator_json,quote_hash,claim_range_json,evidence_json,verified) VALUES(?,?,?,?,?,?,?,?,?,1)',
            )
            .run(
              newId(),
              this.files.store.profileId,
              messageId,
              e.sourceVersion,
              e.chunkId,
              JSON.stringify(e.ref.kind === 'file' ? e.ref.locator : null),
              e.hash,
              JSON.stringify({ start, end }),
              JSON.stringify(e),
            );
        }
      })();
    return verified.map(({ e }) => e);
  }
}
/** Conservative structured contradictions: same field, different numbers or negations. */
export function markConflicts(evidence: EvidenceRef[]) {
  const claims = new Map<string, { value: string; e: EvidenceRef }[]>();
  for (const e of evidence)
    for (const line of e.text.split(/[\n。；]/)) {
      const m = /^\s*([^：:]{2,40})[：:]\s*(.+)$/.exec(line);
      if (!m || !/\d|不|禁止|允许|是|否/.test(m[2]!)) continue;
      const key = m[1]!.trim().toLowerCase(),
        rows = claims.get(key) ?? [];
      rows.push({ value: m[2]!.trim(), e });
      claims.set(key, rows);
    }
  for (const rows of claims.values())
    if (new Set(rows.map((r) => r.value)).size > 1)
      for (const { e } of rows) e.status = 'conflicting';
  return evidence.some((e) => e.status === 'conflicting');
}
