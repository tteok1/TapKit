import { crc32 } from 'node:zlib';

/** Metadata checked before a managed image is handed to an isolated renderer.
 * This does not decode pixels or establish authorization; the caller must do both
 * authorization and isolated rendering. Only PNG is accepted for now.
 */
export function checkedDocumentImage(bytes: Buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 45 || bytes.length > 128 * 1024 || !bytes.subarray(0, 8).equals(signature))
    throw new Error('FORMAT_UNSUPPORTED');
  if (bytes.readUInt32BE(8) !== 13 || bytes.subarray(12, 16).toString('ascii') !== 'IHDR')
    throw new Error('FORMAT_UNSUPPORTED');
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (!width || !height || width > 4096 || height > 4096 || width * height > 16_000_000)
    throw new Error('OUTPUT_LIMIT_REACHED');
  const depth = bytes[24]!,
    color = bytes[25]!;
  const depths: Record<number, number[]> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  if (
    !depths[color]?.includes(depth) ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    ![0, 1].includes(bytes[28]!)
  )
    throw new Error('FORMAT_UNSUPPORTED');
  let offset = 8,
    count = 0,
    dataSeen = false,
    dataEnded = false,
    ended = false;
  while (offset < bytes.length) {
    if (++count > 1024 || offset + 12 > bytes.length) throw new Error('FORMAT_UNSUPPORTED');
    const length = bytes.readUInt32BE(offset),
      end = offset + 12 + length;
    if (end > bytes.length) throw new Error('FORMAT_UNSUPPORTED');
    const name = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(name) || ['acTL', 'fcTL', 'fdAT'].includes(name))
      throw new Error('FORMAT_UNSUPPORTED');
    if (
      crc32(bytes.subarray(offset + 4, offset + 8 + length)) !==
      bytes.readUInt32BE(offset + 8 + length)
    )
      throw new Error('FORMAT_UNSUPPORTED');
    if ((count === 1 && name !== 'IHDR') || (count > 1 && name === 'IHDR'))
      throw new Error('FORMAT_UNSUPPORTED');
    if (name === 'IDAT') {
      if (dataEnded) throw new Error('FORMAT_UNSUPPORTED');
      dataSeen = true;
    } else if (dataSeen && name !== 'IEND') dataEnded = true;
    if (name === 'IEND') {
      if (!dataSeen || length !== 0 || end !== bytes.length) throw new Error('FORMAT_UNSUPPORTED');
      ended = true;
    } else if (name[0] === name[0]!.toUpperCase() && !['IHDR', 'PLTE', 'IDAT'].includes(name))
      throw new Error('FORMAT_UNSUPPORTED');
    offset = end;
  }
  if (!ended) throw new Error('FORMAT_UNSUPPORTED');
  // The image decoder in the Office worker remains the authority for pixel validity.
  return { type: 'png' as const, bytes, width, height };
}
