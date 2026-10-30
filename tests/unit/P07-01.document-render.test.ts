import { expect, test } from 'vitest';
import { renderDocumentDraft } from '../../packages/workflows/src/document-render';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';
import { validateDocumentStructure } from '../../packages/workflows/src/document-validation';
import { emptyDocument } from '../../packages/retrieval/src/ingest/text';

test('P07-01 fixed document renderer preserves Chinese and numeric table content in editable DOCX', async () => {
  const output = await renderDocumentDraft({
    schemaVersion: 1,
    title: '年度报告',
    audience: '读者',
    language: 'zh-CN',
    sections: [
      {
        blockId: 'one',
        heading: '销售',
        blocks: [
          { type: 'paragraph', text: '中文，标点。' },
          { type: 'table', columns: ['项目', '金额'], rows: [['甲', '123.45']] },
          { type: 'code', language: 'text', text: '```\n示例' },
        ],
      },
    ],
  });
  const parsed = await parseOfficeFile(output.docx, 'docx');
  expect(JSON.stringify(parsed.blocks)).toContain('123.45');
  expect(JSON.stringify(parsed.blocks)).toContain('中文，标点。');
  expect(output.markdown).toContain('| 甲 | 123.45 |');
  expect(output.markdown).toContain('````\n```');
});

test('P07-01 rejects images without an authorized resolver', async () => {
  await expect(
    renderDocumentDraft({
      schemaVersion: 1,
      title: '报告',
      audience: '',
      language: 'zh',
      sections: [
        {
          blockId: 'one',
          heading: '图片',
          blocks: [
            { type: 'image', fileVersionId: '0199b35d-9700-7000-8000-000000000001', alt: '图片' },
          ],
        },
      ],
    }),
  ).rejects.toThrow('IMAGE_AUTHORIZATION_REQUIRED');
});

test('P07-01 does not present an empty outline as a finished document', async () => {
  await expect(
    renderDocumentDraft({
      schemaVersion: 1,
      title: '报告',
      audience: '',
      language: 'zh',
      sections: [{ blockId: 'one', heading: '摘要', blocks: [] }],
    }),
  ).rejects.toThrow('DOCUMENT_CONTENT_REQUIRED');
});

test('P07-01 preserves paragraph and table line breaks in Markdown', async () => {
  const output = await renderDocumentDraft({
    schemaVersion: 1,
    title: '报告',
    audience: '',
    language: 'zh',
    sections: [
      {
        blockId: 'one',
        heading: '标题',
        blocks: [
          { type: 'paragraph', text: '第一行\n第二行' },
          { type: 'table', columns: ['列'], rows: [['第一行\n第二行']] },
        ],
      },
    ],
  });
  expect(output.markdown).toContain('第一行  \n第二行');
  expect(output.markdown).toContain('第一行<br>第二行');
  const parsed = await parseOfficeFile(output.docx, 'docx');
  expect(JSON.stringify(parsed.blocks)).toContain('第一行');
  expect(JSON.stringify(parsed.blocks)).toContain('第二行');
});

test('P07-01 renders explicit cover fields and refuses citations unless each source is authorized', async () => {
  const ref = {
    kind: 'file' as const,
    fileId: '0199b35d-9700-7000-8000-000000000001',
    versionId: '0199b35d-9700-7000-8000-000000000002',
  };
  const draft = {
    schemaVersion: 1,
    title: '项目计划',
    audience: '团队',
    language: 'zh-CN',
    style: {
      template: 'proposal',
      fields: { name: '张三', date: '2026-10-28', brand: '示例' },
      tableOfContents: true,
      pageNumbers: true,
    },
    sections: [{ blockId: 'goal', heading: '目标', blocks: [{ type: 'paragraph', text: '内容' }] }],
    citations: [{ label: '已选资料', ref }],
  };
  await expect(renderDocumentDraft(draft)).rejects.toThrow('CITATION_AUTHORIZATION_REQUIRED');
  await expect(renderDocumentDraft(draft, async () => false)).rejects.toThrow(
    'CITATION_AUTHORIZATION_REQUIRED',
  );
  const seen: unknown[] = [];
  const result = await renderDocumentDraft(draft, async (item) => {
    seen.push(item);
    return true;
  });
  expect(seen).toEqual([ref]);
  expect(result.markdown).toContain('姓名：张三');
  expect(result.markdown).toContain('## 目录');
  expect(result.markdown).toContain('已选资料');
  const parsed = await parseOfficeFile(result.docx, 'docx');
  expect(JSON.stringify(parsed.blocks)).toContain('张三');
  expect(JSON.stringify(parsed.blocks)).toContain('已选资料');
});

test('P07-01 structure validation rejects incomplete content or wrong document type', async () => {
  const spec = {
    schemaVersion: 1,
    title: '报告',
    audience: '',
    language: 'zh',
    sections: [
      {
        blockId: 'one',
        heading: '销售',
        blocks: [
          { type: 'paragraph', text: '完整中文正文' },
          { type: 'table', columns: ['金额'], rows: [['123.45']] },
        ],
      },
    ],
  };
  const output = await renderDocumentDraft(spec);
  const parsed = await parseOfficeFile(output.docx, 'docx');
  expect(validateDocumentStructure(spec, parsed)).toBe(true);
  expect(
    validateDocumentStructure(
      {
        ...spec,
        sections: [{ ...spec.sections[0], blocks: [{ type: 'paragraph', text: '缺失的内容' }] }],
      },
      parsed,
    ),
  ).toBe(false);
  expect(validateDocumentStructure(spec, { ...parsed, format: 'text' })).toBe(false);
});

test('P07-01 PDF verification rejects text clipped at the page edge and invalid page geometry', () => {
  const spec = {
    schemaVersion: 1,
    title: '报告',
    audience: '',
    language: '中文',
    sections: [
      { blockId: 'one', heading: '摘要', blocks: [{ type: 'paragraph', text: '正文 123.45' }] },
    ],
  };
  const pdf = emptyDocument('pdf');
  pdf.pages.push({ width: 595, height: 842 });
  pdf.blocks.push({
    id: 'p1',
    kind: 'text',
    text: '报告 摘要 正文 123.45',
    locator: { kind: 'pdf', pageIndex: 0, rects: [{ x: 0.1, y: 0.1, width: 0.5, height: 0.03 }] },
  });
  expect(validateDocumentStructure(spec, pdf, 'pdf')).toBe(true);
  expect(
    validateDocumentStructure(spec, { ...pdf, pages: [{ width: 100, height: 100 }] }, 'pdf'),
  ).toBe(false);
  pdf.blocks[0]!.locator = {
    kind: 'pdf',
    pageIndex: 0,
    rects: [{ x: 0, y: 0.1, width: 0.5, height: 0.03 }],
  };
  expect(validateDocumentStructure(spec, pdf, 'pdf')).toBe(false);
  pdf.blocks[0]!.locator = { kind: 'pdf', pageIndex: 0 };
  expect(validateDocumentStructure(spec, pdf, 'pdf')).toBe(false);
});

test('P07-01 bounded layout candidates preserve document text and stop after two repairs', async () => {
  const spec = {
    schemaVersion: 1,
    title: '长报告',
    audience: '团队',
    language: '中文',
    sections: [
      {
        blockId: 'one',
        heading: '明细',
        blocks: [
          { type: 'paragraph', text: '真实数字 123.45，中文标点。' },
          { type: 'table', columns: ['项目', '金额'], rows: [['甲', '42']] },
        ],
      },
    ],
  };
  const candidates = await Promise.all(
    [0, 1, 2].map((attempt) => renderDocumentDraft(spec, undefined, undefined, attempt)),
  );
  expect(new Set(candidates.map((candidate) => candidate.markdown)).size).toBe(1);
  for (const candidate of candidates)
    expect(validateDocumentStructure(spec, await parseOfficeFile(candidate.docx, 'docx'))).toBe(
      true,
    );
  expect(candidates[0]!.docx.equals(candidates[1]!.docx)).toBe(false);
  expect(candidates[1]!.docx.equals(candidates[2]!.docx)).toBe(false);
  await expect(renderDocumentDraft(spec, undefined, undefined, 3)).rejects.toThrow(
    'LAYOUT_REPAIR_LIMIT',
  );
});
