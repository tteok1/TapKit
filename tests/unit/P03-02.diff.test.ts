import { test, expect } from 'vitest';
import { artifactDiff } from '../../packages/core/src/artifact-diff';
import { parseTextFile } from '../../packages/retrieval/src/ingest/text';
import { ResourceRefSchema } from '../../packages/contracts/src';
const doc = (text: string) => parseTextFile(Buffer.from(text), 'source.ts');
test('P03-02 version diff keeps actual old/new line coordinates and reconstructs each immutable input', () => {
  const old = '共同\n删除\n重复\n重复\n结尾',
    current = '共同\n插入\n重复\n结尾';
  const rows = artifactDiff(doc(old), doc(current));
  expect(
    rows
      .filter((r) => r.kind !== 'added')
      .map((r) => r.text)
      .join('\n'),
  ).toBe(old);
  expect(
    rows
      .filter((r) => r.kind !== 'removed')
      .map((r) => r.text)
      .join('\n'),
  ).toBe(current);
  expect(rows).toContainEqual({ kind: 'removed', text: '删除', oldLine: 2, newLine: null });
  expect(rows).toContainEqual({ kind: 'added', text: '插入', oldLine: null, newLine: 2 });
});
test('P03-02 long unrelated diff stays bounded and selections cannot omit their locator', () => {
  const rows = artifactDiff(
    doc(Array.from({ length: 10000 }, (_, i) => 'old' + i).join('\n')),
    doc(Array.from({ length: 10000 }, (_, i) => 'new' + i).join('\n')),
  );
  expect(rows).toHaveLength(20000);
  expect(rows.slice(0, 10000).every((row) => row.kind === 'removed')).toBe(true);
  expect(
    ResourceRefSchema.safeParse({
      kind: 'file',
      fileId: '0195abc0-0000-7000-8000-000000000001',
      versionId: '0195abc0-0000-7000-8000-000000000002',
      selection: { selectedTextHash: '0'.repeat(64) },
    }).success,
  ).toBe(false);
});
