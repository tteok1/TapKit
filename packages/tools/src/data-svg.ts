import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { DATA_LIMITS } from '@tapkit/contracts';
type Node = DefaultTreeAdapterMap['node'];
const tags = new Set([
  'svg',
  'g',
  'defs',
  'path',
  'clippath',
  'use',
  'style',
  'rect',
  'text',
  'tspan',
  'title',
  'desc',
  'line',
  'polyline',
  'polygon',
  'circle',
  'ellipse',
]);
const attrs = new Set([
  'id',
  'class',
  'width',
  'height',
  'viewbox',
  'version',
  'xmlns',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'transform',
  'style',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'clip-path',
  'clip-rule',
  'fill-rule',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'href',
  'text-anchor',
  'font-size',
]);
export function sanitizeChartSvg(source: string) {
  if (Buffer.byteLength(source) > DATA_LIMITS.maxSvgBytes) throw Error('SVG_LIMIT');
  const fragment = parseFragment(source);
  const roots = fragment.childNodes.filter((n) => 'tagName' in n);
  if (roots.length !== 1 || !('tagName' in roots[0]!) || roots[0].tagName !== 'svg')
    throw Error('SVG_ROOT');
  const safeCss = (value: string) =>
    !/@|\\|\/\*|expression|javascript|behavior|binding|url\s*\(/i.test(
      value.replace(/url\(\s*#[A-Za-z0-9_-]+\s*\)/g, ''),
    );
  let count = 0;
  function visit(node: Node) {
    if (++count > 100000) throw Error('SVG_LIMIT');
    if (!('tagName' in node)) return;
    if (!tags.has(node.tagName.toLowerCase())) throw Error('SVG_TAG');
    node.attrs = node.attrs.filter((a) => {
      const name = a.name.toLowerCase();
      if (
        name.startsWith('on') ||
        (name === 'href' && !/^#[A-Za-z0-9_-]+$/.test(a.value)) ||
        (['style', 'fill', 'stroke', 'clip-path'].includes(name) && !safeCss(a.value))
      )
        throw Error('SVG_ATTRIBUTE');
      if (name === 'href') {
        delete a.prefix;
        delete a.namespace;
      }
      return attrs.has(name);
    });
    node.childNodes = node.childNodes.filter(
      (n) => !('tagName' in n) || !['metadata'].includes(n.tagName.toLowerCase()),
    );
    if (
      node.tagName === 'style' &&
      !safeCss(node.childNodes.map((n) => ('value' in n ? n.value : '')).join(''))
    )
      throw Error('SVG_STYLE');
    node.childNodes.forEach(visit);
  }
  visit(roots[0]!);
  fragment.childNodes = roots;
  return serialize(fragment);
}
