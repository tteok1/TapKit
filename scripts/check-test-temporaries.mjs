import { parse } from '@babel/parser';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { root, isMain } from './lib.mjs';

export function checkTestTemporaries(source, filename) {
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'importAttributes'] });
  for (const item of ast.program.body) {
    if (item.type !== 'ImportDeclaration') continue;
    if (
      ['fs', 'fs/promises', 'node:fs', 'node:fs/promises'].includes(item.source.value) &&
      item.specifiers.some(
        (specifier) =>
          specifier.type === 'ImportSpecifier' &&
          ['mkdtemp', 'mkdtempSync'].includes(specifier.imported.name),
      )
    )
      throw Error(filename + ': use scripts/test-temp.mjs for owned test directories');
    if (
      /[\\/]e2e[\\/]/.test(filename) &&
      item.source.value === '@playwright/test' &&
      item.specifiers.some(
        (specifier) => specifier.type === 'ImportSpecifier' && specifier.imported.name === 'test',
      ) &&
      !filename.endsWith('/e2e/test.ts') &&
      !filename.endsWith('\\e2e\\test.ts')
    )
      throw Error(filename + ': use the local Playwright fixture for worker cleanup');
  }
}

export async function auditTestTemporaries() {
  let checked = 0;
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.name.endsWith('.ts')) {
        checkTestTemporaries(await readFile(file, 'utf8'), file);
        checked++;
      }
    }
  }
  for (const directory of ['unit', 'integration', 'e2e'])
    await walk(join(root, 'tests', directory));
  checkTestTemporaries(await readFile(join(root, 'tests/setup.ts'), 'utf8'), 'tests/setup.ts');
  console.log('Automated test temporary-directory ownership verified: ' + (checked + 1) + ' files');
}

if (isMain(import.meta.url)) await auditTestTemporaries();
