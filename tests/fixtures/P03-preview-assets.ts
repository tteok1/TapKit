import { crc32, deflateSync } from 'node:zlib';
export function previewImage() {
  const chunk = (name: string, bytes: Buffer) => {
    const type = Buffer.from(name),
      length = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    checksum.writeUInt32BE(crc32(Buffer.concat([type, bytes])));
    return Buffer.concat([length, type, bytes, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(120, 0);
  header.writeUInt32BE(60, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(60 * (1 + 120 * 3));
  for (let y = 0; y < 60; y++)
    for (let x = 0; x < 120; x++) {
      const i = y * 361 + 1 + x * 3;
      pixels[i] = 30 + x;
      pixels[i + 1] = 95 + y;
      pixels[i + 2] = 190;
    }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
export function previewPdf(sample: number) {
  const objects: string[] = [],
    add = (value: string) => {
      objects.push(value);
      return objects.length;
    };
  const catalog = add(''),
    pages = add(''),
    font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    kids: number[] = [];
  for (let page = 0; page < sample; page++) {
    const width = sample === 2 ? 500 : 300,
      height = sample === 2 ? 300 : 420;
    const stream = `0.91 0.95 1 rg 15 15 ${width - 30} ${height - 30} re f\n0.12 0.25 0.38 rg\nBT /F1 18 Tf 30 ${height - 50} Td (PDF sample ${sample} / page ${page + 1}) Tj ET\nBT /F1 12 Tf 30 ${height - 90} Td (Readable text and fixed page coordinates) Tj ET\n0.4 0.6 0.8 RG 30 80 ${width - 60} 100 re S\nBT /F1 11 Tf 45 150 Td (Column A     Column B     Column C) Tj 0 -25 Td (42           100          Preview) Tj ET`;
    const content = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`),
      id = add(
        `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
      );
    kids.push(id);
  }
  const outline = add(''),
    first = add(`<< /Title (First page) /Parent ${outline} 0 R /Dest [${kids[0]} 0 R /Fit] >>`),
    last = add(
      `<< /Title (Last page) /Parent ${outline} 0 R /Prev ${first} 0 R /Dest [${kids.at(-1)} 0 R /Fit] >>`,
    );
  objects[first - 1] = objects[first - 1]!.replace('/Dest', `/Next ${last} 0 R /Dest`);
  objects[outline - 1] = `<< /Type /Outlines /First ${first} 0 R /Last ${last} 0 R /Count 2 >>`;
  objects[catalog - 1] =
    `<< /Type /Catalog /Pages ${pages} 0 R /Outlines ${outline} 0 R /OpenAction << /S /JavaScript /JS (app.alert\\(forbidden\\)) >> >>`;
  objects[pages - 1] =
    `<< /Type /Pages /Kids [${kids.map((id) => id + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let result = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((content, i) => {
    offsets.push(Buffer.byteLength(result));
    result += `${i + 1} 0 obj\n${content}\nendobj\n`;
  });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => n.toString().padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}
