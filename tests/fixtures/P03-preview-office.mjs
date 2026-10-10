import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const require = createRequire(resolve('packages/workflows/package.json'));
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  PageBreak,
  ImageRun,
  WidthType,
} = require('docx');
const PptxGenJS = require('pptxgenjs');
export const previewPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
export async function previewOfficeFixtures(directory) {
  await mkdir(directory, { recursive: true });
  const paragraph = (text) =>
    new Paragraph({ children: [new TextRun({ text, font: 'Microsoft YaHei', size: 24 })] });
  const table = () =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [2400, 1600, 5000],
      rows: [
        ['项目', '数量', '说明'],
        ['文件预览', '3', '只读固定版本'],
        ['中文与数字', '42', '合并前保留原件'],
      ].map(
        (cells) =>
          new TableRow({
            children: cells.map((value) => new TableCell({ children: [paragraph(value)] })),
          }),
      ),
    });
  for (let i = 1; i <= 3; i++) {
    const children = [
      new Paragraph({ text: `DOCX 样本 ${i} · 阅读验收`, heading: HeadingLevel.HEADING_1 }),
      paragraph('中文段落、标点和英文 TapKit Preview 必须清晰可读。'),
      table(),
    ];
    if (i === 2)
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: 'png',
              data: previewPng,
              transformation: { width: 100, height: 60 },
            }),
          ],
        }),
        paragraph('图片位于表格之后，宽页布局。'),
      );
    if (i === 3)
      children.push(
        ...Array.from({ length: 12 }, (_, n) =>
          paragraph(
            `段落 ${n + 1}：这是一份用于分页、换行和结构定位的公开合成材料。版本引用始终保留。`,
          ),
        ),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ text: '末页标题', heading: HeadingLevel.HEADING_2 }),
        paragraph('最后一页可从目录或引用抵达。'),
      );
    const doc = new Document({
      sections: [
        {
          properties: i === 2 ? { page: { size: { orientation: 'landscape' } } } : {},
          children,
        },
      ],
    });
    await writeFile(join(directory, `word-${i}.docx`), await Packer.toBuffer(doc));
    const deck = new PptxGenJS();
    deck.layout = i === 2 ? 'LAYOUT_4x3' : 'LAYOUT_WIDE';
    deck.author = 'TapKit public fixture';
    deck.subject = 'P03-02';
    for (let page = 0; page < i + 1; page++) {
      const slide = deck.addSlide();
      slide.background = { color: page % 2 ? 'EAF2FF' : 'F8FAFC' };
      slide.addText(`PPTX 样本 ${i} / 第 ${page + 1} 页`, {
        x: 0.6,
        y: 0.5,
        w: i === 2 ? 8.7 : 11.8,
        h: 0.8,
        fontFace: 'Microsoft YaHei',
        fontSize: 28,
        color: '173B56',
      });
      slide.addText('中文正文 · 只读幻灯片\n固定版本与讲者备注', {
        x: 0.8,
        y: 1.6,
        w: 8.2,
        h: 1.3,
        fontFace: 'Microsoft YaHei',
        fontSize: 22,
        breakLine: false,
      });
      slide.addTable(
        [
          ['格式', '版本', '状态'],
          ['PPTX', String(i), '预览'],
          ['PDF', String(page + 1), '只读'],
        ],
        {
          x: 0.8,
          y: 3.2,
          w: 8.2,
          h: 1.5,
          fontFace: 'Microsoft YaHei',
          fontSize: 16,
          border: { pt: 1, color: 'A7BCD0' },
          fill: 'FFFFFF',
          color: '24334A',
        },
      );
      if (i === 3)
        slide.addImage({
          data: 'data:image/png;base64,' + previewPng.toString('base64'),
          x: 10,
          y: 1.8,
          w: 1,
          h: 1,
        });
      slide.addNotes(`讲者备注 ${i}-${page + 1}：不会自动作为页面像素定位。`);
    }
    await deck.writeFile({ fileName: join(directory, `slides-${i}.pptx`) });
  }
}
