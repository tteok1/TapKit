import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PingRequestSchema,
  CoreCommandSchema,
  CoreEventSchema,
} from '../../packages/contracts/src/index';
import { checkImport } from '../../scripts/check-boundaries.mjs';
import { assertDigest } from '../../scripts/runtime-fetch.mjs';
describe('P00-01 strict contracts and package boundaries', () => {
  it('accepts a bounded nonce and rejects extra keys, empty and oversized input', () => {
    expect(PingRequestSchema.parse({ nonce: '中文 空格' }).nonce).toBe('中文 空格');
    for (const input of [
      { nonce: '' },
      { nonce: 'x'.repeat(129) },
      { nonce: 'x', channel: 'fs' },
      null,
    ])
      expect(PingRequestSchema.safeParse(input).success).toBe(false);
  });
  it('rejects unknown Core commands and invalid ABI/IDs', () => {
    expect(CoreCommandSchema.safeParse({ type: 'execute' }).success).toBe(false);
    expect(CoreEventSchema.safeParse({ type: 'pong', id: 'invalid', payload: {} }).success).toBe(
      false,
    );
  });
  it('blocks direct and relative privileged imports from Renderer and contracts', () => {
    for (const specifier of [
      'node:fs',
      'fs/promises',
      'electron',
      'better-sqlite3',
      '@tapkit/providers',
      '../../../../packages/storage/src/index',
    ])
      expect(() =>
        checkImport('renderer', specifier, resolve('apps/desktop/src/renderer/main.tsx')),
      ).toThrow();
    expect(() =>
      checkImport('providers', '@tapkit/core', resolve('packages/providers/src/index.ts')),
    ).toThrow();
    expect(() =>
      checkImport('renderer', '@tapkit/contracts', resolve('apps/desktop/src/renderer/main.tsx')),
    ).not.toThrow();
  });
  it('rejects corrupted downloaded content', () => {
    expect(() => assertDigest('bad', 'expected')).toThrow('integrity');
    expect(() => assertDigest('expected', 'expected')).not.toThrow();
  });
});
