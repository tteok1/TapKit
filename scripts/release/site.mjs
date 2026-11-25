import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  installerManifestName,
  readInstallerManifest,
} from '../../packages/contracts/src/distribution.ts';
import { isMain, root } from '../lib.mjs';
import { distributionConfig } from './config.mjs';
import { readJSON } from './sbom.mjs';

const website = join(root, 'website');
const html = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );

export function renderDownloadPage(template, config, value) {
  const release = readInstallerManifest(value, config.repository);
  const repo = 'https://github.com/' + config.repository;
  const downloadable =
    config.publicSiteURL !== null && config.logo !== null && release.signatureStatus === 'verified';
  const fields = {
    REPOSITORY: html(repo),
    INSTALL_DOCS: html(repo + '/blob/main/docs/distribution/windows-development.md'),
    LOGO: config.logo ? '<img alt="" src="./assets/' + html(config.logo) + '" />' : '',
    VERSION: html(release.version),
    ARCH: html(release.arch),
    OS: html(release.minOS),
    CHANNEL: release.signatureStatus === 'verified' ? '正式版' : '开发测试版',
    SIZE: new Intl.NumberFormat('zh-CN').format(release.bytes) + ' 字节',
    HASH: html(release.sha256),
    DOWNLOAD_ACTION: downloadable
      ? '<a class="button" href="' + html(release.url) + '">下载 Windows 安装包</a>'
      : '<button class="button" disabled aria-describedby="download-state">下载 Windows 安装包</button>',
    DOWNLOAD_STATE: downloadable ? '安装前可核对文件的 SHA-256。' : '正式下载待开放。',
    RELEASE_NOTES: downloadable
      ? '<a href="' + html(release.releaseNotesURL) + '">版本说明</a>'
      : '',
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!(key in fields)) throw Error('Unknown website field ' + key);
    return fields[key];
  });
}

export async function buildDownloadSite(
  output = join(website, 'dist'),
  manifestPath = join(root, installerManifestName),
) {
  const [config, release, template] = await Promise.all([
    distributionConfig(),
    readJSON(manifestPath),
    readFile(join(website, 'index.html'), 'utf8'),
  ]);
  const page = renderDownloadPage(template, config, release);
  const assets = ['desktop.png'];
  if (config.logo) assets.push(config.logo);
  await Promise.all(assets.map((asset) => access(join(website, 'assets', asset))));
  await mkdir(join(output, 'assets'), { recursive: true });
  await Promise.all([
    writeFile(join(output, 'index.html'), page),
    copyFile(join(website, 'styles.css'), join(output, 'styles.css')),
    copyFile(manifestPath, join(output, installerManifestName)),
    ...assets.map((asset) =>
      copyFile(join(website, 'assets', asset), join(output, 'assets', asset)),
    ),
  ]);
}

if (isMain(import.meta.url)) {
  if (process.argv.length > 3) throw Error('Expected at most one manifest path.');
  const input = process.argv[2];
  await buildDownloadSite(undefined, input ? resolve(input) : undefined);
  console.log('Download site generated into website/dist.');
}
