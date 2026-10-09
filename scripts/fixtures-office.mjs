import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './lib.mjs';
const require = createRequire(join(root, 'packages/workflows/package.json'));
const { Document, Packer, Paragraph, TextRun } = require('docx');
const ExcelJS = require('exceljs');
const PptxGenJS = require('pptxgenjs');
export async function officeFixtures(directory) {
  await mkdir(directory, { recursive: true });
  const title = 'TapKit 隔离转换验收';
  await writeFile(
    join(directory, 'sample.docx'),
    await Packer.toBuffer(
      new Document({
        sections: [
          {
            children: [
              new Paragraph({
                children: [new TextRun({ text: title, font: 'Microsoft YaHei', size: 28 })],
              }),
              new Paragraph('DOCX 原件不可修改；中文内容应清晰可读。'),
            ],
          },
        ],
      }),
    ),
  );
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet('验收');
  sheet.addRow([title, '数值']);
  sheet.addRow(['中文行', 42]);
  sheet.getColumn(1).width = 36;
  sheet.eachRow((row) =>
    row.eachCell((cell) => {
      cell.font = { name: 'Microsoft YaHei', size: 14 };
    }),
  );
  await workbook.xlsx.writeFile(join(directory, 'sample.xlsx'));
  const deck = new PptxGenJS();
  deck.layout = 'LAYOUT_WIDE';
  deck.author = 'TapKit fixture';
  deck.subject = 'P00-03';
  const slide = deck.addSlide();
  slide.addText(title, { x: 1, y: 1, w: 10, h: 1, fontFace: 'Microsoft YaHei', fontSize: 28 });
  slide.addText('PPTX → PDF / 受限环境', {
    x: 1,
    y: 2.5,
    w: 10,
    h: 1,
    fontFace: 'Microsoft YaHei',
    fontSize: 20,
  });
  await deck.writeFile({ fileName: join(directory, 'sample.pptx') });
}
