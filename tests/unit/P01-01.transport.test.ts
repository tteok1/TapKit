import { describe, it, expect, vi } from 'vitest';
import { codexFetch } from '../../packages/providers/src/codex/transport';
import { textEvents } from '../fixtures/P01-01.codex';
describe('P01-01 strict SSE transport', () => {
  it('does not report EOF failure when the decoder cancels after completion during a pending read', async () => {
    let finishRead!: () => void;
    const readPending = new Promise<void>((resolve) => {
      finishRead = resolve;
    });
    let pulls = 0;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (++pulls === 1) {
            controller.enqueue(
              new TextEncoder().encode('data: ' + JSON.stringify(textEvents().at(-1)) + '\n\n'),
            );
          } else {
            finishRead(); /* The pending read is settled by consumer cancellation. */
          }
        },
      }),
    );
    const capture = vi.fn();
    const output = await codexFetch(
      async () => response,
      capture,
    )('https://chatgpt.com/backend-api/codex/responses');
    const reader = output.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    await readPending;
    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(capture).not.toHaveBeenCalled();
  });
  function untyped(text: string, split = 1) {
    const bytes = new TextEncoder().encode(text);
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < bytes.length; i += split)
            controller.enqueue(bytes.slice(i, i + split));
          controller.close();
        },
      }),
    );
  }
  it('accepts a missing MIME header only after split SSE event validation, preserving Chinese', async () => {
    const event = textEvents().at(-1);
    const text =
      ': heartbeat\r\n\r\nevent: response.completed\r\ndata: ' + JSON.stringify(event) + '\r\n\r\n';
    const capture = vi.fn();
    const output = await codexFetch(
      async () => untyped(text),
      capture,
    )('https://chatgpt.com/backend-api/codex/responses');
    expect(output.headers.get('content-type')).toBe('text/event-stream');
    expect(await output.text()).toBe('data: ' + JSON.stringify(event) + '\n\n');
    expect(capture).not.toHaveBeenCalled();
  });
  it.each([
    '<html>private upstream page</html>',
    '{"error":{"message":"private upstream error"}}',
    'data: {"type":"unrelated"}\n\n',
    'data: invalid json\n\n',
    ': heartbeat\n\ndata: [DONE]\n\n',
    ': ' + 'x'.repeat(65_536),
  ])('rejects untyped non-Codex bodies or an excessive prefix: case %#', async (text) => {
    const capture = vi.fn();
    const output = await codexFetch(
      async () => untyped(text, 4096),
      capture,
    )('https://chatgpt.com/backend-api/codex/responses');
    await expect(output.text()).rejects.toThrow('STREAM_INTERRUPTED');
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({ diagnosticCode: 'unexpected_content_type' }),
    );
    expect(JSON.stringify(capture.mock.calls)).not.toContain('private upstream');
  });
  it('still rejects an unterminated event after validating a missing MIME header', async () => {
    const capture = vi.fn();
    const text = 'data: {"type":"response.created"}\n\ndata: {"type":"response.completed"}';
    const output = await codexFetch(
      async () => untyped(text),
      capture,
    )('https://chatgpt.com/backend-api/codex/responses');
    await expect(output.text()).rejects.toThrow('STREAM_INTERRUPTED');
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({ diagnosticCode: 'unterminated_sse' }),
    );
  });
  it('normalizes multiline data, heartbeat, multiple events and DONE', async () => {
    const event = JSON.stringify(textEvents().at(-1), null, 2)
      .split('\n')
      .map((line) => 'data: ' + line)
      .join('\r\n');
    const response = new Response(': heartbeat\r\n\r\n' + event + '\r\n\r\ndata: [DONE]\r\n\r\n', {
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    });
    const capture = vi.fn();
    const output = await codexFetch(
      async () => response,
      capture,
    )('https://chatgpt.com/backend-api/codex/responses');
    expect(await output.text()).toBe('data: ' + JSON.stringify(textEvents().at(-1)) + '\n\n');
    expect(capture).not.toHaveBeenCalled();
  });
  it('rejects a missing frame boundary at EOF and never leaks credentials to custom endpoints', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('data: ' + JSON.stringify(textEvents().at(-1)), {
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
    const capture = vi.fn();
    const fetch = codexFetch(fetcher, capture);
    await expect(
      fetch('https://evil.example/responses', { headers: { Authorization: 'Bearer mock-secret' } }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    const response = await fetch('https://chatgpt.com/backend-api/codex/responses');
    await expect(response.text()).rejects.toThrow('STREAM_INTERRUPTED');
    expect(capture).toHaveBeenCalledWith({
      code: 'STREAM_INTERRUPTED',
      retryable: false,
      httpStatus: 200,
      diagnosticCode: 'unterminated_sse',
    });
  });
});
