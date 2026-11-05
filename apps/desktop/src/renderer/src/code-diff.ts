export type CodeLine = { number: number; text: string };
export type CodeDiffRow = { left: CodeLine | null; right: CodeLine | null; changed: boolean };
type Op = { side: 'equal' | 'left' | 'right'; left?: CodeLine; right?: CodeLine };

/** Patience anchors plus bounded LCS gaps. Missing sides never invent source lines.
 * Extremely large anchorless gaps remain a valid replace hunk, without quadratic allocation. */
export function codeLineDiff(before: string | null, after: string | null): CodeDiffRow[] {
  const a = before === null ? [] : before.split('\n'),
    b = after === null ? [] : after.split('\n');
  const ops: Op[] = [];
  const left = (i: number): CodeLine => ({ number: i + 1, text: a[i]! });
  const right = (i: number): CodeLine => ({ number: i + 1, text: b[i]! });
  const equal = (i: number, j: number) =>
    ops.push({ side: 'equal', left: left(i), right: right(j) });
  function compare(x: number, endX: number, y: number, endY: number, depth = 0) {
    while (x < endX && y < endY && a[x] === b[y]) equal(x++, y++);
    let tail = 0;
    while (x < endX - tail && y < endY - tail && a[endX - 1 - tail] === b[endY - 1 - tail]) tail++;
    const ax = endX - tail,
      by = endY - tail,
      n = ax - x,
      m = by - y;
    if (n && m && n * m <= 1_000_000) {
      const width = m + 1,
        dp = new Uint32Array((n + 1) * width);
      for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--)
          dp[i * width + j] =
            a[x + i] === b[y + j]
              ? 1 + dp[(i + 1) * width + j + 1]!
              : Math.max(dp[(i + 1) * width + j]!, dp[i * width + j + 1]!);
      let i = 0,
        j = 0;
      while (i < n || j < m) {
        if (i < n && j < m && a[x + i] === b[y + j]) equal(x + i++, y + j++);
        else if (i < n && (j === m || dp[(i + 1) * width + j]! >= dp[i * width + j + 1]!))
          ops.push({ side: 'left', left: left(x + i++) });
        else ops.push({ side: 'right', right: right(y + j++) });
      }
    } else if (n && m && depth < 64) {
      const indexes = (values: string[], start: number, end: number) => {
        const map = new Map<string, number>();
        for (let i = start; i < end; i++) map.set(values[i]!, map.has(values[i]!) ? -1 : i);
        return map;
      };
      const ia = indexes(a, x, ax),
        ib = indexes(b, y, by),
        pairs: [number, number][] = [];
      for (const [text, i] of ia) {
        const j = ib.get(text);
        if (i >= 0 && j !== undefined && j >= 0) pairs.push([i, j]);
      }
      const tails: number[] = [],
        previous = new Int32Array(pairs.length).fill(-1);
      for (let i = 0; i < pairs.length; i++) {
        let lo = 0,
          hi = tails.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (pairs[tails[mid]!]![1] < pairs[i]![1]) lo = mid + 1;
          else hi = mid;
        }
        if (lo) previous[i] = tails[lo - 1]!;
        tails[lo] = i;
      }
      const anchors: [number, number][] = [];
      for (let at = tails.at(-1) ?? -1; at >= 0; at = previous[at]!) anchors.push(pairs[at]!);
      anchors.reverse();
      if (anchors.length) {
        let i = x,
          j = y;
        for (const [nextI, nextJ] of anchors) {
          compare(i, nextI, j, nextJ, depth + 1);
          equal(nextI, nextJ);
          i = nextI + 1;
          j = nextJ + 1;
        }
        compare(i, ax, j, by, depth + 1);
      } else {
        for (let i = x; i < ax; i++) ops.push({ side: 'left', left: left(i) });
        for (let j = y; j < by; j++) ops.push({ side: 'right', right: right(j) });
      }
    } else {
      for (let i = x; i < ax; i++) ops.push({ side: 'left', left: left(i) });
      for (let j = y; j < by; j++) ops.push({ side: 'right', right: right(j) });
    }
    for (let i = 0; i < tail; i++) equal(ax + i, by + i);
  }
  compare(0, a.length, 0, b.length);
  const rows: CodeDiffRow[] = [],
    deleted: CodeLine[] = [],
    inserted: CodeLine[] = [];
  const flush = () => {
    for (let i = 0; i < Math.max(deleted.length, inserted.length); i++)
      rows.push({ left: deleted[i] ?? null, right: inserted[i] ?? null, changed: true });
    deleted.length = 0;
    inserted.length = 0;
  };
  for (const op of ops) {
    if (op.side === 'equal') {
      flush();
      rows.push({ left: op.left!, right: op.right!, changed: false });
    } else if (op.side === 'left') deleted.push(op.left!);
    else inserted.push(op.right!);
  }
  flush();
  return rows;
}
