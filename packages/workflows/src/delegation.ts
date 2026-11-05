import { createHash } from 'node:crypto';
import { DelegateResultSchema, z, type DelegateResult } from '@tapkit/contracts';

export const DelegateSelectionSchema = z.strictObject({
  conclusion: z.string().trim().min(1).max(4000),
  evidenceIds: z.array(z.string().regex(/^e_[a-f0-9]{16}$/)).max(8),
  actions: z.array(z.string().max(500)).max(8),
  uncertainty: z.array(z.string().min(1).max(500)).max(8),
  incomplete: z.boolean(),
});
export function delegateEvidence(sources: readonly { text: string }[]) {
  const rows: { id: string; inputIndex: number; start: number; end: number; quote: string }[] = [];
  for (const [inputIndex, source] of sources.entries()) {
    for (const match of source.text.matchAll(/[^\n。！？.!?]+[。！？.!?]?/gu)) {
      const leading = match[0].length - match[0].trimStart().length,
        start = match.index + leading;
      const quote = match[0].trim();
      if (!quote || quote.length > 2000) continue;
      rows.push({
        id:
          'e_' +
          createHash('sha256')
            .update(JSON.stringify({ inputIndex, start, quote }))
            .digest('hex')
            .slice(0, 16),
        inputIndex,
        start,
        end: start + quote.length,
        quote,
      });
      if (rows.filter((r) => r.inputIndex === inputIndex).length >= 12) break;
    }
  }
  return rows;
}
export function selectedDelegateResult(
  raw: unknown,
  catalog: ReturnType<typeof delegateEvidence>,
): DelegateResult {
  const value = DelegateSelectionSchema.parse(raw),
    evidence = [...new Set(value.evidenceIds)].map((id) => {
      const found = catalog.find((r) => r.id === id);
      if (!found) throw Error('VALIDATION_ERROR');
      const { id: _id, ...row } = found;
      return row;
    });
  return DelegateResultSchema.parse({
    conclusion: value.conclusion,
    evidence,
    artifacts: [],
    actions: value.actions,
    uncertainty: value.uncertainty,
    incomplete: value.incomplete,
  });
}
