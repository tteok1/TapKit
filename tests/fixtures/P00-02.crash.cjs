const { openStore, BlobStore, JobQueue } = require('../../packages/storage/dist/index.cjs');
(async () => {
  const store = await openStore(process.argv[2]);
  if (process.argv[3] === 'blob') {
    const original = store.db.prepare.bind(store.db);
    store.db.prepare = (sql) => {
      if (sql.startsWith('INSERT INTO blobs')) {
        process.send({ renamed: true });
        // Stop precisely after durable rename but before DB registration.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      }
      return original(sql);
    };
    await new BlobStore(store).put(Buffer.from('orphan fixture'));
  } else if (process.argv[3] === 'clear') {
    const { renameSync } = require('node:fs');
    const { join } = require('node:path');
    const job = new JobQueue(store).claim('terminated-clear');
    if (!job || job.kind !== 'data.clear') throw Error('Clear fixture was not queued');
    const backup = process.argv[4];
    if (!/^[0-9a-f-]{36}$/.test(backup)) throw Error('Invalid backup fixture ID');
    const directory = join(store.dataDir, 'backups');
    renameSync(join(directory, backup), join(directory, '.purge-' + backup));
    process.send({
      id: job.id,
      expires: store.db.prepare('SELECT lease_expires_at FROM jobs WHERE id=?').get(job.id)
        .lease_expires_at,
    });
    setInterval(() => {}, 1000);
  } else {
    const queue = new JobQueue(store);
    const id = queue.enqueue({ schemaVersion: 1, kind: 'blob.gc' }, 'crash-job');
    const job = queue.claim('terminated');
    process.send({
      id,
      epoch: job.lease_epoch,
      expires: store.db.prepare('SELECT lease_expires_at FROM jobs WHERE id=?').get(id)
        .lease_expires_at,
    });
    setInterval(() => {}, 1000);
  }
})().catch(() => process.exit(1));
