import { randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_SETTINGS,
  IdSchema,
  SettingsDocumentSchema,
  resolveApiConfig,
} from '../../../../packages/contracts/src';

// Preparation only: no credential, provider request, existing profile or vault access.
const root = resolve(process.argv[2] ?? '.');
const evidence = join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13');
const manifestPath = join(evidence, 'preparation.json');
if (existsSync(manifestPath)) throw new Error('Preparation already exists; preserve its profile.');
const files = [
  '0001_core.sql',
  '0002_codex.sql',
  '0003_api_providers.sql',
  '0004_usage.sql',
  '0005_desktop.sql',
  '0006_chat.sql',
  '0007_chat_history.sql',
  '0008_files.sql',
  '0009_generated_note_links.sql',
  '0010_file_preview.sql',
  '0011_projects.sql',
  '0012_retrieval.sql',
  '0013_context.sql',
  '0014_memory.sql',
];
const config = resolveApiConfig('openai-compatible', {
  apiFormat: 'openai-chat',
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  modelId: 'glm-4.7-flashx',
});
function newId() {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(Date.now(), 0, 6);
  bytes[6] = (bytes[6]! & 15) | 112;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString('hex');
  return IdSchema.parse(
    [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join(
      '-',
    ),
  );
}
const testRoot = join(root, '.test-data');
mkdirSync(testRoot, { recursive: true });
const dataDir = mkdtempSync(join(testRoot, 'P01-02-live-zhipu-chat-20261013-'));
mkdirSync(join(dataDir, 'db'));
const databasePath = join(dataDir, 'db/app.sqlite');
const database = new DatabaseSync(databasePath);
const migrationEvidence: { file: string; sha256: string; version: number }[] = [];
const profileId = newId();
const accountId = newId();
const accountLabel = 'Zhipu Chat FlashX 2026-10-13';
try {
  database.exec('PRAGMA foreign_keys = ON');
  for (const [index, file] of files.entries()) {
    const sql = readFileSync(join(root, 'migrations', file), 'utf8');
    const version = index + 1;
    if (version === 3) database.exec('PRAGMA foreign_keys = OFF');
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(sql);
      if (
        database.prepare('PRAGMA foreign_key_check').all().length ||
        database.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok'
      )
        throw new Error('Migration integrity check failed.');
      database.exec('PRAGMA user_version = ' + version);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    } finally {
      if (version === 3) database.exec('PRAGMA foreign_keys = ON');
    }
    migrationEvidence.push({
      file,
      version,
      sha256: createHash('sha256').update(sql).digest('hex'),
    });
  }
  const now = Date.now();
  database.exec('BEGIN IMMEDIATE');
  database
    .prepare(
      'INSERT INTO profiles(id,display_name,locale,timezone,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    )
    .run(profileId, 'Zhipu Chat isolated test', 'zh-CN', 'Asia/Shanghai', now, now);
  database
    .prepare(
      'INSERT INTO settings(id,profile_id,created_at,updated_at,scope_type,scope_id,key,value_json) VALUES (?,?,?,?,?,?,?,?)',
    )
    .run(
      newId(),
      profileId,
      now,
      now,
      'profile',
      profileId,
      'preferences',
      JSON.stringify(SettingsDocumentSchema.parse({ schemaVersion: 1, values: DEFAULT_SETTINGS })),
    );
  database
    .prepare(
      "INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status,api_format,base_url,model_id) VALUES(?,?,?,?,?,?,'api_key',?,'unconfigured',?,?,?)",
    )
    .run(
      accountId,
      profileId,
      now,
      now,
      config.providerId,
      accountLabel,
      newId(), // Reserved reference only; no vault entry or dummy Key is created.
      config.apiFormat,
      config.baseURL,
      config.modelId,
    );
  database.exec('COMMIT');
  if (
    database.prepare('SELECT count(*) AS count FROM provider_accounts').get()?.count !== 1 ||
    database.prepare('PRAGMA foreign_key_check').all().length ||
    database.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok'
  )
    throw new Error('Fresh profile verification failed.');
} finally {
  database.close();
}
const manifest = {
  task: 'P01-02',
  preparedAt: new Date().toISOString(),
  root,
  dataDir,
  profileId,
  accountId,
  accountLabel,
  config,
  accountStatus: 'unconfigured',
  schemaVersion: 14,
  credentialStored: false,
  vaultCreated: false,
  modelRequests: 0,
  migrations: migrationEvidence,
  databaseSha256: createHash('sha256').update(readFileSync(databasePath)).digest('hex'),
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(manifest, null, 2));
