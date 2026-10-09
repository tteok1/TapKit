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
