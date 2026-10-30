import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { FILE_LIMITS } from '../../packages/contracts/src';
import { checkedDocumentImage } from '../../packages/workflows/src/document-image';
import { renderDocumentDraft } from '../../packages/workflows/src/document-render';
import { BoundedArchive } from '../../packages/retrieval/src/ingest/archive';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

test('P07-01 bounded PNG metadata rejects malformed and oversized images without decoding pixels', () => {
  expect(checkedDocumentImage(png)).toMatchObject({ type: 'png', width: 1, height: 1 });
  expect(() => checkedDocumentImage(Buffer.from('not an image'))).toThrow('FORMAT_UNSUPPORTED');
  const wrongHeader = Buffer.from(png);
  wrongHeader.write('fake', 12, 'ascii');
  expect(() => checkedDocumentImage(wrongHeader)).toThrow('FORMAT_UNSUPPORTED');
  const huge = Buffer.from(png);
  huge.writeUInt32BE(100000, 16);
  expect(() => checkedDocumentImage(huge)).toThrow('OUTPUT_LIMIT_REACHED');
  const corrupted = Buffer.from(png);
  corrupted[42] = corrupted[42]! ^ 1;
  expect(() => checkedDocumentImage(corrupted)).toThrow('FORMAT_UNSUPPORTED');
  expect(() => checkedDocumentImage(png.subarray(0, png.length - 1))).toThrow('FORMAT_UNSUPPORTED');
  expect(() => checkedDocumentImage(Buffer.alloc(128 * 1024 + 1))).toThrow('FORMAT_UNSUPPORTED');
});

test('P07-01 renderer accepts only caller-resolved PNG bytes and embeds the image without a path or URL', async () => {
  const versionId = '0199b35d-9700-7000-8000-000000000001';
  const spec = {
    schemaVersion: 1,
    title: '报告',
    audience: '用户',
    language: '中文',
    sections: [
      {
        blockId: 'one',
        heading: '素材',
        blocks: [{ type: 'image', fileVersionId: versionId, alt: '合成示例' }],
      },
    ],
  };
  await expect(renderDocumentDraft(spec)).rejects.toThrow('IMAGE_AUTHORIZATION_REQUIRED');
  const seen: string[] = [];
  const result = await renderDocumentDraft(spec, undefined, async (id) => {
    seen.push(id);
    return png;
  });
  expect(seen).toEqual([versionId]);
  expect(result.markdown).toContain('data:image/png;base64,' + png.toString('base64'));
  const archive = await BoundedArchive.open(result.docx, FILE_LIMITS);
  try {
    const names = [...archive.entries.keys()].filter((name) => /^word\/media\/.*\.png$/.test(name));
    expect(names).toHaveLength(1);
    expect(await archive.read(names[0]!)).toEqual(png);
  } finally {
    archive.close();
  }
  const parsed = await parseOfficeFile(result.docx, 'docx');
  expect(parsed.blocks.some((block) => block.text.includes('合成示例'))).toBe(true);
  const inspected = await parseOfficeFile(result.docx, 'docx', FILE_LIMITS, true);
  expect(inspected.embeddedPngHashes).toEqual([createHash('sha256').update(png).digest('hex')]);
  await expect(
    renderDocumentDraft(spec, undefined, async () => Buffer.from('bad')),
  ).rejects.toThrow('FORMAT_UNSUPPORTED');
  const tooMany = {
    ...spec,
    sections: [
      {
        ...spec.sections[0],
        blocks: Array.from({ length: 9 }, () => ({
          type: 'image',
          fileVersionId: versionId,
          alt: '示例',
        })),
      },
    ],
  };
  await expect(renderDocumentDraft(tooMany, undefined, async () => png)).rejects.toThrow(
    'OUTPUT_LIMIT_REACHED',
  );
});
