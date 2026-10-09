import { DatabaseSync } from 'node:sqlite';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const databasePath = fileURLToPath(new URL('../../../../.test-data/development/db/app.sqlite', import.meta.url));
const label = process.argv[3] ?? 'chat';
if (!['chat', 'response'].includes(label)) throw new Error('Unsupported diagnostic label');
const baseURL = label === 'chat' ? 'https://open.bigmodel.cn/api/paas/v4' : 'https://open.bigmodel.cn/api/v1';
const report = { profile: 'development', readOnly: true, credentialsRead: false, found: existsSync(databasePath), account: null };
if (report.found) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    // Exact public columns and screenshot label only; never read credentials/native.
    report.account = database.prepare("SELECT label,provider_id,api_format,base_url,model_id,status,last_error_code,last_check_at,updated_at FROM provider_accounts WHERE label=? AND auth_type='api_key' AND deleted_at IS NULL AND base_url=?").all(label, baseURL);
  } finally { database.close(); }
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
