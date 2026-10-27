import { StorageError } from '@tapkit/storage';
export type ClaimSource = { key: string; text: string };
export function verifySourceClaims(text: string, sources: ClaimSource[], required: boolean) {
  const matches = [...text.matchAll(/\[\[(evidence|web):([^\]]+)\]\]/g)];
  if (
    matches.filter((m) => m[1] === 'evidence').length > 20 ||
    matches.filter((m) => m[1] === 'web').length > 16
  )
    throw new StorageError('OUTPUT_LIMIT_REACHED');
  if ((text.match(/\[\[(?:evidence|web):/g) ?? []).length !== matches.length)
    throw new StorageError('VALIDATION_ERROR');
  const indexed = new Map(sources.map((s) => [s.key, s.text]));
  const claims = matches.map((m) => {
    const key = m[1] + ':' + m[2],
      source = indexed.get(key);
    if (source === undefined) throw new StorageError('VALIDATION_ERROR');
    const before = text.slice(0, m.index!).replace(/[。；\s]+$/, '');
    const start =
      Math.max(before.lastIndexOf('。'), before.lastIndexOf('\n'), before.lastIndexOf('；')) + 1;
    if (
      !text
        .slice(start, m.index!)
        .replace(/\[\[(?:evidence|web):[^\]]+\]\]/g, '')
        .trim()
    )
      throw new StorageError('VALIDATION_ERROR');
    return { key, start, end: m.index!, markerEnd: m.index! + m[0].length, source };
  });
  for (const start of new Set(claims.map((c) => c.start))) {
    const group = claims.filter((c) => c.start === start),
      source = group.map((c) => c.source).join('\n');
    const claim = text
      .slice(start, Math.max(...group.map((c) => c.end)))
      .replace(/\[\[(?:evidence|web):[^\]]+\]\]/g, '');
    const sourceNumbers = new Set(source.match(/\d+(?:\.\d+)?/g) ?? []);
    if (
      (claim.match(/\d+(?:\.\d+)?/g) ?? []).some((n) => !sourceNumbers.has(n)) ||
      [...claim.matchAll(/[“「]([^”」]+)[”」]/g)].some((m) => !source.includes(m[1]!))
    )
      throw new StorageError('VALIDATION_ERROR');
  }
  if (required) {
    let end = 0;
    const gaps: string[] = [];
    for (const c of claims) {
      gaps.push(text.slice(end, Math.max(end, c.start)));
      end = c.markerEnd;
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
          /^(?:根据(?:当前|现有|所选)?(?:资料|证据)[，,:：]?\s*)?(?:当前|现有|所选|目前)?(?:资料不足|无法支持|无法确定|无法读取|未找到|没有依据|没有证据|无证据|无依据|资料已过期)/.test(
            sentence,
          )
        )
          continue;
        throw new StorageError('VALIDATION_ERROR');
      }
  }
  return claims;
}
