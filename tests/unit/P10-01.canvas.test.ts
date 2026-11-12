import { expect, test } from 'vitest';
import { CanvasContentSchema, type CanvasView } from '../../packages/contracts/src';
import {
  canvasFromMarkdown,
  canvasText,
  reanchorCanvasThreads,
  renderCanvasMarkdown,
} from '../../packages/workflows/src';
import {
  applyCanvasEdit,
  canvasTextHash,
  editTargets,
  parseCanvasEdits,
  parseCanvasStructure,
  structureTargets,
} from '../../packages/core/src/canvas/edits';

const makeId = () => {
  let n = 0;
  return () => '019953fa-0000-7000-8000-' + String(++n).padStart(12, '0');
};
function canvas(markdown: string): CanvasView {
  const id = makeId();
  return {
    documentId: id(),
    versionId: id(),
    revision: 1,
    createdAt: 0,
    title: '画布',
    threads: [],
    source: { kind: 'blank' },
    content: canvasFromMarkdown(markdown, id),
  };
}

test('P10-01 replaces only the verified range and preserves surrounding marks and blocks', () => {
  const view = canvas('**保留** 修改原文 [链接](https://example.test)\n\n末段');
  const block = view.content.content[0]!;
  const from = canvasText(block).indexOf('修改原文');
  const target = editTargets(view, {
    blockId: String(block.attrs!.blockId),
    from,
    to: from + 4,
    textHash: canvasTextHash('修改原文'),
  });
  const edit = parseCanvasEdits(
    JSON.stringify([{ index: 0, replacement: '新文', explanation: '局部' }]),
    target,
  )[0]!;
  const updated = applyCanvasEdit(view, edit);
  expect(canvasText(updated.content[0]!)).toBe('保留 新文 链接');
  expect(updated.content[0]!.content?.[0]).toEqual(block.content?.[0]);
  expect(updated.content[0]!.content?.at(-1)).toEqual(block.content?.at(-1));
  expect(updated.content[1]).toEqual(view.content.content[1]);
  expect(() => applyCanvasEdit(view, { ...edit, from: from - 1 })).toThrow('CONFLICT');
  expect(() =>
    parseCanvasEdits('[{"index":1,"replacement":"误改","explanation":""}]', target),
  ).toThrow('VALIDATION_ERROR');
});

test('P10-01 moves comment anchors for surrounding edits and invalidates edited or ambiguous quotes', () => {
  const first = canvas('前句 选中文字 后句');
  const blockId = String(first.content.content[0]!.attrs!.blockId);
  const anchor = { blockId, from: 3, to: 7, textHash: canvasTextHash('选中文字') };
  const comment = {
    id: first.documentId,
    author: 'local' as const,
    anchor,
    quote: '选中文字',
    text: '说明',
    replies: [],
    resolved: false,
    stale: false,
    createdAt: 0,
  };
  const next = structuredClone(first.content);
  next.content[0]!.content![0]!.text = '插入前句 选中文字 后句';
  const moved = reanchorCanvasThreads(first.content, next, [comment])[0]!;
  expect(moved.anchor.from).toBe(5);
  expect(moved.stale).toBe(false);
  next.content[0]!.content![0]!.text = '前句 改掉了 后句';
  expect(reanchorCanvasThreads(first.content, next, [comment])[0]!.stale).toBe(true);
});

test('P10-01 rejects arbitrary markup and preserves structured Markdown and safe links', async () => {
  const view = canvas(
    '## 标题\n\n1. 项目\n\n| 名称 | 值 |\n|---|---|\n| 中文 | 42 |\n\n[链接](https://example.test) [风险](javascript:alert(1))',
  );
  expect(view.content.content.map(({ type }) => type)).toEqual([
    'heading',
    'orderedList',
    'table',
    'paragraph',
  ]);
  const markdown = await renderCanvasMarkdown(view, async () => {
    throw Error('unexpected image');
  });
  expect(markdown).toContain('1. 项目');
  expect(markdown).toContain('| 中文 | 42 |');
  expect(markdown).toContain('[链接](<https://example.test>)');
  expect(markdown).not.toContain('javascript:');
  const invalid = structuredClone(view.content);
  invalid.content[0]!.attrs!.onload = 'alert(1)';
  expect(CanvasContentSchema.safeParse(invalid).success).toBe(false);
  const corrupted = {
    type: 'doc',
    content: [{ type: 'bulletList', attrs: { blockId: view.documentId }, content: [null] }],
  };
  expect(CanvasContentSchema.safeParse(corrupted).success).toBe(false);
});

test('P10-01 whole structure changes keep each stable block exactly once', () => {
  const view = canvas('## 甲\n\n乙\n\n丙');
  const blocks = structureTargets(view);
  const edits = parseCanvasStructure('{"order":[2,0,1],"explanation":"先列结论"}', view, blocks);
  expect(applyCanvasEdit(view, edits[0]!).content).toEqual([
    view.content.content[2],
    view.content.content[0],
    view.content.content[1],
  ]);
  expect(() => parseCanvasStructure('{"order":[1,1,2],"explanation":""}', view, blocks)).toThrow(
    'VALIDATION_ERROR',
  );
});
