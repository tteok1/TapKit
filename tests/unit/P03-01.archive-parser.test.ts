import { expect, test } from 'vitest';
import { createRequire } from 'node:module';
import type { Readable } from 'node:stream';
import { FILE_LIMITS } from '../../packages/contracts/src';
import { BoundedArchive, parseZipFile } from '../../packages/retrieval/src/ingest/archive';
const require = createRequire(import.meta.url);
const { ZipFile } = require('../../packages/tools/node_modules/yazl') as {
  ZipFile: new () => {
    addBuffer(bytes: Buffer, name: string, options?: { compress?: boolean; mode?: number }): void;
    end(): void;
    outputStream: Readable;
  };
};
async function zip(entries: { path: string; text: string; compress?: boolean; mode?: number }[]) {
  const z = new ZipFile(),
    chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    z.outputStream.on('data', (b) => chunks.push(b));
    z.outputStream.on('error', reject);
    z.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
  for (const e of entries)
    z.addBuffer(Buffer.from(e.text), e.path, {
      ...(e.compress === undefined ? {} : { compress: e.compress }),
      ...(e.mode === undefined ? {} : { mode: e.mode }),
    });
  z.end();
  return result;
}
test('P03-01 bounded ZIP validates headers and reads CRC-verified UTF8 bytes without extracting files', async () => {
  const bytes = await zip([{ path: '中文目录/资料.txt', text: '原件内容' }]);
  const archive = await BoundedArchive.open(bytes, FILE_LIMITS);
  try {
    expect([...archive.entries.keys()]).toEqual(['中文目录/资料.txt']);
    expect((await archive.read('中文目录/资料.txt')).toString()).toBe('原件内容');
    await expect(archive.read('不存在')).rejects.toThrow('CORRUPT_FILE');
  } finally {
    archive.close();
  }
});
test('P03-01 ZIP traversal, Windows stream aliases, case aliases and symlink entries are rejected before inflate', async () => {
  const traversal = await zip([{ path: 'safe.txt', text: '不可提取' }]);
  const needle = Buffer.from('safe.txt');
  for (
    let index = traversal.indexOf(needle);
    index !== -1;
    index = traversal.indexOf(needle, index + 1)
  )
    Buffer.from('../x.txt').copy(traversal, index);
  await expect(BoundedArchive.open(traversal, FILE_LIMITS)).rejects.toThrow('UNSAFE_ARCHIVE');
  await expect(
    BoundedArchive.open(await zip([{ path: 'file:ads', text: '拒绝' }]), FILE_LIMITS),
  ).rejects.toThrow('UNSAFE_ARCHIVE');
  await expect(
    BoundedArchive.open(
      await zip([
        { path: 'Readme', text: '一' },
        { path: 'README', text: '二' },
      ]),
      FILE_LIMITS,
    ),
  ).rejects.toThrow('UNSAFE_ARCHIVE');
  await expect(
    BoundedArchive.open(
      await zip([{ path: 'link', text: '/outside', mode: 0o120777 }]),
      FILE_LIMITS,
    ),
  ).rejects.toThrow('UNSAFE_ARCHIVE');
});
test('P03-01 ZIP header count, expansion ratio and aggregate size limits reject bombs before entry reads', async () => {
  const count = await zip([
    { path: 'a', text: '甲' },
    { path: 'b', text: '乙' },
  ]);
  await expect(
    BoundedArchive.open(count, { ...FILE_LIMITS, maxArchiveEntries: 1 }),
  ).rejects.toThrow('ARCHIVE_LIMIT');
  await expect(
    BoundedArchive.open(await zip([{ path: 'bomb', text: '0'.repeat(100000) }]), FILE_LIMITS),
  ).rejects.toThrow('ARCHIVE_LIMIT');
  await expect(BoundedArchive.open(count, { ...FILE_LIMITS, maxExpandedBytes: 5 })).rejects.toThrow(
    'ARCHIVE_LIMIT',
  );
});
test('P03-01 ZIP encryption and corrupt CRC produce failures rather than empty successful content', async () => {
  const bytes = await zip([{ path: 'data.txt', text: '内容', compress: false }]);
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const encrypted = await zip([
    { path: 'encrypted.txt', text: '加密头待拒绝内容0123456789', compress: true },
  ]);
  const encryptedCentral = encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  encrypted.writeUInt16LE(encrypted.readUInt16LE(encryptedCentral + 8) | 1, encryptedCentral + 8);
  await expect(BoundedArchive.open(encrypted, FILE_LIMITS)).rejects.toThrow('ENCRYPTED_FILE');
  bytes.writeUInt32LE(0, central + 16);
  const archive = await BoundedArchive.open(bytes, FILE_LIMITS);
  try {
    await expect(archive.read('data.txt')).rejects.toThrow('CORRUPT_FILE');
  } finally {
    archive.close();
  }
  await expect(BoundedArchive.open(Buffer.from('corrupt'), FILE_LIMITS)).rejects.toThrow(
    'CORRUPT_FILE',
  );
});
test('P03-01 ZIP nested archives obey one shared depth and entry budget without extracting their contents', async () => {
  const wrap = async (content: Buffer, path: string) => {
    const z = new ZipFile(),
      chunks: Buffer[] = [];
    const result = new Promise<Buffer>((resolve, reject) => {
      z.outputStream.on('data', (b) => chunks.push(b));
      z.outputStream.on('error', reject);
      z.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    });
    z.addBuffer(content, path, { compress: false });
    z.end();
    return result;
  };
  const leaf = await zip([{ path: '原件.txt', text: '不会解压执行' }]);
  const depth1 = await wrap(leaf, 'one.zip'),
    depth2 = await wrap(depth1, 'two.zip');
  expect((await parseZipFile(depth2)).entries[0]?.path).toBe('two.zip');
  await expect(parseZipFile(await wrap(depth2, 'three.zip'))).rejects.toThrow('ARCHIVE_LIMIT');
  await expect(parseZipFile(depth2, { ...FILE_LIMITS, maxArchiveEntries: 2 })).rejects.toThrow(
    'ARCHIVE_LIMIT',
  );
});
