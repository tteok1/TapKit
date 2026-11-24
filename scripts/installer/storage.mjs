import { copyFile, lstat, mkdir, open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { verifyPayload } from './payload.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { migrate, SCHEMA_VERSION, openCompatibilityDatabase } = require('@tapkit/storage');

async function sync(path) {
  const handle = await open(path, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function prepare(dataDir, transaction) {
  const path = join(dataDir, 'db/app.sqlite');
  const info = await lstat(path).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (!info) return;
  if (!info.isFile()) throw Error('DATABASE_PATH');
  const original = new Database(path, { fileMustExist: true, readonly: true });
  const backup = join(transaction, 'before.sqlite');
  let schema;
  try {
    schema = original.pragma('user_version', { simple: true });
    if (!Number.isSafeInteger(schema) || schema > SCHEMA_VERSION) throw Error('DATABASE_NEWER');
    if (original.pragma('integrity_check', { simple: true }) !== 'ok')
      throw Error('DATABASE_INTEGRITY');
    // The installer owns this fresh directory. Its snapshot includes committed WAL pages.
    await mkdir(transaction);
    await original.backup(backup);
  } finally {
    original.close();
  }
  await sync(backup);
  if (schema === SCHEMA_VERSION) return;
  const pathNew = join(transaction, 'prepared.sqlite');
  await copyFile(backup, pathNew);
  const candidate = new Database(pathNew, { fileMustExist: true });
  try {
    candidate.pragma('journal_mode = DELETE');
    candidate.pragma('foreign_keys = ON');
    await migrate(candidate, join(transaction, 'migration-steps'));
  } catch {
    throw Error('DATABASE_MIGRATION');
  } finally {
    candidate.close();
  }
  await sync(pathNew);
  // An interrupted older process can leave committed pages in WAL. A checkpoint
  // preserves those pages in the pre-image and prevents replay on the new file.
  const checkpoint = new Database(path, { fileMustExist: true });
  try {
    if (checkpoint.pragma('journal_mode = DELETE', { simple: true }) !== 'delete')
      throw Error('DATABASE_BUSY');
  } finally {
    checkpoint.close();
  }
}

try {
  if (process.argv.length !== 6) throw Error('INSTALL_ARGUMENTS');
  const [, , installDir, dataDir, transaction, receipt] = process.argv;
  await verifyPayload(installDir);
  openCompatibilityDatabase().close();
  await prepare(dataDir, transaction);
  await writeFile(receipt, 'OK', { flag: 'wx' });
} catch (error) {
  // The caller displays the component, without storing SQL, user data or private paths.
  const message = String(error.message);
  const publicMessage = /^[A-Z_]+(?:: [A-Za-z0-9._/ @+-]{1,180})?$/.test(message)
    ? message
    : 'INSTALL_STORAGE_CHECK';
  await writeFile(process.argv[5], publicMessage, { flag: 'wx' }).catch(() => {});
  process.exitCode = 1;
}
