import { expect, test } from 'vitest';
import { sanitizeChartSvg } from '../../packages/tools/src/data-svg';
test('P07-02 exported SVG removes metadata and rejects executable content, external resources and CSS URLs', () => {
  const clean = sanitizeChartSvg(
    '<svg xmlns="http://www.w3.org/2000/svg"><metadata>private</metadata><defs><path id="x" d="M0 0L1 1"/></defs><use href="#x"/></svg>',
  );
  expect(clean).not.toContain('private');
  expect(clean).toContain('href="#x"');
  for (const bad of [
    '<script>alert(1)</script>',
    '<foreignObject><iframe/></foreignObject>',
    '<use href="https://example.com/x"/>',
    '<path onclick="alert(1)"/>',
    '<style>@import "https://example.com"</style>',
    '<path style="fill:url(https://example.com)"/>',
  ])
    expect(() => sanitizeChartSvg('<svg>' + bad + '</svg>')).toThrow();
});
