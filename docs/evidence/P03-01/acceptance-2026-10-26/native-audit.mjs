import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const evidence = fileURLToPath(new URL('.', import.meta.url));
const info = JSON.parse(await readFile(join(evidence, 'native-session.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = await readFile(info.source), download = await readFile(info.download);
const externalCopy = join(info.profile, 'tmp/external-preview/fa5affbd-3c33-4fa9-a892-25d90877e8b0/document.txt');
const external = await readFile(externalCopy);
const database = new DatabaseSync(join(info.profile, 'db/app.sqlite'), { readOnly: true });
let files;
try {
  files = database.prepare('SELECT f.display_name, f.relative_path, f.status, v.version, v.parse_status, v.size_bytes, v.sha256 FROM files f JOIN file_versions v ON v.id=f.current_version_id WHERE f.deleted_at IS NULL ORDER BY f.display_name').all();
} finally { database.close(); }
const result = {
  sourceUnchanged: hash(source) === info.sourceSha256,
  downloaded: true,
  downloadMatches: download.equals(source),
  externalCopyMatches: external.equals(source),
  sourceSha256: hash(source), downloadSha256: hash(download), externalSha256: hash(external),
  files,
  observedUi: ['native-open-cancel-without-new-file', 'native-open-chinese-path-and-import-ready', 'native-save-cancel-and-save-chinese-path', 'native-folder-recursive-selection-and-import', 'default-notepad-window-document.txt-created'],
  externalRendering: 'manual_pending_computer_use_app_approval_timed_out',
  nativeExplorerDrop: 'manual_pending_cross_window_drag',
  instrumentation: { sessionExitCode: 1, reason: 'Post-action snapshot failed: page.evaluate: Target page, context or browser has been closed; no successful public snapshot claimed. Read-only persisted-state/hash audit used after closure.' }
};
if (!result.sourceUnchanged || !result.downloadMatches || !result.externalCopyMatches || files.length !== 2 || !files.every(f => f.parse_status === 'ready')) throw new Error('Native persisted-state/hash audit failed: ' + JSON.stringify(result));
await writeFile(join(evidence, 'native-files-result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
