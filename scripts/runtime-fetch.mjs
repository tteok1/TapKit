import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { basename, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { root, runtimeLock, runtimeExe, run, isMain } from './lib.mjs';
const retryStatuses = new Set([408, 429, 500, 502, 503, 504]);
const retryNetworkCodes = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);
class DownloadHttpError extends Error {
  constructor(status, retryAfter) {
    super('Download failed: HTTP ' + status);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
function retryReason(error) {
  if (error instanceof DownloadHttpError)
    return retryStatuses.has(error.status) ? 'HTTP_' + error.status : undefined;
  const code = error?.cause?.code ?? error?.code;
  return retryNetworkCodes.has(code) ? code : undefined;
}
function retryDelay(error, attempt) {
  if (error instanceof DownloadHttpError && error.retryAfter) {
    const seconds = /^\d+$/.test(error.retryAfter) ? Number(error.retryAfter) : NaN;
    const date = Date.parse(error.retryAfter);
    const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : date - Date.now();
    if (Number.isFinite(milliseconds) && milliseconds >= 0) return milliseconds;
  }
  return 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
}
export async function digest(file, algorithm = 'sha256', encoding = 'hex') {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest(encoding);
}
export function assertDigest(actual, expected) {
  if (actual !== expected) throw new Error('Download integrity mismatch');
}
export async function download(
  url,
  destination,
  expected,
  algorithm = 'sha256',
  encoding = 'hex',
  mirrorUrls = [],
) {
  await mkdir(resolve(destination, '..'), { recursive: true });
  if (existsSync(destination)) {
    assertDigest(await digest(destination, algorithm, encoding), expected);
    return;
  }
  const temp = destination + '.part';
  const sources = [url, ...mirrorUrls];
  // Retry only transient transport failures, within the original ten-minute budget.
  const deadline = performance.now() + 600_000;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const source = sources[Math.min(attempt - 1, sources.length - 1)];
    try {
      const response = await fetch(source, {
        signal: AbortSignal.timeout(Math.max(1, Math.ceil(deadline - performance.now()))),
      });
      if (!response.ok || !response.body) {
        await response.body?.cancel().catch(() => {});
        throw new DownloadHttpError(response.status, response.headers.get('retry-after'));
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(temp));
      assertDigest(await digest(temp, algorithm, encoding), expected);
      await rename(temp, destination);
      return;
    } catch (error) {
      // No failed transfer or integrity check may become a reusable archive.
      await rm(temp, { force: true });
      const reason = retryReason(error);
      const waitMs = retryDelay(error, attempt);
      if (!reason || attempt === 3 || waitMs >= deadline - performance.now()) throw error;
      console.warn(
        'DOWNLOAD_RETRY attempt=' +
          attempt +
          ' reason=' +
          reason +
          ' waitMs=' +
          waitMs +
          ' sourceHost=' +
          new URL(source).hostname,
      );
      await delay(waitMs);
    }
  }
}
function extract(archive, target, kind) {
  if (kind === 'msi') {
    // Administrative extraction writes only the target tree; does not install/register Office.
    run(
      'msiexec.exe',
      [
        '/a',
        '"' + archive + '"',
        '/qn',
        'TARGETDIR="' + target + '"',
        '/l*v',
        '"' + join(target, 'extract.log') + '"',
      ],
      { windowsVerbatimArguments: true, timeout: 600_000 },
    );
  } else run('tar.exe', ['-xf', archive, '-C', target]);
}
export async function prepareRuntime(name) {
  const entry = runtimeLock.runtimes[name];
  const archive = join(root, '.cache/downloads', basename(new URL(entry.url).pathname));
  await download(entry.url, archive, entry.sha256, 'sha256', 'hex', entry.mirrorUrls);
  const target = join(root, '.runtime', name);
  await mkdir(target, { recursive: true });
  const marker = join(target, '.verified.json');
  let previous;
  try {
    previous = JSON.parse(await readFile(marker, 'utf8'));
  } catch {
    /* first preparation */
  }
  if (previous?.sha256 === entry.sha256 && existsSync(runtimeExe(name))) {
    console.log(name + ' already prepared ' + entry.version);
    return;
  }
  extract(archive, target, entry.archive);
  if (!existsSync(runtimeExe(name))) throw new Error('Missing runtime executable: ' + name);
  await writeFile(marker, JSON.stringify({ version: entry.version, sha256: entry.sha256 }));
  console.log(name + ' prepared ' + entry.version);
}
export async function preparePnpm() {
  const { packages } = JSON.parse(await readFile(join(root, 'dependency-baseline.json'), 'utf8'));
  const p = packages.pnpm;
  const [algorithm, expected] = p.integrity.split('-');
  const archive = join(root, '.cache/downloads/pnpm-' + p.version + '.tgz');
  await download(p.tarball, archive, expected, algorithm, 'base64');
  const target = join(root, '.cache/tools/pnpm');
  await mkdir(target, { recursive: true });
  extract(archive, target, 'tar.gz');
  const native = packages['@pnpm/exe.win32-x64'];
  const [nativeAlgorithm, nativeHash] = native.integrity.split('-');
  const nativeArchive = join(root, '.cache/downloads/pnpm-native-' + native.version + '.tgz');
  await download(native.tarball, nativeArchive, nativeHash, nativeAlgorithm, 'base64');
  const nativeTarget = join(target, 'package/node_modules/@pnpm/exe.win32-x64');
  await mkdir(nativeTarget, { recursive: true });
  const executable = join(nativeTarget, 'pnpm.exe');
  if (existsSync(executable)) assertDigest(await digest(executable), native.executableSha256);
  else {
    run('tar.exe', ['-xf', nativeArchive, '-C', nativeTarget, '--strip-components=1']);
    assertDigest(await digest(executable), native.executableSha256);
  }
}
export async function prepareWheels() {
  const { wheels } = JSON.parse(await readFile(join(root, 'python-wheels.lock.json'), 'utf8'));
  const pyRoot = join(root, '.runtime/python');
  const site = join(pyRoot, 'Lib/site-packages');
  await mkdir(site, { recursive: true });
  for (const wheel of wheels) {
    const file = join(root, '.cache/wheels', wheel.filename);
    await download(wheel.url, file, wheel.sha256);
    run('tar.exe', ['-xf', file, '-C', site]);
  }
  const pth = join(pyRoot, 'python313._pth');
  await writeFile(pth, 'python313.zip\n.\nLib/site-packages\nimport site\n');
  run(runtimeExe('python'), [
    '-c',
    'import pandas, openpyxl, matplotlib; print(pandas.__version__, openpyxl.__version__, matplotlib.__version__)',
  ]);
}
export async function prepareRuntimes() {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('P00 runtime target is Windows x64');
  await prepareRuntime('node');
  await preparePnpm();
  for (const name of ['python', 'git', 'rust', 'libreoffice']) await prepareRuntime(name);
  await prepareWheels();
}
if (isMain(import.meta.url)) await prepareRuntimes();
