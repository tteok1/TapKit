import { randomUUID } from 'node:crypto';
import { describe, test, expect } from 'vitest';
import { mkdir, mkdtemp, writeFile, readFile, symlink, appendFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { createServer } from 'node:net';
import { HelperRequestSchema } from '../../packages/contracts/src';
import { runDiagnostic, runtimePaths, helperPath } from '../../packages/tools/src/execution';
import { startNativeHelper } from './native-helper';
const root = resolve('.');

const id = () => {
  const value = randomUUID();
  return value.slice(0, 14) + '7' + value.slice(15);
};
async function request(
  runtime: 'node' | 'python' | 'git' | 'libreoffice' = 'node',
  args: string[] = [],
) {
  const base = await mkdtemp(join(root, '.test-data/P00-03 中文 '));
  const input = join(base, 'input'),
    workspace = join(base, 'workspace');
  await mkdir(input);
  await mkdir(workspace);
  return HelperRequestSchema.parse({
    protocolVersion: 1,
    requestId: id(),
    runId: id(),
    leaseEpoch: 1,
    operation: 'diagnostic.execute',
    payload: {
      ...(await runtimePaths(root, runtime)),
      inputRoot: input,
      workspace,
      args,
      timeoutMs: 10_000,
      terminal: false,
    },
  });
}
const run = (
  r: Awaited<ReturnType<typeof request>>,
  options?: Parameters<typeof runDiagnostic>[2],
) =>
  runDiagnostic(helperPath(root), r, options).then(async (result) => {
    await appendFile(
      'docs/evidence/P00-03/native-cases.jsonl',
      JSON.stringify({
        launch: {
          operation: r.operation,
          runtimeRoot: relative(root, r.payload.runtimeRoot).replaceAll('\\', '/'),
          executable: relative(root, r.payload.executable).replaceAll('\\', '/'),
          argumentCount: r.payload.args.length,
          argumentFlags: r.payload.args.filter((arg) =>
            /^--?[A-Za-z][A-Za-z0-9-]{0,63}$/.test(arg),
          ),
          timeoutMs: r.payload.timeoutMs,
          processLimit: r.payload.processLimit ?? null,
        },
        events: result.events,
      }) + '\n',
    );
    return result;
  });
const finished = (r: Awaited<ReturnType<typeof run>>) => {
  expect(r.exitCode, `helper events: ${JSON.stringify(r.events)}`).toBe(0);
  expect(r.events[0]?.data.appContainer).toBe(true);
  const e = r.events.at(-1)!;
  expect(e.event).toBe('finished');
  expect(e.data.activeProcesses).toBe(0);
  return e.data;
};
describe('P00-03 real Windows sandbox T08 T19', () => {
  test('Node reads only input and writes workspace; runtime and input are read only; environment is private', async () => {
    const r = await request();
    const privateRoot = join(r.payload.workspace, '..', 'DATA');
    await mkdir(join(privateRoot, 'db'), { recursive: true });
    await mkdir(join(privateRoot, 'secrets'), { recursive: true });
    const secrets = [
      join(r.payload.workspace, '..', 'secret.txt'),
      join(privateRoot, 'db/app.sqlite'),
      join(privateRoot, 'secrets/credential'),
    ];
    for (const path of secrets) await writeFile(path, 'PRIVATE_MARKER');
    await writeFile(join(r.payload.inputRoot, 'allowed.txt'), '授权输入');
    r.payload.args = [
      '-e',
      String.raw`
      const fs=require('node:fs'),cp=require('node:child_process');
      const [input,secrets,runtime]=process.argv.slice(1);
      console.log(fs.readFileSync(input,'utf8'));
      fs.writeFileSync('output.txt','输出');
      for(const p of [input,runtime]){try{fs.writeFileSync(p,'BAD');console.log('WRITE_ESCAPED')}catch(e){console.log('write',e.code)}}
      for(const secret of JSON.parse(secrets)){try{console.log(fs.readFileSync(secret,'utf8'))}catch(e){console.log('read',e.code)}}
      console.log('env',!!process.env.HOME,!!process.env.TAPKIT_TEST_SECRET);
      cp.execFileSync(process.execPath,['-e','console.log("child")'],{stdio:'inherit'});
    `,
      join(r.payload.inputRoot, 'allowed.txt'),
      JSON.stringify(secrets),
      join(r.payload.runtimeRoot, 'UNAUTHORIZED_WRITE'),
    ];
    process.env.TAPKIT_TEST_SECRET = 'DUMMY_SECRET';
    const result = finished(await run(r));
    delete process.env.TAPKIT_TEST_SECRET;
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('授权输入');
    expect(result.stdout).toContain('child');
    expect(result.stdout).toContain('env false false');
    expect(result.stdout).not.toMatch(/PRIVATE_MARKER|WRITE_ESCAPED/);
    expect(String(result.stdout).match(/read (?:EACCES|EPERM)/g)).toHaveLength(3);
    expect(String(result.stdout).match(/write (?:EACCES|EPERM)/g)).toHaveLength(2);
    expect(await readFile(join(r.payload.workspace, 'output.txt'), 'utf8')).toBe('输出');
  });
  test('execution lease cleanup allows the next helper invocation', async () => {
    const first = await request('node', ['-e', 'process.stdout.write("first run\\n")']);
    const firstResult = await run(first);
    expect(finished(firstResult).status).toBe('exited');

    const localAppData = process.env.LOCALAPPDATA;
    expect(localAppData).toBeTruthy();
    await expect(
      readFile(join(localAppData!, 'TapKit', 'execution-leases', `${first.runId}.json`)),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    const second = await request('node', ['-e', 'process.stdout.write("second run\\n")']);
    expect(finished(await run(second)).status).toBe('exited');
  });
  test('concurrent runs keep independent AppContainer identities and workspace ACLs', async () => {
    const requests = [await request(), await request()] as const;
    const markers = ['run-a', 'run-b'] as const;
    const releasePaths = requests.map(({ payload }) => join(payload.workspace, 'release.txt'));
    const ownFiles = requests.map(({ payload }) => join(payload.workspace, 'owned.txt'));
    const escapedFiles = requests.map(({ payload }) => join(payload.workspace, 'cross-write.txt'));
    for (const [index, current] of requests.entries()) {
      const ownFile = ownFiles[index]!;
      const otherFile = ownFiles[1 - index]!;
      const otherWrite = escapedFiles[1 - index]!;
      const release = releasePaths[index]!;
      const marker = markers[index]!;
      await writeFile(ownFile, 'host seed ' + marker);
      current.payload.timeoutMs = 10_000;
      current.payload.args = [
        '-e',
        String.raw`
          const fs=require('node:fs');
          const [ownFile,otherFile,otherWrite,release,marker]=process.argv.slice(1);
          fs.writeFileSync(ownFile,marker);
          const attempt=(label,fn)=>{try{fn();console.log(label+':ESCAPED')}catch(e){console.log(label+':'+e.code)}};
          attempt('cross-read',()=>fs.readFileSync(otherFile,'utf8'));
          attempt('cross-write',()=>fs.writeFileSync(otherWrite,'escaped'));
          const deadline=Date.now()+8000;
          const wait=setInterval(()=>{
            if(fs.existsSync(release)){clearInterval(wait);setTimeout(()=>process.stdout.write('overlap-complete'),500)}
            else if(Date.now()>deadline){clearInterval(wait);process.exit(2)}
          },10);
        `,
        ownFile,
        otherFile,
        otherWrite,
        release,
        marker,
      ];
    }

    const startedAt: number[] = [];
    const finishedAt: number[] = [];
    let startedCount = 0;
    let releaseStarted!: () => void;
    const bothStarted = new Promise<void>((resolve) => {
      releaseStarted = resolve;
    });
    let releaseWrites: Promise<void>[] = [];
    const executions = requests.map((current, index) =>
      runDiagnostic(helperPath(root), current, {
        onStarted: () => {
          startedAt[index] = performance.now();
          startedCount += 1;
          if (startedCount === requests.length) {
            releaseWrites = releasePaths.map((path) => writeFile(path, 'go'));
            releaseStarted();
          }
        },
      }).then((result) => {
        finishedAt[index] = performance.now();
        return result;
      }),
    );
    const resultsPromise = Promise.all(executions);
    await Promise.race([
      bothStarted,
      resultsPromise.then(() => {
        throw new Error('Both helpers did not reach started before one finished');
      }),
    ]);
    await Promise.all(releaseWrites);
    const results = await resultsPromise;
    const data = results.map((result) => finished(result));
    for (const result of results) {
      await appendFile(
        'docs/evidence/P00-03/native-cases.jsonl',
        JSON.stringify({ concurrent: true, events: result.events }) + '\n',
      );
    }

    expect(startedAt).toHaveLength(2);
    expect(Math.max(...startedAt)).toBeLessThan(Math.min(...finishedAt));
    const starts = results.map((result) =>
      result.events.find((event) => event.event === 'started'),
    );
    expect(
      starts.every((event) => event?.event === 'started' && event.data.appContainer === true),
    ).toBe(true);
    expect(
      starts.map((event) => event?.event === 'started' && event.data.appContainerSid),
    ).toHaveLength(2);
    expect(
      new Set(starts.map((event) => event?.event === 'started' && event.data.appContainerSid)).size,
    ).toBe(2);
    for (const [index, result] of data.entries()) {
      expect(result.status).toBe('exited');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/cross-read:(?:EACCES|EPERM)/);
      expect(result.stdout).toMatch(/cross-write:(?:EACCES|EPERM)/);
      expect(result.stdout).toContain('overlap-complete');
      expect(result.stdout).not.toContain('ESCAPED');
      expect(await readFile(ownFiles[index]!, 'utf8')).toBe(markers[index]);
      await expect(readFile(escapedFiles[index]!, 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
    }
  }, 20_000);
  test('hard-killing the helper stops job descendants and recovers its ACL/profile lease', async () => {
    const first = await request();
    const heartbeat = join(first.payload.workspace, 'descendant-heartbeat.txt');
    const descendant = `const fs=require('node:fs');let count=0;setInterval(()=>fs.writeFileSync(${JSON.stringify(heartbeat)},String(++count)),50);`;
    first.payload.args = [
      '-e',
      `const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'inherit',windowsHide:true});const details=e=>({name:e?.name,message:e?.message,code:e?.code,errno:e?.errno,syscall:e?.syscall,path:e?.path,winerror:e?.winerror});child.once('spawn',()=>process.stdout.write('descendant_created;'));child.once('error',e=>process.stdout.write('descendant_spawn_error:'+JSON.stringify(details(e))+';'));child.once('exit',(code,signal)=>process.stdout.write('descendant_exit:'+JSON.stringify({code,signal})+';'));setInterval(()=>{},1000);`,
    ];
    const localAppData = process.env.LOCALAPPDATA;
    expect(localAppData).toBeTruthy();
    const leasePath = join(localAppData!, 'TapKit', 'execution-leases', `${first.runId}.json`);
    const raw = startNativeHelper(helperPath(root), first);
    try {
      const started = await raw.started;
      expect(started.data.appContainer).toBe(true);
      expect(started.data.networkCapabilities).toBe(0);

      const deadline = performance.now() + 5000;
      let heartbeatValue = '';
      while (performance.now() < deadline) {
        try {
          heartbeatValue = await readFile(heartbeat, 'utf8');
          if (Number(heartbeatValue) >= 2) break;
        } catch {
          // Wait for the AppContainer child to create its first heartbeat.
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(Number(heartbeatValue)).toBeGreaterThanOrEqual(2);
      expect(JSON.parse(await readFile(leasePath, 'utf8')).runId).toBe(first.runId);
      expect(raw.child.kill()).toBe(true);
      await raw.closed;

      await new Promise((resolve) => setTimeout(resolve, 250));
      const stoppedHeartbeat = await readFile(heartbeat, 'utf8');
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(await readFile(heartbeat, 'utf8')).toBe(stoppedHeartbeat);
      await expect(readFile(leasePath, 'utf8')).resolves.toContain(first.runId);
    } finally {
      if (!raw.child.killed) raw.child.kill();
      await raw.closed;
    }

    const recovery = await request('node', ['-e', 'process.stdout.write("recovered\\n")']);
    expect(finished(await run(recovery)).status).toBe('exited');
    await expect(readFile(leasePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  }, 60_000);
  test('Python starts and spawns a child in AppContainer', async () => {
    const r = await request('python', [
      '-c',
      String.raw`
import ctypes, json, pathlib, subprocess, sys
pathlib.Path("python.txt").write_text("中文", encoding="utf8")
set_security = ctypes.WinDLL("advapi32", use_last_error=True).SetNamedSecurityInfoW
set_security.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32,
                        ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
set_security.restype = ctypes.c_uint32
for target in (sys.executable, sys.argv[1]):
    # Replacing the DACL with NULL would grant everyone full access if allowed.
    result = set_security(target, 1, 4, None, None, None, None)
    print("acl_edit_denied:" + str(result), flush=True)
    if result != 5:
        raise RuntimeError("AppContainer could change a read-only target DACL")
try:
    child = subprocess.run([sys.executable, "-c", "print(42)"], capture_output=True, text=True, check=False)
    print("python_child_launch_probe:" + json.dumps({"launch": {"executable": sys.executable, "argumentCount": 2, "flags": ["-c"], "probe": "python-child-startup"}, "created": True, "returncode": child.returncode, "stdout": child.stdout, "stderr": child.stderr}), flush=True)
    print(child.stdout, end="")
    if child.returncode != 0:
        raise SystemExit(child.returncode)
except OSError as error:
    print("python_child_launch_probe:" + json.dumps({"launch": {"executable": sys.executable, "argumentCount": 2, "flags": ["-c"], "probe": "python-child-startup"}, "created": False, "type": type(error).__name__, "message": str(error), "errno": error.errno, "winerror": getattr(error, "winerror", None), "filename": error.filename, "filename2": error.filename2}), flush=True)
    raise
`,
    ]);
    const readOnlyInput = join(r.payload.inputRoot, 'acl-read-only.txt');
    await writeFile(readOnlyInput, 'read only');
    r.payload.args.push(readOnlyInput);
    const data = finished(await run(r));
    expect(data.exitCode).toBe(0);
    expect(data.stdout).toContain('42');
    expect(String(data.stdout).match(/acl_edit_denied:5/g)).toHaveLength(2);
    expect(await readFile(join(r.payload.workspace, 'python.txt'), 'utf8')).toBe('中文');
  });
  test('network denies public, loopback and metadata connections', async () => {
    const server = createServer((socket) => socket.end());
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    try {
      const port = (server.address() as { port: number }).port;
      const r = await request('node', [
        '-e',
        String.raw`
        const net=require('node:net');
        Promise.all(JSON.parse(process.argv[1]).map(([host,port])=>new Promise(resolve=>{
          const s=net.connect({host,port});s.setTimeout(1500);
          s.on('connect',()=>{console.log('ESCAPED');s.destroy();resolve()});
          s.on('error',e=>{console.log(host,e.code);resolve()});
          s.on('timeout',()=>{console.log(host,'TIMEOUT');s.destroy();resolve()});
        })));
      `,
        JSON.stringify([
          ['127.0.0.1', port],
          ['1.1.1.1', 443],
          ['169.254.169.254', 80],
          ['::1', port],
        ]),
      ]);
      const data = finished(await run(r));
      expect(data.stdout).not.toContain('ESCAPED');
      expect(String(data.stdout)).toContain('1.1.1.1 EACCES');
      expect(String(data.stdout).trim().split('\n')).toHaveLength(4);
    } finally {
      server.close();
    }
  });
  test('cancel kills descendants', async () => {
    const r = await request('node', [
      '-e',
      'const child=require("node:child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"inherit"});const details=e=>({name:e?.name,message:e?.message,code:e?.code,errno:e?.errno,syscall:e?.syscall,path:e?.path,winerror:e?.winerror});child.once("spawn",()=>process.stdout.write("cancel_child_created;"));child.once("error",e=>process.stdout.write("cancel_child_spawn_error:"+JSON.stringify(details(e))+";"));child.once("exit",(code,signal)=>process.stdout.write("cancel_child_exit:"+JSON.stringify({code,signal})+";"));setInterval(()=>{},1000)',
    ]);
    const data = finished(
      await run(r, {
        onStarted: (_e, send) => {
          setTimeout(() => send('cancel'), 500);
        },
      }),
    );
    expect(data.status).toBe('cancelled');
    expect(Number(data.totalProcesses)).toBeGreaterThan(1);
  });
  test('timeout, output flood and fork limits are enforced', async () => {
    const timeout = await request('node', ['-e', 'setInterval(()=>{},1000)']);
    timeout.payload.processLimit = 4;
    timeout.payload.timeoutMs = 300;
    const timeoutRun = await run(timeout);
    const timeoutData = finished(timeoutRun);
    expect(timeoutData.status).toBe('timeout');
    const baselineProcesses = Number(timeoutData.peakActiveProcesses);
    expect(baselineProcesses).toBeGreaterThan(0);
    expect(baselineProcesses).toBeLessThan(Number(timeout.payload.processLimit));
    const output = await request('node', [
      '-e',
      'setInterval(()=>process.stdout.write("x".repeat(16384)),1)',
    ]);
    output.payload.outputBytes = 32768;
    const flood = finished(await run(output));
    expect(flood.status).toBe('output_limit');
    expect(String(flood.stdout).length).toBeLessThanOrEqual(65536);
    const forkProgram = `
      const cp = require('node:child_process');
      const fs = require('node:fs');
      let readyChildren = 0;
      let denied = false;
      let childId = 0;
      function mark(text) { fs.writeSync(1, text); }
      function next() {
        if (denied) return;
        mark('fork_attempt:' + readyChildren + ';');
        mark('fork_launch:' + JSON.stringify({executable:process.execPath,argumentCount:3,flags:['-e'],stdio:'inherit',windowsHide:true,probe:'fork-child-startup'}) + ';');
        const id = childId++;
        const readyFile = '.fork-ready-' + id;
        try {
          const child = cp.spawn(process.execPath, [
            '-e',
            'require("node:fs").writeFileSync(".fork-ready-" + process.argv[1], "ready");setInterval(()=>{},1000)',
            String(id),
          ], { stdio: 'inherit', windowsHide: true });
          let ready = false;
          let exited = false;
          const poll = setInterval(() => {
            if (ready || denied) return;
            if (fs.existsSync(readyFile) && fs.readFileSync(readyFile, 'utf8') === 'ready') {
              ready = true;
              clearInterval(poll);
              fs.unlinkSync(readyFile);
              readyChildren += 1;
              mark('fork_ready:' + readyChildren + ';');
              setTimeout(next, 100);
            } else if (exited) {
              denied = true;
              clearInterval(poll);
              mark('fork_child_exit_before_ready:' + id + ';');
            }
          }, 10);
          child.once('error', error => {
            denied = true;
            clearInterval(poll);
            mark('fork_denied_async:' + String(error && error.code || 'unknown') + ':after:' + readyChildren + ';');
            mark('fork_error_detail:' + JSON.stringify({name:error?.name,message:error?.message,code:error?.code,errno:error?.errno,syscall:error?.syscall,path:error?.path,winerror:error?.winerror}) + ';');
          });
          child.once('spawn', () => {
            mark('fork_child_created:' + id + ';');
          });
          child.once('exit', (code, signal) => {
            exited = true;
            mark('fork_child_exit:' + JSON.stringify({code,signal}) + ';');
            if (!ready && !denied && !fs.existsSync(readyFile)) {
              denied = true;
              clearInterval(poll);
              mark('fork_child_exit_before_ready:' + String(code) + ':' + String(signal) + ';');
            }
          });
        } catch (error) {
          denied = true;
          mark('fork_denied_sync:' + String(error && error.code || 'unknown') + ':after:' + readyChildren + ';');
          mark('fork_error_detail:' + JSON.stringify({name:error?.name,message:error?.message,code:error?.code,errno:error?.errno,syscall:error?.syscall,path:error?.path,winerror:error?.winerror}) + ';');
        }
      }
      next();
      setInterval(() => {}, 1000);
    `;
    const fork = await request('node', ['-e', forkProgram]);
    fork.payload.processLimit = 4;
    fork.payload.timeoutMs = 5_000;
    const forkCapacity = Number(fork.payload.processLimit) - baselineProcesses;
    const forkRun = await run(fork);
    const forkEvents = forkRun.events;
    const forked = finished(forkRun);
    const forkDiagnostic = JSON.stringify(forkEvents, null, 2);
    const assertFork = (condition: boolean, reason: string) => {
      if (!condition) throw new Error(`[P00-03 fork ${reason}]\n${forkDiagnostic}`);
    };
    const startEvent = forkEvents.find((event) => event.event === 'started');
    const job =
      startEvent?.event === 'started' &&
      typeof startEvent.data.job === 'object' &&
      startEvent.data.job !== null
        ? (startEvent.data.job as Record<string, unknown>)
        : null;
    const configuredLimit = Number(job?.processLimit);
    const forkOutput = String(forked.stdout);
    const readyChildren = [...forkOutput.matchAll(/fork_ready:(\d+);/g)].map((match) =>
      Number(match[1]),
    );
    const readyCount = readyChildren.length ? Math.max(...readyChildren) : 0;
    const attempts = [...forkOutput.matchAll(/fork_attempt:(\d+);/g)].map((match) =>
      Number(match[1]),
    );
    const denied = forkOutput.match(/fork_denied_(?:sync|async):([^:;]+):after:(\d+);/);
    assertFork(configuredLimit === 4, 'reported process limit did not match the test limit');
    assertFork(forkCapacity > 0, 'baseline left no process capacity for child processes');
    assertFork(
      readyCount === forkCapacity,
      `expected ${forkCapacity} child payloads to start from baseline ${baselineProcesses}, got ${readyCount}`,
    );
    assertFork(
      attempts.includes(forkCapacity),
      'the parent did not attempt one more child after the available slots were occupied',
    );
    assertFork(
      forked.status === 'timeout' || forked.status === 'process_limit',
      `expected a rejected fork or helper process-limit containment, got ${forked.status}`,
    );
    if (forked.status === 'timeout') {
      assertFork(
        denied !== null,
        'the parent survived but no process creation rejection was observed',
      );
      assertFork(
        Number(denied?.[2]) === forkCapacity,
        `process creation was rejected after ${denied?.[2]} ready children; expected ${forkCapacity}`,
      );
    }
    assertFork(
      Number(forked.peakActiveProcesses) >= configuredLimit &&
        Number(forked.peakActiveProcesses) <= configuredLimit + 1,
      `Job active-process peak was ${forked.peakActiveProcesses}; expected the limit ${configuredLimit} or one rejected-association sample above it`,
    );
    assertFork(
      Number(forked.totalProcesses) >= baselineProcesses + forkCapacity,
      'Job accounting did not include the baseline and each ready child',
    );
    assertFork(Number(forked.activeProcesses) === 0, 'Job descendants remained active after exit');
  });
  test('memory exhaustion is contained', async () => {
    const r = await request('python', [
      '-c',
      String.raw`
import sys
print("memory_payload_ready", flush=True)
allocated = []
try:
    while True:
        allocated.append(bytearray(16 * 1024 * 1024))
except MemoryError:
    print("memory_limit_reached:" + str(len(allocated) * 16 * 1024 * 1024), flush=True)
    sys.exit(23)
`,
    ]);
    r.payload.memoryBytes = 256 * 1024 * 1024;
    const data = finished(await run(r));
    expect(data.stdout).toContain('memory_payload_ready');
    const allocatedBytes = String(data.stdout).match(/memory_limit_reached:(\d+)/);
    expect(Number(allocatedBytes?.[1])).toBeGreaterThanOrEqual(128 * 1024 * 1024);
    expect(data.exitCode).toBe(23);
    expect(data.status).toBe('exited');
  });
  test('UNC, ADS, traversal, aliases and junction input paths fail closed', async () => {
    for (const kind of ['unc', 'ads', 'parent', 'alias', 'junction']) {
      const r = await request();
      if (kind === 'unc') r.payload.inputRoot = '\\\\localhost\\C$\\Windows';
      if (kind === 'ads') r.payload.inputRoot += ':stream';
      if (kind === 'parent') r.payload.inputRoot += '\\..\\input';
      if (kind === 'alias') r.payload.inputRoot += '.';
      if (kind === 'junction') {
        const junction = join(r.payload.workspace, 'junction');
        await symlink(r.payload.inputRoot, junction, 'junction');
        r.payload.inputRoot = junction;
      }
      const result = await run(r);
      expect(result.exitCode).toBe(1);
      expect(result.events[0]?.event).toBe('failed');
      expect(result.events[0]?.data.stage).toBe(
        kind === 'junction' ? 'path.reparse' : 'path.syntax',
      );
    }
  });
  test('ConPTY is interactive while still in AppContainer', async () => {
    const r = await request('node', [
      '-e',
      'process.stdin.setEncoding("utf8");process.stdin.once("data",s=>{console.log("PTY_ECHO:"+s.trim());process.exit(0)})',
    ]);
    r.payload.terminal = true;
    const data = finished(
      await run(r, {
        onStarted: (_e, send) =>
          setTimeout(() => send('terminal.input', { text: 'hello terminal\r' }), 300),
      }),
    );
    expect(data.status).toBe('exited');
    expect(data.exitCode).toBe(0);
    expect(data.stdout).toContain('PTY_ECHO:hello terminal');
  });
});
