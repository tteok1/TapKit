import { useEffect, useRef, useState } from 'react';
import { TerminalSurface } from '@tapkit/ui';
import { TerminalViewSchema, type TerminalView, type TerminalCommand } from '@tapkit/contracts';
import { requestOptions } from './desktop-state';
import { terminalArgv } from './terminal-command';
import t from '../locales/terminal.zh-CN.json';
import './terminal.css';

const stateText = (state: string) => t.states[state as keyof typeof t.states] ?? state;
const errorText = (value: string) => t.errors[value as keyof typeof t.errors] ?? t.errors.default;
async function command(name: TerminalCommand, payload: unknown) {
  const r = await window.tapkit.terminalCommand(requestOptions(), name, payload);
  if (!r.ok) throw Error(r.error.code);
  return TerminalViewSchema.parse('terminal' in r.data ? r.data.terminal : null);
}
export function TerminalPanel({ runId }: { runId: string }) {
  const [view, setView] = useState<TerminalView>(),
    [runtime, setRuntime] = useState<'node' | 'python'>('node');
  const [selected, setSelected] = useState(''),
    [text, setText] = useState(''),
    [pageStart, setPageStart] = useState(0),
    [more, setMore] = useState(false);
  const [line, setLine] = useState('node --test --test-isolation=none'),
    [cwd, setCwd] = useState('.'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const cursor = useRef(0),
    size = useRef({ cols: 100, rows: 30 });
  const selection = useRef('');
  selection.current = selected;
  const profile = view?.profiles.find((p) => p.runtime === runtime),
    process = view?.processes.find((p) => p.id === selected);
  const running = !!process && ['starting', 'running'].includes(process.state),
    interactive = running && !!process?.terminal && process.state === 'running';
  const preparing = profile?.state === 'preparing';
  const anyRunning = !!view?.processes.some((p) => ['starting', 'running'].includes(p.state));
  useEffect(() => {
    let active = true,
      pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await command('terminal.status', { runId });
        if (!active) return;
        setView(next);
        if (!selection.current && next.processes[0]) setSelected(next.processes[0].id);
      } catch (e) {
        if (active) setError(errorText(e instanceof Error ? e.message : ''));
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 600);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [runId]);
  useEffect(() => {
    cursor.current = pageStart;
    setText('');
    setMore(false);
    if (!selected) return;
    let active = true,
      pending = false,
      displayed = 0,
      full = false;
    const read = async () => {
      if (pending || full || displayed >= 65536) return;
      pending = true;
      try {
        const next = await command('exec.poll', {
          runId,
          processId: selected,
          offset: cursor.current,
        });
        if (!active || !next.output) return;
        const encoded = new TextEncoder().encode(next.output.text);
        let end = Math.min(encoded.length, 65536 - displayed);
        while (end > 0) {
          try {
            new TextDecoder('utf-8', { fatal: true }).decode(encoded.subarray(0, end));
            break;
          } catch {
            end--;
          }
        }
        const piece = new TextDecoder().decode(encoded.subarray(0, end));
        cursor.current = next.output.offset + end;
        displayed += end;
        full = end < encoded.length;
        setText((current) => current + piece);
        setMore(next.output.truncated || full || displayed >= 65536);
      } catch (e) {
        if (active) setError(errorText(e instanceof Error ? e.message : ''));
      } finally {
        pending = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), 300);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [runId, selected, pageStart]);
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  };
  const choose = (id: string) => {
    setSelected(id);
    setPageStart(0);
  };
  const start = async (terminal: boolean, argv?: string[]) => {
    const next = await command(terminal ? 'terminal.start' : 'exec.run', {
      runId,
      runtime,
      argv: terminal ? [] : (argv ?? terminalArgv(line, runtime)),
      cwd,
      timeoutMs: 120000,
    });
    setView(next);
    if (next.processes[0]) choose(next.processes[0].id);
  };
  return (
    <section className="terminal-panel" aria-label={t.title}>
      <header>
        <h4>{t.title}</h4>
        <p>{t.scope}</p>
      </header>
      <div className="terminal-toolbar">
        <label>
          {t.runtime}
          <select
            value={runtime}
            disabled={busy || preparing || anyRunning}
            onChange={(e) => {
              const next = e.target.value as 'node' | 'python';
              setRuntime(next);
              setLine(
                next === 'node'
                  ? 'node --test --test-isolation=none'
                  : 'python -m unittest discover -v',
              );
            }}
          >
            <option value="node">Node.js</option>
            <option value="python">Python</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy || preparing || anyRunning}
          onClick={() =>
            void action(async () =>
              setView(await command('terminal.prepare', { runId, runtime, download: true })),
            )
          }
        >
          {preparing ? t.preparing : t.prepare}
        </button>
        {profile && (
          <span role="status">
            {profile.state === 'ready'
              ? t.ready
              : profile.state === 'preparing'
                ? t.preparing
                : profile.state === 'unsupported'
                  ? t.unsupported
                  : profile.state === 'failed'
                    ? t.failed
                    : t.detected}{' '}
            · {profile.version}
          </span>
        )}
      </div>
      {profile?.message && (
        <p
          className={
            profile.state === 'failed' || profile.state === 'unsupported'
              ? 'terminal-error'
              : 'terminal-hint'
          }
        >
          {t.errors[profile.message as keyof typeof t.errors] ?? profile.message}
        </p>
      )}
      {preparing && (
        <p className="terminal-hint" role="status">
          {profile?.progress.at(-1)}
        </p>
      )}
      {!!profile?.dependencyCount && (
        <details>
          <summary>
            {t.license} · {profile.dependencyCount}
          </summary>
          <ul>
            {profile.licenses.map((license) => (
              <li key={license}>{license}</li>
            ))}
          </ul>
          <p>{profile.progress.at(-1)}</p>
        </details>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action(() => start(false));
        }}
      >
        <div className="terminal-command-fields">
          <label>
            {t.command}
            <input value={line} onChange={(e) => setLine(e.target.value)} spellCheck={false} />
          </label>
          <label>
            {t.cwd}
            <input value={cwd} onChange={(e) => setCwd(e.target.value)} spellCheck={false} />
          </label>
        </div>
        <p className="terminal-hint">{t.help}</p>
        <div className="terminal-actions">
          <button
            type="submit"
            disabled={busy || preparing || anyRunning || profile?.state !== 'ready'}
          >
            {t.run}
          </button>
          <button
            type="button"
            disabled={busy || preparing || anyRunning || profile?.state !== 'ready'}
            onClick={() => void action(() => start(true))}
          >
            {t.open}
          </button>
          {profile?.commands.map((c) => (
            <button
              type="button"
              key={c.name}
              disabled={busy || preparing || anyRunning || profile.state !== 'ready'}
              onClick={() => void action(() => start(false, c.argv))}
            >
              {c.name}
            </button>
          ))}
        </div>
      </form>
      {error && (
        <p className="terminal-error" role="alert">
          {error}
        </p>
      )}
      {view?.processes.length ? (
        <>
          <div className="terminal-records" aria-label={t.history}>
            {view.processes.map((p) => (
              <button
                type="button"
                key={p.id}
                aria-pressed={selected === p.id}
                className={
                  p.state === 'failed' || p.state === 'unknown' ? 'terminal-failed-record' : ''
                }
                onClick={() => choose(p.id)}
              >
                <span>
                  {p.runtime === 'node' ? 'Node' : 'Python'} · {p.argv.join(' ') || '交互终端'}
                </span>
                <small>
                  {stateText(p.state)}
                  {p.exitCode !== null ? ` · 退出码 ${p.exitCode}` : ''}
                </small>
              </button>
            ))}
          </div>
          {process && (
            <>
              <div className="terminal-process-meta">
                <strong role="status">
                  {stateText(process.state)}
                  {process.exitCode !== null ? ` · 退出码 ${process.exitCode}` : ''}
                </strong>
                <span>
                  目录 {process.cwd} · {process.outputBytes.toLocaleString()} 字节
                </span>
                <button
                  type="button"
                  disabled={!running || busy}
                  onClick={() =>
                    void action(async () =>
                      setView(await command('terminal.stop', { runId, processId: selected })),
                    )
                  }
                >
                  {t.stop}
                </button>
              </div>
              <TerminalSurface
                text={text || (running ? '' : t.noOutput)}
                generation={selected + ':' + pageStart}
                interactive={interactive}
                onData={(value) => {
                  if (interactive)
                    void command('terminal.input', {
                      runId,
                      processId: selected,
                      text: value,
                    }).catch((e: Error) => setError(errorText(e.message)));
                }}
                onResize={(cols, rows) => {
                  size.current = { cols, rows };
                  if (interactive)
                    void command('terminal.resize', {
                      runId,
                      processId: selected,
                      cols,
                      rows,
                    }).catch(() => {});
                }}
              />
              <div className="terminal-log-controls">
                <small>{t.output}</small>
                <button type="button" disabled={pageStart === 0} onClick={() => setPageStart(0)}>
                  {t.restartLog}
                </button>
                <button type="button" disabled={!more} onClick={() => setPageStart(cursor.current)}>
                  {t.next}
                </button>
              </div>
              {process.reason && process.reason !== 'exited' && (
                <p className="terminal-hint">
                  {t.errors[process.reason as keyof typeof t.errors] ??
                    (process.state === 'unknown'
                      ? '运行结果待核对；请检查当前代码与环境后创建新的验证。'
                      : stateText(process.state))}
                </p>
              )}
            </>
          )}
        </>
      ) : (
        <p className="terminal-empty">{t.empty}</p>
      )}
    </section>
  );
}
