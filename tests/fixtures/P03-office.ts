import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { Readable } from 'node:stream';
const require = createRequire(resolve('packages/tools/package.json'));
const { ZipFile } = require('yazl') as {
  ZipFile: new () => {
    addBuffer(bytes: Buffer, name: string, options: { compress: boolean; mode?: number }): void;
    end(): void;
    outputStream: Readable;
  };
};
export async function officeZip(
  parts: Record<string, string | Buffer>,
  options: { compress?: boolean; mode?: number } = {},
) {
  const zip = new ZipFile(),
    chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on('data', (bytes: Buffer) => chunks.push(bytes));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
  });
  for (const [path, value] of Object.entries(parts))
    zip.addBuffer(Buffer.from(value), path, { compress: false, ...options });
  zip.end();
  return result;
}
const relBase = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
export function relationships(
  items: { id: string; kind: string; target: string; external?: boolean }[],
) {
  return `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items
    .map(
      (i) =>
        `<Relationship Id="${i.id}" Type="${relBase + i.kind}" Target="${i.target}"${i.external ? ' TargetMode="External"' : ''}/>`,
    )
    .join('')}</Relationships>`;
}
export function officeParts(
  extension: 'docx' | 'xlsx' | 'pptx',
  main: string,
  xml: string,
  extra: Record<string, string> = {},
) {
  const contentType = {
    docx: 'wordprocessingml.document',
    xlsx: 'spreadsheetml.sheet',
    pptx: 'presentationml.presentation',
  }[extension];
  return {
    '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${main}" ContentType="application/vnd.openxmlformats-officedocument.${contentType}.main+xml"/></Types>`,
    '_rels/.rels': relationships([{ id: 'rId1', kind: 'officeDocument', target: main }]),
    [main]: xml,
    ...extra,
  };
}
export const docxFixture = () =>
  officeParts(
    'docx',
    'word/document.xml',
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>中文标题</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">第一段 </w:t></w:r><w:r><w:t>第二个run</w:t></w:r><w:r><w:tab/><w:t>尾部</w:t></w:r><w:r><w:instrText>外部字段命令</w:instrText></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>表头</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>内容</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:del><w:r><w:delText>已删除文字</w:delText></w:r></w:del><w:r><w:t>保留文字</w:t></w:r></w:p>
  </w:body></w:document>`,
  );
export const xlsxFixture = () =>
  officeParts(
    'xlsx',
    'xl/workbook.xml',
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="中文表" sheetId="7" r:id="rIdSheet"/></sheets></workbook>`,
    {
      'xl/_rels/workbook.xml.rels': relationships([
        { id: 'rIdSheet', kind: 'worksheet', target: 'worksheets/sheet2.xml' },
        { id: 'str', kind: 'sharedStrings', target: 'sharedStrings.xml' },
      ]),
      'xl/sharedStrings.xml':
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><r><t>富文本</t></r><r><t>中文</t></r></si></sst>',
      'xl/worksheets/sheet2.xml': `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D3"/><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>4</v></c><c r="C1"><f>B1*2</f><v>8</v></c><c r="D1"><f>B1/0</f></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>=保持字符串</t></is></c><c r="B3" t="b"><v>1</v></c></row></sheetData></worksheet>`,
    },
  );
export const pptxFixture = () =>
  officeParts(
    'pptx',
    'ppt/presentation.xml',
    `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="second"/><p:sldId id="257" r:id="first"/></p:sldIdLst></p:presentation>`,
    {
      'ppt/_rels/presentation.xml.rels': relationships([
        { id: 'first', kind: 'slide', target: 'slides/slide1.xml' },
        { id: 'second', kind: 'slide', target: 'slides/slide2.xml' },
      ]),
      'ppt/slides/slide2.xml':
        '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>实际第一张</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
      'ppt/slides/slide1.xml':
        '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>实际第二张</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
      'ppt/slides/_rels/slide2.xml.rels': relationships([
        { id: 'notes', kind: 'notesSlide', target: '../notesSlides/notes2.xml' },
      ]),
      'ppt/notesSlides/notes2.xml':
        '<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>演讲备注</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>123</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>',
    },
  );
