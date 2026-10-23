import { WindowLayoutSchema, DEFAULT_LAYOUT, type z } from '@tapkit/contracts';
export type WindowLayout = z.infer<typeof WindowLayoutSchema>;
export const NAVIGATION_KEYS = ['chats', 'work', 'projects', 'files'] as const;
export type NavigationKey = (typeof NAVIGATION_KEYS)[number];
export function navigationOrder(order: WindowLayout['navigation']): NavigationKey[] {
  return [
    ...new Set([
      ...order.filter((key): key is NavigationKey => key !== 'notifications'),
      ...NAVIGATION_KEYS,
    ]),
  ];
}
function completeNavigation(layout: WindowLayout): WindowLayout {
  return { ...layout, navigation: [...navigationOrder(layout.navigation), 'notifications'] };
}
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
    return completeNavigation(
      raw ? WindowLayoutSchema.parse(JSON.parse(raw)) : structuredClone(DEFAULT_LAYOUT),
    );
  } catch {
    return structuredClone(DEFAULT_LAYOUT);
  }
}
export function writeLayout(slot: string, layout: WindowLayout) {
  try {
    localStorage.setItem(
      'tapkit.layout.' + slot,
      JSON.stringify(completeNavigation(WindowLayoutSchema.parse(layout))),
    );
  } catch {
    /* An unavailable browser store must not break navigation. */
  }
}
