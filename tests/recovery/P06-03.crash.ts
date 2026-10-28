import { writeFileSync } from 'node:fs';
import { openStore, BlobStore, FileRepository, newId } from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
import { WorkService } from '../../packages/core/src/work-service';
import { WorkArtifacts } from '../../packages/core/src/work-artifacts';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import { WorkNativeTools } from '../../packages/core/src/work-native';
import { NativeSandboxExecutor } from '../../packages/tools/src';
import { resolve, join } from 'node:path';
import type { ExecutionCapabilities, WorkToolArgs } from '../../packages/contracts/src';
async function main() {
  const [directory, stage] = process.argv.slice(2);
  if (!directory || !stage) throw Error('ARGS');
  const store = await openStore(directory),
    blobs = new BlobStore(store),
    files = new FileRepository(store, blobs),
    core = new CoreService(store),
    artifacts = new WorkArtifacts(files, blobs);
  function checkpoint(runId: string): never {
    writeFileSync(join(directory!, 'checkpoint.json'), JSON.stringify({ stage, runId }));
    process.kill(process.pid, 'SIGKILL');
    throw Error('kill failed');
  }
  const created = core.dispatch({
    protocolVersion: 1,
    requestId: newId(),
    command: 'sessions.create',
    payload: { mode: 'work', title: 'P06-03 crash fixture' },
  });
  if (!created.ok || !('entityId' in created.data)) throw Error('SESSION');
  const sessionId = created.data.entityId;
  let source: { kind: 'file'; fileId: string; versionId: string } | undefined;
  if (stage === 'after_native') {
    const blob = await blobs.put(Buffer.from('项目,金额\nA,10\nB,30\n'));
    const input = files.importBlob({
      blobId: blob.id,
      name: 'data.csv',
      relativePath: 'data.csv',
      owner: { type: 'session', id: sessionId },
    }).file;
    source = { kind: 'file', fileId: input.id, versionId: input.version.id };
  }
  const available: ExecutionCapabilities = {
    nativeExecution: { status: 'available' },
    officeRender: { status: 'available' },
    terminal: { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason: 'not used' },
  };
  const gateway = new WorkToolGateway(
    artifacts,
    new WorkNativeTools(
      resolve('.'),
      artifacts,
      available,
      new NativeSandboxExecutor(resolve('.')),
    ),
  );
  const work = new WorkService(
    store,
    async (run) => {
      if (stage === 'before_dispatch') checkpoint(run.id);
      const args: WorkToolArgs = source
        ? { tool: 'python.analyze', fileId: source.fileId, versionId: source.versionId }
        : { tool: 'artifact.write', name: '结果.md', content: '# 可验证成果' };
      return { text: '真实保存后验收', calls: [args], finished: true };
    },
    gateway,
    async () => {},
  );
  const reply = await work.dispatch({
    protocolVersion: 1,
    requestId: newId(),
    command: 'runs.create',
    payload: {
      sessionId,
      goal: 'P06-03 crash',
      format: source ? 'json' : 'md',
      refs: source ? [source] : [],
    },
  });
  if (!reply.ok || !('work' in reply.data)) throw Error('CREATE');
  const runId = reply.data.work.runId;
  const original = artifacts.execute.bind(artifacts),
    publish = artifacts.publishBytes.bind(artifacts),
    attach = blobs.attach.bind(blobs);
  artifacts.execute = async (...args) => {
    if (stage === 'after_intent') checkpoint(runId);
    const result = await original(...args);
    if (stage === 'after_commit') checkpoint(runId);
    return result;
  };
  blobs.attach = (...args) => {
    if (stage === 'after_blob') checkpoint(runId);
    return attach(...args);
  };
  artifacts.publishBytes = async (...args) => {
    if (stage === 'after_native') checkpoint(runId);
    return publish(...args);
  };
  await work.start();
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
