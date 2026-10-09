import { WindowLayoutSchema, DEFAULT_LAYOUT, type z } from '@tapkit/contracts';
export type WindowLayout = z.infer<typeof WindowLayoutSchema>;
export function requestOptions(expectedRevision?: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let time = Date.now();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = (bytes[6]! & 15) | 112;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return {
    requestId: [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-'),
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  };
}
export function readLayout(slot: string): WindowLayout {
  try {
    const raw = localStorage.getItem('tapkit.layout.' + slot);
    return raw ? WindowLayoutSchema.parse(JSON.parse(raw)) : structuredClone(DEFAULT_LAYOUT);
  } catch {
    return structuredClone(DEFAULT_LAYOUT);
  }
}
export function writeLayout(slot: string, layout: WindowLayout) {
  try {
    localStorage.setItem('tapkit.layout.' + slot, JSON.stringify(WindowLayoutSchema.parse(layout)));
  } catch {
    /* An unavailable browser store must not break navigation. */
  }
}
