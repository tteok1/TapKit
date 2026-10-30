import {
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { DocumentDraftSchema, type DocumentDraft } from './document-draft';
import { checkedDocumentImage } from './document-image';
import { documentLayoutPreset } from './document-layout';

/** Image bytes must come from a caller that has authorized the exact managed version. */
export async function renderDocumentDraft(
  raw: unknown,
  authorizeCitation?: (ref: DocumentDraft['citations'][number]['ref']) => Promise<boolean>,
  resolveImage?: (fileVersionId: string) => Promise<Buffer>,
  layoutRepairAttempt = 0,
): Promise<{ markdown: string; docx: Buffer }> {
  const draft = DocumentDraftSchema.parse(raw);
  const layout = documentLayoutPreset(layoutRepairAttempt);
  const imageCount = draft.sections.reduce(
    (count, section) => count + section.blocks.filter((block) => block.type === 'image').length,
    0,
  );
  if (imageCount > 8) throw new Error('OUTPUT_LIMIT_REACHED');
  let imageBytes = 0;
  if (
    !draft.sections.some((s) =>
      s.blocks.some((b) =>
        b.type === 'paragraph' || b.type === 'code'
          ? b.text.trim()
          : b.type === 'bullets'
            ? b.items.some((item) => item.trim())
            : b.type === 'table'
              ? b.rows.some((row) => row.some((cell) => cell.trim()))
              : true,
      ),
    )
  )
    throw new Error('DOCUMENT_CONTENT_REQUIRED');
  for (const citation of draft.citations) {
    if (!authorizeCitation || !(await authorizeCitation(citation.ref)))
      throw new Error('CITATION_AUTHORIZATION_REQUIRED');
  }
  if (!resolveImage && draft.sections.some((s) => s.blocks.some((b) => b.type === 'image'))) {
    throw new Error('IMAGE_AUTHORIZATION_REQUIRED');
  }
  const literal = (value: string) => value.replace(/([\\`*_{}\[\]<>|#])/g, '\\$1');
  const inline = (value: string) => literal(value).replace(/\r\n|\r|\n/g, '<br>');
  const lines = ['# ' + inline(draft.title), ''];
  const paragraph = (value: string) =>
    new Paragraph({
      ...(layout.lineTwips
        ? { spacing: { line: layout.lineTwips, lineRule: 'auto' as const } }
        : {}),
      children: value.split(/\r\n|\r|\n/).map(
        (line, index) =>
          new TextRun({
            text: line,
            font: 'Noto Sans CJK SC',
            size: layout.bodyHalfPoints,
            break: index ? 1 : 0,
          }),
      ),
    });
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: draft.title, heading: HeadingLevel.TITLE }),
  ];
  const templateName = { report: '报告', proposal: '方案', minutes: '会议纪要' }[
    draft.style.template
  ];
  lines.push(templateName, '');
  children.push(paragraph(templateName));
  for (const [label, value] of [
    ['品牌', draft.style.fields.brand],
    ['姓名', draft.style.fields.name],
    ['日期', draft.style.fields.date],
    ['目标读者', draft.audience],
  ] as const) {
    if (!value) continue;
    lines.push(`${label}：${inline(value)}`, '');
    children.push(paragraph(`${label}：${value}`));
  }
  if (draft.style.tableOfContents) {
    lines.push('## 目录', '', ...draft.sections.map((s) => '- ' + inline(s.heading)), '');
    children.push(new Paragraph({ text: '目录', heading: HeadingLevel.HEADING_1 }));
    children.push(...draft.sections.map((s) => paragraph(s.heading)));
  }
  for (const section of draft.sections) {
    lines.push('## ' + inline(section.heading), '');
    children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }));
    for (const block of section.blocks) {
      switch (block.type) {
        case 'paragraph':
          lines.push(
            block.text
              .split(/\r\n|\r|\n/)
              .map(literal)
              .join('  \n'),
            '',
          );
          children.push(paragraph(block.text));
          break;
        case 'bullets':
          lines.push(...block.items.map((item) => '- ' + inline(item)), '');
          children.push(...block.items.map((item) => paragraph('• ' + item)));
          break;
        case 'table': {
          const rows = [block.columns, ...block.rows];
          lines.push(
            '| ' + block.columns.map(inline).join(' | ') + ' |',
            '| ' + block.columns.map(() => '---').join(' | ') + ' |',
            ...block.rows.map((row) => '| ' + row.map(inline).join(' | ') + ' |'),
            '',
          );
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: rows.map(
                (row, index) =>
                  new TableRow({
                    tableHeader: index === 0,
                    children: row.map((cell) => new TableCell({ children: [paragraph(cell)] })),
                  }),
              ),
            }),
          );
          break;
        }
        case 'code': {
          let fenceLength = 3;
          for (const match of block.text.matchAll(/`+/g))
            fenceLength = Math.max(fenceLength, match[0].length + 1);
          const fence = '`'.repeat(fenceLength);
          lines.push(fence, block.text, fence, '');
          children.push(paragraph(block.text));
          break;
        }
        case 'image': {
          if (!resolveImage) throw new Error('IMAGE_AUTHORIZATION_REQUIRED');
          const image = checkedDocumentImage(Buffer.from(await resolveImage(block.fileVersionId)));
          imageBytes += image.bytes.length;
          if (imageBytes > 512 * 1024) throw new Error('OUTPUT_LIMIT_REACHED');
          const scale = Math.min(1, 600 / image.width, 800 / image.height);
          const alt = block.alt || '图片';
          lines.push(
            '![' + literal(alt) + '](data:image/png;base64,' + image.bytes.toString('base64') + ')',
            '',
          );
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  type: image.type,
                  data: image.bytes,
                  transformation: {
                    width: Math.max(1, Math.round(image.width * scale)),
                    height: Math.max(1, Math.round(image.height * scale)),
                  },
                  altText: { name: 'image', description: alt, title: alt },
                }),
              ],
            }),
          );
          children.push(paragraph('图片：' + alt));
          break;
        }
      }
    }
  }
  if (draft.citations.length) {
    lines.push('## 来源', '');
    children.push(new Paragraph({ text: '来源', heading: HeadingLevel.HEADING_1 }));
    draft.citations.forEach((citation, index) => {
      const label = `[${index + 1}] ${citation.label}`;
      lines.push(literal(label), '');
      children.push(paragraph(label));
    });
  }
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Noto Sans CJK SC', size: layout.bodyHalfPoints } },
        title: {
          run: {
            font: 'Noto Sans CJK SC',
            size: 44,
            bold: true,
            color: draft.style.theme === 'formal' ? '365C46' : '242B27',
          },
        },
        heading1: {
          run: {
            font: 'Noto Sans CJK SC',
            size: 32,
            bold: true,
            color: draft.style.theme === 'formal' ? '365C46' : '242B27',
          },
        },
        heading2: {
          run: {
            font: 'Noto Sans CJK SC',
            size: 26,
            bold: true,
            color: draft.style.theme === 'formal' ? '365C46' : '242B27',
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top: layout.marginTwips,
              right: layout.marginTwips,
              bottom: layout.marginTwips,
              left: layout.marginTwips,
            },
          },
        },
        ...(draft.style.pageNumbers
          ? {
              footers: {
                default: new Footer({
                  children: [
                    new Paragraph({ children: [new TextRun({ children: [PageNumber.CURRENT] })] }),
                  ],
                }),
              },
            }
          : {}),
        children,
      },
    ],
  });
  return { markdown: lines.join('\n'), docx: await Packer.toBuffer(doc) };
}
