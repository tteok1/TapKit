import { parentPort, workerData } from 'node:worker_threads';
import { setTimeout as pause } from 'node:timers/promises';
if (workerData.directory === 'slow-init') await pause(500);
parentPort.on('message', ({ id, ids }) => {
  if (workerData.directory === 'crash') process.exit(1);
  // Deliberately block only this fixture thread to test main-loop cancellation.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  parentPort.postMessage({ type: 'result', id, values: new Float32Array(ids.slice(0, 2)) });
});
parentPort.postMessage({ type: 'ready' });
