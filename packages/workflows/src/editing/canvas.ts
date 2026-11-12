import { Lexer, type Token, type Tokens } from 'marked';
import {
  CanvasContentSchema,
  DocumentSpecSchema,
  type CanvasContent,
  type CanvasMark,
  type CanvasNode,
  type CanvasSnapshot,
  type CanvasThread,
  type ParsedDocument,
} from '@tapkit/contracts';

export function canvasText(node: CanvasNode): string {
  return node.type === 'hardBreak'
    ? '\n'
    : (node.text ?? (node.content ?? []).map(canvasText).join(''));
}

export function canvasBlocks(content: CanvasContent) {
  const blocks = new Map<string, CanvasNode>();
  const visit = (node: CanvasNode) => {
    if (typeof node.attrs?.blockId === 'string') blocks.set(node.attrs.blockId, node);
    node.content?.forEach(visit);
  };
  visit(content);
  return blocks;
}

/** Offset anchors move only when their quote is unambiguous within the same block. */
export function reanchorCanvasThreads(
  previous: CanvasContent,
  current: CanvasContent,
  threads: CanvasThread[],
) {
  if (!threads.length) return threads;
  const before = canvasBlocks(previous);
  const after = canvasBlocks(current);
  return threads.map((thread) => {
    if (thread.stale) return thread;
    const oldBlock = before.get(thread.anchor.blockId);
    const newBlock = after.get(thread.anchor.blockId);
    if (!oldBlock || !newBlock) return { ...thread, stale: true };
    const oldText = canvasText(oldBlock);
    const newText = canvasText(newBlock);
    if (oldText === newText) return thread;
    const { from, to } = thread.anchor;
    if (
      oldText.indexOf(thread.quote) !== oldText.lastIndexOf(thread.quote) ||
      newText.indexOf(thread.quote) !== newText.lastIndexOf(thread.quote)
    )
      return { ...thread, stale: true };
    // A single changed span can be mapped by its unchanged prefix and suffix.
    let prefix = 0;
    while (prefix < Math.min(oldText.length, newText.length) && oldText[prefix] === newText[prefix])
      prefix++;
    let suffix = 0;
    while (
      suffix < Math.min(oldText.length, newText.length) &&
      oldText.at(-1 - suffix) === newText.at(-1 - suffix)
    )
      suffix++;
    const offsets = new Set<number>();
    if (to <= prefix) offsets.add(from);
    if (from >= oldText.length - suffix) offsets.add(from + newText.length - oldText.length);
    const offset = offsets.values().next().value;
    if (
      offsets.size !== 1 ||
      offset === undefined ||
      newText.slice(offset, offset + thread.quote.length) !== thread.quote
    )
      return { ...thread, stale: true };
    return {
      ...thread,
      anchor: { ...thread.anchor, from: offset, to: offset + thread.quote.length },
    };
  });
}

function inline(tokens: Token[], marks: CanvasMark[] = []): CanvasNode[] {
  return tokens.flatMap((token): CanvasNode[] => {
    switch (token.type) {
      case 'br':
        return [{ type: 'hardBreak' }];
      case 'strong':
      case 'em':
      case 'del':
        return inline(token.tokens ?? [], [
          ...marks,
          { type: token.type === 'strong' ? 'bold' : token.type === 'em' ? 'italic' : 'strike' },
        ]);
      case 'link': {
        const href = token.href as string;
        let safe = false;
        try {
          const url = new URL(href);
          safe =
            /^https?:$/.test(url.protocol) && !url.username && !url.password && href.length <= 2048;
        } catch {
          // Keep the label of a relative or unsupported link.
        }
        return inline(
          token.tokens ?? [],
          safe ? [...marks, { type: 'link', attrs: { href } }] : marks,
        );
      }
      case 'text':
        if (token.tokens) return inline(token.tokens ?? [], marks);
        break;
      case 'codespan':
        marks = [...marks, { type: 'code' }];
        break;
    }
    const value = (token as Tokens.Text).text ?? token.raw;
    const unique = [...new Map(marks.map((mark) => [mark.type, mark])).values()];
    return value
      ? [{ type: 'text', text: value, ...(unique.length ? { marks: unique } : {}) }]
      : [];
  });
}

export function canvasFromMarkdown(markdown: string, id: () => string): CanvasContent {
  if (markdown.length > 200_000) throw new Error('OUTPUT_LIMIT_REACHED');
  const paragraph = (content: CanvasNode[] = []): CanvasNode => ({
    type: 'paragraph',
    attrs: { blockId: id() },
    content,
  });
  const convert = (tokens: Token[]): CanvasNode[] =>
    tokens.flatMap((token): CanvasNode[] => {
      const blockId = id();
      switch (token.type) {
        case 'space':
          return [];
        case 'heading':
          return [
            {
              type: 'heading',
              attrs: { blockId, level: token.depth },
              content: inline(token.tokens ?? []),
            },
          ];
        case 'code':
          return [
            {
              type: 'codeBlock',
              attrs: { blockId, language: token.lang?.slice(0, 80) ?? null },
              content: token.text ? [{ type: 'text', text: token.text }] : [],
            },
          ];
        case 'table': {
          const table = token as Tokens.Table;
          return [
            {
              type: 'table',
              attrs: { blockId },
              content: [table.header, ...table.rows].map((row, index) => ({
                type: 'tableRow',
                content: row.map((cell) => ({
                  type: index ? 'tableCell' : 'tableHeader',
                  content: [paragraph(inline(cell.tokens))],
                })),
              })),
            },
          ];
        }
        case 'list': {
          const list = token as Tokens.List;
          return [
            {
              type: list.ordered ? 'orderedList' : 'bulletList',
              attrs: { blockId, ...(list.ordered ? { start: Number(list.start) || 1 } : {}) },
              content: list.items.map((item) => {
                const items = convert(item.tokens);
                return {
                  type: 'listItem',
                  content: [
                    ...(items[0]?.type === 'paragraph' ? [] : [paragraph()]),
                    ...items.map((node) =>
                      ['paragraph', 'bulletList', 'orderedList', 'codeBlock'].includes(node.type)
                        ? node
                        : paragraph([{ type: 'text', text: canvasText(node) || ' ' }]),
                    ),
                  ],
                };
              }),
            },
          ];
        }
        case 'blockquote':
          return convert(token.tokens ?? []);
        default:
          return [paragraph(inline((token as Tokens.Paragraph).tokens ?? [token]))];
      }
    });
  const content = convert(Lexer.lex(markdown));
  return CanvasContentSchema.parse({
    type: 'doc',
    content: content.length ? content : [paragraph()],
  });
}

export function canvasFromDocx(parsed: ParsedDocument, id: () => string): CanvasContent {
  const line = (text: string): CanvasNode[] => (text ? [{ type: 'text', text }] : []);
  const paragraph = (text: string): CanvasNode => ({
    type: 'paragraph',
    attrs: { blockId: id() },
    content: line(text),
  });
  const content: CanvasNode[] = parsed.blocks.map((block) => {
    if (block.kind === 'heading') {
      return {
        type: 'heading',
        attrs: { blockId: id(), level: block.level ?? 2 },
        content: line(block.text),
      };
    }
    if (block.kind !== 'table') return paragraph(block.text);
    const rows = block.text.split('\n').map((row) => row.split('\t'));
    const width = Math.max(...rows.map((row) => row.length));
    return {
      type: 'table',
      attrs: { blockId: id() },
      content: rows.map((row, index) => ({
        type: 'tableRow',
        content: Array.from({ length: width }, (_, column) => ({
          type: index ? 'tableCell' : 'tableHeader',
          content: [paragraph(row[column] ?? '')],
        })),
      })),
    };
  });
  return CanvasContentSchema.parse({
    type: 'doc',
    content: content.length ? content : [paragraph('')],
  });
}

function withLinks(node: CanvasNode): string {
  if (node.type === 'hardBreak') return '\n';
  if (node.type !== 'text') return (node.content ?? []).map(withLinks).join('');
  const href = node.marks?.find((mark) => mark.type === 'link')?.attrs.href;
  return (node.text ?? '') + (href && href !== node.text ? ' (' + href + ')' : '');
}

export function canvasDocumentSpec(snapshot: CanvasSnapshot) {
  const sections: ReturnType<typeof DocumentSpecSchema.parse>['sections'] = [];
  let section: (typeof sections)[number] = { blockId: 'body', heading: '', blocks: [] };
  for (const node of snapshot.content.content) {
    if (node.type === 'heading') {
      if (section.heading || section.blocks.length) sections.push(section);
      section = { blockId: String(node.attrs?.blockId), heading: canvasText(node), blocks: [] };
      continue;
    }
    const text = withLinks(node);
    switch (node.type) {
      case 'image':
        section.blocks.push({
          type: 'image',
          fileVersionId: String(node.attrs?.versionId),
          alt: String(node.attrs?.alt ?? ''),
        });
        break;
      case 'table': {
        const [columns = [], ...rows] = (node.content ?? []).map((row) =>
          (row.content ?? []).map((cell) => (cell.content ?? []).map(withLinks).join('\n')),
        );
        section.blocks.push({ type: 'table', columns, rows });
        break;
      }
      case 'bulletList':
      case 'orderedList': {
        const lines: string[] = [];
        function list(parent: CanvasNode, depth: number) {
          (parent.content ?? []).forEach((item, index) => {
            const start = Number(parent.attrs?.start ?? 1);
            const marker = parent.type === 'orderedList' ? String(start + index) + '. ' : '• ';
            for (const child of item.content ?? []) {
              if (child.type === 'bulletList' || child.type === 'orderedList')
                list(child, depth + 1);
              else lines.push('  '.repeat(depth) + marker + withLinks(child));
            }
          });
        }
        list(node, 0);
        section.blocks.push({ type: 'paragraph', text: lines.join('\n') });
        break;
      }
      case 'codeBlock':
        section.blocks.push({ type: 'code', text, language: String(node.attrs?.language ?? '') });
        break;
      default:
        section.blocks.push({ type: 'paragraph', text });
    }
  }
  if (section.heading || section.blocks.length) sections.push(section);
  return DocumentSpecSchema.parse({
    schemaVersion: 1,
    title: snapshot.title,
    language: 'zh-CN',
    audience: '',
    sections,
    ...(snapshot.style ? { style: snapshot.style } : {}),
  });
}
