import { parse } from '@babel/parser';
import { builtinModules } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { root, isMain } from './lib.mjs';
const pure = new Set(['contracts', 'ui', 'renderer']);
const allowed = {
  contracts: [],
  ui: ['contracts'],
  renderer: ['contracts', 'ui'],
  core: [
    'contracts',
    'storage',
    'providers',
    'context',
    'tools',
    'network',
    'retrieval',
    'workflows',
  ],
  storage: ['contracts'],
  providers: ['contracts', 'network'],
  context: ['contracts'],
  retrieval: ['contracts', 'storage', 'network'],
  tools: ['contracts', 'network'],
  workflows: ['contracts', 'tools'],
  network: ['contracts'],
};
export function checkImport(owner, specifier, filename) {
  const normalized = specifier.replaceAll('\\', '/');
  let target = normalized.startsWith('@tapkit/') ? normalized.split('/')[1] : undefined;
  if (normalized.startsWith('.')) {
    const resolved = resolve(filename, '..', normalized).replaceAll('\\', '/');
    target = resolved.match(/\/packages\/([^/]+)\//)?.[1];
    if (owner === 'renderer' && /\/src\/(main|preload)\//.test(resolved))
      throw new Error('Renderer imported privileged desktop code');
  }
  if (target && target !== owner && !(allowed[owner] ?? []).includes(target))
    throw new Error(owner + ' cannot import ' + target);
  if (pure.has(owner)) {
    if (
      normalized.startsWith('node:') ||
      builtinModules.includes(normalized) ||
      /^(electron|better-sqlite3|@earendil-works\/pi-ai)(\/|$)/.test(normalized)
    )
      throw new Error(owner + ' imported privileged module ' + normalized);
    if (!normalized.startsWith('.') && !normalized.startsWith('@tapkit/') && filename) {
      const manifest =
        owner === 'renderer'
          ? join(root, 'apps/desktop/package.json')
          : join(root, 'packages', owner, 'package.json');
      const packageName = normalized.startsWith('@')
        ? normalized.split('/').slice(0, 2).join('/')
        : normalized.split('/')[0];
      // Declared pure package dependencies are additionally checked by the manifest graph.
      return { manifest, packageName };
    }
  }
}
export async function auditBoundaries() {
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    return (
      await Promise.all(
        entries
          .filter((e) => !['node_modules', 'dist'].includes(e.name))
          .map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])),
      )
    ).flat();
  }
  const files = [
    ...(await walk(join(root, 'apps/desktop/src/renderer'))),
    ...(await walk(join(root, 'packages'))),
  ].filter((p) => /\.[cm]?tsx?$/.test(p) && !/[\\/]node_modules[\\/]|[\\/]dist[\\/]/.test(p));
  for (const file of files) {
    const rel = relative(root, file).replaceAll('\\', '/');
    const owner = rel.startsWith('apps/') ? 'renderer' : rel.split('/')[1];
    const source = parse(await readFile(file, 'utf8'), {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      let spec;
      if (
        [
          'ImportDeclaration',
          'ExportNamedDeclaration',
          'ExportAllDeclaration',
          'ImportExpression',
        ].includes(node.type)
      )
        spec = node.source;
      else if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === 'require'
      )
        spec = node.arguments[0];
      else if (node.type === 'TSExternalModuleReference') spec = node.expression;
      if (spec?.type === 'StringLiteral') checkImport(owner, spec.value, file);
      else if (
        pure.has(owner) &&
        (node.type === 'ImportExpression' ||
          (node.type === 'CallExpression' && node.callee?.name === 'require'))
      )
        throw new Error('Computed module loading forbidden in pure boundary: ' + rel);
      for (const [key, child] of Object.entries(node))
        if (!['loc', 'start', 'end', 'comments', 'tokens'].includes(key)) visit(child);
    }
    visit(source);
  }
  console.log('Dependency boundaries verified');
}
if (isMain(import.meta.url)) await auditBoundaries();
