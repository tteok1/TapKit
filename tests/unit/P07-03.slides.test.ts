import { expect, test } from 'vitest';
import {
  SlideDeckSpecSchema,
  SlideActionSchema,
  WorkToolArgsSchema,
} from '../../packages/contracts/src';
import {
  normalizeSlideDeck,
  renderSlideDeck,
  reviseSlideDeck,
  slideHashes,
} from '../../packages/workflows/src';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';
import { catalogAllowsTool } from '../../packages/tools/src/registry';
import { sampleDeck } from '../fixtures/P07-03.slides';

test('P07-03 schemas preserve catalog compatibility and reject external/executable slide content', () => {
  const spec = sampleDeck();
  expect(SlideDeckSpecSchema.safeParse({ ...spec, url: 'https://example.invalid' }).success).toBe(
    false,
  );
  expect(
    SlideDeckSpecSchema.safeParse({ ...spec, slides: Array(51).fill(spec.slides[0]) }).success,
  ).toBe(false);
  expect(SlideActionSchema.safeParse({ op: 'script', code: 'process.exit()' }).success).toBe(false);
  expect(
    WorkToolArgsSchema.safeParse({ tool: 'slides.create', name: 'a.pptx', spec }).success,
  ).toBe(true);
  for (const version of ['p06-tools-1', 'p07-tools-1', 'p07-tools-2'])
    expect(catalogAllowsTool(version, 'slides.create')).toBe(false);
  expect(catalogAllowsTool('p07-tools-2', 'data.analyze')).toBe(true);
  expect(catalogAllowsTool('p07-tools-3', 'slides.revise')).toBe(true);
});
test('P07-03 local replacement preserves unrelated slide hashes and old source; structural operations use stable IDs', () => {
  const spec = sampleDeck(),
    before = JSON.stringify(spec),
    hashes = slideHashes(spec);
  const updated = reviseSlideDeck(spec, [
    { op: 'replace', slideId: 'page-2', slide: { ...spec.slides[1]!, title: '局部更新' } },
  ]);
  const after = slideHashes(updated);
  expect(after['page-2']).not.toBe(hashes['page-2']);
  for (const s of spec.slides.filter((s) => s.id !== 'page-2'))
    expect(after[s.id]).toBe(hashes[s.id]);
  expect(JSON.stringify(spec)).toBe(before);
  const reordered = reviseSlideDeck(spec, [
    { op: 'duplicate', slideId: 'page-2', newId: 'copy' },
    { op: 'move', slideId: 'copy', index: 0 },
    { op: 'delete', slideId: 'page-3' },
    { op: 'insert', index: 1, slide: { ...spec.slides[0]!, id: 'insert' } },
  ]);
  expect(reordered.slides.slice(0, 2).map((s) => s.id)).toEqual(['copy', 'insert']);
  expect(reordered.slides.some((s) => s.id === 'page-3')).toBe(false);
});
test('P07-03 overflow splits pages and retains numbers instead of shrinking text', () => {
  const spec = sampleDeck();
  spec.slides = [
    { ...spec.slides[0]!, bullets: Array(12).fill('关键数字123.45；' + '中文内容'.repeat(30)) },
  ];
  const result = normalizeSlideDeck(spec);
  expect(result.slides.length).toBeGreaterThan(1);
  expect(result.slides.every((s) => s.title.length <= 60)).toBe(true);
  expect(JSON.stringify(result)).toContain('123.45');
  expect(normalizeSlideDeck(result)).toEqual(result);
  const boundary = normalizeSlideDeck({
    ...spec,
    slides: [{ ...spec.slides[0], bullets: ['中'.repeat(128) + '123.45'] }],
  });
  expect(JSON.stringify(boundary)).toContain('123.45');
});
for (const [theme, ratio] of [
  ['light_business', '16:9'],
  ['dark_presentation', '16:9'],
  ['light_business', '4:3'],
] as const) {
  test('P07-03 editable ten-page PPTX with notes ' + theme + ' ' + ratio, async () => {
    const draft = await renderSlideDeck(sampleDeck(theme, ratio));
    const parsed = await parseOfficeFile(draft.bytes, 'pptx');
    expect(parsed.slides).toHaveLength(10);
    expect(parsed.blocks.some((b) => b.kind === 'paragraph' && b.text.includes('123.45'))).toBe(
      true,
    );
    expect(parsed.slides.every((s) => s.notes.includes('讲者备注'))).toBe(true);
    expect(parsed.blocks.some((b) => b.kind === 'table' && b.text.includes('0.70'))).toBe(true);
  });
}
