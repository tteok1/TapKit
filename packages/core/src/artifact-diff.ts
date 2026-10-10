import { StorageError, documentText } from '@tapkit/storage';
import type { ParsedDocument } from '@tapkit/contracts';
export type DiffLine = {
  kind: 'equal' | 'removed' | 'added';
  text: string;
  oldLine: number | null;
  newLine: number | null;
};
function lines(doc: ParsedDocument) {
  if (!['code', 'text', 'markdown'].includes(doc.format))
    throw new StorageError('FORMAT_UNSUPPORTED');
  if (doc.blocks.reduce((n, b) => n + b.text.length + 1, 0) > 5_000_000)
    throw new StorageError('OUTPUT_LIMIT_REACHED');
  const result = documentText(doc).split('\n');
  if (result.length > 200000) throw new StorageError('OUTPUT_LIMIT_REACHED');
  return result;
}
/** A bounded exact edit sequence. Large changed regions are replaced wholesale;
 * unchanged prefixes/suffixes remain context and never become invented matches. */
export function artifactDiff(old: ParsedDocument, current: ParsedDocument) {
  const a = lines(old),
    b = lines(current),
    out: DiffLine[] = [];
  let begin = 0,
    tail = 0;
  const push = (kind: DiffLine['kind'], x: number | null, y: number | null) =>
    out.push({
      kind,
      text: (x === null ? b[y!] : a[x])!,
      oldLine: x === null ? null : x + 1,
      newLine: y === null ? null : y + 1,
    });
  while (begin < Math.min(a.length, b.length) && a[begin] === b[begin]) {
    push('equal', begin, begin);
    begin++;
  }
  while (
    tail < Math.min(a.length, b.length) - begin &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail++;
  const n = a.length - tail - begin,
    m = b.length - tail - begin;
  if (n * m <= 1_000_000) {
    const table = new Uint32Array((n + 1) * (m + 1)),
      width = m + 1;
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        table[i * width + j] =
          a[begin + i] === b[begin + j]
            ? 1 + table[(i + 1) * width + j + 1]!
            : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    let i = 0,
      j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[begin + i] === b[begin + j]) {
        push('equal', begin + i++, begin + j++);
      } else if (i < n && (j === m || table[(i + 1) * width + j]! >= table[i * width + j + 1]!))
        push('removed', begin + i++, null);
      else push('added', null, begin + j++);
    }
  } else {
    for (let i = begin; i < a.length - tail; i++) push('removed', i, null);
    for (let j = begin; j < b.length - tail; j++) push('added', null, j);
  }
  for (let i = tail; i > 0; i--) push('equal', a.length - i, b.length - i);
  return out;
}
