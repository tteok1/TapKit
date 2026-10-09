import { test, expect } from 'vitest';
import { mkdtemp, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GitBroker } from '../../packages/tools/src/execution/git-broker';
import { runtimePaths } from '../../packages/tools/src/execution';

test('P00-03 GitBroker bounds oversized diff output and cleans the private lease', async () => {
  const privateRoot = await mkdtemp(resolve('.test-data/P00-03 broker output '));
  const broker = new GitBroker((await runtimePaths(resolve('.'), 'git')).executable, privateRoot);
  await expect(
    broker.inspect(
      { kind: 'diff' },
      [{ path: 'large.txt', content: Buffer.from('old\n') }],
      [{ path: 'large.txt', content: Buffer.from('a'.repeat(1_100_000) + '\n') }],
    ),
  ).rejects.toThrow('GIT_OUTPUT_LIMIT');
  expect(await readdir(privateRoot)).toEqual([]);
});

test('P00-03 GitBroker runs real MinGit status/diff on private byte snapshots', async () => {
  const privateRoot = await mkdtemp(resolve('.test-data/P00-03 broker 中文 '));
  const { executable } = await runtimePaths(resolve('.'), 'git');
  const broker = new GitBroker(executable, privateRoot);
  const before = [{ path: '目录/readme.txt', content: Buffer.from('before\n') }];
  const after = [{ path: '目录/readme.txt', content: Buffer.from('after 中文\n') }];
  const [status, diff] = await Promise.all([
    broker.inspect({ kind: 'status' }, before, after),
    broker.inspect({ kind: 'diff' }, before, after),
  ]);
  expect(status.output).toContain('目录/readme.txt');
  expect(diff.output).toContain('+after 中文');
  expect(await readdir(privateRoot)).toEqual([]);
});

test('P00-03 GitBroker rejects model args, metadata pointers and Windows path aliases', async () => {
  const privateRoot = await mkdtemp(resolve('.test-data/P00-03 broker reject '));
  const broker = new GitBroker((await runtimePaths(resolve('.'), 'git')).executable, privateRoot);
  await expect(broker.inspect({ kind: 'diff', args: ['--ext-diff'] }, [], [])).rejects.toThrow();
  for (const path of [
    '.git/config',
    'a/.GiT',
    '../escape',
    '/absolute',
    'C:/secret',
    'x:stream',
    'AUX.txt',
    'x.',
    'x~1',
  ])
    await expect(
      broker.inspect({ kind: 'status' }, [], [{ path, content: Buffer.from('hostile') }]),
    ).rejects.toThrow('GIT_SNAPSHOT_PATH');
  expect(await readdir(privateRoot)).toEqual([]);
});

test('P00-03 GitBroker excludes inherited Git config, external diff and SSH commands', async () => {
  const privateRoot = await mkdtemp(resolve('.test-data/P00-03 broker hostile '));
  const broker = new GitBroker((await runtimePaths(resolve('.'), 'git')).executable, privateRoot);
  const keys = {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'diff.external',
    GIT_CONFIG_VALUE_0: 'nonexistent-tapkit-must-not-run',
    GIT_EXTERNAL_DIFF: 'nonexistent-tapkit-must-not-run',
    GIT_SSH_COMMAND: 'nonexistent-tapkit-must-not-run',
    GIT_DIR: 'Z:/untrusted',
    GIT_WORK_TREE: 'Z:/untrusted',
  };
  const saved = Object.fromEntries(Object.keys(keys).map((key) => [key, process.env[key]]));
  Object.assign(process.env, keys);
  try {
    const attrs = {
      path: '.gitattributes',
      content: Buffer.from('*.txt diff=hostile filter=hostile\n'),
    };
    const output = await broker.inspect(
      { kind: 'diff' },
      [attrs, { path: 'readme.txt', content: Buffer.from('old\n') }],
      [attrs, { path: 'readme.txt', content: Buffer.from('new\n') }],
    );
    expect(output.output).toContain('+new');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  expect(await readdir(privateRoot)).toEqual([]);
});
