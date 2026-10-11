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
  async validateAnswer(text: string, messageId?: string) {
    const matches = [...text.matchAll(/\[\[evidence:([^\]]+)\]\]/g)];
    if (
      this.queried &&
      !matches.length &&
      !/资料不足|无法支持|无法确定|未找到|没有依据|没有证据|无证据|无依据|资料已过期/.test(text)
    )
      throw new StorageError('VALIDATION_ERROR');
    const verified: { e: EvidenceRef; start: number; end: number; markerEnd: number }[] = [];
    if (matches.length > 20) throw new StorageError('OUTPUT_LIMIT_REACHED');
    for (const m of matches) {
      const before = text.slice(0, m.index!).replace(/[。；\s]+$/, '');
      const start =
        Math.max(before.lastIndexOf('。'), before.lastIndexOf('\n'), before.lastIndexOf('；')) + 1;
      if (!text.slice(start, m.index!).trim()) throw new StorageError('VALIDATION_ERROR');
      const e = await this.verify(m[1]!);
      verified.push({ e, start, end: m.index!, markerEnd: m.index! + m[0].length });
    }
    for (const start of new Set(verified.map((claim) => claim.start))) {
      // Multiple actual sources can jointly support a comparison or conflicting values.
      const group = verified.filter((claim) => claim.start === start);
      const source = group.flatMap(({ e }) => [e.text, ...e.context.map((c) => c.text)]).join('\n');
      const claim = text
        .slice(start, Math.max(...group.map((item) => item.end)))
        .replace(/\[\[evidence:[^\]]+\]\]/g, '');
      // Deterministic support checks catch invented values or quotations even with a known ID.
      const numbers = claim.match(/\d+(?:\.\d+)?/g) ?? [];
      const sourceNumbers = new Set(source.match(/\d+(?:\.\d+)?/g) ?? []);
      const quotations = [...claim.matchAll(/[“「]([^”」]+)[”」]/g)].map((q) => q[1]!);
      if (numbers.some((n) => !sourceNumbers.has(n)) || quotations.some((q) => !source.includes(q)))
        throw new StorageError('VALIDATION_ERROR');
    }
    // Reject alternate forged marker spellings instead of silently treating them as sources.
    if ((text.match(/\[\[evidence:/g) ?? []).length !== matches.length)
      throw new StorageError('VALIDATION_ERROR');
    if (this.queried) {
      // A valid marker cannot make other unreferenced conclusions count as verified.
      let end = 0;
      const gaps: string[] = [];
      for (const claim of verified) {
        gaps.push(text.slice(end, Math.max(end, claim.start)));
        end = claim.markerEnd;
      }
      gaps.push(text.slice(end));
      for (const gap of gaps)
        for (const raw of gap.split(/[。；\n!?！？]/)) {
          const sentence = raw.trim();
          if (
            !sentence ||
            /^[\s*_#>\-:：]+$/.test(sentence) ||
            /^#{1,6}\s+[^\d]{1,40}$/.test(sentence) ||
            /^[^\d。；]{1,40}[：:]$/.test(sentence) ||
            /^(?:根据(?:当前|现有|所选)?(?:资料|证据)[，,:：]?\s*)?(?:当前|现有|所选|目前)?(?:资料不足|无法支持|无法确定|未找到|没有依据|没有证据|无证据|无依据|资料已过期)/.test(
              sentence,
            )
          )
            continue;
          throw new StorageError('VALIDATION_ERROR');
        }
    }
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
