import type { CSSProperties } from 'react';
import {
  MessageCircle,
  BriefcaseBusiness,
  Folder,
  FileText,
  SquarePen,
  Pin,
  Settings,
} from '@tapkit/ui';

const roundedIcons = {
  chat: MessageCircle,
  work: BriefcaseBusiness,
  folder: Folder,
  file: FileText,
  edit: SquarePen,
  pin: Pin,
  settings: Settings,
};

const paths = {
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  plus: 'M12 5v14M5 12h14',
  temporary: 'M12 3a9 9 0 1 0 9 9M12 7v5l3 2M16 3h5v5',
  panel: 'M6 4h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Zm9 0v16',
  sidebar: 'M6 4h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Zm2 0v16',
  archive:
    'M5 8v10a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8M4 3h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm6 9h4',
  trash:
    'M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13M10 10v7M14 10v7',
  sort: 'M8 20V4m-4 4 4-4 4 4M16 4v16m-4-4 4 4 4-4',
  check: 'm5 12 4 4L19 6',
  arrowUpRight: 'M7 17 17 7M7 7h10v10',
  left: 'm14 6-6 6 6 6',
  right: 'm10 6 6 6-6 6',
  home: 'm3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9',
  arrow: 'M12 19V5m-6 6 6-6 6 6',
  close: 'm6 6 12 12M18 6 6 18',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  copy: 'M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Zm6 0V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  up: 'M7 10v11H3V10h4Zm0 0 5-7c2 0 2 2 1 6h6a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 2H7',
  down: 'M7 14V3H3v11h4Zm0 0 5 7c2 0 2-2 1-6h6a2 2 0 0 0 2-2l-2-8a2 2 0 0 0-2-2H7',
  quote: 'M4 6h6v7H5c0 3 1 4 3 5M14 6h6v7h-5c0 3 1 4 3 5',
  memory: 'M8 4H6v4H3v8h3v4h12v-4h3V8h-3V4H8ZM8 8h8v8H8V8Z',
  chevronDown: 'm6 9 6 6 6-6',
  info: 'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
} as const;

export type IconName = keyof typeof paths | keyof typeof roundedIcons;
export function UiIcon({ name, style }: { name: IconName; style?: CSSProperties }) {
  const Icon = roundedIcons[name as keyof typeof roundedIcons];
  if (Icon)
    return (
      <Icon className="ui-icon" size={18} strokeWidth={1.65} aria-hidden="true" style={style} />
    );
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
      <path d={paths[name as keyof typeof paths]} />
    </svg>
  );
}
