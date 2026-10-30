import { crc32, deflateSync } from 'node:zlib';

export function solidPng() {
  const width = 160,
    height = 90;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const data = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      const light = x > 15 && x < 145 && y > 15 && y < 75;
      data[offset] = light ? 219 : 38;
      data[offset + 1] = light ? 234 : 107;
      data[offset + 2] = light ? 211 : 74;
    }
  const chunk = (type: string, body: Buffer) => {
    const label = Buffer.from(type, 'ascii'),
      length = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    checksum.writeUInt32BE(crc32(Buffer.concat([label, body])));
    return Buffer.concat([length, label, body, checksum]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(data)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
