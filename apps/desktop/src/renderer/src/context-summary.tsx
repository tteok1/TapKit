import { useState } from 'react';
import {
  ContextViewSchema,
  ContextFields,
  CreatedEntitySchema,
  ChatMaterialsViewSchema,
  type ContextView,
} from '@tapkit/contracts';
import { requestOptions } from './desktop-state';
import c from '../locales/context.zh-CN.json';
export function ContextSummary({
  sessionId,
  onCreated,
}: {
  sessionId: string;
  onCreated: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [view, setView] = useState<ContextView>(),
    [text, setText] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [original, setOriginal] = useState('');
  const [fields, setFields] = useState<(typeof ContextFields)[number][]>(['goal', 'constraints']);
  async function load(command: 'context.get' | 'context.compact' | 'context.correct') {
    setBusy(true);
    setError('');
    try {
      const reply = await window.tapkit.chatCommand(
        requestOptions(command === 'context.correct' ? view?.checkpoint?.revision : undefined),
        command,
        {
          sessionId,
          ...(command === 'context.correct' ? { checkpointId: view?.checkpoint?.id, text } : {}),
        },
      );
      if (!reply.ok) throw new Error(reply.error.code);
      setView(ContextViewSchema.parse(reply.data));
      if (command === 'context.correct') setText('');
    } catch {
      setError(c.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="context-summary">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) void load('context.get');
        }}
      >
        {c.open}
      </button>
      {open && (
        <div role="region" aria-label={c.open}>
          <button disabled={busy} onClick={() => void load('context.compact')}>
            {c.compact}
          </button>
          {error && <p role="alert">{error}</p>}
          {!view?.checkpoint && <p>{c.empty}</p>}
          {view?.checkpoint && (
            <>
              {ContextFields.map((field) => (
                <div key={field}>
                  <label>
                    <input
                      type="checkbox"
                      checked={fields.includes(field)}
                      onChange={(e) =>
                        setFields(
                          e.target.checked ? [...fields, field] : fields.filter((f) => f !== field),
                        )
                      }
                    />
                    {c.fields[field]}
                  </label>
                  {view.checkpoint!.state[field].map((fact, i) => (
                    <div key={i}>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{fact.text}</p>
                      {fact.sources.map((ref) => (
                        <button
                          key={ref.id}
                          onClick={() =>
                            void (async () => {
                              try {
                                const reply = await window.tapkit.chatCommand(
                                  requestOptions(),
                                  'messages.read',
                                  { sessionId: view.checkpoint!.sessionId, messageId: ref.id },
                                );
                                if (!reply.ok) throw new Error();
                                setOriginal(
                                  ChatMaterialsViewSchema.parse(reply.data).materials[0]?.text ??
                                    '',
                                );
                              } catch {
                                setError(c.error);
                              }
                            })()
                          }
                        >
                          {c.source}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
              <label>
                {c.correction}
                <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={8000} />
              </label>
              <button disabled={busy || !text.trim()} onClick={() => void load('context.correct')}>
                {c.correct}
              </button>
              {view.checkpoint.state.execution_refs.length > 0 && <p>{c.pending}</p>}
              <button
                disabled={busy || !fields.length || view.checkpoint.state.execution_refs.length > 0}
                onClick={() =>
                  void (async () => {
                    setBusy(true);
                    setError('');
                    try {
                      const created = await window.tapkit.desktopCommand(
                        requestOptions(),
                        'sessions.create',
                        {
                          title: c.newTitle,
                          mode: 'chat',
                          ...(view.checkpoint!.projectId
                            ? { projectId: view.checkpoint!.projectId }
                            : {}),
                        },
                      );
                      if (!created.ok) throw new Error();
                      const target = CreatedEntitySchema.parse(created.data).entityId;
                      const reply = await window.tapkit.chatCommand(
                        requestOptions(),
                        'context.continue',
                        { sessionId: target, checkpointId: view.checkpoint!.id, fields },
                      );
                      if (!reply.ok) throw new Error();
                      onCreated(target);
                    } catch {
                      setError(c.error);
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              >
                {c.continue}
              </button>
            </>
          )}
          {original && <pre style={{ whiteSpace: 'pre-wrap' }}>{original}</pre>}
          {view && (
            <small>
              {c.cache}: {view.cache.hits}/{view.cache.misses} · {view.cache.bytes} B;{' '}
              {c.providerCache}: {view.providerCachedTokens ?? c.unknown}
            </small>
          )}
        </div>
      )}
    </div>
  );
}
