import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  realpathSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  lstatSync,
  constants,
} from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { root, isMain } from './lib.mjs';

function child(directory, prefix) {
  const path = realpathSync(directory);
  if (
    dirname(path).toLowerCase() !== join(root, '.test-data').toLowerCase() ||
    !basename(path).startsWith(prefix) ||
    path.toLowerCase() !== resolve(directory).toLowerCase() ||
    lstatSync(directory).isSymbolicLink()
  )
    throw Error('PERMISSION_DENIED');
  return path;
}
function readPublic(directory) {
  const database = join(directory, 'db/app.sqlite');
  if (realpathSync(database).toLowerCase() !== database.toLowerCase())
    throw Error('PERMISSION_DENIED');
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const accounts = db.prepare('SELECT * FROM provider_accounts WHERE deleted_at IS NULL').all();
    if (accounts.length !== 1) throw Error('CONFLICT');
    const a = accounts[0];
    if (
      a.provider_id !== 'openai-compatible' ||
      a.api_format !== 'openai-chat' ||
      a.base_url !== 'https://open.bigmodel.cn/api/paas/v4' ||
      !a.model_id ||
      !/^[0-9a-f-]{36}$/i.test(a.credential_id)
    )
      throw Error('PERMISSION_DENIED');
    return {
      account: a,
      settings: JSON.parse(
        db
          .prepare(
            "SELECT value_json FROM settings WHERE key='preferences' AND scope_type='profile' AND deleted_at IS NULL",
          )
          .get().value_json,
      ).values,
      preferences: JSON.parse(
        db
          .prepare(
            "SELECT value_json FROM settings WHERE key='modelPreferences' AND scope_type='profile' AND deleted_at IS NULL",
          )
          .get().value_json,
      ).values,
      catalog: db
        .prepare(
          'SELECT * FROM model_catalog WHERE provider_id=? AND model_id=? AND catalog_version=? AND deleted_at IS NULL',
        )
        .all(a.provider_id, a.model_id, 'tapkit-api/2:openai-chat:' + a.id),
    };
  } finally {
    db.close();
  }
}
function production() {
  for (const path of [
    'node_modules/electron/dist/electron.exe',
    'packages/core/dist/index.cjs',
    'packages/storage/dist/index.cjs',
    'apps/desktop/out/main/index.js',
    'apps/desktop/out/preload/index.js',
    'apps/desktop/out/renderer/index.html',
  ])
    if (!existsSync(join(root, path))) throw Error('BUILD_REQUIRED');
  const core = readFileSync(join(root, 'packages/core/dist/index.cjs'), 'utf8');
  if (core.includes('installChatFixture') || core.includes('installWebFixture'))
    throw Error('TEST_BUILD_REFUSED');
}
function restrict(directory) {
  const quoted = directory.replaceAll("'", "''");
  const script =
    "$ErrorActionPreference='Stop'; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=[System.Security.AccessControl.DirectorySecurity]::new(); $acl.SetAccessRuleProtection($true,$false); $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')); [System.IO.Directory]::SetAccessControl('" +
    quoted +
    "',$acl)";
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ],
    { windowsHide: true, stdio: 'ignore', timeout: 15000 },
  );
  if (result.error || result.status !== 0) throw Error('PERMISSION_DENIED');
}
export async function connectionProfile(prepare, task = 'P07-01', round) {
  if (!['P07-01', 'P07-02', 'P07-03'].includes(task)) throw Error('PERMISSION_DENIED');
  if (round !== undefined && !/^[a-f0-9-]{36}$/.test(round)) throw Error('PERMISSION_DENIED');
  const pointer = join(
    root,
    '.test-data/' + task + '-live-profile' + (round ? '-' + round : '') + '.json',
  );
  production();
  let directory;
  if (existsSync(pointer)) {
    const saved = JSON.parse(readFileSync(pointer, 'utf8'));
    directory = child(saved.directory, task + '-live-profile-');
    if (!existsSync(join(directory, 'P07.live-profile.json'))) throw Error('PERMISSION_DENIED');
    // Repeated launches preserve the user's repaired settings and credentials.
    const current = readPublic(directory);
    return {
      status: 'ready',
      directory,
      existing: true,
      accountLabel: current.account.label,
      modelId: current.account.model_id,
      accountStatus: current.account.status,
      modelRequests: 0,
      applicationStarted: false,
    };
  }
  const manifest = JSON.parse(
    readFileSync(join(root, '.test-data/P06-connection-debug.json'), 'utf8'),
  );
  const source = child(manifest.directory, 'P06-connection-debug-');
  const original = readPublic(source),
    a = original.account;
  if (!existsSync(join(source, 'secrets', a.credential_id))) throw Error('AUTH_REQUIRED');
  if (!prepare)
    return {
      status: 'prepared',
      existing: false,
      accountLabel: a.label,
      modelId: a.model_id,
      accountStatus: a.status,
      modelRequests: 0,
      applicationStarted: false,
    };
  mkdirSync(join(root, '.test-data'), { recursive: true });
  directory = mkdtempSync(join(root, '.test-data/' + task + '-live-profile-'));
  restrict(directory);
  const { openStore, newId } = createRequire(import.meta.url)(
    join(root, 'packages/storage/dist/index.cjs'),
  );
  const store = await openStore(directory);
  try {
    store.db.transaction(() => {
      const now = store.now();
      store.db
        .prepare(
          'INSERT INTO provider_accounts(id,profile_id,created_at,updated_at,provider_id,label,auth_type,credential_id,status,model_id,api_format,base_url,revision,last_error_code,last_check_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          a.id,
          store.profileId,
          now,
          now,
          a.provider_id,
          a.label,
          a.auth_type,
          a.credential_id,
          a.status,
          a.model_id,
          a.api_format,
          a.base_url,
          a.revision,
          a.last_error_code,
          a.last_check_at,
        );
      const settings = {
        ...store.settings.values,
        network: { mode: 'direct', proxyURL: '' },
        memoryEnabled: false,
      };
      store.db
        .prepare(
          "UPDATE settings SET value_json=? WHERE key='preferences' AND scope_type='profile'",
        )
        .run(JSON.stringify({ schemaVersion: 1, values: settings }));
      const preferences = {
        ...original.preferences,
        selection: { accountId: a.id, modelId: a.model_id },
        onlyThisModel: true,
        allowPaidFallback: false,
        mode: 'quick',
        reasoning: 'off',
        dailyTokenLimit: 120000,
        rootTokenLimit: 120000,
        workRootTokenLimit: 120000,
      };
      store.db
        .prepare(
          "INSERT INTO settings(id,profile_id,created_at,updated_at,scope_type,scope_id,key,value_json) VALUES(?,?,?,?,'profile',?,'modelPreferences',?)",
        )
        .run(
          newId(),
          store.profileId,
          now,
          now,
          store.profileId,
          JSON.stringify({ schemaVersion: 1, values: preferences }),
        );
      for (const m of original.catalog)
        store.db
          .prepare(
            'INSERT INTO model_catalog(id,profile_id,created_at,updated_at,provider_id,model_id,catalog_version,capabilities_json,price_json,verification,verified_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            newId(),
            store.profileId,
            now,
            now,
            m.provider_id,
            m.model_id,
            m.catalog_version,
            m.capabilities_json,
            m.price_json,
            m.verification,
            m.verified_at,
          );
    })();
  } finally {
    store.close();
  }
  // Copy only protected crypto metadata and ciphertext. No decrypt or API call.
  const crypto = JSON.parse(readFileSync(join(source, 'Local State'), 'utf8')).os_crypt;
  if (typeof crypto?.encrypted_key !== 'string') throw Error('AUTH_REQUIRED');
  writeFileSync(join(directory, 'Local State'), JSON.stringify({ os_crypt: crypto }), {
    flag: 'wx',
  });
  mkdirSync(join(directory, 'secrets'));
  copyFileSync(
    join(source, 'secrets', a.credential_id),
    join(directory, 'secrets', a.credential_id),
    constants.COPYFILE_EXCL,
  );
  writeFileSync(
    join(directory, 'P07.live-profile.json'),
    JSON.stringify({
      scope: task + ' isolated live verification only',
      source,
      createdAt: new Date().toISOString(),
      automaticModelCalls: false,
    }),
    { flag: 'wx' },
  );
  writeFileSync(
    pointer,
    JSON.stringify(
      {
        directory,
        source,
        createdAt: new Date().toISOString(),
        scope: task + ' isolated live verification only',
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  return {
    status: 'ready',
    directory,
    existing: false,
    accountLabel: a.label,
    modelId: a.model_id,
    accountStatus: a.status,
    modelRequests: 0,
    applicationStarted: false,
  };
}
if (isMain(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || !['--check-only', '--prepare'].includes(process.argv[2]))
      throw Error('VALIDATION_ERROR');
    console.log(JSON.stringify(await connectionProfile(process.argv[2] === '--prepare')));
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z_]{3,40}$/.test(error.message)
        ? error.message
        : 'PREPARATION_FAILED';
    console.error(
      'P07 live profile launcher: ' + code + '. No application or model request was started.',
    );
    process.exitCode = 1;
  }
}
