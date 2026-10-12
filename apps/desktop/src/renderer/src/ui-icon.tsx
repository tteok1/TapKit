import type { CSSProperties } from 'react';

const paths = {
  chat: 'M4 4h16v12H9l-5 4V4Z',
  work: 'M8 6V4h8v2M3 7h18v13H3V7Zm0 5h18M10 12v3h4v-3',
  folder: 'M3 6h7l2 2h9v12H3V6Z',
  file: 'M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6M9 16h6',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  plus: 'M12 5v14M5 12h14',
  edit: 'm14 4 6 6M4 20l5-1L21 7l-5-5L4 14v6Z',
  temporary: 'M12 3a9 9 0 1 0 9 9M12 7v5l3 2M16 3h5v5',
  panel: 'M3 4h18v16H3V4Zm12 0v16',
  left: 'm14 6-6 6 6 6',
  right: 'm10 6 6 6-6 6',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z',
  home: 'm3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9',
  arrow: 'M12 19V5m-6 6 6-6 6 6',
  close: 'm6 6 12 12M18 6 6 18',
  pin: 'm8 3 8 0-1 5 4 4v2h-6v7l-2-2v-5H5v-2l4-4-1-5Z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
} as const;

export type IconName = keyof typeof paths;
export function UiIcon({ name, style }: { name: IconName; style?: CSSProperties }) {
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
