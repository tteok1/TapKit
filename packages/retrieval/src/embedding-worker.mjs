import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Only trusted Core creates this thread. It tokenizes selected material and
// runs bounded inference windows, with no storage or tool gateway.
if (!parentPort) throw new Error('EMBEDDING_WORKER_REQUIRED');
const { directory, dims, sessionOptions, files } = workerData;
// Cold file hashing and tokenizer construction also block Node's event loop.
// Verify every pinned byte here before allowing any model/tokenizer load.
for (const [name, expected] of Object.entries(files)) {
  const actual = createHash('sha256')
    .update(await readFile(join(directory, name)))
    .digest('hex');
  if (actual !== expected) throw new Error('EMBEDDING_MODEL_INTEGRITY');
}
const config = JSON.parse(await readFile(join(directory, 'config.json'), 'utf8'));
if (config.hidden_size !== dims || !Number.isInteger(config.max_position_embeddings))
  throw new Error('EMBEDDING_MODEL_CONFIG');
const { AutoTokenizer, AutoModel, Tensor } = await import('@huggingface/transformers');
const tokenizer = await AutoTokenizer.from_pretrained(directory, { local_files_only: true });
const special = tokenizer.encode('');
const windowSize = Math.min(384, config.max_position_embeddings - special.length);
if (special.length !== 2 || windowSize <= 64) throw new Error('EMBEDDING_MODEL_CONFIG');
const model = await AutoModel.from_pretrained(directory, {
  local_files_only: true,
  device: 'cpu',
  dtype: 'q8',
  session_options: sessionOptions,
});
async function infer(ids) {
  const tensor = (values) =>
    new Tensor('int64', BigInt64Array.from(values, BigInt), [1, values.length]);
  const output = await model({
    input_ids: tensor(ids),
    attention_mask: tensor(ids.map(() => 1)),
    token_type_ids: tensor(ids.map(() => 0)),
  });
  const hidden = output.last_hidden_state;
  if (hidden.dims.at(-1) !== dims) throw new Error('INVALID_EMBEDDING');
  return Float32Array.from(hidden.data.slice(0, dims));
}
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
    const values = await infer(ids);
    parentPort.postMessage({ type: 'result', id, value: values }, [values.buffer]);
  } catch {
    parentPort.postMessage({ type: 'error', id });
  }
});
parentPort.postMessage({
  type: 'ready',
  protocolVersion: 2,
  configuration: { positions: config.max_position_embeddings, special },
});
