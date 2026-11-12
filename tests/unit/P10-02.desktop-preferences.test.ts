import { describe, expect, it } from 'vitest';
import { DEFAULT_DESKTOP, DesktopSettingsSchema } from '../../packages/contracts/src/desktop';
import {
  currentWeek,
  desktopDateBoundary,
  formatDesktopDate,
} from '../../apps/desktop/src/renderer/features/settings/desktop-preferences';

describe('P10-02 desktop settings', () => {
  it('keeps saved pre-P10 preferences and supplies defaults for all new fields', () => {
    const old = {
      theme: 'dark',
      fontSize: 'large',
      zoom: 2,
      enterSends: false,
      compact: true,
      showSuggestions: false,
      showPlanned: true,
      defaultDirectory: 'D:\\Downloads',
    };
    expect(DesktopSettingsSchema.parse(old)).toEqual({ ...DEFAULT_DESKTOP, ...old });
  });

  it('rejects duplicate bindings and unrecognized zones before settings can be stored', () => {
    expect(
      DesktopSettingsSchema.safeParse({
        ...DEFAULT_DESKTOP,
        shortcuts: { ...DEFAULT_DESKTOP.shortcuts, newTask: DEFAULT_DESKTOP.shortcuts.search },
      }).success,
    ).toBe(false);
    expect(
      DesktopSettingsSchema.safeParse({ ...DEFAULT_DESKTOP, timeZone: 'Other/Unknown' }).success,
    ).toBe(false);
  });

  it('uses the chosen zone and week start including a 23-hour date during DST', () => {
    const now = Date.UTC(2026, 2, 8, 16);
    const prefs = {
      ...DEFAULT_DESKTOP,
      timeZone: 'America/New_York',
      weekStart: 'sunday' as const,
    };
    expect(currentWeek(prefs, now)).toEqual(['2026-03-08', '2026-03-14']);
    expect(currentWeek({ ...prefs, weekStart: 'monday' }, now)).toEqual([
      '2026-03-02',
      '2026-03-08',
    ]);
    const start = desktopDateBoundary('2026-03-08', prefs.timeZone);
    const end = desktopDateBoundary('2026-03-08', prefs.timeZone, true);
    expect(start).toBe(Date.UTC(2026, 2, 8, 5));
    expect(end - start + 1).toBe(23 * 3600_000);
    expect(formatDesktopDate(now, { ...prefs, dateLocale: 'en-US' }, 'time')).toBe('12:00 PM');
  });
});
