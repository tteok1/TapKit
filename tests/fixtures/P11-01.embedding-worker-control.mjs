import { parentPort, workerData } from 'node:worker_threads';
import { setTimeout as pause } from 'node:timers/promises';
if (workerData.directory === 'slow-init') await pause(500);
parentPort.on('message', ({ type, id, ids }) => {
  if (type === 'count' || type === 'encode') {
    parentPort.postMessage({ type: 'result', id, value: type === 'count' ? 0 : [] });
    return;
  }
  if (workerData.directory === 'crash') process.exit(1);
  if (workerData.directory === 'malformed') {
    parentPort.postMessage({ type: 'result', id, value: new Float32Array([1]) });
    return;
  }
  // Deliberately block only this fixture thread to test main-loop cancellation.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  parentPort.postMessage({ type: 'result', id, value: new Float32Array(ids.slice(0, 2)) });
});
parentPort.postMessage({
  type: 'ready',
  protocolVersion: workerData.directory === 'mismatch' ? 1 : 2,
  configuration: {
    positions: 512,
    special: workerData.directory === 'bad-config' ? [101] : [101, 102],
  },
});
