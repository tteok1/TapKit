import { expect, test, vi } from 'vitest';
import { importChatFiles } from '../../apps/desktop/src/renderer/src/chat-file-import';
import type { TapKitBridge, Reply } from '../../packages/contracts/src';
const sessionId = '0195abc0-0000-7000-8000-000000000001';
const fileId = '0195abc0-0000-7000-8000-000000000002';
const versionId = '0195abc0-0000-7000-8000-000000000003';
const token = '0195abc0-0000-7000-8000-000000000004';
const token2 = '0195abc0-0000-7000-8000-000000000005';
const file = () => new File(['synthetic text'], '资料.txt', { type: 'text/plain' });
const selection = (value = token) => ({
  token: value,
  name: '资料.txt',
  relativePath: '资料.txt',
  sizeBytes: 14,
  extension: 'txt',
});
const reply = (data: unknown): Reply =>
  ({ protocolVersion: 1, requestId: sessionId, ok: true, data }) as Reply;
const bridge = (): Pick<TapKitBridge, 'selectChatFiles' | 'fileCommand' | 'chatCommand'> => ({
  selectChatFiles: vi.fn(async () => ({ selections: [], virtualIndexes: [0] })),
  fileCommand: vi.fn(async () => reply({ changedIds: [] })),
  chatCommand: vi.fn(async () =>
    reply({
      ref: { kind: 'file', fileId, versionId },
      name: '资料.txt',
      source: '本地托管文本',
      state: 'ready',
      text: 'synthetic text',
    }),
  ),
});
test('P03-01 Host denial never falls back to reading physical bytes or attaching a clipboard payload', async () => {
  const b = bridge(),
    source = file();
  const read = vi.spyOn(source, 'arrayBuffer').mockRejectedValue(new Error('must not read'));
  vi.mocked(b.selectChatFiles).mockRejectedValue(new Error('PERMISSION_DENIED'));
  const result = await importChatFiles(
    b,
    [source],
    sessionId,
    new AbortController().signal,
    () => {},
  );
  expect(result.errors).toEqual(['PERMISSION_DENIED']);
  expect(result.refs).toEqual([]);
  expect(read).not.toHaveBeenCalled();
  expect(b.chatCommand).not.toHaveBeenCalled();
  expect(b.fileCommand).not.toHaveBeenCalled();
});
test('P03-01 partial physical import preserves its pinned result and reports the failing item without reading File bytes', async () => {
  const b = bridge(),
    sources = [file(), file()];
  sources.forEach((source) =>
    vi.spyOn(source, 'arrayBuffer').mockRejectedValue(new Error('must not read')),
  );
  vi.mocked(b.selectChatFiles).mockResolvedValue({
    selections: [selection(), selection(token2)],
    virtualIndexes: [],
  });
  vi.mocked(b.fileCommand).mockImplementation(async (options, command, payload) => {
    if (command !== 'files.import') return reply({ changedIds: [] });
    expect(payload).toEqual({
      selectionTokens: [token, token2],
      destination: { type: 'session', id: sessionId },
      duplicate: 'keep',
    });
    return reply({
      import: {
        requestId: options.requestId,
        status: 'completed',
        items: [
          {
            token,
            name: '资料.txt',
            status: 'imported',
            readBytes: 14,
            totalBytes: 14,
            fileId,
            versionId,
            errorCode: null,
          },
          {
            token: token2,
            status: 'failed',
            readBytes: 0,
            totalBytes: 14,
            fileId: null,
            versionId: null,
            errorCode: 'DISK_FULL',
          },
        ],
      },
    });
  });
  const result = await importChatFiles(
    b,
    sources,
    sessionId,
    new AbortController().signal,
    () => {},
  );
  expect(result.refs).toEqual([{ kind: 'file', fileId, versionId }]);
  expect(result.errors).toEqual(['DISK_FULL']);
  expect(b.chatCommand).not.toHaveBeenCalled();
  expect(b.fileCommand).toHaveBeenLastCalledWith(expect.anything(), 'files.releaseSelection', {
    selectionTokens: [token, token2],
  });
});
test('P03-01 cancelling while Host selection is pending releases the granted handle and never starts importing', async () => {
  const b = bridge(),
    controller = new AbortController();
  vi.mocked(b.selectChatFiles).mockImplementation(async () => {
    controller.abort();
    return { selections: [selection()], virtualIndexes: [] };
  });
  const result = await importChatFiles(b, [file()], sessionId, controller.signal, () => {});
  expect(result.cancelled).toBe(true);
  expect(b.fileCommand).toHaveBeenCalledTimes(1);
  expect(b.fileCommand).toHaveBeenCalledWith(expect.anything(), 'files.releaseSelection', {
    selectionTokens: [token],
  });
});
test('P03-01 cancellation reaches the active Core batch and retains an item committed before cancellation', async () => {
  const b = bridge(),
    controller = new AbortController();
  vi.mocked(b.selectChatFiles).mockResolvedValue({
    selections: [selection(), selection(token2)],
    virtualIndexes: [],
  });
  let complete!: (value: Reply) => void, started!: () => void;
  const active = new Promise<void>((resolve) => {
    started = resolve;
  });
  let requestId = '';
  vi.mocked(b.fileCommand).mockImplementation(async (options, command) => {
    if (command === 'files.import') {
      requestId = options.requestId;
      started();
      return new Promise<Reply>((resolve) => {
        complete = resolve;
      });
    }
    if (command === 'files.cancelImport')
      complete(
        reply({
          import: {
            requestId,
            status: 'cancelled',
            items: [
              {
                token,
                status: 'imported',
                readBytes: 14,
                totalBytes: 14,
                fileId,
                versionId,
                errorCode: null,
              },
              {
                token: token2,
                status: 'cancelled',
                readBytes: 0,
                totalBytes: 14,
                fileId: null,
                versionId: null,
                errorCode: 'CANCELLED',
              },
            ],
          },
        }),
      );
    return reply({ changedIds: [] });
  });
  const importing = importChatFiles(b, [file(), file()], sessionId, controller.signal, () => {});
  await active;
  controller.abort();
  const result = await importing;
  expect(result.cancelled).toBe(true);
  expect(result.refs).toEqual([{ kind: 'file', fileId, versionId }]);
  expect(b.fileCommand).toHaveBeenCalledWith(expect.anything(), 'files.cancelImport', {
    importRequestId: requestId,
  });
});
test.each([0, 1])(
  'P03-01 virtual clipboard attachment retains the successful ref with failure at item %i',
  async (failedIndex) => {
    const b = bridge();
    vi.mocked(b.selectChatFiles).mockResolvedValue({ selections: [], virtualIndexes: [0, 1] });
    const attach = vi.mocked(b.chatCommand).getMockImplementation()!;
    let index = 0;
    vi.mocked(b.chatCommand).mockImplementation(async (...args) => {
      if (index++ === failedIndex) throw new Error('FILE_TOO_LARGE');
      return attach(...args);
    });
    const result = await importChatFiles(
      b,
      [file(), file()],
      sessionId,
      new AbortController().signal,
      () => {},
    );
    expect(result.refs).toEqual([{ kind: 'file', fileId, versionId }]);
    expect(result.errors).toEqual(['FILE_TOO_LARGE']);
    expect(b.chatCommand).toHaveBeenCalledTimes(2);
  },
);
test('P03-01 virtual attachment committed before cancellation is retained and the next source is not read', async () => {
  const b = bridge(),
    controller = new AbortController(),
    next = file();
  const readNext = vi.spyOn(next, 'arrayBuffer');
  vi.mocked(b.selectChatFiles).mockResolvedValue({ selections: [], virtualIndexes: [0, 1] });
  const attach = vi.mocked(b.chatCommand).getMockImplementation()!;
  vi.mocked(b.chatCommand).mockImplementation(async (...args) => {
    const committed = await attach(...args);
    controller.abort();
    return committed;
  });
  const result = await importChatFiles(b, [file(), next], sessionId, controller.signal, () => {});
  expect(result.cancelled).toBe(true);
  expect(result.refs).toEqual([{ kind: 'file', fileId, versionId }]);
  expect(readNext).not.toHaveBeenCalled();
  expect(b.chatCommand).toHaveBeenCalledTimes(1);
});
test('P03-01 malformed virtual index grants do not read bytes and still release physical handles', async () => {
  const b = bridge(),
    source = file(),
    read = vi.spyOn(source, 'arrayBuffer');
  vi.mocked(b.selectChatFiles).mockResolvedValue({
    selections: [selection()],
    virtualIndexes: [1],
  });
  const result = await importChatFiles(
    b,
    [source],
    sessionId,
    new AbortController().signal,
    () => {},
  );
  expect(result.errors).toEqual(['VALIDATION_ERROR']);
  expect(read).not.toHaveBeenCalled();
  expect(b.fileCommand).toHaveBeenLastCalledWith(expect.anything(), 'files.releaseSelection', {
    selectionTokens: [token],
  });
});
