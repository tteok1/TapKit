import { createContext, useContext } from 'react';
import { DEFAULT_DESKTOP, type SettingsValues } from '@tapkit/contracts';

export const DesktopPreferences = createContext(DEFAULT_DESKTOP);
export const useDesktopPreferences = () => useContext(DesktopPreferences);
type DatePreferences = Pick<
  SettingsValues['desktop'],
  'dateLocale' | 'timeZone' | 'dateFormat' | 'weekStart'
>;

export function formatDesktopDate(
  value: number,
  prefs: DatePreferences,
  kind: 'date' | 'time' | 'both' = 'both',
) {
  return new Intl.DateTimeFormat(prefs.dateLocale === 'system' ? undefined : prefs.dateLocale, {
    ...(kind === 'time' ? {} : { dateStyle: prefs.dateFormat }),
    ...(kind === 'date' ? {} : { timeStyle: 'short' }),
    timeZone: prefs.timeZone === 'system' ? undefined : prefs.timeZone,
  }).format(value);
}

export function currentWeek(prefs: DatePreferences, now = Date.now()) {
  const locale =
    prefs.dateLocale === 'system'
      ? new Intl.DateTimeFormat().resolvedOptions().locale
      : prefs.dateLocale;
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: prefs.timeZone === 'system' ? undefined : prefs.timeZone,
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  const date = new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
  const localWeek = new Intl.Locale(locale) as Intl.Locale & {
    getWeekInfo?: () => { firstDay: number };
  };
  const start =
    prefs.weekStart === 'monday'
      ? 1
      : prefs.weekStart === 'sunday'
        ? 0
        : (localWeek.getWeekInfo?.().firstDay ?? (localWeek.maximize().region === 'US' ? 7 : 1)) %
          7;
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() - start + 7) % 7));
  const from = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return [from, date.toISOString().slice(0, 10)] as const;
}

export function desktopDateBoundary(date: string, timeZone: string, end = false) {
  if (timeZone === 'system')
    return new Date(date + (end ? 'T23:59:59.999' : 'T00:00:00')).getTime();
  const utc = Date.parse(date + 'T00:00:00Z') + (end ? 86_400_000 : 0);
  const target = new Date(utc).toISOString().slice(0, 10);
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  let before = utc - 86_400_000;
  let after = utc + 86_400_000;
  while (after - before > 1) {
    const mid = Math.floor((before + after) / 2);
    if (formatter.format(mid) < target) before = mid;
    else after = mid;
  }
  return end ? after - 1 : after;
}

export function shortcutFromEvent(event: KeyboardEvent) {
  if (
    !event.ctrlKey ||
    event.metaKey ||
    event.isComposing ||
    event.repeat ||
    event.getModifierState('AltGraph')
  )
    return;
  const key = event.code === 'Space' ? 'Space' : event.key.toUpperCase();
  return 'Ctrl+' + (event.altKey ? 'Alt+' : '') + (event.shiftKey ? 'Shift+' : '') + key;
}
