import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { root } from '../../scripts/lib.mjs';
import { requiredCases } from '../../scripts/p00-03-required-cases.mjs';

test('P00-03 standard-user probe requires every current integration case', async () => {
  const directory = join(root, 'tests/integration');
  const files = (await readdir(directory))
    .filter((name) => name.startsWith('P00-03.') && name.endsWith('.test.ts'))
    .sort();
  const actual: [string, string][] = [];

  for (const file of files) {
    const source = await readFile(join(directory, file), 'utf8');
    for (const match of source.matchAll(/\btest(?:\.skip)?\s*\(\s*(['"])(.*?)\1/g)) {
      const title = match[2];
      if (title !== undefined) actual.push([file, title]);
    }
  }

  const sortCases = (cases: readonly (readonly string[])[]) =>
    cases.map(([file, title]) => `${file}::${title}`).sort();
  expect(sortCases(requiredCases)).toEqual(sortCases(actual));
});
