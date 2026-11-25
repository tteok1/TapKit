import { createHash, randomUUID } from 'node:crypto';
import { link, open, unlink } from 'node:fs/promises';
import {
  installerAssetName,
  installerManifestMaximumBytes,
  installerManifestName,
  installerMaximumBytes,
  isInstallerVersion,
  isReleaseRepository,
  readInstallerManifest,
  releaseAssetURL,
} from '@tapkit/contracts';

type Fetch = (url: string, options: RequestInit) => Promise<Response>;
type ReleaseAsset = {
  name: string;
  url: string;
  bytes: number;
  sha256: string;
};
export type InstallerRelease = ReleaseAsset & { version: string };
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

function findAsset(
  assets: unknown[],
  repository: string,
  version: string,
  name: string,
  limit: number,
): ReleaseAsset | undefined {
  const url = releaseAssetURL(repository, version, name);
  for (const rawAsset of assets) {
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
    )
      return { name, url, bytes: asset.size, sha256: asset.digest.slice(7) };
  }
}

export function selectInstallerRelease(
  value: unknown,
  repository: string,
  current: string,
): (InstallerRelease & { manifest: ReleaseAsset }) | undefined {
  if (!isReleaseRepository(repository) || !isInstallerVersion(current))
    throw Error('UPDATE_CONFIGURATION');
  if (!Array.isArray(value)) throw Error('UPDATE_RELEASE_FORMAT');
  let best: (InstallerRelease & { manifest: ReleaseAsset }) | undefined;
  for (const raw of value) {
    const release = asObject(raw);
    const tag = release.tag_name;
    if (
      release.draft !== false ||
      release.prerelease === true ||
      typeof tag !== 'string' ||
      !tag.startsWith('v') ||
      !Array.isArray(release.assets)
    )
      continue;
    const version = tag.slice(1);
    if (!isInstallerVersion(version) || compareVersions(version, best?.version ?? current) <= 0)
      continue;
    const installer = findAsset(
      release.assets,
      repository,
      version,
      installerAssetName(version, true),
      installerMaximumBytes,
    );
    const manifest = findAsset(
      release.assets,
      repository,
      version,
      installerManifestName,
      installerManifestMaximumBytes,
    );
    if (installer && manifest) best = { version, ...installer, manifest };
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

export async function checkInstallerRelease(
  fetch: Fetch,
  repository: string,
  current: string,
): Promise<InstallerRelease | undefined> {
  if (!isReleaseRepository(repository) || !isInstallerVersion(current))
    throw Error('UPDATE_CONFIGURATION');
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
  const candidate = selectInstallerRelease(
    JSON.parse(Buffer.concat(parts).toString('utf8')),
    repository,
    current,
  );
  if (!candidate) return undefined;
  const { manifest, ...installer } = candidate;
  const responseManifest = await fetchReleaseAsset(
    fetch,
    manifest.url,
    AbortSignal.timeout(12_000),
  );
  const manifestParts: Uint8Array[] = [];
  const size = await consume(responseManifest, manifest.bytes, (part) => {
    manifestParts.push(part);
  });
  const bytes = Buffer.concat(manifestParts);
  if (
    size !== manifest.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== manifest.sha256
  )
    throw Error('UPDATE_MANIFEST_HASH');
  const parsed = readInstallerManifest(JSON.parse(bytes.toString('utf8')), repository);
  if (
    parsed.signatureStatus !== 'verified' ||
    parsed.version !== installer.version ||
    parsed.url !== installer.url ||
    parsed.bytes !== installer.bytes ||
    parsed.sha256 !== installer.sha256
  )
    throw Error('UPDATE_MANIFEST_MISMATCH');
  return installer;
}

async function fetchReleaseAsset(fetch: Fetch, address: string, signal: AbortSignal) {
  let url = new URL(address);
  for (let hop = 0; hop < 5; hop++) {
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !downloadHosts.has(url.hostname)
    )
      throw Error('UPDATE_REDIRECT');
    const response = await fetch(url.href, { redirect: 'manual', credentials: 'omit', signal });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const next = response.headers.get('location');
    await response.body?.cancel();
    if (!next) throw Error('UPDATE_REDIRECT');
    url = new URL(next, url);
  }
  throw Error('UPDATE_REDIRECT');
}

export async function downloadInstaller(
  fetch: Fetch,
  release: InstallerRelease,
  destination: string,
) {
  const response = await fetchReleaseAsset(fetch, release.url, AbortSignal.timeout(20 * 60_000));
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
