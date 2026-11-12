import type { CanvasNode, CanvasSnapshot } from '@tapkit/contracts';
import { checkedDocumentImage } from '../document-image';
import { canvasText } from './canvas';

const escape = (value: string) => value.replace(/([\\`*_{}\[\]<>|#!~])/g, '\\$1');
const fenceFor = (value: string, minimum: number) =>
  '`'.repeat(
    Math.max(minimum, ...Array.from(value.matchAll(/`+/g), (match) => match[0].length + 1)),
  );

function inline(node: CanvasNode): string {
  if (node.type === 'hardBreak') return '  \n';
  if (node.type !== 'text') return (node.content ?? []).map(inline).join('');
  const text = node.text ?? '';
  let value = escape(text);
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'code': {
        const fence = fenceFor(text, 1);
        value = fence + ' ' + text + ' ' + fence;
        break;
      }
      case 'link':
        value = '[' + value + '](<' + mark.attrs.href.replace(/[<>]/g, encodeURIComponent) + '>)';
        break;
      case 'bold':
        value = '**' + value + '**';
        break;
      case 'italic':
        value = '*' + value + '*';
        break;
      case 'strike':
        value = '~~' + value + '~~';
        break;
      case 'underline':
        value = '<u>' + value + '</u>';
        break;
    }
  }
  return value;
}

export async function renderCanvasMarkdown(
  snapshot: CanvasSnapshot,
  resolveImage: (id: string) => Promise<Buffer>,
) {
  let imageBytes = 0;
  let imageCount = 0;
  async function block(node: CanvasNode): Promise<string> {
    switch (node.type) {
      case 'heading':
        return '#'.repeat(Number(node.attrs?.level ?? 2)) + ' ' + inline(node);
      case 'codeBlock': {
        const text = canvasText(node);
        const fence = fenceFor(text, 3);
        const language = String(node.attrs?.language ?? '').match(/^[\w+-]{1,80}$/)?.[0] ?? '';
        return fence + language + '\n' + text + '\n' + fence;
      }
      case 'bulletList':
      case 'orderedList': {
        const items = [];
        for (const [index, item] of (node.content ?? []).entries()) {
          const prefix =
            node.type === 'bulletList'
              ? '- '
              : String(Number(node.attrs?.start ?? 1) + index) + '. ';
          const lines = (await Promise.all((item.content ?? []).map(block))).join('\n').split('\n');
          items.push(
            prefix +
              lines[0] +
              lines
                .slice(1)
                .map((line) => '\n' + ' '.repeat(prefix.length) + line)
                .join(''),
          );
        }
        return items.join('\n');
      }
      case 'table': {
        const rows = (node.content ?? []).map((row) =>
          (row.content ?? []).map((cell) =>
            (cell.content ?? []).map(inline).join('<br>').replace(/\r?\n/g, '<br>'),
          ),
        );
        return [rows[0]!, rows[0]!.map(() => '---'), ...rows.slice(1)]
          .map((row) => '| ' + row.join(' | ') + ' |')
          .join('\n');
      }
      case 'image': {
        if (++imageCount > 8) throw Error('OUTPUT_LIMIT_REACHED');
        const { bytes } = checkedDocumentImage(await resolveImage(String(node.attrs?.versionId)));
        imageBytes += bytes.length;
        if (imageBytes > 512 * 1024) throw Error('OUTPUT_LIMIT_REACHED');
        return (
          '![' +
          escape(String(node.attrs?.alt || '图片')) +
          '](data:image/png;base64,' +
          bytes.toString('base64') +
          ')'
        );
      }
      default:
        return inline(node);
    }
  }
  const lines = ['# ' + escape(snapshot.title.replace(/\s+/g, ' '))];
  for (const node of snapshot.content.content) lines.push(await block(node));
  return lines.join('\n\n') + '\n';
}
