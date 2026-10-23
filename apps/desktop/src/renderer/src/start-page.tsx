import type { KeyboardEvent, ReactNode } from 'react';
import t from '../locales/desktop.zh-CN.json';
import { UiIcon } from './ui-icon';
import { Tooltip } from './tooltip';

export type StartMode = 'chat' | 'temporary' | 'work';
const modes = ['chat', 'temporary', 'work'] as const;

export function StartPage({
  mode,
  onMode,
  showSuggestions,
  onSuggestions,
  onExample,
  busy,
  children,
}: {
  mode: StartMode;
  onMode: (mode: StartMode) => void;
  showSuggestions: boolean;
  onSuggestions: () => void;
  onExample: (text: string) => void;
  busy: boolean;
  children: ReactNode;
}) {
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % modes.length
        : event.key === 'ArrowLeft'
          ? (index + modes.length - 1) % modes.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? modes.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    onMode(modes[next]!);
    event.currentTarget
      .closest('[role="radiogroup"]')
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [next]?.focus();
  }
  return (
    <section className="start-page" aria-label="新建任务">
      <div className="start-page-scroll">
        <header className="start-heading">
          <h1>{t.home}</h1>
          <div className="start-modes" role="radiogroup" aria-label="任务类型">
            {modes.map((item, index) => (
              <Tooltip key={item} placement="bottom" label={t.startModes[item].description}>
                <button
                  type="button"
                  role="radio"
                  aria-label={t.startModes[item].label}
                  aria-checked={mode === item}
                  tabIndex={mode === item ? 0 : -1}
                  disabled={busy}
                  aria-describedby={'start-mode-' + item}
                  onClick={() => onMode(item)}
                  onKeyDown={(event) => move(event, index)}
                >
                  {t.startModes[item].label}
                  <span className="sr-only" id={'start-mode-' + item}>
                    {t.startModes[item].description}
                  </span>
                </button>
              </Tooltip>
            ))}
          </div>
        </header>
        <section className="start-recommendations" aria-label="推荐问题">
          <div className="start-recommendations-heading">
            <span>为你推荐</span>
            <button
              className="suggestions-toggle"
              aria-expanded={showSuggestions}
              aria-controls="start-questions"
              onClick={onSuggestions}
            >
              {showSuggestions ? '隐藏推荐问题' : '展示推荐问题'}
              <UiIcon name="chevronDown" />
            </button>
          </div>
          {showSuggestions && (
            <div className="start-questions" id="start-questions">
              {t.startModes[mode].examples.map((example) => (
                <button key={example} disabled={busy} onClick={() => onExample(example)}>
                  <span>{example}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      {children}
    </section>
  );
}
