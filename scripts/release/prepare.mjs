import { execFileSync } from 'node:child_process';
import { copyFile, cp, lstat, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  installerAssetName,
  installerManifestName,
  installerMinimumOS,
  isInstallerVersion,
  readInstallerManifest,
} from '../../packages/contracts/src/distribution.ts';
import { isMain, root } from '../lib.mjs';
import { distributionConfig } from './config.mjs';
import { fileDigest, readJSON } from './sbom.mjs';

export function checkCandidateVersion(tag, version) {
  if (!isInstallerVersion(version) || tag !== 'v' + version)
    throw Error('Tag must match the Windows desktop package version.');
}

export function manifestForDevelopment(receipt, version, repository) {
  const name = installerAssetName(version, false);
  const matches = receipt.artifacts?.filter(
    (item) => item.version === version && item.name === name,
  );
  if (receipt.channel !== 'development' || receipt.signed !== false || matches?.length !== 1)
    throw Error('Expected one unsigned build receipt entry for the tagged version.');
  return readInstallerManifest(
    {
      version,
      platform: 'windows',
      arch: 'x64',
      name,
      bytes: matches[0].installerBytes,
      url: null,
      sha256: matches[0].sha256,
      signatureStatus: 'unsigned',
      minOS: installerMinimumOS,
      releaseNotesURL: null,
    },
    repository,
  );
}

export function checkDevelopmentSbom(sbom, manifest) {
  if (
    sbom.bomFormat !== 'CycloneDX' ||
    sbom.specVersion !== '1.6' ||
    sbom.metadata?.component?.version !== manifest.version ||
    !sbom.metadata?.component?.hashes?.some(
      ({ alg, content }) => alg === 'SHA-256' && content === manifest.sha256,
    ) ||
    !Array.isArray(sbom.components) ||
    sbom.components.length === 0
  )
    throw Error('SBOM does not identify the tagged installer.');
}

export function probeInstaller(file) {
  const script = [
    '$ErrorActionPreference = "Stop"',
    'Import-Module (Join-Path $PSHOME "Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1")',
    '$file = $env:TAPKIT_RELEASE_PROBE_FILE',
    '$sig = Get-AuthenticodeSignature -LiteralPath $file',
    '$version = [Diagnostics.FileVersionInfo]::GetVersionInfo($file).ProductVersion',
    'ConvertTo-Json -Compress -InputObject @{ status = [string]$sig.Status; version = $version }',
  ].join('\n');
  return JSON.parse(
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      env: { ...process.env, TAPKIT_RELEASE_PROBE_FILE: file },
      windowsHide: true,
    }),
  );
}

export async function prepareDevelopmentRelease(packages, output, tag) {
  const { repository } = await distributionConfig();
  const { version } = await readJSON(join(root, 'apps/desktop/package.json'));
  checkCandidateVersion(tag, version);
  const receipt = await readJSON(join(packages, 'build-receipt.json'));
  const manifest = manifestForDevelopment(receipt, version, repository);
  const executable = join(packages, manifest.name);
  const checksum = manifest.sha256 + '  ' + manifest.name;
  const sbomName = manifest.name.replace(/\.exe$/, '.cdx.json');
  const exists = await lstat(output).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (exists) throw Error('Release candidate output already exists.');
  const staged = await mkdtemp(join(dirname(output), '.preparing-tapkit-'));
  try {
    const candidate = join(staged, manifest.name);
    const sbomSource = await readFile(join(packages, sbomName), 'utf8');
    const sbom = JSON.parse(sbomSource);
    checkDevelopmentSbom(sbom, manifest);
    if ((await readFile(executable + '.sha256', 'utf8')).trimEnd() !== checksum)
      throw Error('Receipt and SHA-256 sidecar disagree.');
    await copyFile(executable, candidate);
    const actual = await fileDigest(candidate);
    if (actual.bytes !== manifest.bytes || actual.sha256 !== manifest.sha256)
      throw Error('Installer bytes and SHA-256 disagree.');
    const signature = probeInstaller(candidate);
    if (
      signature.status !== 'NotSigned' ||
      (signature.version !== version && signature.version !== version + '.0')
    )
      throw Error('Unexpected Authenticode status or Windows installer version.');

    await writeFile(join(staged, sbomName), sbomSource);
    await cp(join(root, 'resources/licenses'), join(staged, 'licenses'), { recursive: true });
    await writeFile(join(staged, 'SHA256SUMS.txt'), checksum + '\n');
    await writeFile(join(staged, installerManifestName), JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(
      join(staged, 'validation.json'),
      JSON.stringify(
        {
          tag,
          repository,
          stage: 'development',
          signature,
          asset: actual,
          components: sbom.components.length,
        },
        null,
        2,
      ) + '\n',
    );
    await rename(staged, output);
  } finally {
    await rm(staged, { recursive: true, force: true });
  }
  return manifest;
}

if (isMain(import.meta.url)) {
  const [packages, output, tag] = process.argv.slice(2);
  if (!packages || !output || !tag || process.argv.length !== 5)
    throw Error('Expected package directory, new output directory and release tag.');
  const result = await prepareDevelopmentRelease(resolve(packages), resolve(output), tag);
  console.log('Verified development artifact ' + result.name + ' (' + result.bytes + ' bytes).');
}
