import { describe, expect, test } from 'vitest';
import {
  FileImportSchema,
  FileNameSchema,
  FileRelativePathSchema,
  ParsedDocumentSchema,
} from '../../packages/contracts/src';
const token = '0195abc0-0000-7000-8000-000000000001';
const fileId = '0195abc0-0000-7000-8000-000000000002';
describe('P03-01 T08 T19 file boundary contracts', () => {
  test('replacement requires distinct, explicit file and Host selection identities', () => {
    const input = {
      selectionTokens: [token],
      destination: { type: 'library' },
      duplicate: 'replace',
    };
    expect(FileImportSchema.safeParse(input).success).toBe(false);
    expect(
      FileImportSchema.parse({ ...input, replacements: [{ token, fileId }] }).replacements,
    ).toHaveLength(1);
    expect(
      FileImportSchema.safeParse({
        ...input,
        selectionTokens: [token, token],
        replacements: [
          { token, fileId },
          { token, fileId },
        ],
      }).success,
    ).toBe(false);
    expect(
      FileImportSchema.safeParse({ ...input, path: 'C:/secret', replacements: [{ token, fileId }] })
        .success,
    ).toBe(false);
    expect(
      FileImportSchema.safeParse({
        ...input,
        destination: { type: 'project', id: fileId, profileId: fileId },
        replacements: [{ token, fileId }],
      }).success,
    ).toBe(false);
  });
  test('names preserve Chinese filenames and reject Windows aliases, traversal and streams', () => {
    expect(FileRelativePathSchema.parse('材料/第一章/笔记.MD')).toBe('材料/第一章/笔记.MD');
    for (const name of ['../secret', 'CON.txt', 'aux', 'a:b', 'note.', 'a\\b', 'a\0b'])
      expect(FileNameSchema.safeParse(name).success).toBe(false);
    for (const path of ['../x', 'a/../x', '/x', 'C:/x', 'a//x', 'a/CON', 'a\\x'])
      expect(FileRelativePathSchema.safeParse(path).success).toBe(false);
  });
  test('parser output cannot invent sheet coordinates or duplicate structure identities', () => {
    const doc = {
      schemaVersion: 1,
      parserVersion: 'p03-v1',
      format: 'sheet',
      blocks: [],
      pages: [],
      slides: [],
      entries: [],
      quality: { needsOcr: false, warnings: [] },
      sheets: [
        {
          id: 's1',
          name: '表1',
          rows: 1,
          columns: 1,
          cells: [{ row: 1, column: 1, value: null, formula: 'SUM(A2:A3)', calculated: false }],
        },
      ],
    };
    expect(ParsedDocumentSchema.safeParse(doc).success).toBe(true);
    expect(
      ParsedDocumentSchema.safeParse({ ...doc, sheets: [{ ...doc.sheets[0], rows: 0 }] }).success,
    ).toBe(false);
    expect(
      ParsedDocumentSchema.safeParse({ ...doc, sheets: [doc.sheets[0], doc.sheets[0]] }).success,
    ).toBe(false);
    expect(ParsedDocumentSchema.safeParse({ ...doc, privatePath: 'C:/secret' }).success).toBe(
      false,
    );
  });
});
