import { newId, type Store } from '../../packages/storage/src';

export function seedPerformanceHistory(store: Store) {
  const now = store.now(),
    seedStart = performance.now();
  store.db.transaction(() => {
    const session = store.db.prepare(
        'INSERT INTO sessions(id,profile_id,created_at,updated_at,title,mode,active_branch_id,settings_json,last_activity_at) VALUES(?,?,?,?,?,\'chat\',?,\'{"schemaVersion":1,"values":{}}\',?)',
      ),
      branch = store.db.prepare(
        'INSERT INTO branches(id,profile_id,created_at,updated_at,session_id,label,head_message_id) VALUES(?,?,?,?,?,?,?)',
      ),
      head = store.db.prepare('UPDATE branches SET head_message_id=? WHERE id=?'),
      message = store.db.prepare(
        'INSERT INTO messages(id,profile_id,created_at,updated_at,session_id,branch_id,parent_message_id,role,content_json,status,chat_json) VALUES(?,?,?,?,?,?,?,? ,?,\'final\',\'{"schemaVersion":1,"attachments":[],"calls":[],"model":null,"errorCode":null}\')',
      );
    for (let i = 0; i < 10000; i++) {
      const s = newId(),
        b = newId();
      session.run(s, store.profileId, now + i, now + i, '性能会话 ' + i, b, now + i);
      branch.run(b, store.profileId, now + i, now + i, s, '主分支', null);
      let parent: string | null = null;
      for (let j = 0; j < 10; j++) {
        const id = newId();
        message.run(
          id,
          store.profileId,
          now + i,
          now + i,
          s,
          b,
          parent,
          j % 2 ? 'assistant' : 'user',
          JSON.stringify({
            schemaVersion: 1,
            blocks: [{ kind: 'text', text: '分页性能标记 ' + i + '/' + j }],
          }),
        );
        parent = id;
      }
      head.run(parent, b);
    }
  })();
  return performance.now() - seedStart;
}
