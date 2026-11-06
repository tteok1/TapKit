import { test, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import {
  ExecArgsSchema,
  TerminalCommandSchemas,
  WorkToolArgsSchema,
} from '../../packages/contracts/src';
import {
  inspectCodeEnvironment,
  registryUrl,
  verifyDependency,
  catalogAllowsTool,
} from '../../packages/tools/src';
import { terminalArgv } from '../../apps/desktop/src/renderer/src/terminal-command';
import { newId } from '../../packages/storage/src';
import { zhipuToolNames, zhipuToolName } from '../../packages/providers/src/api/zhipu-tools';

test('P09-02 structured execution and terminal commands reject shell/executable/environment injection and unsafe paths', () => {
  const args = { runtime: 'node', argv: ['--test'], cwd: '.', timeoutMs: 1000 };
  expect(ExecArgsSchema.safeParse(args).success).toBe(true);
  for (const patch of [
    { argv: 'node --test' },
    { runtime: 'bash' },
    { cwd: '../outside' },
    { cwd: '.git' },
    { executable: 'cmd.exe' },
    { env: { TOKEN: 'synthetic' } },
    { argv: ['a\0b'] },
  ])
    expect(ExecArgsSchema.safeParse({ ...args, ...patch }).success).toBe(false);
  expect(WorkToolArgsSchema.safeParse({ tool: 'exec.run', ...args }).success).toBe(true);
  expect(
    TerminalCommandSchemas['terminal.resize'].safeParse({
      runId: newId(),
      processId: newId(),
      cols: 50000,
      rows: 30,
    }).success,
  ).toBe(false);
  expect(catalogAllowsTool('p08-tools-2', 'exec.run')).toBe(false);
  expect(catalogAllowsTool('p08-tools-2', 'code.applyPatch')).toBe(true);
  expect(catalogAllowsTool('p08-tools-2', 'research.search')).toBe(true);
  expect(catalogAllowsTool('p09-tools-1', 'exec.run')).toBe(true);
  expect(zhipuToolName('exec.run')).toBe('exec_run');
  expect(zhipuToolNames([{ name: 'exec.run' }]).get('exec_run')).toBe('exec.run');
  expect(() => zhipuToolNames([{ name: 'exec.run' }, { name: 'exec_run' }])).toThrow();
  expect(ExecArgsSchema.safeParse({ ...args, timeoutMs: 600000 }).success).toBe(true);
  expect(ExecArgsSchema.safeParse({ ...args, timeoutMs: 600001 }).success).toBe(false);
});
test('P09-02 displayed commands become literal argv with quoted code and Windows paths', () => {
  expect(terminalArgv('node -e "console.log(\'a b\');"', 'node')).toEqual([
    '-e',
    "console.log('a b');",
  ]);
  expect(terminalArgv('npm run test -- "中文 path/test.mjs"', 'node')).toEqual([
    'npm',
    'run',
    'test',
    '--',
    '中文 path/test.mjs',
  ]);
  expect(terminalArgv('python "sub\\test.py" ""', 'python')).toEqual(['sub\\test.py', '']);
  expect(() => terminalArgv('cmd /c whoami', 'node')).toThrow('COMMAND_RUNTIME');
  expect(() => terminalArgv('python "unclosed', 'python')).toThrow('COMMAND_QUOTES');
});
test('P09-02 registries, integrity and pin parsing fail closed', () => {
  for (const url of [
    'https://registry.npmjs.org.evil.invalid/a.tgz',
    'https://u:p@registry.npmjs.org/a.tgz',
    'http://registry.npmjs.org/a.tgz',
    'https://127.0.0.1/a.tgz',
    'git+https://github.com/a/b',
  ])
    expect(() => registryUrl(url, 'node')).toThrow();
  expect(() =>
    verifyDependency(
      {
        name: 'test',
        version: '1',
        url: '',
        filename: '',
        license: '',
        integrity: 'sha512-' + Buffer.alloc(64).toString('base64'),
      },
      Buffer.from('corrupt'),
    ),
  ).toThrow('DEPENDENCY_HASH_MISMATCH');
});
test('P09-02 detect pinned Node/Python and reject VCS, unpinned installs and other-language execution', async () => {
  const root = await mkdtemp(resolve('.test-data/P09-02 detect '));
  const inspect = (runtime: 'node' | 'python') =>
    inspectCodeEnvironment(root, resolve('.'), newId(), newId(), runtime);
  await writeFile(join(root, 'main.go'), 'package main');
  expect((await inspect('node')).profile.state).toBe('unsupported');
  expect((await inspect('python')).profile.state).toBe('unsupported');
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ dependencies: { x: 'git+https://example.invalid/a' } }),
  );
  expect((await inspect('node')).profile.message).toBe('UNSUPPORTED_DEPENDENCY');
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ scripts: { test: 'node --test', lint: 'node check.mjs' } }),
  );
  expect((await inspect('node')).profile.commands.map((c) => c.name)).toEqual([
    'Node 测试',
    'test',
    'lint',
  ]);
  await writeFile(join(root, 'requirements.txt'), 'demo>=1\n');
  expect((await inspect('python')).profile.state).toBe('unsupported');
  await writeFile(
    join(root, 'requirements.txt'),
    'demo==1.2.3 --hash=sha256:' + 'a'.repeat(64) + '\n',
  );
  const p = await inspect('python');
  expect(p.python).toEqual([{ name: 'demo', version: '1.2.3', hashes: ['a'.repeat(64)] }]);
  expect(p.profile.dependencyCount).toBe(1);
  await mkdir(join(root, '.tapkit-runtime')); // Private installed environments never become model source files.
});
