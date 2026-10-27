import { test, expect } from 'vitest';
import {
  ExportDocumentSchema,
  ExportTargetSchema,
  ExportOptionsSchema,
} from '../../packages/contracts/src';
import { redactExport, renderExport } from '../../packages/workflows/src';
test('P05-02 T20 exports exclude credentials/internal paths and render scripts/images as inert content', () => {
  const secret = 'sk-synthetic-secret-key';
  const text = redactExport(
    'API_key=' +
      secret +
      '\n路径 C:\\Users\\Synthetic\\private.txt\nBearer synthetic-token\nfile:///C:/private\n<img src="https://tracker.invalid/pixel"><script>secret()</script>',
  );
  for (const forbidden of [secret, 'synthetic-token', 'C:\\Users', 'file:///'])
    expect(text).not.toContain(forbidden);
  const doc = ExportDocumentSchema.parse({
    title: '中文导出',
    messages: [{ id: '01990000-0000-7000-8000-000000000001', role: 'user', status: 'final', text }],
    sources: [],
    files: [],
    process: ['api_key=' + secret + ' <a id="source-1"></a>'],
  });
  const rendered = renderExport(doc);
  expect(rendered.html).not.toMatch(/<script\b|<img\b|<iframe\b|src="https:/i);
  expect(rendered.html).toContain("script-src 'none'");
  expect(rendered.html).toContain('中文导出');
  expect(rendered.markdown).not.toContain('<script>');
  expect(rendered.html).not.toContain(secret);
  expect(rendered.markdown).not.toContain(secret);
  expect(rendered.html).not.toContain('<a id="source-1">');
});
test('P05-02 T07 tables, long code whitespace, actual sources and safe package links survive', () => {
  const doc = ExportDocumentSchema.parse({
    title: '排版样本',
    messages: [
      {
        id: '01990000-0000-7000-8000-000000000001',
        role: 'assistant',
        status: 'final',
        text: '|项目|金额|\n|---|---|\n|中文|42|\n\n```html\n    <tag>正文</tag>\n```\n\n[来源](https://example.com/) [危险](javascript:alert(1))',
      },
    ],
    sources: [
      {
        number: 1,
        title: '原文',
        detail: 'v1',
        excerpt: '金额42',
        available: true,
        url: 'https://example.com/',
      },
    ],
    files: [],
    process: [],
  });
  const rendered = renderExport(doc);
  expect(rendered.html).toContain('<table>');
  expect(rendered.html).toContain('    &lt;tag&gt;正文&lt;/tag&gt;');
  expect(rendered.html).toContain('href="https://example.com/"');
  expect(rendered.html).not.toContain('href="javascript:');
  expect(rendered.markdown).toContain('    <tag>正文</tag>');
  expect(rendered.text).toContain('中文');
});
test('P05-02 T19 targets reject arbitrary paths and payload-supplied HTML/credentials', () => {
  expect(ExportTargetSchema.safeParse({ kind: 'files', paths: ['C:\\private'] }).success).toBe(
    false,
  );
  expect(ExportOptionsSchema.safeParse({ format: 'html', html: '<script>' }).success).toBe(false);
});
