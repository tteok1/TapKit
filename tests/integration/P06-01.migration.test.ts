import { test, expect } from 'vitest';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { Store, migrate, migrations, newId } from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
const Database = createRequire(import.meta.url)(
  '../../packages/storage/node_modules/better-sqlite3',
) as typeof import('better-sqlite3');
test('P06-01 T20 schema16 upgrade preserves task/run/tool identity and restores history triggers on the rebuilt table', async () => {
  await mkdir('.test-data', { recursive: true });
  const directory = await mkdtemp(resolve('.test-data', 'P06 migration ')),
    db = new Database(join(directory, 'app.sqlite')),
    backups = join(directory, 'backups');
  db.pragma('foreign_keys=ON');
  await migrate(
    db,
    backups,
    migrations.filter((m) => m.version <= 16),
  );
  const store = new Store(db, directory);
  try {
    const reply = new CoreService(store).dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: 'sessions.create',
      payload: { mode: 'chat', title: '已有聊天' },
    });
    if (!reply.ok || !('entityId' in reply.data)) throw Error('session');
    const session = reply.data.entityId,
      branch = (
        db.prepare('SELECT active_branch_id id FROM sessions WHERE id=?').get(session) as {
          id: string;
        }
      ).id,
      time = store.now(),
      task = newId(),
      message = newId(),
      run = newId(),
      call = newId();
    db.prepare(
      'INSERT INTO tasks(id,profile_id,created_at,updated_at,session_id,root_task_id,goal,acceptance_json,mode) VALUES(?,?,?,?,?,?,?,\'{"schemaVersion":1,"rules":[]}\',\'chat\')',
    ).run(task, store.profileId, time, time, session, task, '旧任务正文');
    db.prepare(
      "INSERT INTO messages(id,profile_id,created_at,updated_at,session_id,branch_id,role,content_json,status) VALUES(?,?,?,?,?,?,'user','{\"schemaVersion\":1,\"blocks\":[]}','final')",
    ).run(message, store.profileId, time, time, session, branch);
    db.prepare(
      'INSERT INTO runs(id,profile_id,created_at,updated_at,task_id,task_version,root_run_id,session_id,user_message_id,status,model_json) VALUES(?,?,?,?,?,1,?,?,?,\'completed\',\'{"schemaVersion":1,"selection":null}\')',
    ).run(run, store.profileId, time, time, task, run, session, message);
    db.prepare(
      "INSERT INTO tool_calls(id,profile_id,created_at,updated_at,run_id,task_version,call_id,tool_name,tool_version,args_json,args_hash,resource_hash,idempotency_key,status,side_effect) VALUES(?,?,?,?,?,1,?,'artifact_write','1','{}','a','r',?,'succeeded','committed')",
    ).run(call, store.profileId, time, time, run, call, call);
    const oldTask = db.prepare('SELECT * FROM tasks WHERE id=?').get(task),
      oldRun = db.prepare('SELECT * FROM runs WHERE id=?').get(run),
      oldCall = db.prepare('SELECT * FROM tool_calls WHERE id=?').get(call);
    await migrate(db, backups);
    await migrate(db, backups);
    expect(db.prepare('SELECT * FROM tasks WHERE id=?').get(task)).toMatchObject(oldTask as object);
    expect(db.prepare('SELECT * FROM runs WHERE id=?').get(run)).toMatchObject(oldRun as object);
    expect(db.prepare('SELECT * FROM tool_calls WHERE id=?').get(call)).toMatchObject(
      oldCall as object,
    );
    db.prepare('UPDATE tasks SET goal=? WHERE id=?').run('迁移后任务正文', task);
    expect(
      db
        .prepare(
          "SELECT body FROM history_search_documents WHERE entity_id=? AND entity_type='task'",
        )
        .get(task),
    ).toEqual({ body: '迁移后任务正文' });
    db.prepare('UPDATE tasks SET deleted_at=? WHERE id=?').run(time, task);
    expect(
      db
        .prepare("SELECT 1 FROM history_search_documents WHERE entity_id=? AND entity_type='task'")
        .get(task),
    ).toBeUndefined();
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('user_version', { simple: true })).toBe(17);
  } finally {
    store.close();
  }
});
