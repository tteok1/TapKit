import type { ChatSnapshot } from '../../packages/contracts/src';
import type { Page } from './test';

export async function measureStreaming(
  page: Page,
  first: string,
  second: string,
  indexWork?: { projectId: string; selectedVersionIds: string[] },
) {
  const result = await page.evaluate(
    async ({ first, second, indexWork }) => {
      const id = () => {
        const value = crypto.randomUUID();
        return value.slice(0, 14) + '7' + value.slice(15);
      };
      const send = async (sessionId: string) => {
        const reply = await window.tapkit.chatCommand({ requestId: id() }, 'messages.send', {
          sessionId,
          clientMessageId: id(),
          text: 'P11-01 流式性能',
          attachments: [],
          mode: 'chat',
        });
        if (!reply.ok) throw Error(reply.error.code);
      };
      const snapshot = async (sessionId: string) => {
        const reply = await window.tapkit.chatCommand({ requestId: id() }, 'messages.list', {
          sessionId,
        });
        if (!reply.ok) throw Error(reply.error.code);
        return reply.data as ChatSnapshot;
      };
      const latencies = new Map<number, number>();
      const observed = new Map<number, number>();
      const observer = new MutationObserver(() => {
        const answer = document.querySelector(
          `.chat-surface[data-session-id="${first}"] .chat-message.assistant`,
        );
        for (const match of (answer?.textContent ?? '').matchAll(/P11-(\d+)-(\d{13})/g)) {
          const index = Number(match[1]);
          if (observed.has(index)) continue;
          observed.set(index, Number(match[2]));
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              latencies.set(index, Date.now() - Number(match[2]));
            }),
          );
        }
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      try {
        await Promise.all([send(first), send(second)]);
        const deadline = performance.now() + 10_000;
        let peer = await snapshot(second);
        while (!(latencies.has(0) && peer.messages.some(({ text }) => /P11-0-\d{13}/.test(text)))) {
          if (performance.now() >= deadline)
            throw Error('Both roots must stream before cancellation');
          await pause(40);
          peer = await snapshot(second);
        }

        const indexing =
          indexWork &&
          (async () => {
            const startedAt = Date.now();
            const reply = await window.tapkit.projectCommand(
              { requestId: id() },
              'knowledge.query',
              {
                ...indexWork,
                query: '联合索引基准',
                limit: 4,
              },
            );
            return {
              startedAt,
              finishedAt: Date.now(),
              hits: reply.ok && 'hits' in reply.data ? reply.data.hits.length : 0,
              error: reply.ok ? null : reply.error.code,
            };
          })();
        const before = peer.run!;

        const cancelStarted = performance.now();
        const reply = await window.tapkit.chatCommand({ requestId: id() }, 'runs.cancel', {
          runId: before.id,
        });
        const cancelAckMs = performance.now() - cancelStarted;
        if (!reply.ok) throw Error(reply.error.code);
        do {
          peer = await snapshot(second);
          if (peer.run?.status === 'cancelled') break;
          await pause(15);
        } while (performance.now() - cancelStarted <= 1000);
        const cancelSettledMs = performance.now() - cancelStarted;
        if (peer.run?.status !== 'cancelled')
          throw Error('Cancellation did not settle within 1 second');
        while (latencies.size < 24 || (await snapshot(first)).run?.status !== 'completed') {
          if (performance.now() >= deadline)
            throw Error('Uncancelled root did not finish streaming');
          await pause(40);
        }
        const after = await snapshot(second);
        const index = await indexing;
        return {
          latencies: [...latencies.values()],
          index: index && {
            ...index,
            streamedDuringIndex: [...observed.values()].filter(
              (at) => at >= index.startedAt && at <= index.finishedAt,
            ).length,
          },
          cancelAckMs,
          cancelSettledMs,
          callsBefore: before.calls,
          callsAfter: after.run?.calls,
          cancelled: after.run?.status,
        };
      } finally {
        observer.disconnect();
      }
    },
    { first, second, indexWork },
  );
  const sorted = [...result.latencies].sort((a, b) => a - b);
  const displayP95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
  return { ...result, displayP95Ms };
}
