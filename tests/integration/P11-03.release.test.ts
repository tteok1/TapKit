import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { expect, test, vi } from 'vitest';
import {
  type InstallerManifest,
  installerAssetName,
  installerManifestName,
  readInstallerManifest,
  releaseAssetURL,
  releaseNotesURL,
} from '../../packages/contracts/src';
import { checkInstallerRelease } from '../../apps/desktop/src/main/installer-updates';
import { buildDownloadSite, renderDownloadPage } from '../../scripts/release/site.mjs';
import {
  checkCandidateVersion,
  checkDevelopmentSbom,
  manifestForDevelopment,
  prepareDevelopmentRelease,
} from '../../scripts/release/prepare.mjs';
import { installerSbom } from '../../scripts/release/sbom.mjs';
import { auditReleaseHistory } from '../../scripts/scan-release.mjs';
import { mkdtemp, testRoot } from '../../scripts/test-temp.mjs';

const repository = 'tteok1/TapKit';
const baseline = JSON.parse(await readFile('release-manifest.json', 'utf8')) as InstallerManifest;
const config = { repository, publicSiteURL: null, logo: null };
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const version = '0.2.0';
const signedName = installerAssetName(version, true);
const manifest: InstallerManifest = {
  ...baseline,
  version,
  name: signedName,
  url: releaseAssetURL(repository, version, signedName),
  releaseNotesURL: releaseNotesURL(repository, version),
  signatureStatus: 'verified',
};

function feed(value: InstallerManifest, manifestTampered = false) {
  const metadata = JSON.stringify(value);
  const response = [
    {
      tag_name: 'v' + version,
      draft: false,
      prerelease: false,
      assets: [
        { name: signedName, size: manifest.bytes, digest: 'sha256:' + manifest.sha256 },
        {
          name: installerManifestName,
          size: Buffer.byteLength(metadata),
          digest: 'sha256:' + sha256(manifestTampered ? metadata + 'x' : metadata),
        },
      ].map((asset) => ({
        ...asset,
        state: 'uploaded',
        browser_download_url: releaseAssetURL(repository, version, asset.name),
      })),
    },
  ];
  return vi
    .fn()
    .mockResolvedValueOnce(Response.json(response))
    .mockResolvedValueOnce(new Response(metadata));
}

test('P11-03 binds the desktop installer to the tagged release manifest and GitHub digests', async () => {
  const fetch = feed(manifest);
  await expect(checkInstallerRelease(fetch, repository, baseline.version)).resolves.toMatchObject({
    version,
    url: manifest.url,
    sha256: manifest.sha256,
    bytes: manifest.bytes,
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenLastCalledWith(
    releaseAssetURL(repository, version, installerManifestName),
    expect.objectContaining({ redirect: 'manual', credentials: 'omit' }),
  );
});

test('P11-03 rejects a changed manifest, an incompatible installer and an untrusted URL', async () => {
  await expect(
    checkInstallerRelease(feed(manifest, true), repository, baseline.version),
  ).rejects.toThrow('UPDATE_MANIFEST_HASH');
  await expect(
    checkInstallerRelease(
      feed({ ...manifest, bytes: manifest.bytes - 1 }),
      repository,
      baseline.version,
    ),
  ).rejects.toThrow('UPDATE_MANIFEST_MISMATCH');
  await expect(
    checkInstallerRelease(
      feed({ ...manifest, url: 'https://example.org/setup.exe' }),
      repository,
      baseline.version,
    ),
  ).rejects.toThrow('UPDATE_MANIFEST_FORMAT');
  expect(() => readInstallerManifest({ ...baseline, url: manifest.url }, repository)).toThrow(
    'UPDATE_MANIFEST_FORMAT',
  );
});

test('P11-03 takes the tagged base installer and couples the SBOM to its bytes', () => {
  const accepted = {
    version: baseline.version,
    name: baseline.name,
    installerBytes: baseline.bytes,
    sha256: baseline.sha256,
  };
  const receipt = {
    channel: 'development',
    signed: false,
    artifacts: [
      { ...accepted, version: '0.1.1', name: installerAssetName('0.1.1', false) },
      accepted,
    ],
  };
  expect(manifestForDevelopment(receipt, baseline.version, repository)).toEqual(baseline);
  expect(() => checkCandidateVersion('v0.1.1', baseline.version)).toThrow('Tag must match');
  const sbom = installerSbom(baseline.version, baseline, [{ name: 'fixture' }]);
  expect(() => checkDevelopmentSbom(sbom, baseline)).not.toThrow();
  expect(() => checkDevelopmentSbom(sbom, { ...baseline, sha256: '0'.repeat(64) })).toThrow(
    'SBOM does not identify',
  );
});

test('P11-03 removes its staging directory if the installer bytes fail validation', async () => {
  const root = await mkdtemp(join(testRoot, 'P11-03-prepare-'));
  const packages = await mkdtemp(join(root, 'packages-'));
  const artifact = {
    version: baseline.version,
    name: baseline.name,
    installerBytes: baseline.bytes,
    sha256: baseline.sha256,
  };
  const executable = join(packages, artifact.name);
  await Promise.all([
    writeFile(
      join(packages, 'build-receipt.json'),
      JSON.stringify({
        channel: 'development',
        signed: false,
        artifacts: [artifact],
      }),
    ),
    writeFile(executable, 'truncated installer fixture'),
    writeFile(executable + '.sha256', baseline.sha256 + '  ' + artifact.name + '\n'),
    writeFile(
      executable.replace(/\.exe$/, '.cdx.json'),
      JSON.stringify(installerSbom(baseline.version, baseline, [{ name: 'fixture' }])),
    ),
  ]);
  await expect(
    prepareDevelopmentRelease(packages, join(root, 'candidate'), 'v' + baseline.version),
  ).rejects.toThrow('Installer bytes and SHA-256 disagree');
  expect(await readdir(root)).toEqual([basename(packages)]);
});

test('P11-03 builds an offline site with matching metadata and a disabled unsigned download', async () => {
  const output = await mkdtemp(join(testRoot, 'P11-03-site-'));
  await buildDownloadSite(output);
  const page = await readFile(join(output, 'index.html'), 'utf8');
  expect(page).toContain('disabled aria-describedby="download-state"');
  expect(page).toContain(baseline.sha256);
  expect(page).not.toContain('/releases/download/');
  expect(JSON.parse(await readFile(join(output, installerManifestName), 'utf8'))).toEqual(baseline);
  const preview = await readFile(join(output, 'assets/desktop.png'));
  expect(preview.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
});

test('P11-03 only exposes the configured exact download for a verified manifest', () => {
  const template = '{{DOWNLOAD_ACTION}}';
  const website = { ...config, publicSiteURL: 'https://tapkit.example' };
  const configured = { ...website, logo: 'tapkit.png' };
  expect(renderDownloadPage(template, config, manifest)).toContain('disabled');
  expect(renderDownloadPage(template, website, manifest)).toContain('disabled');
  expect(renderDownloadPage(template, configured, baseline)).toContain('disabled');
  expect(renderDownloadPage(template, configured, manifest)).toContain(
    'href="' + manifest.url + '"',
  );
  expect(renderDownloadPage('{{DOWNLOAD_STATE}}', config, manifest)).toBe('正式下载待开放。');
});

test('P11-03 release history review counts a removed synthetic credential without returning it', async () => {
  const cwd = await mkdtemp(join(testRoot, 'P11-03-history-'));
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=TapKit Fixture', '-c', 'user.email=tapkit@example.test', ...args],
      {
        cwd,
        stdio: 'pipe',
        windowsHide: true,
      },
    );
  git('init', '-q');
  const sample = join(cwd, 'sample.txt');
  await writeFile(sample, 'gh' + 'p_' + 'q'.repeat(36));
  git('add', 'sample.txt');
  git('commit', '-qm', 'Synthetic historical fixture');
  await writeFile(sample, 'Public replacement');
  git('commit', '-qam', 'Replace fixture');
  expect(auditReleaseHistory(cwd)).toEqual({
    credentialFindings: 1,
    oversizedTextBlobs: 0,
    pathFindings: 0,
    textBlobs: 2,
  });
});
