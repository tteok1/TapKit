import { it, expect, vi, afterEach } from 'vitest';
const native = vi.hoisted(() => ({ resolveProxy: vi.fn() }));
vi.mock('electron', () => ({ session: { defaultSession: { resolveProxy: native.resolveProxy } } }));
import { parseSystemProxy, resolveSystemProxy } from '../../apps/desktop/src/main/system-proxy';
afterEach(() => {
  native.resolveProxy.mockReset();
  vi.useRealTimers();
});
it.each([
  ['DIRECT', ''],
  ['PROXY 127.0.0.1:7890; DIRECT', 'http://127.0.0.1:7890'],
  ['HTTPS proxy.example:443', 'https://proxy.example'],
  ['PROXY proxy.example:80', 'http://proxy.example'],
  ['PROXY [::1]:7890', 'http://[::1]:7890'],
])('P01-02 parses the first supported system proxy route %s', (input, expected) =>
  expect(parseSystemProxy(input)).toBe(expected),
);
it.each([
  '',
  'SOCKS5 127.0.0.1:7890; DIRECT',
  'PROXY user:secret@proxy:7890',
  'PROXY proxy:0',
  'PROXY proxy:65536',
  'PROXY proxy:7890/private',
  'PROXY proxy:7890?secret=value',
])(
  'P01-02 refuses unsupported or credential-bearing system routes without using a DIRECT fallback',
  (input) => {
    expect(() => parseSystemProxy(input)).toThrow('PROXY_UNSUPPORTED');
  },
);
it('P01-02 private Host resolver passes only the public HTTPS URL and follows changing system routes', async () => {
  native.resolveProxy.mockResolvedValueOnce('PROXY 127.0.0.1:7890').mockResolvedValueOnce('DIRECT');
  const payload = { url: 'https://api.trusted.example/v1/chat/completions' };
  expect(await resolveSystemProxy(payload)).toEqual({ proxyURL: 'http://127.0.0.1:7890' });
  expect(await resolveSystemProxy(payload)).toEqual({ proxyURL: '' });
  expect(native.resolveProxy.mock.calls).toEqual([[payload.url], [payload.url]]);
  await expect(resolveSystemProxy({ ...payload, key: 'not-a-real-key' })).rejects.toThrow();
  await expect(resolveSystemProxy({ url: 'http://api.trusted.example' })).rejects.toThrow(
    'PERMISSION_DENIED',
  );
  expect(native.resolveProxy).toHaveBeenCalledTimes(2);
});
it('P01-02 bounds a stalled system proxy resolver without accessing credentials', async () => {
  vi.useFakeTimers();
  native.resolveProxy.mockImplementation(() => new Promise(() => {}));
  const result = expect(
    resolveSystemProxy({ url: 'https://api.trusted.example/v1/chat' }),
  ).rejects.toThrow('NETWORK_ERROR');
  await vi.advanceTimersByTimeAsync(5000);
  await result;
  expect(vi.getTimerCount()).toBe(0);
});
