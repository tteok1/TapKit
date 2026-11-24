// Runs under the bundled Node in the disposable installation profile.
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const [, , root, data, step] = process.argv;
const Database = require(join(root, 'node_modules/better-sqlite3'));
const live = join(data, 'db/app.sqlite');
const db = new Database(live, {
  fileMustExist: true,
  readonly: step.startsWith('verify'),
});
try {
  if (step === 'seed') {
    const id = randomUUID();
    const profile = db.prepare('SELECT id FROM profiles').get().id;
    db.exec('CREATE TABLE p11_install_fixture (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
    db.prepare('INSERT INTO p11_install_fixture VALUES (?, ?)').run(id, '升级保留样本');
    db.prepare(
      "INSERT INTO deletion_tombstones (id,profile_id,created_at,updated_at,entity_type,entity_id,deleted_before_event_seq) VALUES (?,?,0,0,'session',?,0)",
    ).run(randomUUID(), profile, id);
    // Keep the trigger to make the real schema-26 migration reject this fixture.
    db.pragma('user_version = 25');
  } else if (step === 'repair') {
    db.exec('DROP TRIGGER export_job_state');
  } else if (step === 'future') {
    db.pragma('user_version = 65535');
  } else if (step === 'restore-schema') {
    db.pragma('user_version = 26');
  } else if (step === 'mutate-interrupted-copy') {
    db.exec("UPDATE p11_install_fixture SET value = 'interrupted'");
  } else if (step.startsWith('verify')) {
    const expected = Number(step.split('-')[1]);
    assert.equal(db.pragma('user_version', { simple: true }), expected);
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    const fixture = db.prepare('SELECT * FROM p11_install_fixture').get();
    assert.equal(fixture.value, '升级保留样本');
    assert.ok(db.prepare('SELECT id FROM deletion_tombstones WHERE entity_id = ?').get(fixture.id));
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='export_job_state'").get());
  } else throw Error('Unknown fixture action');
} finally {
  db.close();
}
