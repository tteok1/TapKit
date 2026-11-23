import { parentPort, workerData } from 'node:worker_threads';
import { AutoTokenizer, AutoModel, Tensor } from '@huggingface/transformers';

// Only trusted Core creates this thread. It tokenizes selected material and
// runs bounded inference windows, with no storage or tool gateway.
if (!parentPort) throw new Error('EMBEDDING_WORKER_REQUIRED');
const { directory, dims, sessionOptions } = workerData;
const tokenizer = await AutoTokenizer.from_pretrained(directory, { local_files_only: true });
const model = await AutoModel.from_pretrained(directory, {
  local_files_only: true,
  device: 'cpu',
  dtype: 'q8',
  session_options: sessionOptions,
});
parentPort.on('message', async (message) => {
  if (!Number.isSafeInteger(message?.id)) return;
  const { id, ids } = message;
  try {
    if (message.type === 'count' || message.type === 'encode') {
      if (typeof message.text !== 'string') throw new Error('INVALID_EMBEDDING');
      const encoded = tokenizer.encode(message.text, { add_special_tokens: false });
      parentPort.postMessage({
        type: 'result',
        id,
        value: message.type === 'count' ? encoded.length : encoded,
      });
      return;
    }
    if (message.type !== 'run') return;
    if (
      !Array.isArray(ids) ||
      ids.length < 2 ||
      ids.length > 386 ||
      !ids.every((value) => Number.isSafeInteger(value) && value >= 0)
    )
      throw new Error('INVALID_EMBEDDING');
    const tensor = (values) =>
      new Tensor('int64', BigInt64Array.from(values, BigInt), [1, values.length]);
    const output = await model({
      input_ids: tensor(ids),
      attention_mask: tensor(ids.map(() => 1)),
      token_type_ids: tensor(ids.map(() => 0)),
    });
    const hidden = output.last_hidden_state;
    if (hidden.dims.at(-1) !== dims) throw new Error('INVALID_EMBEDDING');
    const values = Float32Array.from(hidden.data.slice(0, dims));
    parentPort.postMessage({ type: 'result', id, value: values }, [values.buffer]);
  } catch {
    parentPort.postMessage({ type: 'error', id });
  }
});
parentPort.postMessage({ type: 'ready', protocolVersion: 1 });
