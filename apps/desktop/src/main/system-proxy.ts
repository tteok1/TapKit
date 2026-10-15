import { session } from 'electron';
import { z } from '@tapkit/contracts';

// Private Host operation. Only proxy routing metadata crosses to Core; no Key or request body.
export function parseSystemProxy(result: string): string {
  if (result.length > 2048) throw new Error('PROXY_UNSUPPORTED');
  const first = result.split(';')[0]!.trim();
  if (first === 'DIRECT') return '';
  const match = /^(PROXY|HTTPS) ([^\s/]+)$/.exec(first);
  if (!match) throw new Error('PROXY_UNSUPPORTED');
  const authority = /^(?:\[[0-9a-fA-F:]+\]|[^:@\\/?#]+):([0-9]{1,5})$/.exec(match[2]!);
  if (!authority || Number(authority[1]) < 1 || Number(authority[1]) > 65535)
    throw new Error('PROXY_UNSUPPORTED');
  try {
    const url = new URL((match[1] === 'HTTPS' ? 'https://' : 'http://') + match[2]);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      throw new Error();
    return url.origin;
  } catch {
    throw new Error('PROXY_UNSUPPORTED');
  }
}
export async function resolveSystemProxy(
  payload: unknown,
  resolveProxy = (url: string) => session.defaultSession.resolveProxy(url),
): Promise<{ proxyURL: string }> {
  const { url } = z.strictObject({ url: z.string().max(2048).url() }).parse(payload);
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new Error('PERMISSION_DENIED');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      resolveProxy(parsed.href),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('NETWORK_ERROR')), 5000);
      }),
    ]);
    return { proxyURL: parseSystemProxy(result) };
  } finally {
    clearTimeout(timer);
  }
}
