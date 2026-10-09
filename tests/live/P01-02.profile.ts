import { realpathSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ApiConfigSchema, IdSchema, resolveApiConfig } from '../../packages/contracts/src';
import type { ApiLiveSelection } from './P01-02.acceptance';

export function selectApiLiveAccount(
  root: string,
  requested: string,
  provider: string,
  account: string,
): ApiLiveSelection {
  if (!isAbsolute(requested) || !account || account.length > 160)
    throw new Error('VALIDATION_ERROR');
  const directory = realpathSync(requested);
  const testRoot = realpathSync(resolve(root, '.test-data'));
  const child = relative(testRoot, directory);
  if (
    !child ||
    child.startsWith('..') ||
    isAbsolute(child) ||
    !basename(directory).startsWith('P01-02-live-')
  )
    throw new Error('PERMISSION_DENIED');
  // Resolve the database separately to reject a symlink out of the isolated profile.
  const databasePath = realpathSync(join(directory, 'db/app.sqlite'));
  const databaseChild = relative(directory, databasePath);
  if (!databaseChild || databaseChild.startsWith('..') || isAbsolute(databaseChild))
    throw new Error('PERMISSION_DENIED');
  const providerId = ApiConfigSchema.shape.providerId.parse(provider);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    // Public columns only: never select credential_id or open the vault.
    const rows = database
      .prepare(
        "SELECT id,label,api_format,base_url,model_id FROM provider_accounts WHERE provider_id=? AND auth_type='api_key' AND deleted_at IS NULL AND (id=? OR label=?)",
      )
      .all(providerId, account, account);
    if (rows.length !== 1) throw new Error(rows.length ? 'CONFLICT' : 'NOT_FOUND');
    const row = rows[0]!;
    const config = resolveApiConfig(providerId, {
      ...(row.api_format !== null ? { apiFormat: row.api_format } : {}),
      ...(row.base_url !== null ? { baseURL: row.base_url } : {}),
      ...(row.model_id !== null ? { modelId: row.model_id } : {}),
    } as Parameters<typeof resolveApiConfig>[1]);
    if (!config.modelId || typeof row.label !== 'string') throw new Error('MODEL_UNSUPPORTED');
    return { accountId: IdSchema.parse(row.id), label: row.label, config };
  } finally {
    database.close();
  }
}
