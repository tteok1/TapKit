import { expect, test, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { localEmbedder, cosine, verifyModel } from '../../packages/retrieval/src';
test('P04-01 T09 real pinned CPU ONNX tokenizer, 512 dimensions and tail windows', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  const bge = await localEmbedder();
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRestore();
  expect(bge.dims).toBe(512);
  const exact = await bge.embed('网络连接超时错误'),
    same = await bge.embed('网络连接超时错误'),
    query = await bge.embed('连接等很久没有响应', true);
  expect(cosine(exact, same)).toBeCloseTo(1, 5);
  expect(cosine(exact, query)).toBeGreaterThan(0.5);
  const long = '普通说明和背景。'.repeat(130);
  const a = await bge.embed(long + '尾部退款期限为七天。'.repeat(40));
  const b = await bge.embed(long + '尾部禁止退款，期限为零天。'.repeat(40));
  expect(bge.count(long)).toBeGreaterThan(800);
  expect(cosine(a, b)).toBeLessThan(0.999);
}, 120000);
test('P04-01 model digest mismatch fails closed without downloading a replacement', async () => {
  await mkdir('.test-data', { recursive: true });
  const directory = await mkdtemp(resolve('.test-data', 'P04-01 corrupt model '));
  await writeFile(join(directory, 'config.json'), '{"hidden_size":384}');
  const fetch = vi.spyOn(globalThis, 'fetch');
  try {
    await expect(verifyModel(directory)).rejects.toThrow('EMBEDDING_MODEL_INTEGRITY');
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
