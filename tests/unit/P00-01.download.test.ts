import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { download } from '../../scripts/runtime-fetch.mjs';
import { root } from '../../scripts/lib.mjs';

const directoryRoot = resolve(root, '.cache/download-regression');
const fixture = Buffer.from('locked runtime fixture');
const expected = createHash('sha256').update(fixture).digest('hex');
const url = 'https://download-fixture.invalid/runtime.zip';
let directory: string;
let destination: string;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(async () => {
  await mkdir(directoryRoot, { recursive: true });
  directory = await mkdtemp(join(directoryRoot, 'case-'));
  destination = join(directory, 'runtime.zip');
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => {
  vi.unstubAllGlobals();
  if (directory) {
    expect(dirname(directory)).toBe(directoryRoot);
    await rm(directory, { recursive: true, force: true });
  }
});
async function absent(path: string) {
  await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
}

test('P00-01 retries a 504 and 429 before publishing a checksum-verified archive', async () => {
  fetchMock
    .mockResolvedValueOnce(new Response('gateway timeout', { status: 504 }))
    .mockResolvedValueOnce(new Response('busy', { status: 429, headers: { 'Retry-After': '0' } }))
    .mockResolvedValueOnce(new Response(fixture));
  await download(url, destination, expected);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(await readFile(destination)).toEqual(fixture);
  await absent(destination + '.part');
});
test('P00-01 retries a transport reset before response headers', async () => {
  fetchMock
    .mockRejectedValueOnce(
      new TypeError('fetch failed', {
        cause: Object.assign(new Error('fixture reset'), { code: 'ECONNRESET' }),
      }),
    )
    .mockResolvedValueOnce(new Response(fixture));
  await download(url, destination, expected);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(await readFile(destination)).toEqual(fixture);
});
test('P00-01 removes an interrupted body before restarting the transfer', async () => {
  const interrupted = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(Buffer.from('partial unverified bytes'));
      await delay(20);
      controller.error(
        new TypeError('terminated', {
          cause: Object.assign(new Error('fixture socket close'), { code: 'UND_ERR_SOCKET' }),
        }),
      );
    },
  });
  fetchMock.mockResolvedValueOnce(new Response(interrupted)).mockImplementationOnce(async () => {
    await absent(destination);
    await absent(destination + '.part');
    return new Response(fixture);
  });
  await download(url, destination, expected);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(await readFile(destination)).toEqual(fixture);
  await absent(destination + '.part');
});
test.each([401, 403, 404])('P00-01 fails immediately on permanent HTTP %i', async (status) => {
  fetchMock.mockResolvedValueOnce(new Response('permanent failure', { status }));
  await expect(download(url, destination, expected)).rejects.toThrow('HTTP ' + status);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await absent(destination);
  await absent(destination + '.part');
});
test('P00-01 fails after three transient responses without leaving an archive', async () => {
  fetchMock.mockImplementation(async () => new Response('gateway timeout', { status: 504 }));
  await expect(download(url, destination, expected)).rejects.toThrow('HTTP 504');
  expect(fetchMock).toHaveBeenCalledTimes(3);
  await absent(destination);
  await absent(destination + '.part');
}, 15_000);
test('P00-01 does not retry or retain a checksum mismatch', async () => {
  fetchMock.mockResolvedValueOnce(new Response('untrusted bytes'));
  await expect(download(url, destination, expected)).rejects.toThrow('integrity mismatch');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await absent(destination);
  await absent(destination + '.part');
});
test('P00-01 reuses only a verified existing archive', async () => {
  await writeFile(destination, fixture);
  await download(url, destination, expected);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await readFile(destination)).toEqual(fixture);
});
test('P00-01 preserves and rejects a corrupt existing archive without replacing it', async () => {
  await writeFile(destination, 'corrupt cached fixture');
  await expect(download(url, destination, expected)).rejects.toThrow('integrity mismatch');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await readFile(destination, 'utf8')).toBe('corrupt cached fixture');
});
test('P00-01 refuses Retry-After beyond the existing total download budget', async () => {
  fetchMock.mockResolvedValueOnce(
    new Response('busy', { status: 503, headers: { 'Retry-After': '3600' } }),
  );
  await expect(download(url, destination, expected)).rejects.toThrow('HTTP 503');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await absent(destination);
});
test('P00-01 retains SHA512 base64 verification used by the locked pnpm archive', async () => {
  fetchMock.mockResolvedValueOnce(new Response(fixture));
  await download(
    url,
    destination,
    createHash('sha512').update(fixture).digest('base64'),
    'sha512',
    'base64',
  );
  expect(await readFile(destination)).toEqual(fixture);
});
test('P00-01 uses a configured mirror after a transient error and verifies the same digest', async () => {
  const mirror = 'https://mirror-fixture.invalid/runtime.zip';
  fetchMock
    .mockResolvedValueOnce(new Response('gateway timeout', { status: 504 }))
    .mockResolvedValueOnce(new Response(fixture));
  await download(url, destination, expected, 'sha256', 'hex', [mirror]);
  expect(fetchMock.mock.calls.map(([source]) => source)).toEqual([url, mirror]);
  expect(await readFile(destination)).toEqual(fixture);
  await absent(destination + '.part');
});
test('P00-01 never fails over after an integrity mismatch from a mirror', async () => {
  const mirror = 'https://mirror-fixture.invalid/runtime.zip';
  fetchMock
    .mockResolvedValueOnce(new Response('gateway timeout', { status: 504 }))
    .mockResolvedValueOnce(new Response('wrong mirror bytes'));
  await expect(
    download(url, destination, expected, 'sha256', 'hex', [mirror, 'https://unused.invalid/file']),
  ).rejects.toThrow('integrity mismatch');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await absent(destination);
  await absent(destination + '.part');
});
