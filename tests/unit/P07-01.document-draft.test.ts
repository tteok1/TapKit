import { describe, expect, test } from 'vitest';
import { zhipuToolNames } from '../../packages/providers/src/api/zhipu-tools';
import {
  DocumentDraftSchema,
  documentOutline,
  documentModelContext,
  replaceDocumentFields,
  reviseDocumentSection,
} from '../../packages/workflows/src/document-draft';

const draft = {
  schemaVersion: 1 as const,
  title: '报告',
  audience: '读者',
  language: 'zh-CN',
  sections: [
    { blockId: 'one', heading: '摘要', blocks: [{ type: 'paragraph' as const, text: '原文' }] },
    {
      blockId: 'two',
      heading: '数据',
      blocks: [{ type: 'table' as const, columns: ['金额'], rows: [['123.45']] }],
    },
  ],
};

describe('P07-01 document draft', () => {
  test('P07-01 long document context keeps valid JSON and the named section', () => {
    const document = DocumentDraftSchema.parse({
      ...draft,
      sections: [
        {
          blockId: 'long',
          heading: '背景',
          blocks: [{ type: 'paragraph', text: '长'.repeat(25000) }],
        },
        { blockId: 'target', heading: '建议', blocks: [{ type: 'paragraph', text: '原建议' }] },
      ],
    });
    const result = documentModelContext(document, '修改建议', 4000);
    expect(result.truncated).toBe(true);
    expect(result.content.length).toBeLessThanOrEqual(4000);
    expect(JSON.parse(result.content).focusedSection.blocks[0].text).toBe('原建议');
    expect(
      JSON.parse(documentModelContext(document, '继续处理', 4000).content).focusedSection,
    ).toBeUndefined();
  });
  test('P07-01 document tool has a reversible provider wire name', () => {
    expect(zhipuToolNames([{ name: 'document.create' }]).get('document_create')).toBe(
      'document.create',
    );
  });
  test('P07-01 creates three fixed outlines without fabricated content', () => {
    for (const [template, headings] of [
      ['report', ['摘要', '正文']],
      ['proposal', ['目标', '步骤', '资源', '验收']],
      ['minutes', ['议题', '结论', '待办']],
    ] as const) {
      const outline = documentOutline({
        title: '标题',
        audience: '读者',
        language: '中文',
        template,
      });
      expect(outline.sections.map((s) => s.heading)).toEqual(headings);
      expect(outline.sections.every((s) => s.blocks.length === 0)).toBe(true);
    }
  });
  test('revises only the selected section without mutating the original', () => {
    const updated = reviseDocumentSection(draft, 'v1', 'v1', 'one', {
      blockId: 'one',
      heading: '摘要',
      blocks: [{ type: 'paragraph', text: '新文' }],
    });
    expect(updated.sections[1]).toEqual(draft.sections[1]);
    expect(draft.sections[0]!.blocks[0]).toEqual({ type: 'paragraph', text: '原文' });
    expect(updated.sections[0]!.blocks[0]).toEqual({ type: 'paragraph', text: '新文' });
  });
  test('rejects stale versions, missing targets and changed identities', () => {
    expect(() => reviseDocumentSection(draft, 'v1', 'v2', 'one', draft.sections[0]!)).toThrow(
      'VERSION_CONFLICT',
    );
    expect(() => reviseDocumentSection(draft, 'v1', 'v1', 'missing', draft.sections[0]!)).toThrow(
      'VALIDATION_ERROR',
    );
    expect(() => reviseDocumentSection(draft, 'v1', 'v1', 'one', draft.sections[1]!)).toThrow(
      'VALIDATION_ERROR',
    );
  });
  test('P07-01 cover field replacement does not rewrite matching body content', () => {
    const input = {
      ...draft,
      style: {
        template: 'proposal',
        fields: { name: '原文', date: '', brand: '原文' },
        tableOfContents: false,
        pageNumbers: false,
      },
    };
    const changed = replaceDocumentFields(input, { name: '新姓名' });
    expect(changed.style.fields).toEqual({ name: '新姓名', date: '', brand: '原文' });
    expect(changed.sections).toEqual(draft.sections);
  });
  test('rejects malformed tables, duplicate identities and excess blocks', () => {
    expect(DocumentDraftSchema.safeParse({ ...draft, title: '坏\u0000标题' }).success).toBe(false);
    expect(
      DocumentDraftSchema.safeParse({
        ...draft,
        sections: [
          {
            blockId: 'big',
            heading: '',
            blocks: Array.from({ length: 5 }, () => ({
              type: 'paragraph',
              text: 'x'.repeat(90_000),
            })),
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      DocumentDraftSchema.safeParse({ ...draft, sections: [draft.sections[0], draft.sections[0]] })
        .success,
    ).toBe(false);
    expect(
      DocumentDraftSchema.safeParse({
        ...draft,
        sections: [
          {
            blockId: 'x',
            heading: '',
            blocks: [{ type: 'table', columns: ['a'], rows: [['1', '2']] }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      DocumentDraftSchema.safeParse({
        ...draft,
        sections: Array.from({ length: 2 }, (_, i) => ({
          blockId: String(i),
          heading: '',
          blocks: Array.from({ length: 501 }, () => ({ type: 'paragraph', text: '' })),
        })),
      }).success,
    ).toBe(false);
  });
});
