import { readFile } from 'node:fs/promises';

/** A missing, partial or older report cannot supply passing counts for this run. */
export async function readCurrentProbeResults(path, startedAt) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (!Number.isFinite(value.startTime) || value.startTime < Date.parse(startedAt)) return null;
    return value;
  } catch {
    return null;
  }
}
