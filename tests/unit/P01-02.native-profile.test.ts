import { mkdtempSync } from '../../scripts/test-temp.mjs';
import { it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  containedPath,
  nativeProfilePath,
  NATIVE_FIXTURE_MARKER,
  nativeSelectionHash,
  selectNativeAccount,
} from '../live/P01-02.native-profile';
import { resolveApiConfig } from '../../packages/contracts/src';
import { openStore, newId } from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';

it('P01-02 native acceptance rejects nonisolated, relative and unmarked fixture profiles', () => {
  const root = resolve('.');
  expect(() => nativeProfilePath(root, '.test-data')).toThrow('VALIDATION_ERROR');
  expect(() => nativeProfilePath(root, root)).toThrow('PERMISSION_DENIED');
  const path = mkdtempSync(resolve('.test-data', 'P01-02-native-fixture-unit-'));
  expect(() => nativeProfilePath(root, path, true)).toThrow();
  writeFileSync(join(path, 'P01-02.native.fixture'), NATIVE_FIXTURE_MARKER);
  mkdirSync(join(path, 'secrets'));
  expect(nativeProfilePath(root, path, true)).toBe(path);
  expect(() => nativeProfilePath(root, path, false)).toThrow('PERMISSION_DENIED');
  expect(() => containedPath(path, resolve(path, '..', 'outside'))).toThrow('PERMISSION_DENIED');
});
it('P01-02 native preflight fingerprint binds account, revision, profile and exact API configuration', () => {
  const value = {
    accountId: '01990000-0000-7000-8000-000000000001',
    profileId: '01990000-0000-7000-8000-000000000002',
    accountRevision: 1,
    config: resolveApiConfig('openai-compatible', {
      modelId: 'm',
      apiFormat: 'openai-chat',
      baseURL: 'https://fixture.invalid/v1',
    }),
  };
  const hash = nativeSelectionHash(value);
  for (const changed of [
    { ...value, accountRevision: 2 },
    { ...value, accountId: value.profileId },
    { ...value, profileId: value.accountId },
    { ...value, config: { ...value.config, modelId: 'other' } },
    { ...value, config: { ...value.config, baseURL: 'https://other.invalid/v1' } },
  ])
    expect(nativeSelectionHash(changed)).not.toBe(hash);
});

it('P01-02 public preflight is read-only and rejects multiple active accounts or an unsupported database version', async () => {
  const directory = mkdtempSync(resolve('.test-data', 'P01-02-native-fixture-preflight-'));
  writeFileSync(join(directory, 'P01-02.native.fixture'), NATIVE_FIXTURE_MARKER);
  const store = await openStore(directory);
  const id = newId();
  const insert = (account: string) =>
    store.db
      .prepare(
        `INSERT INTO provider_accounts
    (id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status,model_id,api_format,base_url)
    VALUES (?,?,?,?,?,?,'api_key',?,'ready',?,'openai-chat',?)`,
      )
      .run(
        account,
        store.profileId,
        store.now(),
        store.now(),
        'openai-compatible',
        account,
        newId(),
        'm',
        'https://fixture.invalid/v1',
      );
  try {
    insert(id);
    expect(
      selectNativeAccount(resolve('.'), directory, 'openai-compatible', id, true),
    ).toMatchObject({ accountId: id, accountRevision: 1 });
    expect(store.db.prepare('SELECT count(*) n FROM opaque_states').get()).toEqual({ n: 0 });
    expect(store.db.prepare('SELECT count(*) n FROM provider_attempts').get()).toEqual({ n: 0 });
    const session = new CoreService(store).dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: 'sessions.create',
      payload: { mode: 'chat', title: 'native queued fixture' },
    });
    if (!session.ok || !('entityId' in session.data)) throw new Error('Fixture session missing');
    store.db
      .prepare(
        "INSERT INTO title_jobs(session_id,profile_id,run_id,expected_revision,status) VALUES(?,?,?,1,'queued')",
      )
      .run(session.data.entityId, store.profileId, newId());
    expect(() =>
      selectNativeAccount(resolve('.'), directory, 'openai-compatible', id, true),
    ).toThrow('CONFLICT');
    store.db.prepare('DELETE FROM title_jobs WHERE session_id=?').run(session.data.entityId);
    const other = newId();
    insert(other);
    expect(() =>
      selectNativeAccount(resolve('.'), directory, 'openai-compatible', id, true),
    ).toThrow('PERMISSION_DENIED');
    store.db
      .prepare('UPDATE provider_accounts SET deleted_at=? WHERE id=?')
      .run(store.now(), other);
    store.db.pragma('user_version=13');
    expect(() =>
      selectNativeAccount(resolve('.'), directory, 'openai-compatible', id, true),
    ).toThrow('CONFLICT');
  } finally {
    store.close();
  }
});
