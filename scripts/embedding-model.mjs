import { createHash } from 'node:crypto';
import { readFile, mkdir, rename, rm, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { root, isMain } from './lib.mjs';
export const modelLock = JSON.parse(
  await readFile(join(root, 'embedding-model-lock.json'), 'utf8'),
);
export const modelDirectory = join(root, 'resources/models', modelLock.directory);
async function valid(path, expected) {
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
export async function prepareEmbeddingModel() {
  for (const [name, expected] of Object.entries(modelLock.files)) {
    const path = join(modelDirectory, name);
    if (await valid(path, expected)) continue;
    await mkdir(dirname(path), { recursive: true });
    const temporary = path + '.download';
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(
          `https://huggingface.co/${modelLock.id}/resolve/${modelLock.revision}/${name}`,
          { signal: AbortSignal.timeout(120000) },
        );
        if (!response.ok) throw new Error('Model download HTTP ' + response.status);
        const { writeFile } = await import('node:fs/promises');
        await writeFile(temporary, Buffer.from(await response.arrayBuffer()));
        if (!(await valid(temporary, expected))) throw new Error('Model digest mismatch: ' + name);
        await rename(temporary, path);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        await rm(temporary, { force: true });
      }
    }
    if (lastError) throw lastError;
  }
  console.log('P04-01 locked local embedding model verified: ' + modelLock.revision);
}
export async function bundleEmbeddingModel(destination) {
  // Builds must validate already prepared assets; runtime inference never downloads.
  for (const [name, expected] of Object.entries(modelLock.files)) {
    if (!(await valid(join(modelDirectory, name), expected)))
      throw new Error('Missing verified model: ' + name);
    const target = join(destination, modelLock.directory, name);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(modelDirectory, name), target);
  }
}
if (isMain(import.meta.url)) await prepareEmbeddingModel();
