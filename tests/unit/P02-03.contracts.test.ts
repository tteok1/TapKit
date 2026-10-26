import { it, expect } from 'vitest';
import {
  SessionBatchSchema,
  SessionPageInputSchema,
  SearchInputSchema,
  MessageTransformSchema,
  SessionUpdateSchema,
  WindowLayoutSchema,
  DEFAULT_LAYOUT,
  BookmarkPageInputSchema,
  MessageMarkSchema,
} from '../../packages/contracts/src';
const id = '01990000-0000-7000-8000-000000000001';
it('P02-03 bounds bookmark reads and supports clearing rating without clearing saved feedback', () => {
  expect(BookmarkPageInputSchema.parse({})).toEqual({ limit: 50 });
  for (const payload of [
    { limit: 101 },
    { limit: 0 },
    { profileId: id },
    { cursor: 'a'.repeat(513) },
  ])
    expect(BookmarkPageInputSchema.safeParse(payload).success).toBe(false);
  expect(MessageMarkSchema.parse({ sessionId: id, messageId: id, rating: null })).toEqual({
    sessionId: id,
    messageId: id,
    rating: null,
  });
});
it('P02-03 bounds history pages and requires explicit scoped search identity', () => {
  expect(SessionPageInputSchema.safeParse({ limit: 101 }).success).toBe(false);
  expect(SessionBatchSchema.safeParse({ sessionIds: [id, id] }).success).toBe(false);
  expect(SearchInputSchema.safeParse({ query: '短词', scope: { type: 'project' } }).success).toBe(
    false,
  );
  expect(
    SearchInputSchema.safeParse({ query: '词', scope: { type: 'session', id }, limit: 50 }).success,
  ).toBe(true);
  expect(
    SearchInputSchema.safeParse({ query: 'text', scope: { type: 'all' }, secret: 'ignored' })
      .success,
  ).toBe(false);
});
it('P02-03 preserves partial metadata updates and requires versioned exact message ranges', () => {
  expect(SessionUpdateSchema.parse({ sessionId: id, patch: { note: '备注' } }).patch).toEqual({
    note: '备注',
  });
  const p = {
    sessionId: id,
    messageId: id,
    version: 1,
    range: { start: 1, end: 2 },
    action: 'translate',
  };
  expect(MessageTransformSchema.safeParse({ ...p, version: 0 }).success).toBe(false);
  expect(MessageTransformSchema.safeParse({ ...p, range: { start: -1, end: 2 } }).success).toBe(
    false,
  );
  expect(
    WindowLayoutSchema.safeParse({ ...DEFAULT_LAYOUT, navigation: ['chats', 'chats'] }).success,
  ).toBe(false);
});
