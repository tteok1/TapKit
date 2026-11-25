export const installerManifestName = 'release-manifest.json';
export const installerMinimumOS = 'Windows 11';
export const installerMaximumBytes = 1.5 * 1024 ** 3;
export const installerManifestMaximumBytes = 32 * 1024;

export type InstallerManifest = {
  version: string;
  platform: 'windows';
  arch: 'x64';
  name: string;
  bytes: number;
  url: string | null;
  sha256: string;
  signatureStatus: 'unsigned' | 'verified';
  minOS: typeof installerMinimumOS;
  releaseNotesURL: string | null;
};

export function isInstallerVersion(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){2}$/.test(value) &&
    value.split('.').every((part) => Number(part) <= 65535)
  );
}

export function isReleaseRepository(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/.test(value);
}

export function installerAssetName(version: string, signed: boolean) {
  return 'TapKit-' + version + '-windows-x64' + (signed ? '' : '-development') + '.exe';
}

export function releaseAssetURL(repository: string, version: string, name: string) {
  return 'https://github.com/' + repository + '/releases/download/v' + version + '/' + name;
}

export function releaseNotesURL(repository: string, version: string) {
  return 'https://github.com/' + repository + '/releases/tag/v' + version;
}

export function readInstallerManifest(value: unknown, repository: string): InstallerManifest {
  if (!isReleaseRepository(repository) || !value || typeof value !== 'object')
    throw Error('UPDATE_MANIFEST_FORMAT');
  const entry = value as Record<string, unknown>;
  const version = entry.version;
  const signed = entry.signatureStatus === 'verified';
  if (
    !isInstallerVersion(version) ||
    (!signed && entry.signatureStatus !== 'unsigned') ||
    entry.platform !== 'windows' ||
    entry.arch !== 'x64' ||
    entry.minOS !== installerMinimumOS ||
    entry.name !== installerAssetName(version, signed) ||
    typeof entry.bytes !== 'number' ||
    !Number.isSafeInteger(entry.bytes) ||
    entry.bytes <= 0 ||
    entry.bytes > installerMaximumBytes ||
    typeof entry.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(entry.sha256) ||
    entry.url !== (signed ? releaseAssetURL(repository, version, entry.name) : null) ||
    entry.releaseNotesURL !== (signed ? releaseNotesURL(repository, version) : null)
  )
    throw Error('UPDATE_MANIFEST_FORMAT');
  return entry as InstallerManifest;
}
