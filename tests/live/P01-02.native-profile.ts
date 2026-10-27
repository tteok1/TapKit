import { realpathSync, readFileSync, existsSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ApiConfigSchema, IdSchema, resolveApiConfig, z } from '../../packages/contracts/src';

export const NATIVE_FIXTURE_MARKER = 'P01-02 isolated encrypted native fixture';
export const NativeSelectionSchema = z.strictObject({
  accountId: IdSchema,
  profileId: IdSchema,
  accountRevision: z.number().int().positive(),
  config: ApiConfigSchema,
});
export type NativeSelection = z.infer<typeof NativeSelectionSchema>;
export function nativeSelectionHash(selection: NativeSelection) {
  return createHash('sha256').update(JSON.stringify(selection)).digest('hex');
}
export function containedPath(parent: string, child: string) {
  const part = relative(parent, child);
  if (!part || part.startsWith('..') || isAbsolute(part)) throw new Error('PERMISSION_DENIED');
  return child;
}
export function nativeProfilePath(root: string, requested: string, fixture = false) {
  if (!isAbsolute(requested)) throw new Error('VALIDATION_ERROR');
  const directory = realpathSync(requested);
  if (resolve(requested).toLowerCase() !== directory.toLowerCase())
    throw new Error('PERMISSION_DENIED');
  containedPath(realpathSync(join(root, '.test-data')), directory);
  const prefix = fixture ? 'P01-02-native-fixture-' : 'P01-02-app-';
  if (!basename(directory).startsWith(prefix)) throw new Error('PERMISSION_DENIED');
  if (
    fixture &&
    readFileSync(join(directory, 'P01-02.native.fixture'), 'utf8') !== NATIVE_FIXTURE_MARKER
  )
    throw new Error('PERMISSION_DENIED');
  for (const name of ['db/app.sqlite', 'secrets']) {
    const path = join(directory, name);
    if (existsSync(path)) containedPath(directory, realpathSync(path));
  }
  return directory;
}
export function selectNativeAccount(
  root: string,
  requested: string,
  provider: string,
  account: string,
  fixture = false,
): NativeSelection {
  const directory = nativeProfilePath(root, requested, fixture);
  const providerId = ApiConfigSchema.shape.providerId.parse(provider);
  if (!account || account.length > 160) throw new Error('VALIDATION_ERROR');
  const db = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
  try {
    if (db.prepare('PRAGMA user_version').get()?.user_version !== 16) throw new Error('CONFLICT');
    // Only public configuration. The preflight never opens the vault or reads credential IDs.
    const rows = db
      .prepare(
        `SELECT id,profile_id,revision,api_format,base_url,model_id,status
      FROM provider_accounts WHERE provider_id=? AND auth_type='api_key'
      AND deleted_at IS NULL AND (id=? OR label=?)`,
      )
      .all(providerId, account, account);
    if (rows.length !== 1) throw new Error(rows.length ? 'CONFLICT' : 'NOT_FOUND');
    const row = rows[0]!;
    if (row.status !== 'ready') throw new Error('PROVIDER_UNAVAILABLE');
    // ModelService's formal catalog checks credentials. Restrict this dedicated
    // acceptance to a one-account profile so no unrelated channel is inspected.
    if (
      db.prepare('SELECT count(*) n FROM provider_accounts WHERE deleted_at IS NULL').get()?.n !== 1
    )
      throw new Error('PERMISSION_DENIED');
    if (
      db
        .prepare(
          'SELECT 1 FROM provider_attempts WHERE id NOT IN (SELECT provider_attempt_id FROM usage_ledger) LIMIT 1',
        )
        .get() ||
      db.prepare('SELECT 1 FROM budgets WHERE reserved_tokens<>0 LIMIT 1').get() ||
      db.prepare("SELECT 1 FROM title_jobs WHERE status IN ('queued','running') LIMIT 1").get()
    )
      throw new Error('CONFLICT');
    const config = resolveApiConfig(providerId, {
      apiFormat: row.api_format,
      baseURL: row.base_url,
      modelId: row.model_id,
    } as Parameters<typeof resolveApiConfig>[1]);
    if (fixture && new URL(config.baseURL).hostname !== 'fixture.invalid')
      throw new Error('PERMISSION_DENIED');
    if (
      !fixture &&
      (config.providerId !== 'openai-compatible' ||
        config.apiFormat !== 'openai-chat' ||
        config.baseURL !== 'https://open.bigmodel.cn/api/paas/v4' ||
        config.modelId !== 'glm-4.7-flashx')
    )
      throw new Error('PERMISSION_DENIED');
    if (
      db
        .prepare(
          "SELECT 1 FROM runs WHERE status IN ('running','queued','waiting_tool','waiting_user','pausing','paused','recovering') AND deleted_at IS NULL LIMIT 1",
        )
        .get()
    )
      throw new Error('CONFLICT');
    return NativeSelectionSchema.parse({
      accountId: row.id,
      profileId: row.profile_id,
      accountRevision: row.revision,
      config,
    });
  } finally {
    db.close();
  }
}
