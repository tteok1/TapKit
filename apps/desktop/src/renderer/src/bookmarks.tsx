import { useCallback, useEffect, useRef, useState } from 'react';
import { BookmarkPageSchema, SessionDetailsSchema, type BookmarkPage } from '@tapkit/contracts';
import { historyCommand } from './history-ui';
import { IconButton } from './action-popover';
import h from '../locales/history.zh-CN.json';

export function Bookmarks({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [page, setPage] = useState<BookmarkPage>();
  const [loading, setLoading] = useState(true),
    [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async (cursor?: string) => {
    const ticket = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const next = BookmarkPageSchema.parse(await historyCommand('messages.bookmarks', { cursor }));
      if (ticket === sequence.current)
        setPage((previous) => ({
          ...next,
          bookmarks:
            cursor && previous
              ? [...previous.bookmarks, ...next.bookmarks].filter(
                  (item, index, items) =>
                    items.findIndex((other) => other.messageId === item.messageId) === index,
                )
              : next.bookmarks,
        }));
    } catch {
      if (ticket === sequence.current) setError(h.bookmarkFailed);
    } finally {
      if (ticket === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener('tapkit:history-refresh', refresh);
    return () => {
      sequence.current++;
      window.removeEventListener('tapkit:history-refresh', refresh);
    };
  }, [load]);
  async function action(work: () => Promise<void>) {
    if (working || loading) return;
    setWorking(true);
    setError('');
    try {
      await work();
    } catch {
      setError(h.failed);
    } finally {
      setWorking(false);
    }
  }
  return (
    <section className="bookmarks-page" aria-label={h.bookmarks}>
      <h1>{h.bookmarks}</h1>
      <p className="bookmark-hint">{h.bookmarkHint}</p>
      {error && (
        <div role="alert">
          {error}{' '}
          <button disabled={loading || working} onClick={() => void load()}>
            {h.retry}
          </button>
        </div>
      )}
      {loading && <p role="status">{h.loadingBookmarks}</p>}
      {!loading && !error && !page?.bookmarks.length && <p>{h.noBookmarks}</p>}
      <ul className="bookmark-list" aria-busy={loading}>
        {page?.bookmarks.map((item) => (
          <li className="bookmark-entry" key={item.messageId} data-message-id={item.messageId}>
            <button
              className="bookmark-open"
              disabled={loading || working}
              onClick={() =>
                void action(async () => {
                  const details = SessionDetailsSchema.parse(
                    await historyCommand('sessions.get', { sessionId: item.sessionId }),
                  );
                  if (details.session.branchId !== item.branchId)
                    await historyCommand(
                      'messages.switchBranch',
                      {
                        sessionId: item.sessionId,
                        branchId: item.branchId,
                      },
                      details.session.revision,
                    );
                  onNavigate('/sessions/' + item.sessionId + '?message=' + item.messageId);
                })
              }
            >
              <strong>{item.sessionTitle}</strong>
              {item.archived && <span className="bookmark-hint">{h.archived}</span>}
              <span className="bookmark-snippet">{item.snippet || h.bookmarkOpen}</span>
              <span className="bookmark-location">{h.bookmarkOpen}</span>
            </button>
            <IconButton
              icon="bookmark"
              label={h.unbookmark}
              disabled={loading || working}
              onClick={() =>
                void action(async () => {
                  await historyCommand('messages.mark', {
                    sessionId: item.sessionId,
                    messageId: item.messageId,
                    bookmark: false,
                  });
                  window.dispatchEvent(new Event('tapkit:history-changed'));
                })
              }
            />
          </li>
        ))}
      </ul>
      {page?.nextCursor && (
        <button disabled={loading || working} onClick={() => void load(page.nextCursor!)}>
          {h.more}
        </button>
      )}
    </section>
  );
}
