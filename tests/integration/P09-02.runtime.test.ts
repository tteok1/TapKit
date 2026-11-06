import { test, expect } from 'vitest';
import { mkdir, writeFile, readFile, utimes, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createServer } from 'node:net';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { fixture } from './P06.fixture';
import { newId } from '../../packages/storage/src';
import { CodeService } from '../../packages/core/src/code-service';
import { CodeRuntimeService } from '../../packages/core/src/code-runtime';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import {
  codeHash,
  codeTree,
  managedZip,
  inspectCodeEnvironment,
  runtimePaths,
  NativeSandboxExecutor,
  DependencyBroker,
} from '../../packages/tools/src';
import type { CodeProcess } from '../../packages/contracts/src';

async function setup(runtime: 'node' | 'python' = 'node', extra: Record<string, string> = {}) {
  const f = await fixture(),
    root = await mkdtemp(resolve('.test-data/P09-02 native ')),
    source = join(root, '中文项目');
  await mkdir(source);
  const original =
    runtime === 'node' ? 'export const sum=(a,b)=>a-b;\n' : 'def sum(a,b):\n    return a-b\n';
  const files =
    runtime === 'node'
      ? {
          'package.json': JSON.stringify({ type: 'module', scripts: { test: 'node --test' } }),
          'sum.mjs': original,
          'sum.test.mjs':
            "import {sum} from './sum.mjs';import assert from 'node:assert/strict';import test from 'node:test';test('sum',()=>assert.equal(sum(2,3),5));\n",
        }
      : {
          'sum.py': original,
          'test_sum.py':
            'import unittest\nfrom sum import sum\nclass TestSum(unittest.TestCase):\n    def test_sum(self): self.assertEqual(sum(2,3),5)\n',
        };
  for (const [name, text] of Object.entries({ ...files, ...extra }))
    await writeFile(join(source, name), text);
  const work = await f.create({ planFirst: true }),
    id = work.runId,
    code = new CodeService(f.store, resolve('.'));
  await code.attach(id, source);
  const reply = await code.dispatch({
    protocolVersion: 1,
    requestId: newId(),
    command: 'code.prepareWorkspace',
    payload: { runId: id },
  });
  expect(reply.ok, JSON.stringify(reply)).toBe(true);
  // This suite probes the real native boundary; it does not publish a production capability report.
  const service = new CodeRuntimeService(f.store, code, resolve('.'), {
    nativeExecution: { status: 'available' },
    terminal: { status: 'available' },
    officeRender: { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason: 'not used' },
  });
  // Wire the same shared gateway instance that the fixture's WorkService owns, as Core does.
  Object.defineProperty(f.gateway, 'code', { value: code });
  Object.defineProperty(f.gateway, 'runtime', { value: service });
  const wait = async (process: CodeProcess) => {
    const end = performance.now() + 130000;
    while (performance.now() < end) {
      const current = (await service.view(id)).processes.find((p) => p.id === process.id)!;
      if (!['starting', 'running'].includes(current.state))
        return { process: current, output: (await service.poll(id, process.id, 0)).output.text };
      await new Promise((r) => setTimeout(r, 30));
    }
    throw Error('process timeout');
  };
  return {
    ...f,
    root,
    source,
    original,
    id,
    code,
    service,
    wait,
    close: async () => {
      await service.stop();
      await f.close();
    },
  };
}
for (const runtime of ['node', 'python'] as const)
  test(`P09-02 ${runtime} real failed test then hash-bound repair passes and original remains unchanged`, async () => {
    const f = await setup(runtime);
    try {
      const profile = await f.service.prepare(f.id, runtime);
      expect(profile.state, JSON.stringify(profile)).toBe('ready');
      const argv =
        runtime === 'node'
          ? ['--test', '--test-isolation=none']
          : ['-m', 'unittest', 'discover', '-v'];
      const failed = await f.wait(
        await f.service.start(f.id, { runtime, argv, cwd: '.', timeoutMs: 30000 }, false),
      );
      expect(failed.process.state, JSON.stringify(failed)).toBe('failed');
      expect(failed.process.exitCode).not.toBe(0);
      expect(await f.service.verify(f.id)).toBe(false);
      const name = runtime === 'node' ? 'sum.mjs' : 'sum.py';
      const reply = await f.code.dispatch({
        protocolVersion: 1,
        requestId: newId(),
        command: 'code.applyPatch',
        payload: {
          runId: f.id,
          patch: {
            path: name,
            baseHash: codeHash(f.original),
            content: f.original.replace('a-b', 'a+b'),
          },
        },
      });
      expect(reply.ok, JSON.stringify(reply)).toBe(true);
      const passed = await f.wait(
        await f.service.start(f.id, { runtime, argv, cwd: '.', timeoutMs: 30000 }, false),
      );
      expect(passed.process.state, JSON.stringify(passed)).toBe('succeeded');
      expect(passed.process.exitCode).toBe(0);
      expect(await f.service.verify(f.id)).toBe(true);
      expect(await readFile(join(f.source, name), 'utf8')).toBe(f.original);
      expect((await f.service.view(f.id)).processes).toHaveLength(2);
    } finally {
      await f.close();
    }
  }, 180000);

test('P09-02 Python ignores stale bytecode after a same-size same-second repair', async () => {
  const f = await setup('python');
  try {
    await f.service.prepare(f.id, 'python');
    const workspace = await f.code.executionWorkspace(f.id),
      path = join(workspace.root, 'sum.py'),
      timestamp = new Date('2020-01-01T00:00:00Z');
    await utimes(path, timestamp, timestamp);
    const before = await stat(path);
    const seed = await f.wait(
      await f.service.start(
        f.id,
        {
          runtime: 'python',
          cwd: '.',
          timeoutMs: 30000,
          argv: [
            '-c',
            "import py_compile,sys,os;os.makedirs('__pycache__',exist_ok=True);py_compile.compile('sum.py',cfile='__pycache__/sum.'+sys.implementation.cache_tag+'.pyc',doraise=True,invalidation_mode=py_compile.PycInvalidationMode.TIMESTAMP);print('OLD_CACHE_SEEDED')",
          ],
        },
        false,
      ),
    );
    expect(seed.process.state, JSON.stringify(seed)).toBe('succeeded');
    expect(seed.output).toContain('OLD_CACHE_SEEDED');
    const args = {
      runtime: 'python' as const,
      argv: ['-m', 'unittest', 'discover', '-v'],
      cwd: '.',
      timeoutMs: 30000,
    };
    expect((await f.wait(await f.service.start(f.id, args, false))).process.state).toBe('failed');
    const patch = await f.code.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: 'code.applyPatch',
      payload: {
        runId: f.id,
        patch: {
          path: 'sum.py',
          baseHash: codeHash(f.original),
          content: f.original.replace('a-b', 'a+b'),
        },
      },
    });
    expect(patch.ok, JSON.stringify(patch)).toBe(true);
    await utimes(path, timestamp, timestamp);
    const after = await stat(path);
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    const result = await f.wait(await f.service.start(f.id, args, false));
    expect(result.process.state, JSON.stringify(result)).toBe('succeeded');
    expect(result.output).toContain('OK');
    expect(await readFile(join(f.source, 'sum.py'), 'utf8')).toBe(f.original);
  } finally {
    await f.close();
  }
}, 180000);

test('P09-02 work gateway reruns the same test after a patch, reuses exact receipts and never accepts a failed test', async () => {
  const f = await setup();
  try {
    const gateway = new WorkToolGateway(
        f.artifacts,
        undefined,
        undefined,
        undefined,
        undefined,
        f.code,
        f.service,
      ),
      run = f.work.repo.row(f.id);
    const args = {
      tool: 'exec.run' as const,
      runtime: 'node' as const,
      argv: ['--test', '--test-isolation=none'],
      cwd: '.',
      timeoutMs: 30000,
    };
    const failed = await gateway.execute(run, 'repair-and-check', args, () => {});
    expect(failed?.kind).toBe('file');
    expect(await gateway.verify(run, [failed!])).toBe(false);
    const patch = await gateway.execute(
      run,
      'repair-and-check',
      {
        tool: 'code.applyPatch',
        patch: {
          path: 'sum.mjs',
          baseHash: codeHash(f.original),
          content: f.original.replace('a-b', 'a+b'),
        },
      },
      () => {},
    );
    const passed = await gateway.execute(run, 'repair-and-check', args, () => {});
    expect(passed).not.toEqual(failed);
    expect(await gateway.verify(run, [patch!, passed!])).toBe(true);
    const count = f.work.repo.row(f.id).tools;
    expect(await gateway.execute(run, 'repair-and-check', args, () => {})).toEqual(passed);
    expect(f.work.repo.row(f.id).tools).toBe(count);
    expect((await f.service.view(f.id)).processes.map((p) => p.state)).toEqual([
      'succeeded',
      'failed',
    ]);
  } finally {
    await f.close();
  }
}, 180000);

test('P09-02 timeout, output limit and native workspace limit fail closed with an empty Job', async () => {
  const f = await setup();
  try {
    const timeout = await f.wait(
      await f.service.start(
        f.id,
        { runtime: 'node', argv: ['-e', 'setInterval(()=>{},1000)'], cwd: '.', timeoutMs: 250 },
        false,
      ),
    );
    expect(timeout.process.state).toBe('timeout');
    const output = await f.wait(
      await f.service.start(
        f.id,
        {
          runtime: 'node',
          argv: ['-e', "process.stdout.write('x'.repeat(8*1024*1024));setInterval(()=>{},1000)"],
          cwd: '.',
          timeoutMs: 15000,
        },
        false,
      ),
    );
    expect(output.process.state, JSON.stringify(output.process)).toBe('output_limit');
    expect(output.process.outputBytes).toBeLessThanOrEqual(4 * 1024 ** 2);
    const workspace = await f.code.executionWorkspace(f.id),
      input = join(f.root, 'quota-input');
    await mkdir(input);
    const native = await new NativeSandboxExecutor(resolve('.')).execute({
      protocolVersion: 1,
      requestId: newId(),
      runId: newId(),
      leaseEpoch: 1,
      operation: 'diagnostic.execute',
      payload: {
        ...(await runtimePaths(resolve('.'), 'node')),
        inputRoot: input,
        workspace: workspace.root,
        args: [
          '-e',
          "require('node:fs').writeFileSync('quota.bin',Buffer.alloc(256*1024));setInterval(()=>{},1000)",
        ],
        terminal: false,
        workspaceBytes: 64 * 1024,
        timeoutMs: 10000,
        memoryBytes: 256 * 1024 ** 2,
        processLimit: 4,
        outputBytes: 65536,
      },
    });
    expect(native.events.at(-1)!.data.status).toBe('workspace_limit');
    expect(native.events.at(-1)!.data.activeProcesses).toBe(0);
    const ads = await new NativeSandboxExecutor(resolve('.')).execute({
      protocolVersion: 1,
      requestId: newId(),
      runId: newId(),
      leaseEpoch: 1,
      operation: 'diagnostic.execute',
      payload: {
        ...(await runtimePaths(resolve('.'), 'node')),
        inputRoot: input,
        workspace: workspace.root,
        args: ['-e', "require('node:fs').writeFileSync('ads.txt:payload',Buffer.alloc(256*1024))"],
        terminal: false,
        streamOutput: true,
        writeBytes: 64 * 1024,
        timeoutMs: 10000,
        memoryBytes: 256 * 1024 ** 2,
        processLimit: 4,
        outputBytes: 65536,
      },
    });
    expect(ads.events.at(-1)!.data.status).toBe('workspace_limit');
    expect(ads.events.at(-1)!.data.writeBytes).toBeGreaterThan(64 * 1024);
    expect(ads.events.at(-1)!.data.activeProcesses).toBe(0);
  } finally {
    await f.close();
  }
}, 180000);

test('P09-02 user code cannot connect even to an owned loopback server', async () => {
  const f = await setup();
  let connections = 0;
  const server = createServer((socket) => {
    connections++;
    socket.destroy();
  });
  try {
    await new Promise<void>((resolveReady, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolveReady());
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('server');
    const script = `const c=require('node:net').connect(${address.port},'127.0.0.1');c.on('connect',()=>{console.log('NETWORK_ESCAPED');c.destroy()});c.on('error',e=>console.log('NETWORK_DENIED:'+e.code));setTimeout(()=>{console.log('NETWORK_CLOSED');c.destroy()},1000);`;
    const result = await f.wait(
      await f.service.start(
        f.id,
        { runtime: 'node', argv: ['-e', script], cwd: '.', timeoutMs: 5000 },
        false,
      ),
    );
    expect(result.process.state, JSON.stringify(result)).toBe('succeeded');
    expect(result.output).not.toContain('NETWORK_ESCAPED');
    expect(connections).toBe(0);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await f.close();
  }
}, 180000);

function tarball(files: Record<string, string>) {
  const blocks: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const bytes = Buffer.from(content),
      header = Buffer.alloc(512);
    header.write('package/' + name);
    header.write('0000644\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124);
    header.write('00000000000\0', 136);
    header.fill(32, 148, 156);
    header.write('0', 156);
    header.write('ustar\0', 257);
    const sum = header.reduce((a, b) => a + b, 0);
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}
test('P09-02 npm v3 uses verified cache for a real offline install; malicious postinstall cannot read a private secret', async () => {
  const dep = tarball({
    'package.json': JSON.stringify({
      name: 'tapkit-fixture-dep',
      version: '1.0.0',
      main: 'index.js',
    }),
    'index.js': 'module.exports=42;\n',
  });
  const integrity = 'sha512-' + createHash('sha512').update(dep).digest('base64');
  const url = 'https://registry.npmjs.org/tapkit-fixture-dep/-/tapkit-fixture-dep-1.0.0.tgz';
  const f = await setup('node');
  try {
    const workspace = await f.code.executionWorkspace(f.id),
      secret = join(f.dir, 'P09-02-private-synthetic.txt');
    await writeFile(secret, 'SYNTHETIC_PRIVATE_SENTINEL');
    const pkg = {
      name: 'tapkit-project',
      version: '1.0.0',
      dependencies: { 'tapkit-fixture-dep': '1.0.0' },
      scripts: {
        postinstall: `node --preserve-symlinks --preserve-symlinks-main -e "try{require('node:fs').readFileSync(${JSON.stringify(secret).replaceAll('"', '\\"')});console.log('SECRET_ESCAPED')}catch(e){console.log('SECRET_DENIED:'+e.code)}"`,
      },
    };
    await writeFile(join(workspace.root, 'package.json'), JSON.stringify(pkg));
    await writeFile(
      join(workspace.root, 'package-lock.json'),
      JSON.stringify({
        name: pkg.name,
        version: pkg.version,
        lockfileVersion: 3,
        packages: {
          '': { name: pkg.name, version: pkg.version, dependencies: pkg.dependencies },
          'node_modules/tapkit-fixture-dep': {
            version: '1.0.0',
            resolved: url,
            integrity,
            license: 'MIT',
          },
        },
      }),
    );
    await f.service.broker.seed(
      {
        name: 'node_modules/tapkit-fixture-dep',
        version: '1.0.0',
        url,
        integrity,
        filename: 'package.tgz',
        license: 'MIT',
      },
      dep,
    );
    const prepared = await f.service.prepare(f.id, 'node', false);
    if (prepared.state !== 'ready')
      console.log(
        'P09-02 synthetic post-install file audit',
        await Promise.all(
          (await codeTree(workspace.root)).slice(0, 10).map(async (path) => {
            const bytes = await readFile(join(workspace.root, path));
            return { path, bytes: bytes.length, nul: bytes.includes(0) };
          }),
        ),
      );
    expect(
      prepared.state,
      JSON.stringify({
        profile: prepared,
        processes: await f.service.view(f.id),
        output: (await f.service.view(f.id)).processes[0]
          ? await f.service.poll(f.id, (await f.service.view(f.id)).processes[0]!.id, 0)
          : null,
      }),
    ).toBe('ready');
    const install = (await f.service.view(f.id)).processes[0]!;
    const output = (await f.service.poll(f.id, install.id, 0)).output.text;
    expect(output).toMatch(/(?:^|\r?\n)SECRET_DENIED:(?:EPERM|EACCES)(?:\r?\n|$)/);
    expect(output).not.toMatch(/(?:^|\r?\n)SECRET_ESCAPED(?:\r?\n|$)/);
    expect(await readFile(secret, 'utf8')).toBe('SYNTHETIC_PRIVATE_SENTINEL');
    const run = await f.wait(
      await f.service.start(
        f.id,
        {
          runtime: 'node',
          argv: ['-e', "console.log(require('tapkit-fixture-dep'))"],
          cwd: '.',
          timeoutMs: 5000,
        },
        false,
      ),
    );
    expect(run.process.state, JSON.stringify(run)).toBe('succeeded');
    expect(run.output).toContain('42');
  } finally {
    await f.close();
  }
}, 180000);

test('P09-02 cached Python wheel installs offline and is available to the isolated project', async () => {
  const f = await setup('python');
  try {
    const workspace = await f.code.executionWorkspace(f.id),
      bytes = await managedZip([
        { name: 'tapkit_dep/__init__.py', bytes: Buffer.from('answer=42\n') },
        {
          name: 'tapkit_dep-1.0.0.dist-info/METADATA',
          bytes: Buffer.from('Metadata-Version: 2.1\nName: tapkit-dep\nVersion: 1.0.0\n'),
        },
      ]);
    const hash = createHash('sha256').update(bytes).digest('hex');
    await writeFile(
      join(workspace.root, 'requirements.txt'),
      'tapkit-dep==1.0.0 --hash=sha256:' + hash + '\n',
    );
    const plan = await inspectCodeEnvironment(
      workspace.root,
      resolve('.'),
      f.id,
      newId(),
      'python',
    );
    await f.service.broker.seed(
      {
        name: 'tapkit-dep',
        version: '1.0.0',
        url: 'https://files.pythonhosted.org/packages/tapkit_dep-1.0.0-py3-none-any.whl',
        filename: 'tapkit_dep-1.0.0-py3-none-any.whl',
        license: 'MIT',
        integrity: 'sha256-' + Buffer.from(hash, 'hex').toString('base64'),
      },
      bytes,
    );
    await writeFile(
      join(f.service.broker.cache, 'python-' + plan.profile.lockHash + '.json'),
      JSON.stringify([
        {
          name: 'tapkit-dep',
          version: '1.0.0',
          url: 'https://files.pythonhosted.org/packages/tapkit_dep-1.0.0-py3-none-any.whl',
          filename: 'tapkit_dep-1.0.0-py3-none-any.whl',
          license: 'MIT',
          integrity: 'sha256-' + Buffer.from(hash, 'hex').toString('base64'),
        },
      ]),
    );
    const profile = await f.service.prepare(f.id, 'python', false);
    expect(profile.state, JSON.stringify({ profile, view: await f.service.view(f.id) })).toBe(
      'ready',
    );
    const result = await f.wait(
      await f.service.start(
        f.id,
        {
          runtime: 'python',
          argv: ['-c', 'import tapkit_dep;print(tapkit_dep.answer)'],
          cwd: '.',
          timeoutMs: 5000,
        },
        false,
      ),
    );
    expect(result.process.state, JSON.stringify(result)).toBe('succeeded');
    expect(result.output).toContain('42');
  } finally {
    await f.close();
  }
}, 180000);

test('P09-02 cancellation kills descendants, blocks concurrent patching and preserves bounded paged output', async () => {
  const f = await setup();
  try {
    await f.service.prepare(f.id, 'node');
    const child =
      "require('node:fs').appendFileSync('ticks.txt','x');setInterval(()=>require('node:fs').appendFileSync('ticks.txt','x'),50)";
    const p = await f.service.start(
      f.id,
      {
        runtime: 'node',
        argv: [
          '-e',
          `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:'inherit'});console.log('CHILD_STARTED');setInterval(()=>{},1000)`,
        ],
        cwd: '.',
        timeoutMs: 15000,
      },
      false,
    );
    const source = (
      f.store.db.prepare('SELECT canonical_path FROM worktrees WHERE run_id=?').get(f.id) as {
        canonical_path: string;
      }
    ).canonical_path;
    let childStarted = false;
    for (let i = 0; i < 200; i++) {
      if ((await readFile(join(source, 'ticks.txt'), 'utf8').catch(() => '')).length > 0) {
        childStarted = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(childStarted).toBe(true);
    const patch = await f.code.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: 'code.applyPatch',
      payload: {
        runId: f.id,
        patch: {
          path: 'sum.mjs',
          baseHash: codeHash(f.original),
          content: f.original.replace('a-b', 'a+b'),
        },
      },
    });
    expect(patch.ok).toBe(false);
    f.service.control(f.id, p.id, 'stop');
    expect((await f.wait(p)).process.state).toBe('cancelled');
    const nativeIdentity = JSON.parse(
      (
        f.store.db.prepare('SELECT identity_json FROM process_handles WHERE id=?').get(p.id) as {
          identity_json: string;
        }
      ).identity_json,
    );
    expect(nativeIdentity.nativeReceipt.activeProcesses).toBe(0);
    expect(nativeIdentity.nativeReceipt.totalProcesses).toBeGreaterThanOrEqual(2);
    const workspace = await f.code.executionWorkspace(f.id),
      before = await readFile(join(workspace.root, 'ticks.txt'), 'utf8').catch(() => '');
    await new Promise((r) => setTimeout(r, 250));
    expect(await readFile(join(workspace.root, 'ticks.txt'), 'utf8').catch(() => '')).toBe(before);
    const output = await f.wait(
      await f.service.start(
        f.id,
        {
          runtime: 'node',
          argv: ['-e', "process.stdout.write('大输出\\n'.repeat(30000))"],
          cwd: '.',
          timeoutMs: 15000,
        },
        false,
      ),
    );
    expect(output.process.state, JSON.stringify(output.process)).toBe('succeeded');
    expect(Buffer.byteLength(output.output)).toBeLessThanOrEqual(65536);
    const first = await f.service.poll(f.id, output.process.id, 0);
    expect(first.output.truncated).toBe(true);
    const second = await f.service.poll(f.id, output.process.id, first.output.nextOffset);
    expect(second.output.offset).toBe(first.output.nextOffset);
    expect(second.output.text).not.toContain('\ufffd');
  } finally {
    await f.close();
  }
}, 180000);

test('P09-02 recovery never reattaches a recycled PID and changed locks force a fresh environment', async () => {
  const f = await setup();
  let recovered: CodeRuntimeService | undefined;
  try {
    await f.service.prepare(f.id, 'node');
    const result = await f.wait(
      await f.service.start(
        f.id,
        { runtime: 'node', argv: ['-e', 'console.log(1)'], cwd: '.', timeoutMs: 5000 },
        false,
      ),
    );
    const before = result.process.environmentId;
    // Synthetic persisted crash state uses the current test runner PID; recovery must not touch it.
    f.store.db
      .prepare("UPDATE process_handles SET pid=?,state='running',process_json=? WHERE id=?")
      .run(
        process.pid,
        JSON.stringify({ ...result.process, state: 'running', endedAt: null }),
        result.process.id,
      );
    recovered = new CodeRuntimeService(f.store, f.code, resolve('.'), f.service.capabilities);
    expect((await recovered.view(f.id)).processes[0]!.state).toBe('unknown');
    expect(() =>
      recovered!.control(f.id, result.process.id, 'input', { text: 'do not attach' }),
    ).toThrow('CONFLICT');
    const workspace = await f.code.executionWorkspace(f.id);
    await writeFile(
      join(workspace.root, 'package.json'),
      JSON.stringify({
        type: 'module',
        scripts: { test: 'node --test' },
        description: 'new lock fingerprint',
      }),
    );
    const after = await recovered.prepare(f.id, 'node');
    expect(after.state).toBe('ready');
    expect(after.id).not.toBe(before);
    expect((await recovered.view(f.id)).processes).toHaveLength(1);
  } finally {
    await recovered?.stop();
    await f.close();
  }
}, 180000);

test('P09-02 ConPTY streams UTF-8 before exit, accepts input/resize, records real identity and stops its job', async () => {
  const f = await setup();
  try {
    await f.service.prepare(f.id, 'node');
    const p = await f.service.start(
      f.id,
      {
        runtime: 'node',
        argv: [
          '-e',
          "process.stdout.write('就绪\\n');process.stdin.on('data',x=>{console.log('收到:'+x);});setInterval(()=>{},1000)",
        ],
        cwd: '.',
        timeoutMs: 30000,
      },
      true,
    );
    let output = '',
      ready = false;
    for (let i = 0; i < 200; i++) {
      const polled = await f.service.poll(f.id, p.id, 0);
      output = polled.output.text;
      if (polled.view.state === 'running' && output.includes('就绪')) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(ready, output).toBe(true);
    f.service.control(f.id, p.id, 'resize', { cols: 73, rows: 18 });
    f.service.control(f.id, p.id, 'input', { text: '你好 terminal\r' });
    for (let i = 0; i < 100; i++) {
      output = (await f.service.poll(f.id, p.id, 0)).output.text;
      if (output.includes('收到:你好 terminal')) break;
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(output).toContain('收到:你好 terminal');
    const row = f.store.db
      .prepare('SELECT helper_instance_id,identity_json FROM process_handles WHERE id=?')
      .get(p.id) as { helper_instance_id: string; identity_json: string };
    const identity = JSON.parse(row.identity_json);
    expect(identity.helperInstanceId).toBe(row.helper_instance_id);
    expect(identity.processStartTime).toMatch(/^\d+$/);
    expect(identity.pid).toBeGreaterThan(0);
    f.service.control(f.id, p.id, 'stop');
    expect((await f.wait(p)).process.state).toBe('cancelled');
    expect(() => f.service.control(f.id, p.id, 'input', { text: 'late' })).toThrow('CONFLICT');
  } finally {
    await f.close();
  }
}, 180000);

test('P09-02 request receipts prevent duplicate execution and changed request IDs cannot reuse an action', async () => {
  const f = await setup();
  try {
    const request = {
      protocolVersion: 1 as const,
      requestId: newId(),
      command: 'exec.run',
      payload: {
        runId: f.id,
        runtime: 'node',
        argv: ['-e', 'console.log(1)'],
        cwd: '.',
        timeoutMs: 5000,
      },
    };
    const first = await f.service.dispatch(request);
    expect(first.ok, JSON.stringify(first)).toBe(true);
    if (!first.ok || !('terminal' in first.data)) throw Error('reply');
    await f.wait(first.data.terminal.processes[0]!);
    expect(await f.service.dispatch(request)).toEqual(first);
    expect((await f.service.view(f.id)).processes).toHaveLength(1);
    const changed = await f.service.dispatch({
      ...request,
      payload: { ...request.payload, argv: ['-e', 'console.log(2)'] },
    });
    expect(changed.ok).toBe(false);
    if (!changed.ok) expect(changed.error.code).toBe('CONFLICT');
  } finally {
    await f.close();
  }
}, 180000);

test.runIf(process.env.TAPKIT_P09_REGISTRY_LIVE === '1')(
  'P09-02 registry live downloads pinned public packages and installs both runtimes without a model account',
  async () => {
    const f = await setup();
    let offline: CodeRuntimeService | undefined;
    try {
      const workspace = await f.code.executionWorkspace(f.id);
      const metadata = await f.service.broker.network.request(
        'https://registry.npmjs.org/is-number/7.0.0',
        { limit: 128 * 1024 },
      );
      expect(metadata.status).toBe(200);
      const pkg = JSON.parse(metadata.bytes.toString('utf8'));
      expect(pkg.name).toBe('is-number');
      expect(pkg.version).toBe('7.0.0');
      await writeFile(
        join(workspace.root, 'package.json'),
        JSON.stringify({
          name: 'tapkit-live-registry',
          version: '1.0.0',
          dependencies: { 'is-number': '7.0.0' },
        }),
      );
      await writeFile(
        join(workspace.root, 'package-lock.json'),
        JSON.stringify({
          name: 'tapkit-live-registry',
          version: '1.0.0',
          lockfileVersion: 3,
          packages: {
            '': {
              name: 'tapkit-live-registry',
              version: '1.0.0',
              dependencies: { 'is-number': '7.0.0' },
            },
            'node_modules/is-number': {
              version: '7.0.0',
              resolved: pkg.dist.tarball,
              integrity: pkg.dist.integrity,
              license: pkg.license,
            },
          },
        }),
      );
      await writeFile(join(workspace.root, 'requirements.txt'), 'colorama==0.4.6\n');
      const node = await f.service.prepare(f.id, 'node', true);
      expect(node.state, JSON.stringify(node)).toBe('ready');
      const nodeResult = await f.wait(
        await f.service.start(
          f.id,
          {
            runtime: 'node',
            argv: ['-e', "console.log('LIVE_NODE:'+require('is-number')(7))"],
            cwd: '.',
            timeoutMs: 10000,
          },
          false,
        ),
      );
      expect(nodeResult.process.state, JSON.stringify(nodeResult)).toBe('succeeded');
      expect(nodeResult.output).toContain('LIVE_NODE:true');
      const python = await f.service.prepare(f.id, 'python', true);
      expect(python.state, JSON.stringify(python)).toBe('ready');
      const pythonResult = await f.wait(
        await f.service.start(
          f.id,
          {
            runtime: 'python',
            argv: ['-c', "import colorama;print('LIVE_PYTHON:'+colorama.__version__)"],
            cwd: '.',
            timeoutMs: 10000,
          },
          false,
        ),
      );
      expect(pythonResult.process.state, JSON.stringify(pythonResult)).toBe('succeeded');
      expect(pythonResult.output).toContain('LIVE_PYTHON:0.4.6');
      const offlineBroker = new DependencyBroker(f.service.broker.cache);
      offlineBroker.network.request = async () => {
        throw Error('OFFLINE_NETWORK_MUST_NOT_BE_USED');
      };
      offline = new CodeRuntimeService(
        f.store,
        f.code,
        resolve('.'),
        f.service.capabilities,
        offlineBroker,
      );
      expect((await offline.prepare(f.id, 'node', false)).state).toBe('ready');
      expect((await offline.prepare(f.id, 'python', false)).state).toBe('ready');
      await writeFile(
        'docs/evidence/P09-02/registry-live.json',
        JSON.stringify(
          {
            task: 'P09-02',
            scope:
              'Fresh synthetic profiles, direct pinned public registry policy, real AppContainer install; no account/model call',
            state: 'passed',
            node: {
              package: pkg.name,
              version: pkg.version,
              url: pkg.dist.tarball,
              integrity: pkg.dist.integrity,
              install: node.state,
              output: nodeResult.output,
            },
            python: {
              package: 'colorama',
              version: '0.4.6',
              install: python.state,
              output: pythonResult.output,
            },
            freshEnvironmentOfflineReinstall: {
              node: 'passed',
              python: 'passed',
              networkMethod: 'throws if called',
            },
            newModelCalls: 0,
            providerConnectionChecks: 0,
          },
          null,
          2,
        ),
      );
    } finally {
      await offline?.stop();
      await f.close();
    }
  },
  180000,
);

test('P09-02 manual budgets share root tools and charge actual execution time', async () => {
  const f = await setup();
  try {
    const run = f.work.repo.row(f.id),
      state = f.work.repo.state(run);
    state.definition.budgetOverrides.maxTools = 1;
    f.work.repo.save(run, state);
    const first = await f.wait(
      await f.service.start(
        f.id,
        {
          runtime: 'node',
          argv: ['-e', 'setTimeout(()=>console.log(1),50)'],
          cwd: '.',
          timeoutMs: 5000,
        },
        false,
      ),
    );
    expect(first.process.state, JSON.stringify(first)).toBe('succeeded');
    expect(f.work.repo.rootUsage(f.work.repo.row(f.id)).tools).toBe(1);
    expect(f.work.repo.rootUsage(f.work.repo.row(f.id)).activeMs).toBeGreaterThan(0);
    await expect(
      f.service.start(
        f.id,
        { runtime: 'node', argv: ['-e', 'console.log(2)'], cwd: '.', timeoutMs: 5000 },
        false,
      ),
    ).rejects.toThrow('BUDGET_EXCEEDED');
    expect((await f.service.view(f.id)).processes).toHaveLength(1);
    expect(f.service.isBusy(f.id)).toBe(false);
  } finally {
    await f.close();
  }
}, 180000);

test('P09-02 version changes cancel the old process before inheriting a stable copy', async () => {
  const f = await setup();
  try {
    const p = await f.service.start(
      f.id,
      {
        runtime: 'node',
        argv: ['-e', 'console.log("VERSION_READY");setInterval(()=>{},1000)'],
        cwd: '.',
        timeoutMs: 15000,
      },
      false,
    );
    for (let i = 0; i < 200; i++) {
      if ((await f.service.poll(f.id, p.id, 0)).output.text.includes('VERSION_READY')) break;
      await new Promise((r) => setTimeout(r, 30));
    }
    const steered = await f.send(
      'runs.steer',
      { runId: f.id, text: '下一版本继续修复', clientRequestId: newId() },
      f.work.repo.row(f.id).revision,
    );
    expect(steered.ok, JSON.stringify(steered)).toBe(true);
    if (!steered.ok || !('work' in steered.data)) throw Error('steer');
    const next = steered.data.work.runId;
    const inherited = f.code.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: 'code.inherit',
      payload: { runId: next, sourceRunId: f.id },
    });
    expect((await f.wait(p)).process.state).toBe('cancelled');
    const receipt = await inherited;
    expect(receipt.ok, JSON.stringify(receipt)).toBe(true);
    expect(f.code.has(next)).toBe(true);
    await expect(
      f.service.start(
        f.id,
        { runtime: 'node', argv: ['-e', 'console.log(2)'], cwd: '.', timeoutMs: 5000 },
        false,
      ),
    ).rejects.toThrow('PERMISSION_DENIED');
  } finally {
    await f.close();
  }
}, 180000);
