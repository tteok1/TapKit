import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmbeddingInference } from './embedding-inference';
import lock from '../../../embedding-model-lock.json';
import type { PreTrainedTokenizer } from '@huggingface/transformers';

export const EMBEDDING_REVISION = `${lock.revision}:q8:cls:windows384-64:v1`;
export interface Embedder {
  readonly revision: string;
  readonly dims: number;
  count(text: string, signal?: AbortSignal): number | Promise<number>;
  countAsync?(text: string, signal?: AbortSignal): Promise<number>;
  embed(text: string, query?: boolean, signal?: AbortSignal): Promise<Float32Array>;
  dispose?(): Promise<void>;
}
export interface SynchronousEmbedder extends Embedder {
  count(text: string): number;
}
export function normalize(vector: Float32Array) {
  let norm = 0;
  for (const value of vector) {
    if (!Number.isFinite(value)) throw new Error('INVALID_EMBEDDING');
    norm += value * value;
  }
  if (!norm) throw new Error('INVALID_EMBEDDING');
  norm = Math.sqrt(norm);
  return Float32Array.from(vector, (value) => value / norm);
}
export function tokenWindows(ids: number[], size: number, overlap = 64) {
  if (size <= overlap) throw new Error('INVALID_EMBEDDING_WINDOW');
  const result: { ids: number[]; weight: number; start: number }[] = [];
  for (let start = 0; start < ids.length; start += size - overlap) {
    const window = ids.slice(start, start + size);
    result.push({ ids: window, weight: window.length - (start ? overlap : 0), start });
    if (start + size >= ids.length) break;
  }
  return result;
}
export function weightedWindows(vectors: { vector: Float32Array; weight: number }[], dims: number) {
  const sum = new Float32Array(dims);
  for (const { vector, weight } of vectors) {
    if (vector.length !== dims || weight <= 0) throw new Error('INVALID_EMBEDDING');
    for (let i = 0; i < dims; i++) sum[i] = sum[i]! + vector[i]! * weight;
  }
  return normalize(sum);
}
export async function verifyModel(directory: string) {
  for (const [name, hash] of Object.entries(lock.files)) {
    if (
      createHash('sha256')
        .update(await readFile(join(directory, name)))
        .digest('hex') !== hash
    )
      throw new Error('EMBEDDING_MODEL_INTEGRITY');
  }
  const config = JSON.parse(await readFile(join(directory, 'config.json'), 'utf8'));
  if (config.hidden_size !== lock.dims || !Number.isInteger(config.max_position_embeddings))
    throw new Error('EMBEDDING_MODEL_CONFIG');
  return {
    dims: config.hidden_size as number,
    positions: config.max_position_embeddings as number,
  };
}
async function modelPath() {
  // Source/dev and bundled utilityProcess layouts. No user-selected model path crosses IPC.
  const candidates = [
    resolve(process.cwd(), 'resources/models', lock.directory),
    resolve(process.cwd(), '../../resources/models', lock.directory),
    ...(typeof __dirname === 'string' ? [resolve(__dirname, 'models', lock.directory)] : []),
  ];
  for (const directory of candidates) {
    try {
      await readFile(join(directory, 'config.json'));
      return directory;
    } catch {
      /* try next layout */
    }
  }
  throw new Error('INDEX_NOT_READY');
}
async function prepareBge(directory?: string) {
  const path = directory ?? (await modelPath());
  const config = await verifyModel(path);
  const { AutoTokenizer } = await import('@huggingface/transformers');
  const tokenizer: PreTrainedTokenizer = await AutoTokenizer.from_pretrained(path, {
    local_files_only: true,
  });
  const special = tokenizer.encode('');
  if (special.length !== 2) throw new Error('EMBEDDING_MODEL_CONFIG');
  const windowSize = Math.min(384, config.positions - special.length);
  const encode = (text: string) => tokenizer.encode(text, { add_special_tokens: false });
  return { path, config, special, windowSize, encode };
}
const sessionOptions = { intraOpNumThreads: 2, interOpNumThreads: 1 };
async function embedTokenIds(
  ids: number[],
  dims: number,
  special: number[],
  windowSize: number,
  infer: (ids: number[], signal?: AbortSignal) => Promise<Float32Array>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (!ids.length) throw new Error('INVALID_EMBEDDING');
  const windows: { vector: Float32Array; weight: number }[] = [];
  for (const window of tokenWindows(ids, windowSize)) {
    signal?.throwIfAborted();
    const input = [special[0]!, ...window.ids, special[1]!];
    windows.push({ vector: normalize(await infer(input, signal)), weight: window.weight });
  }
  signal?.throwIfAborted();
  return weightedWindows(windows, dims);
}
function bgeEmbedder(
  setup: Awaited<ReturnType<typeof prepareBge>>,
  infer: (ids: number[], signal?: AbortSignal) => Promise<Float32Array>,
  dispose: () => Promise<void>,
  encodeAsync?: (text: string, signal?: AbortSignal) => Promise<number[]>,
): SynchronousEmbedder {
  const { config, special, windowSize, encode } = setup;
  return {
    revision: EMBEDDING_REVISION,
    dims: config.dims,
    count: (text) => encode(text).length,
    async embed(text, query = false, signal) {
      signal?.throwIfAborted();
      const inputText = (query ? lock.queryPrefix : '') + text;
      const ids = encodeAsync ? await encodeAsync(inputText, signal) : encode(inputText);
      return embedTokenIds(ids, config.dims, special, windowSize, infer, signal);
    },
    dispose,
  };
}
export async function loadBge(directory?: string): Promise<SynchronousEmbedder> {
  const setup = await prepareBge(directory);
  const { AutoModel, Tensor } = await import('@huggingface/transformers');
  const model = await AutoModel.from_pretrained(setup.path, {
    local_files_only: true,
    device: 'cpu',
    dtype: 'q8',
    session_options: sessionOptions,
  });
  return bgeEmbedder(
    setup,
    async (input) => {
      const tensor = (values: number[]) =>
        new Tensor('int64', BigInt64Array.from(values, BigInt), [1, values.length]);
      const output = await model({
        input_ids: tensor(input),
        attention_mask: tensor(input.map(() => 1)),
        token_type_ids: tensor(input.map(() => 0)),
      });
      const hidden = output.last_hidden_state;
      if (hidden.dims.at(-1) !== setup.config.dims) throw new Error('INVALID_EMBEDDING');
      return Float32Array.from(hidden.data.slice(0, setup.config.dims));
    },
    async () => {
      await model.dispose();
    },
  );
}
type BackgroundEmbedder = Embedder & { healthy(): boolean; dispose(): Promise<void> };
const clients = new Set<EmbeddingInference>();
async function backgroundBge(
  directory?: string,
  shutdown?: AbortSignal,
): Promise<BackgroundEmbedder> {
  const path = directory ?? (await modelPath());
  shutdown?.throwIfAborted();
  const entry =
    typeof __dirname === 'string'
      ? join(__dirname, 'embedding-worker.mjs')
      : fileURLToPath(new URL('./embedding-worker.mjs', import.meta.url));
  const client = new EmbeddingInference(entry, path, lock.dims, sessionOptions, () =>
    clients.delete(client),
  );
  clients.add(client);
  const { positions, special } = await client.ready;
  return {
    revision: EMBEDDING_REVISION,
    dims: lock.dims,
    count: (text, signal) => client.count(text, signal),
    countAsync: (text, signal) => client.count(text, signal),
    async embed(text, query = false, signal) {
      signal?.throwIfAborted();
      const ids = await client.encode((query ? lock.queryPrefix : '') + text, signal);
      return embedTokenIds(
        ids,
        lock.dims,
        special,
        Math.min(384, positions - special.length),
        (ids, signal) => client.run(ids, signal),
        signal,
      );
    },
    healthy: () => client.healthy(),
    dispose: () => client.dispose(),
  };
}
export function loadBackgroundBge(directory?: string) {
  return backgroundBge(directory);
}
let loaded: Promise<BackgroundEmbedder> | undefined;
let shutdown = new AbortController();
export async function localEmbedder(): Promise<Embedder> {
  const closingSignal = shutdown.signal;
  const pending = (loaded ??= backgroundBge(undefined, closingSignal).catch((error) => {
    if (loaded === pending) loaded = undefined;
    throw error;
  }));
  const value = await pending;
  closingSignal.throwIfAborted();
  if (!value.healthy()) {
    if (loaded === pending) loaded = undefined;
    return localEmbedder();
  }
  return value;
}
export async function closeLocalEmbedder() {
  shutdown.abort();
  shutdown = new AbortController();
  loaded = undefined;
  await Promise.all([...clients].map((client) => client.dispose()));
}
