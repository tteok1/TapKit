import { test, expect } from 'vitest';
import { win32 } from 'node:path';
import { isOutsideWorkspace } from '../../scripts/standard-user-kit.mjs';

test('P00-03 standard-user kit accepts another drive and rejects workspace aliases', () => {
  expect(
    isOutsideWorkspace('D:\\TapKit', 'C:\\Users\\test\\AppData\\Local\\TapKit-P00-03', win32),
  ).toBe(true);
  expect(isOutsideWorkspace('D:\\TapKit', 'D:\\TapKit-test', win32)).toBe(true);
  for (const target of [
    'D:\\TapKit',
    'd:\\tapkit\\',
    'D:\\TapKit\\test',
    'D:\\TapKit\\x\\..\\test',
  ])
    expect(isOutsideWorkspace('D:\\TapKit', target, win32)).toBe(false);
});
