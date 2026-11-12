import { createHash } from 'node:crypto';
import {
  CanvasEditSchema,
  type CanvasEdit,
  type CanvasNode,
  type CanvasRange,
  type CanvasView,
  z,
} from '@tapkit/contracts';
import { StorageError } from '@tapkit/storage';
import { canvasBlocks, canvasText } from '@tapkit/workflows';

const textBlock = (node?: CanvasNode) =>
  node && ['paragraph', 'heading', 'codeBlock'].includes(node.type) ? node : undefined;
export const canvasTextHash = (text: string) => createHash('sha256').update(text).digest('hex');

export function rangeText(view: CanvasView, range: CanvasRange) {
  const block = textBlock(canvasBlocks(view.content).get(range.blockId));
  if (!block) throw new StorageError('CONFLICT');
  const text = canvasText(block);
  const before = text.slice(range.from, range.to);
  if (range.from >= range.to || range.to > text.length || canvasTextHash(before) !== range.textHash)
    throw new StorageError('CONFLICT');
  return before;
}

export function editTargets(view: CanvasView, selection?: CanvasRange) {
  if (selection) return [{ ...selection, before: rangeText(view, selection) }];
  const entries = [...canvasBlocks(view.content)].flatMap(([blockId, block]) => {
    if (!textBlock(block)) return [];
    const before = canvasText(block);
    return before.trim()
      ? [{ blockId, from: 0, to: before.length, before, textHash: canvasTextHash(before) }]
      : [];
  });
  if (
    !entries.length ||
    entries.length > 100 ||
    entries.reduce((n, item) => n + item.to, 0) > 14_000
  )
    throw new StorageError('OUTPUT_LIMIT_REACHED');
  return entries;
}

const modelEdit = z.strictObject({
  index: z.number().int().nonnegative(),
  replacement: z.string().max(24_000),
  explanation: z.string().max(800),
});
export function parseCanvasEdits(raw: string, targets: ReturnType<typeof editTargets>) {
  const parsed = z
    .array(modelEdit)
    .min(1)
    .max(targets.length)
    .parse(JSON.parse(raw.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi, '')));
  const seen = new Set<number>();
  return parsed.flatMap(({ index, replacement, explanation }) => {
    const target = targets[index];
    if (!target || seen.has(index)) throw new StorageError('VALIDATION_ERROR');
    seen.add(index);
    return replacement === target.before
      ? []
      : [CanvasEditSchema.parse({ ...target, replacement, explanation })];
  });
}

export function structureTargets(view: CanvasView) {
  const blocks = view.content.content.map((node) => ({
    id: String(node.attrs?.blockId),
    text: node.type === 'image' ? String(node.attrs?.alt || '图片') : canvasText(node),
    type: node.type,
  }));
  if (
    blocks.length < 2 ||
    blocks.length > 100 ||
    blocks.reduce((n, block) => n + block.text.length, 0) > 14_000
  )
    throw new StorageError('OUTPUT_LIMIT_REACHED');
  return blocks;
}

export function parseCanvasStructure(
  raw: string,
  view: CanvasView,
  blocks: ReturnType<typeof structureTargets>,
) {
  const { order, explanation } = z
    .strictObject({
      order: z
        .array(
          z
            .number()
            .int()
            .min(0)
            .max(blocks.length - 1),
        )
        .length(blocks.length),
      explanation: z.string().max(800),
    })
    .parse(JSON.parse(raw.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi, '')));
  if (new Set(order).size !== blocks.length) throw new StorageError('VALIDATION_ERROR');
  if (order.every((index, position) => index === position)) return [];
  const outline = (indices: number[]) =>
    indices
      .map(
        (index) =>
          String(index + 1) + '. ' + (blocks[index]!.text.trim().slice(0, 120) || '空白段落'),
      )
      .join('\n');
  const before = outline(blocks.map((_, index) => index));
  return [
    CanvasEditSchema.parse({
      blockId: view.documentId,
      from: 0,
      to: before.length,
      textHash: canvasTextHash(before),
      before,
      replacement: outline(order),
      explanation,
      order: order.map((index) => blocks[index]!.id),
    }),
  ];
}

function sliceInline(nodes: CanvasNode[], start: number, end: number): CanvasNode[] {
  let offset = 0;
  return nodes.flatMap((node) => {
    const value = canvasText(node);
    const from = Math.max(0, start - offset);
    const to = Math.min(value.length, end - offset);
    offset += value.length;
    return from < to
      ? [node.type === 'hardBreak' ? node : { ...node, text: value.slice(from, to) }]
      : [];
  });
}

/** Replace only the verified UTF-16 range. Keep every surrounding node and mark. */
export function applyCanvasEdit(view: CanvasView, edit: CanvasEdit) {
  if (edit.order) {
    const blocks = new Map(view.content.content.map((node) => [node.attrs?.blockId, node]));
    if (
      edit.order.length !== blocks.size ||
      new Set(edit.order).size !== blocks.size ||
      edit.order.some((id) => !blocks.has(id))
    )
      throw new StorageError('CONFLICT');
    return { ...view.content, content: edit.order.map((id) => blocks.get(id)!) };
  }
  rangeText(view, edit);
  const content = structuredClone(view.content);
  const block = canvasBlocks(content).get(edit.blockId)!;
  const inline = block.content ?? [];
  const replacement: CanvasNode[] =
    block.type === 'codeBlock'
      ? edit.replacement
        ? [{ type: 'text', text: edit.replacement }]
        : []
      : edit.replacement
          .split('\n')
          .flatMap((text, index): CanvasNode[] => [
            ...(index ? [{ type: 'hardBreak' as const }] : []),
            ...(text ? [{ type: 'text' as const, text }] : []),
          ]);
  block.content = [
    ...sliceInline(inline, 0, edit.from),
    ...replacement,
    ...sliceInline(inline, edit.to, Infinity),
  ];
  return content;
}
