import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, rename, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './lib.mjs';
export const exportFontLock = JSON.parse(
  await readFile(join(root, 'export-font-lock.json'), 'utf8'),
);
export async function validExportFont(path, expected) {
  try {
    return (
      createHash('sha256')
        .update(await readFile(path))
        .digest('hex') === expected
    );
  } catch {
    return false;
  }
}
export async function prepareExportFont() {
  const directory = join(root, 'resources/fonts');
  await mkdir(directory, { recursive: true });
  for (const [name, item] of Object.entries(exportFontLock.files)) {
    const target = join(directory, name);
    if (await validExportFont(target, item.sha256)) continue;
    const response = await fetch(item.source, { signal: AbortSignal.timeout(120000) });
    if (!response.ok || !response.body) throw new Error('Export font download failed');
    const parts = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 20 * 1024 * 1024) throw new Error('Export font size exceeded');
      parts.push(chunk);
    }
    const bytes = Buffer.concat(parts);
    if (createHash('sha256').update(bytes).digest('hex') !== item.sha256)
      throw new Error('Export font integrity mismatch');
    await writeFile(target + '.download', bytes);
    await rename(target + '.download', target);
  }
}
export async function bundleExportFont(directory) {
  await prepareExportFont();
  await mkdir(directory, { recursive: true });
  for (const [name, item] of Object.entries(exportFontLock.files)) {
    await copyFile(join(root, 'resources/fonts', name), join(directory, name));
    if (!(await validExportFont(join(directory, name), item.sha256)))
      throw new Error('Bundled export font integrity mismatch');
  }
}
