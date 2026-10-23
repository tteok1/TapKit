import { useEffect, useState } from 'react';
import { memoryCommand } from './memory-ui';
import t from '../locales/memory.zh-CN.json';
export function MemoryDeletePreview({
  sessionIds,
  onConfirm,
  onClose,
  busy,
}: {
  sessionIds: string[];
  onConfirm: (keep: boolean) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [impact, setImpact] = useState<{
      onlySource: number;
      sharedSource: number;
      explicit: number;
    }>(),
    [keep, setKeep] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void memoryCommand('memory.sessionImpact', { sessionIds })
      .then((data) => {
        if (alive)
          setImpact(
            (
              data as {
                memoryImpact: { onlySource: number; sharedSource: number; explicit: number };
              }
            ).memoryImpact,
          );
      })
      .catch(() => {
        if (alive) setError(t.error);
      });
    return () => {
      alive = false;
    };
  }, [sessionIds]);
  return (
    <div className="history-dialog" role="dialog" aria-label={t.impact}>
      <p>{t.deleteSession}</p>
      {impact && (
        <p>
          {t.onlySource}：{impact.onlySource}；{t.sharedSource}：{impact.sharedSource}；{t.explicit}
          ：{impact.explicit}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <label>
        <input
          aria-label={t.keepExplicit}
          type="checkbox"
          checked={keep}
          onChange={(e) => setKeep(e.target.checked)}
        />
        {t.keepExplicit}
      </label>
      <span className="action-group">
        <button disabled={busy || !impact} onClick={() => onConfirm(keep)}>
          {t.deleteSessionConfirm}
        </button>
        <button disabled={busy} onClick={onClose}>
          {t.close}
        </button>
      </span>
    </div>
  );
}
