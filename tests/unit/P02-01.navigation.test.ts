import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_LAYOUT } from '../../packages/contracts/src';
import { readLayout, writeLayout } from '../../apps/desktop/src/renderer/src/desktop-state';

afterEach(() => vi.unstubAllGlobals());

it('P02-01 navigation restores hidden entries without losing existing order or window state', () => {
  const old = {
    ...DEFAULT_LAYOUT,
    navigation: ['files', 'notifications', 'chats'],
    sidebarScroll: 91,
    collapsed: true,
  };
  const storage = new Map([['tapkit.layout.test', JSON.stringify(old)]]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  const layout = readLayout('test');
  expect(layout.navigation).toEqual(['files', 'chats', 'work', 'projects', 'notifications']);
  expect(layout.sidebarScroll).toBe(91);
  expect(layout.collapsed).toBe(true);
  writeLayout('test', { ...layout, navigation: ['projects', 'files'] });
  expect(readLayout('test').navigation).toEqual([
    'projects',
    'files',
    'chats',
    'work',
    'notifications',
  ]);
  expect(JSON.parse(storage.get('tapkit.layout.test')!).navigation).toHaveLength(5);
});

it('P02-01 navigation remains fully reachable when old layout data or browser storage is unavailable', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => '{broken',
    setItem: () => {
      throw new Error('blocked');
    },
  });
  expect(readLayout('bad')).toEqual(DEFAULT_LAYOUT);
  expect(() => writeLayout('bad', DEFAULT_LAYOUT)).not.toThrow();
});
