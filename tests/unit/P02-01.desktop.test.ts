import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SettingsSetSchema,
  NetworkSettingsSchema,
  WindowLayoutSchema,
  DEFAULT_LAYOUT,
  PersonalSettingsSchema,
  SessionCreateSchema,
} from '../../packages/contracts/src';
import { avatarDimensions } from '../../apps/desktop/src/main/avatar';
const id = '019953fa-0000-7000-8000-000000000001';
describe('P02-01 desktop contracts and untrusted local images', () => {
  it('partial updates do not inject defaults and silently reset unrelated preferences', () => {
    expect(
      SettingsSetSchema.parse({ scope: { type: 'profile', id }, patch: { historyEnabled: false } })
        .patch,
    ).toEqual({ historyEnabled: false });
    expect(SettingsSetSchema.safeParse({ scope: { type: 'profile', id }, patch: {} }).success).toBe(
      false,
    );
    expect(DEFAULT_SETTINGS.desktop.theme).toBe('system');
  });
  it.each([
    'http://user:secret@localhost:7890',
    'http://localhost/private-secret',
    'http://localhost/?key=secret',
    'file:///private',
    'socks5://localhost:7890',
    'not-a-proxy',
  ])('rejects unsafe proxy input %s', (proxyURL) =>
    expect(NetworkSettingsSchema.safeParse({ mode: 'manual', proxyURL }).success).toBe(false),
  );
  it('accepts local proxy endpoints and rejects manual mode without an endpoint', () => {
    expect(
      NetworkSettingsSchema.parse({ mode: 'manual', proxyURL: 'http://127.0.0.1:7890' }).mode,
    ).toBe('manual');
    expect(NetworkSettingsSchema.safeParse({ mode: 'manual', proxyURL: '' }).success).toBe(false);
  });
  it('bounds personal fields and window state, rejecting HTML and external navigation', () => {
    expect(
      PersonalSettingsSchema.safeParse({ ...DEFAULT_SETTINGS.personal, nickname: ' '.repeat(4) })
        .success,
    ).toBe(false);
    expect(
      PersonalSettingsSchema.safeParse({
        ...DEFAULT_SETTINGS.personal,
        avatar: 'data:image/svg+xml,<svg/>',
      }).success,
    ).toBe(false);
    for (const route of [
      'https://attacker.invalid',
      '/files-extra',
      '/settings/general?token=secret',
    ])
      expect(WindowLayoutSchema.safeParse({ ...DEFAULT_LAYOUT, route }).success).toBe(false);
    expect(WindowLayoutSchema.safeParse({ ...DEFAULT_LAYOUT, sidebarWidth: 401 }).success).toBe(
      false,
    );
    expect(SessionCreateSchema.safeParse({ mode: 'research', title: 'fake task' }).success).toBe(
      false,
    );
  });
  it('checks image signatures and dimensions before native decoding', () => {
    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.write('IHDR', 12);
    png.writeUInt32BE(96, 16);
    png.writeUInt32BE(96, 20);
    expect(avatarDimensions(png)).toEqual({ width: 96, height: 96 });
    png.writeUInt32BE(4097, 16);
    expect(() => avatarDimensions(png)).toThrow('4096');
    expect(() => avatarDimensions(Buffer.alloc(5 * 1024 * 1024 + 1))).toThrow('5 MiB');
    expect(() => avatarDimensions(Buffer.from('<svg/>'))).toThrow();
    expect(() => avatarDimensions(Buffer.from([255, 216, 255, 192, 255, 255]))).toThrow();
    const webp = Buffer.alloc(30);
    webp.write('RIFF');
    webp.write('WEBP', 8);
    webp.write('VP8X', 12);
    webp.writeUIntLE(95, 24, 3);
    webp.writeUIntLE(95, 27, 3);
    expect(avatarDimensions(webp)).toEqual({ width: 96, height: 96 });
    const jpg = Buffer.from([255, 216, 255, 192, 0, 7, 8, 0, 96, 0, 96]);
    expect(avatarDimensions(jpg)).toEqual({ width: 96, height: 96 });
  });
});
