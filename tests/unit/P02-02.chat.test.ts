import { it, expect } from 'vitest';
import { ReadGateway } from '../../packages/tools/src/read-gateway';
import {
  ChatSendSchema,
  ChatDraftSaveSchema,
  ChatInputUpdateSchema,
} from '../../packages/contracts/src/chat';
import { safeChatURL, safeMermaidText } from '../../packages/ui/src/chat-safety';
const session = '019953fa-0000-7000-8000-000000000001';
const version = '019953fa-0000-7000-8000-000000000002';
it('P02-02 T02 unsafe links and diagram resource loading are rejected before rendering', () => {
  for (const url of [
    'javascript:alert(1)',
    'file:///private',
    'data:text/html,evil',
    'https://user:password@example.com',
  ])
    expect(safeChatURL(url)).toBe('');
  expect(safeChatURL('https://example.com/path')).toBe('https://example.com/path');
  for (const code of [
    '%%{init:{}}%%\ngraph TD',
    'graph TD\nclick A "https://example.com"',
    'graph TD\nA@{img:"data:image/png,x"}',
    'graph TD\nA[<img src="x">]',
  ])
    expect(safeMermaidText(code)).toBe(false);
  expect(safeMermaidText('graph TD\nA[输入] --> B[输出]')).toBe(true);
});
it('P02-02 T19 rejects unknown tools, injected authorization fields and non-closed arguments before repository access', async () => {
  let reads = 0;
  const gateway = new ReadGateway({
    alive: () => {},
    file: async () => {
      reads++;
      return 'private';
    },
    history: () => [],
  });
  await expect(gateway.execute('exec.run', { argv: ['x'] }, session, [])).rejects.toThrow(
    'PERMISSION_DENIED',
  );
  await expect(gateway.execute('files.read', '{"fileVersionId":', session, [])).rejects.toThrow();
  await expect(
    gateway.execute('files.read', { fileVersionId: version, profileId: session }, session, []),
  ).rejects.toThrow();
  await expect(
    gateway.execute('files.read', { fileVersionId: version }, session, []),
  ).rejects.toThrow('PERMISSION_DENIED');
  await expect(
    gateway.execute('history.search', { query: 'x', sessionIds: [version] }, session, []),
  ).rejects.toThrow('PERMISSION_DENIED');
  expect(reads).toBe(0);
});
it('P02-02 T19 rechecks cancellation after asynchronous reads and bounds the model-visible result', async () => {
  let alive = true;
  const refs = [{ kind: 'file' as const, fileId: session, versionId: version }];
  const gateway = new ReadGateway({
    alive: () => {
      if (!alive) throw new Error('CANCELLED');
    },
    file: async () => {
      alive = false;
      return 'secret';
    },
    history: () => [],
  });
  await expect(
    gateway.execute('files.read', { fileVersionId: version, maxChars: 2 }, session, refs),
  ).rejects.toThrow('CANCELLED');
  const bounded = new ReadGateway({
    alive: () => {},
    file: async () => '中文原文',
    history: () => [],
  });
  expect(
    JSON.parse(
      await bounded.execute('files.read', { fileVersionId: version, maxChars: 2 }, session, refs),
    ),
  ).toMatchObject({ text: '中文', truncated: true });
});
it('P02-02 T05 over-limit text remains a valid draft while send and injected write capability are rejected', () => {
  const text = '中'.repeat(100001);
  expect(
    ChatDraftSaveSchema.safeParse({ sessionId: session, windowId: '0', text, attachments: [] })
      .success,
  ).toBe(true);
  expect(
    ChatSendSchema.safeParse({
      sessionId: session,
      clientMessageId: version,
      text,
      attachments: [],
      mode: 'chat',
    }).success,
  ).toBe(false);
  expect(
    ChatSendSchema.safeParse({
      sessionId: session,
      clientMessageId: version,
      text: 'x',
      attachments: [],
      mode: 'chat',
      tools: ['exec.run'],
    }).success,
  ).toBe(false);
  expect(ChatInputUpdateSchema.safeParse({ inputId: session, text, attachments: [] }).success).toBe(
    false,
  );
});
