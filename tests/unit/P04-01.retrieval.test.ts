import { expect, test } from 'vitest';
import { emptyDocument } from '../../packages/retrieval/src/ingest/text';
import {
  tokenWindows,
  weightedWindows,
  textSlices,
  chunkDocument,
  cosine,
  markConflicts,
} from '../../packages/retrieval/src';
import { selectedMaterial } from '../../packages/storage/src';
import type { EvidenceRef } from '../../packages/contracts/src';

test('P04-01 windows cover every token once in weights and preserve the final 384+64 tail', () => {
  const ids = Array.from({ length: 1307 }, (_, i) => i),
    windows = tokenWindows(ids, 384);
  expect(windows.map((w) => w.start)).toEqual([0, 320, 640, 960]);
  expect(windows.at(-1)!.ids.at(-1)).toBe(1306);
  expect(windows.reduce((n, w) => n + w.weight, 0)).toBe(1307);
  expect(
    weightedWindows(
      [
        { vector: new Float32Array([1, 0]), weight: 3 },
        { vector: new Float32Array([0, 1]), weight: 4 },
      ],
      2,
    ),
  ).toEqual(new Float32Array([0.6, 0.8]));
  expect(() => weightedWindows([{ vector: new Float32Array([NaN, 0]), weight: 1 }], 2)).toThrow();
  expect(() => cosine(new Float32Array(2), new Float32Array(3))).toThrow();
});
test('P04-01 structure slices keep original UTF16, headings, table units and neighbors', () => {
  const doc = emptyDocument('markdown');
  const heading = '退款说明',
    body = '退款期限为七天。'.repeat(230) + '😀最后一段不可丢失';
  doc.blocks = [
    {
      id: 'h',
      kind: 'heading',
      text: heading,
      level: 1,
      locator: { kind: 'text', start: 0, end: heading.length },
    },
    {
      id: 'p',
      kind: 'paragraph',
      text: body,
      locator: { kind: 'text', start: heading.length + 1, end: heading.length + 1 + body.length },
    },
  ];
  const chunks = chunkDocument(doc, (s) => [...s].length);
  expect(chunks.length).toBeGreaterThan(3);
  expect(chunks.at(-1)!.text).toContain('最后一段不可丢失');
  for (const c of chunks) {
    expect(selectedMaterial(doc, c.locator, c.range ?? undefined).hash).toBe(c.hash);
    expect(c.tokens).toBeLessThanOrEqual(800);
  }
  expect(chunks[1]!.parent).toBe(0);
  expect(chunks[1]!.previous).toBe(0);
  expect(chunks[1]!.context[0]!.text).toBe(heading);
  const slices = textSlices(body, (s) => [...s].length);
  expect(slices[1]!.start).toBeLessThan(slices[0]!.end);
  expect(slices.at(-1)!.end).toBe(body.length);
});
test('P04-01 structured contradictory facts preserve both evidence IDs', () => {
  const a = { id: 'a', text: '退款期限：7天', status: 'supported' } as EvidenceRef,
    b = { id: 'b', text: '退款期限：30天', status: 'supported' } as EvidenceRef;
  expect(markConflicts([a, b])).toBe(true);
  expect([a.status, b.status]).toEqual(['conflicting', 'conflicting']);
});
