import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../../..');
const manifest = JSON.parse(
  readFileSync(
    join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
    'utf8',
  ),
);
const dataDir = realpathSync(manifest.dataDir);
if (manifest.root !== root || dirname(dataDir) !== join(root, '.test-data'))
  throw Error('Unexpected acceptance profile');
const db = new DatabaseSync(join(dataDir, 'db/app.sqlite'), { readOnly: true });
let profileId;
try {
  const profiles = db.prepare('SELECT id FROM profiles WHERE deleted_at IS NULL').all();
  if (profiles.length !== 1 || profiles[0].id !== '01a13376-d6a6-7ca5-90dd-a27bf8a7bf10')
    throw Error('Unexpected profile binding');
  profileId = profiles[0].id;
} finally {
  db.close();
}
const bytes = randomBytes(16),
  time = BigInt(Date.now());
for (let i = 0; i < 6; i++) bytes[5 - i] = Number((time >> BigInt(i * 8)) & 255n);
bytes[6] = (bytes[6] & 15) | 112;
bytes[8] = (bytes[8] & 63) | 128;
const hex = bytes.toString('hex');
const caseId = [
  hex.slice(0, 8),
  hex.slice(8, 12),
  hex.slice(12, 16),
  hex.slice(16, 20),
  hex.slice(20),
].join('-');
const result = {
  task: 'P02-02',
  round: 'C3',
  preparedAt: new Date().toISOString(),
  caseId,
  profileId,
  dataDir,
  tracePath: join(dataDir, 'logs', 'tool-trace-' + caseId + '.jsonl'),
  modelRequests: 0,
};
mkdirSync(join(directory, 'tool-trace-cases'), { recursive: true });
writeFileSync(
  join(directory, 'tool-trace-cases', caseId + '.json'),
  JSON.stringify(result, null, 2) + '\n',
  { flag: 'wx' },
);
writeFileSync(join(directory, 'tool-trace-current.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
