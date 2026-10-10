import { createHash } from 'node:crypto';
import type { Locator, ParsedDocument } from '@tapkit/contracts';
import { selectedMaterial, locatedText, sheetRange } from '@tapkit/storage';
import type { Embedder } from './embedding';

export const CHUNK_POLICY = 'structure800-overlap120-v1';
export const digest = (text: string) => createHash('sha256').update(text).digest('hex');
export type ContextPart = { text: string; locator: Locator; hash: string };
export type Chunk = {
  kind: ParsedDocument['blocks'][number]['kind'];
  ordinal: number;
  parent: number | null;
  previous: number | null;
  next: number | null;
  text: string;
  locator: Locator;
  range: { start: number; end: number } | null;
  hash: string;
  tokens: number;
  context: ContextPart[];
};
/** Boundaries use the actual locked tokenizer and UTF-16 source offsets. */
export function textSlices(text: string, count: Embedder['count'], target = 800, overlap = 120) {
  const slices: { start: number; end: number }[] = [];
  const boundary = (at: number) => (at > 0 && /[\uDC00-\uDFFF]/.test(text[at] ?? '') ? at - 1 : at);
  let start = 0;
  while (start < text.length) {
    let lo = start + 1,
      hi = Math.min(text.length, start + 16000);
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (count(text.slice(start, mid)) <= target) lo = mid;
      else hi = mid - 1;
    }
    let end = boundary(lo);
    if (end <= start) end = start + (text.codePointAt(start)! > 65535 ? 2 : 1);
    // Prefer whole rows, sentences and symbols; retain bounded overlap for long structures.
    if (end < text.length) {
      const tail = text.slice(start, end),
        at = Math.max(tail.lastIndexOf('\n'), tail.lastIndexOf('。'));
      if (at > tail.length * 0.65) end = start + at + 1;
    }
    slices.push({ start, end });
    if (end === text.length) break;
    lo = start + 1;
    hi = end;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (count(text.slice(mid, end)) > overlap) lo = mid + 1;
      else hi = mid;
    }
    start = Math.max(start + 1, boundary(lo));
  }
  return slices;
}
export function chunkDocument(doc: ParsedDocument, count: Embedder['count']): Chunk[] {
  const chunks: Chunk[] = [],
    seen = new Set<string>();
  let parent: number | null = null,
    heading: ContextPart | undefined;
  const headers = new Map<string, ContextPart>();
  const blocks = doc.blocks.map((b) => ({ ...b, locator: { ...b.locator } }));
  for (let at = 0; at < blocks.length; at++) {
    const block = blocks[at]!,
      locator: Locator = block.locator;
    // Consecutive sheet rows keep their header/units as context and group to the chunk budget.
    if (locator.kind === 'sheet') {
      const first = selectedMaterial(doc, locator);
      if (!headers.has(locator.sheetId))
        headers.set(locator.sheetId, { ...first, locator: { ...locator } });
      let combined = first.text;
      while (at + 1 < blocks.length) {
        const next = blocks[at + 1]!.locator;
        if (next.kind !== 'sheet' || next.sheetId !== locator.sheetId) break;
        const currentRange = sheetRange(locator.range),
          nextRange = sheetRange(next.range);
        if (
          nextRange.start.row !== currentRange.end.row + 1 ||
          nextRange.start.column !== currentRange.start.column ||
          nextRange.end.column !== currentRange.end.column
        )
          break;
        const candidate = combined + '\t' + selectedMaterial(doc, next).text;
        if (count(candidate) > 800) break;
        locator.range =
          locator.range.split(':')[0] + ':' + (next.range.split(':')[1] ?? next.range);
        combined = candidate;
        at++;
      }
    } else if (locator.kind === 'code') {
      while (at + 1 < blocks.length) {
        const next = blocks[at + 1]!;
        if (
          next.locator.kind !== 'code' ||
          next.locator.path !== locator.path ||
          next.locator.lineStart !== locator.lineEnd + 1 ||
          /^\s*(?:export\s+)?(?:async\s+)?(?:function|class|def)\s/.test(next.text)
        )
          break;
        const combined = { ...locator, lineEnd: next.locator.lineEnd };
        if (count(locatedText(doc, combined)) > 800) break;
        locator.lineEnd = next.locator.lineEnd;
        at++;
      }
    } else if (
      locator.kind === 'text' &&
      !locator.paragraphId &&
      block.kind !== 'heading' &&
      block.kind !== 'table'
    ) {
      // Keep nearby paragraphs together until the next structural boundary.
      while (at + 1 < blocks.length) {
        const next = blocks[at + 1]!;
        if (
          next.locator.kind !== 'text' ||
          next.locator.paragraphId ||
          ['heading', 'table'].includes(next.kind) ||
          next.locator.start !== locator.end + 1
        )
          break;
        if (count(selectedMaterial(doc, { ...locator, end: next.locator.end }).text) > 800) break;
        locator.end = next.locator.end;
        at++;
      }
    }
    const key = JSON.stringify(locator);
    if (seen.has(key)) continue;
    seen.add(key);
    const source = locatedText(doc, locator);
    if (!source.trim()) continue;
    const context: ContextPart[] = heading ? [heading] : [];
    const header = locator.kind === 'sheet' ? headers.get(locator.sheetId) : undefined;
    if (header && JSON.stringify(header.locator) !== key) context.push(header);
    if (block.kind === 'table' && locator.kind === 'text') {
      const firstEnd = source.indexOf('\n');
      if (firstEnd > 0) {
        const headLocator = { ...locator, end: locator.start + firstEnd };
        const headText = selectedMaterial(doc, headLocator).text;
        context.push({ text: headText, locator: headLocator, hash: digest(headText) });
      }
    }
    for (const slice of textSlices(source, count)) {
      let pieceLocator = locator,
        range: Chunk['range'] = slice;
      if (locator.kind === 'text') {
        pieceLocator = {
          ...locator,
          start: locator.start + slice.start,
          end: locator.start + slice.end,
        };
        range = null;
      }
      const text = source.slice(slice.start, slice.end),
        ordinal = chunks.length;
      chunks.push({
        kind: block.kind,
        ordinal,
        parent,
        previous: ordinal ? ordinal - 1 : null,
        next: null,
        text,
        locator: pieceLocator,
        range,
        hash: digest(text),
        tokens: count(text),
        context: [...context],
      });
    }
    if (block.kind === 'heading') {
      parent = chunks.length - 1;
      heading = { text: source, locator, hash: digest(source) };
    }
  }
  for (const c of chunks) c.next = c.ordinal + 1 < chunks.length ? c.ordinal + 1 : null;
  return chunks;
}
