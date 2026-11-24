import { createHash, randomUUID } from 'node:crypto';
import { link, open, unlink } from 'node:fs/promises';

type Fetch = (url: string, options: RequestInit) => Promise<Response>;
export type InstallerRelease = {
  version: string;
  name: string;
  url: string;
  bytes: number;
  sha256: string;
};
const limit = 1.5 * 1024 ** 3;
const versionPattern = /^\d{1,5}\.\d{1,5}\.\d{1,5}$/;
const downloadHosts = new Set([
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
]);

function compareVersions(a: string, b: string) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  return left[0]! - right[0]! || left[1]! - right[1]! || left[2]! - right[2]!;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function selectInstallerRelease(
  value: unknown,
  repository: string,
  current: string,
): InstallerRelease | undefined {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !versionPattern.test(current))
    throw Error('UPDATE_CONFIGURATION');
  if (!Array.isArray(value)) throw Error('UPDATE_RELEASE_FORMAT');
  let best: InstallerRelease | undefined;
  for (const raw of value) {
    const release = asObject(raw);
    const tag = release.tag_name;
    if (release.draft !== false || typeof tag !== 'string' || !Array.isArray(release.assets))
      continue;
    const version = tag.replace(/^v/, '');
    if (!versionPattern.test(version) || compareVersions(version, best?.version ?? current) <= 0)
      continue;
    const name = 'TapKit-' + version + '-windows-x64-development.exe';
    const url = 'https://github.com/' + repository + '/releases/download/' + tag + '/' + name;
    for (const rawAsset of release.assets) {
      const asset = asObject(rawAsset);
      if (
        asset.name === name &&
        asset.state === 'uploaded' &&
        asset.browser_download_url === url &&
        typeof asset.digest === 'string' &&
        /^sha256:[a-f0-9]{64}$/.test(asset.digest) &&
        typeof asset.size === 'number' &&
        Number.isSafeInteger(asset.size) &&
        asset.size > 0 &&
        asset.size <= limit
      ) {
        best = { version, name, url, bytes: asset.size, sha256: asset.digest.slice(7) };
        break;
      }
    }
  }
  return best;
}

async function consume(
  response: Response,
  maxBytes: number,
  write: (chunk: Uint8Array) => void | Promise<void>,
) {
  if (!response.ok || !response.body) throw Error('UPDATE_UNAVAILABLE');
  const reader = response.body.getReader();
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return bytes;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) throw Error('UPDATE_SIZE');
      await write(next.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function checkInstallerRelease(fetch: Fetch, repository: string, current: string) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw Error('UPDATE_CONFIGURATION');
  const response = await fetch(
    'https://api.github.com/repos/' + repository + '/releases?per_page=15',
    {
      redirect: 'error',
      credentials: 'omit',
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(12_000),
    },
  );
  const parts: Uint8Array[] = [];
  await consume(response, 2 * 1024 * 1024, (part) => {
    parts.push(part);
  });
  return selectInstallerRelease(
    JSON.parse(Buffer.concat(parts).toString('utf8')),
    repository,
    current,
  );
}

export async function downloadInstaller(
  fetch: Fetch,
  release: InstallerRelease,
  destination: string,
) {
  const signal = AbortSignal.timeout(20 * 60_000);
  let url = new URL(release.url);
  let response;
  for (let hop = 0; hop < 5; hop++) {
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !downloadHosts.has(url.hostname)
    )
      throw Error('UPDATE_REDIRECT');
    response = await fetch(url.href, { redirect: 'manual', credentials: 'omit', signal });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const next = response.headers.get('location');
    await response.body?.cancel();
    if (!next || hop === 4) throw Error('UPDATE_REDIRECT');
    url = new URL(next, url);
  }
  if (!response) throw Error('UPDATE_UNAVAILABLE');
  const temporary = destination + '.' + randomUUID() + '.download';
  const handle = await open(temporary, 'wx');
  try {
    const hash = createHash('sha256');
    try {
      const size = await consume(response, release.bytes, async (chunk) => {
        hash.update(chunk);
        await handle.writeFile(chunk);
      });
      if (size !== release.bytes || hash.digest('hex') !== release.sha256)
        throw Error('UPDATE_HASH');
      await handle.sync();
    } finally {
      await handle.close();
    }
    // Publishing by hard link fails on an existing destination and cannot expose a partial file.
    await link(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
