import { describe, it, expect } from 'vitest';
import {
  RequestSchema,
  LocatorSchema,
  ResourceRefSchema,
  CoreEventSchema,
  SettingsSetSchema,
} from '../../packages/contracts/src/index';
import { trustedSender } from '../../apps/desktop/src/main/security';
const id = '019953fa-0000-7000-8000-000000000001';
describe('P00-02 contracts and IPC boundaries', () => {
  it('rejects old protocol, profile injection, unknown fields and invalid IDs', () => {
    for (const request of [
      { protocolVersion: 2, requestId: id, command: 'app.bootstrap', payload: {} },
      { protocolVersion: 1, requestId: 'not-id', command: 'app.bootstrap', payload: {} },
      { protocolVersion: 1, requestId: id, command: 'app.bootstrap', payload: {}, profileId: id },
    ])
      expect(RequestSchema.safeParse(request).success).toBe(false);
    expect(CoreEventSchema.safeParse({ type: 'ready' }).success).toBe(false);
    expect(
      CoreEventSchema.safeParse({ type: 'ready', protocolVersion: 1, schemaVersion: 12 }).success,
    ).toBe(true);
  });
  it('requires exact registered window, main frame and app URL', () => {
    const frame = { url: 'file:///app/index.html' },
      contents = { mainFrame: frame },
      window = { webContents: contents };
    expect(trustedSender({ sender: contents, senderFrame: frame }, [window], frame.url)).toBe(true);
    expect(
      trustedSender({ sender: contents, senderFrame: { url: frame.url } }, [window], frame.url),
    ).toBe(false);
    expect(
      trustedSender({ sender: { mainFrame: frame }, senderFrame: frame }, [window], frame.url),
    ).toBe(false);
    expect(
      trustedSender({ sender: contents, senderFrame: frame }, [window], 'https://evil.test'),
    ).toBe(false);
  });
  it('validates relative locators, normalized coordinates and UTF-16 ranges', () => {
    for (const path of ['../secret', 'C:/secret', '/etc/secret', 'a\\b', 'a/../../secret'])
      expect(
        LocatorSchema.safeParse({ kind: 'code', path, lineStart: 1, lineEnd: 2 }).success,
      ).toBe(false);
    expect(LocatorSchema.safeParse({ kind: 'text', start: 10, end: 9 }).success).toBe(false);
    expect(
      LocatorSchema.safeParse({
        kind: 'pdf',
        pageIndex: 0,
        rects: [{ x: 0.9, y: 0, width: 0.2, height: 0.1 }],
      }).success,
    ).toBe(false);
    expect(LocatorSchema.parse({ kind: 'text', start: 0, end: '中文😀'.length })).toEqual({
      kind: 'text',
      start: 0,
      end: 4,
    });
    expect(
      ResourceRefSchema.safeParse({
        kind: 'file',
        fileId: id,
        versionId: id,
        absolutePath: 'C:/secret',
      }).success,
    ).toBe(false);
  });
  it('rejects unbounded settings, nulls and empty patches', () => {
    for (const patch of [
      { dailyTokenLimit: 2_000_001 },
      { memoryEnabled: null },
      {},
      { arbitrary: 'setting' },
    ])
      expect(SettingsSetSchema.safeParse({ scope: { type: 'profile', id }, patch }).success).toBe(
        false,
      );
  });
});
