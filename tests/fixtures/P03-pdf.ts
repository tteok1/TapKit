import { createHash } from 'node:crypto';
// Historical R2/RC4 is used only to produce a public password fixture, never for application storage.
const padding = Buffer.from(
  '28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a',
  'hex',
);
function padded(password: string) {
  return Buffer.concat([Buffer.from(password, 'latin1').subarray(0, 32), padding]).subarray(0, 32);
}
function md5(...bytes: Buffer[]) {
  return createHash('md5').update(Buffer.concat(bytes)).digest();
}
function rc4(key: Buffer, bytes: Buffer) {
  const state = Uint8Array.from({ length: 256 }, (_, n) => n);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + state[i]! + key[i % key.length]!) & 255;
    [state[i], state[j]] = [state[j]!, state[i]!];
  }
  let i = 0;
  j = 0;
  return Buffer.from(
    bytes.map((value) => {
      i = (i + 1) & 255;
      j = (j + state[i]!) & 255;
      [state[i], state[j]] = [state[j]!, state[i]!];
      return value ^ state[(state[i]! + state[j]!) & 255]!;
    }),
  );
}
/** Synthetic minimal PDF with real xref offsets, Helvetica and optional embedded inert action. */
export function pdfFixture(
  text: string | null = 'Text location marker',
  pages = 1,
  action = false,
  password?: string,
) {
  if (action && password) throw new Error('Fixture action/encryption combination unsupported');
  const fileId = md5(Buffer.from('P03 public fixture ID')),
    permissions = Buffer.alloc(4);
  permissions.writeInt32LE(-4);
  const owner = rc4(md5(padded('public-owner-pass')).subarray(0, 5), padded(password ?? ''));
  const key = md5(padded(password ?? ''), owner, permissions, fileId).subarray(0, 5);
  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R${action ? ' /OpenAction << /S /JavaScript /JS (throw forbidden) >>' : ''} >>`,
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const kids: number[] = [];
  for (let index = 0; index < pages; index++) {
    const pageId = objects.length + 1,
      streamId = pageId + 1;
    kids.push(pageId);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`,
    );
    let stream =
      text === null ? '' : `BT /F1 12 Tf 20 100 Td (${text.replace(/([\\()])/g, '\\$1')}) Tj ET`;
    if (password) {
      const identity = Buffer.alloc(5);
      identity.writeUIntLE(streamId, 0, 3);
      stream = rc4(md5(key, identity).subarray(0, 10), Buffer.from(stream, 'latin1')).toString(
        'latin1',
      );
    }
    objects.push(
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects[1] = `<< /Type /Pages /Count ${pages} /Kids [${kids.map((n) => n + ' 0 R').join(' ')}] >>`;
  let encrypt = '';
  if (password) {
    objects.push(
      `<< /Filter /Standard /V 1 /R 2 /Length 40 /P -4 /O <${owner.toString('hex')}> /U <${rc4(key, padding).toString('hex')}> >>`,
    );
    encrypt = ` /Encrypt ${objects.length} 0 R /ID [<${fileId.toString('hex')}> <${fileId.toString('hex')}>]`;
  }
  let result = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((content, i) => {
    offsets.push(Buffer.byteLength(result, 'latin1'));
    result += `${i + 1} 0 obj\n${content}\nendobj\n`;
  });
  const xref = Buffer.byteLength(result, 'latin1');
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => n.toString().padStart(10, '0') + ' 00000 n \n').join('')}`;
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${encrypt} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result, 'latin1');
}
