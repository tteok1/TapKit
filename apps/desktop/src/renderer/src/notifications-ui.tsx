import { useEffect, useState } from 'react';
import {
  NotificationPrefsSchema,
  type WorkView,
  type z,
  type WorkNotificationSchema,
} from '@tapkit/contracts';
import { workCommand } from './work-ui';
import { PermissionsCenter } from './permissions-ui';
import t from '../locales/notifications.zh-CN.json';
export function NotificationsCenter({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [items, setItems] = useState<z.infer<typeof WorkNotificationSchema>[]>([]),
    [waiting, setWaiting] = useState<WorkView[]>([]),
    [unreadCount, setUnreadCount] = useState(0),
    [kind, setKind] = useState(''),
    [unread, setUnread] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [prefs, setPrefs] = useState(NotificationPrefsSchema.parse({})),
    [revision, setRevision] = useState(1);
  async function reload() {
    const data = await workCommand('notifications.list', { ...(kind ? { kind } : {}), unread }),
      runs = await workCommand('runs.list', { status: 'waiting_user' });
    if ('notifications' in data) {
      setItems(data.notifications);
      setUnreadCount(data.unreadCount);
    }
    if ('workItems' in runs) setWaiting(runs.workItems);
  }
  useEffect(() => {
    let cancelled = false;
    const read = () =>
      !cancelled && void reload().catch((e: Error) => !cancelled && setError(e.message));
    read();
    const timer = setInterval(read, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [kind, unread]);
  useEffect(() => {
    void workCommand('notifications.preferences')
      .then((data) => {
        if ('notificationPreferences' in data) {
          setPrefs(data.notificationPreferences);
          setRevision(data.revision);
        }
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label={t.title}>
      <div className="work-center">
        <h1>{t.title}</h1>
        <p role="status">
          {t.count}：{unreadCount}
        </p>
        {error && (
          <p role="alert">
            {t.error}
            {error}
          </p>
        )}
        <div className="work-actions">
          <label>
            {t.all}
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">{t.all}</option>
              {Object.entries(t.kinds).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={unread} onChange={(e) => setUnread(e.target.checked)} />
            {t.unread}
          </label>
          <button
            disabled={busy}
            onClick={() => void action(() => workCommand('notifications.read', { all: true }))}
          >
            {t.readAll}
          </button>
          <button
            disabled={busy}
            onClick={() => void action(() => workCommand('notifications.delete', { all: true }))}
          >
            {t.clear}
          </button>
        </div>
        {!items.length && <p>{t.empty}</p>}
        {items.map((n) => (
          <article className="notification-item" key={n.id}>
            <strong>
              {n.read ? '' : '• '}
              {n.title}
            </strong>
            <time>{new Date(n.createdAt).toLocaleString()}</time>
            <p>{n.summary}</p>
            <div className="work-actions">
              <button
                onClick={() => {
                  void action(() => workCommand('notifications.read', { ids: [n.id] }));
                  onNavigate('/work/' + n.runId);
                }}
              >
                {t.open}
              </button>
              {!n.read && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(() => workCommand('notifications.read', { ids: [n.id] }))
                  }
                >
                  {t.read}
                </button>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  void action(() => workCommand('notifications.delete', { ids: [n.id] }))
                }
              >
                {t.remove}
              </button>
            </div>
          </article>
        ))}
        {!!waiting.length && (
          <section aria-label={t.waiting}>
            <h2>{t.waiting}</h2>
            {waiting.map((r) => (
              <button
                className="work-row"
                key={r.runId}
                onClick={() => onNavigate('/work/' + r.runId)}
              >
                {r.definition.goal} · {r.reason}
              </button>
            ))}
          </section>
        )}
        <details>
          <summary>{t.settings}</summary>
          <form
            className="work-create"
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                const data = await workCommand(
                  'notifications.preferences',
                  { values: prefs },
                  revision,
                );
                if ('notificationPreferences' in data) {
                  setPrefs(data.notificationPreferences);
                  setRevision(data.revision);
                }
              });
            }}
          >
            <label>
              <input
                type="checkbox"
                checked={prefs.desktop}
                onChange={(e) => setPrefs({ ...prefs, desktop: e.target.checked })}
              />
              {t.desktop}
            </label>
            {prefs.desktop && (
              <fieldset>
                <legend>{t.all}</legend>
                {NotificationPrefsSchema.shape.kinds.unwrap().element.options.map((key) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={prefs.kinds.includes(key)}
                      onChange={(e) =>
                        setPrefs({
                          ...prefs,
                          kinds: e.target.checked
                            ? [...prefs.kinds, key]
                            : prefs.kinds.filter((k) => k !== key),
                        })
                      }
                    />
                    {t.kinds[key]}
                  </label>
                ))}
              </fieldset>
            )}
            <label>
              {t.quietStart}
              <input
                type="number"
                min={0}
                max={23}
                value={prefs.quietStart}
                onChange={(e) => setPrefs({ ...prefs, quietStart: Number(e.target.value) })}
              />
            </label>
            <label>
              {t.quietEnd}
              <input
                type="number"
                min={0}
                max={23}
                value={prefs.quietEnd}
                onChange={(e) => setPrefs({ ...prefs, quietEnd: Number(e.target.value) })}
              />
            </label>
            <p>{t.quietHint}</p>
            <button disabled={busy}>{t.save}</button>
          </form>
        </details>
      </div>
      <PermissionsCenter onNavigate={onNavigate} />
    </section>
  );
}
