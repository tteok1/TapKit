import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { openStore, newId, UsageLedger } from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
import {
  DEFAULT_MODEL_PREFERENCES,
  DEFAULT_SETTINGS,
  SettingsViewSchema,
} from '../../packages/contracts/src';

it('P10-02 persists display, startup and shortcut preferences by CAS without changing the workspace', async () => {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P10-02 settings '));
  const store = await openStore(dir);
  const service = new CoreService(store);
  const command = (name: string, payload: unknown, revision?: number) =>
    service.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: name,
      payload,
      ...(revision === undefined ? {} : { expectedRevision: revision }),
    });
  const scope = { type: 'profile' as const, id: store.profileId };
  const desktop = {
    ...store.settings.values.desktop,
    showPlanned: true,
    keepInTray: false,
    startPage: 'chats',
    weekStart: 'sunday',
    timeZone: 'America/New_York',
  };
  try {
    const original = store.settings.values;
    const written = command('settings.set', { scope, patch: { desktop } }, 1);
    if (!written.ok) throw Error(written.error.code);
    const settings = SettingsViewSchema.parse(written.data);
    expect(settings.revision).toBe(2);
    expect(settings.values).toEqual({ ...original, desktop });
    expect(
      command('settings.set', { scope, patch: { desktop: original.desktop } }, 1),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT', currentRevision: 2 } });
    expect(
      command(
        'settings.set',
        {
          scope,
          patch: {
            desktop: {
              ...desktop,
              shortcuts: { ...original.desktop.shortcuts, quickInput: 'Ctrl+K' },
            },
          },
        },
        2,
      ),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    for (const name of ['plugins.install', 'skills.run', 'agents.start', 'schedules.create']) {
      expect(command(name, {})).toMatchObject({
        ok: false,
        error: { code: 'FEATURE_NOT_AVAILABLE' },
      });
    }
  } finally {
    store.close();
  }
  const reopened = await openStore(dir);
  try {
    expect(reopened.settings.values.desktop).toEqual(desktop);
    expect(reopened.settings.revision).toBe(2);
    const ledger = new UsageLedger(reopened);
    reopened.db.transaction(() =>
      ledger.setPreferences(scope, { ...DEFAULT_MODEL_PREFERENCES, mode: 'deep' }, 1),
    )();
    const reopenedService = new CoreService(reopened);
    const reset = (resetModelPreferencesAt: number) =>
      reopenedService.dispatch({
        protocolVersion: 1,
        requestId: newId(),
        command: 'settings.set',
        expectedRevision: 2,
        payload: { scope, patch: DEFAULT_SETTINGS, resetModelPreferencesAt },
      });
    expect(reset(1)).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(reopened.settings.values.desktop).toEqual(desktop);
    expect(ledger.preferences(scope).values.mode).toBe('deep');
    expect(reset(2).ok).toBe(true);
    expect(reopened.settings.values).toEqual(DEFAULT_SETTINGS);
    expect(ledger.preferences(scope)).toMatchObject({
      values: DEFAULT_MODEL_PREFERENCES,
      revision: 3,
    });
  } finally {
    reopened.close();
  }
});
