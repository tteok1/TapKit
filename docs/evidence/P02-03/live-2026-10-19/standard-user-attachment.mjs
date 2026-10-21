// Copied into the isolated seed's scripts directory. Uses the existing fixed probes.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join, resolve, delimiter } from 'node:path';
import { root, runtimeLock } from './lib.mjs';
import { prepareStandardUserKit, isOutsideWorkspace } from './standard-user-kit.mjs';
import { executionFingerprint } from './runtime-inventory.mjs';

const manifestPath = join(root, 'local-standard-user-seed.json');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function verifySeed() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.purpose !== 'P02-03 attachment dependency only')
    throw new Error('SEED_MANIFEST_INVALID');
  for (const [file, digest] of Object.entries(manifest.entryHashes))
    if (sha(await readFile(join(root, file))) !== digest) throw new Error('SEED_ENTRY_CHANGED');
  if ((await executionFingerprint(root)) !== manifest.executionFingerprint)
    throw new Error('SEED_RUNTIME_OR_PROBE_CHANGED');
  return manifest;
}

if (process.argv.includes('--verify-seed')) {
  await verifySeed();
  console.log('SEED_VERIFIED; no tests, installation or account operations performed.');
} else {
  // Refuse administrator-group accounts, including medium-integrity UAC sessions.
  const groups = spawnSync('whoami.exe', ['/groups', '/fo', 'csv', '/nh'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (
    groups.status !== 0 ||
    groups.stdout.includes('S-1-5-32-544') ||
    !groups.stdout.includes('S-1-16-8192')
  )
    throw new Error('STANDARD_USER_REQUIRED: sign in with the existing non-administrator account.');
  if (!process.env.LOCALAPPDATA) throw new Error('LOCALAPPDATA_UNAVAILABLE');

  const manifest = await verifySeed();
  const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
  const target = resolve(process.env.LOCALAPPDATA, 'TapKit-P02-attachment-' + runId);
  if (!isOutsideWorkspace(root, target)) throw new Error('FRESH_USER_DIRECTORY_REQUIRED');
  const returned = join(root, 'returns', runId);
  await mkdir(returned, { recursive: true });
  const commands = [];
  let failure = null;
  let runtime = null;
  let parser = null;
  let finalFingerprint = null;
  let copiedFingerprint = null;
  const exports = [];
  const redact = (text) => {
    let value = String(text);
    for (const [source, replacement] of [
      [target, '<STANDARD_USER_KIT>'],
      [root, '<VERIFICATION_SEED>'],
      [process.env.USERPROFILE, '<STANDARD_USER_PROFILE>'],
    ]) {
      if (!source) continue;
      value = value.split(source).join(replacement);
      value = value.split(source.replaceAll('\\', '/')).join(replacement);
      value = value.split(source.replaceAll('\\', '\\\\')).join(replacement);
    }
    return value;
  };
  async function readJson(file) {
    try {
      return JSON.parse(await readFile(join(target, file), 'utf8'));
    } catch {
      return null;
    }
  }
  try {
    console.log(
      'Preparing a fresh copy owned by this standard user. This can take several minutes.',
    );
    await prepareStandardUserKit(target);
    copiedFingerprint = await executionFingerprint(target);
    if (copiedFingerprint !== manifest.executionFingerprint)
      throw new Error('COPY_FINGERPRINT_MISMATCH');
    const node = join(
      target,
      '.runtime/node',
      runtimeLock.runtimes.node.directory,
      runtimeLock.runtimes.node.executable,
    );
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
    env.Path = dirname(node) + delimiter + (process.env.Path ?? process.env.PATH ?? '');
    // The store belongs to this disposable copy; no administrator's store or npm credentials are copied.
    const steps = [
      [
        'install-locked-dependencies',
        [
          join(target, '.cache/tools/pnpm/package/bin/pnpm.mjs'),
          'install',
          '--frozen-lockfile',
          '--ignore-scripts',
          '--store-dir',
          join(target, '.pnpm-store'),
        ],
        900000,
      ],
      ['verify-native-module', [join(target, 'scripts/prepare-native.mjs')], 120000],
      [
        'build-fixed-parser',
        [
          join(target, 'node_modules/vite/bin/vite.js'),
          'build',
          '--config',
          'packages/retrieval/vite.worker.config.ts',
        ],
        120000,
      ],
      ['original-native-probe', [join(target, 'scripts/runtime-probe.mjs')], 900000],
      ['original-parser-probe', [join(target, 'scripts/p03-parser-probe.mjs')], 300000],
    ];
    for (const [label, args, timeout] of steps) {
      console.log('Running ' + label + ' ...');
      const result = spawnSync(node, args, {
        cwd: target,
        env,
        encoding: 'utf8',
        windowsHide: true,
        timeout,
        maxBuffer: 32 * 1024 * 1024,
      });
      await writeFile(
        join(returned, label + '.log'),
        redact(String(result.stdout ?? '') + String(result.stderr ?? '')),
      );
      commands.push({
        step: label,
        exitCode: result.status,
        errorCode: result.error?.code ?? null,
        signal: result.signal,
      });
      if (result.error || result.status !== 0)
        throw new Error(label + ' failed; see ' + label + '.log');
      console.log(label + ': OK');
    }
    runtime = await readJson('docs/evidence/P00-03/runtime-probe.json');
    parser = await readJson('docs/evidence/P03-01/parser-probe.json');
    finalFingerprint = await executionFingerprint(target);
    const nativePassed =
      runtime?.standardUser === true &&
      runtime.exitCode === 0 &&
      runtime.fingerprint === manifest.executionFingerprint &&
      runtime.tests?.total === 22 &&
      runtime.tests.passed === 22 &&
      runtime.tests.failed === 0 &&
      runtime.tests.pending === 0 &&
      Array.isArray(runtime.missingCases) &&
      runtime.missingCases.length === 0 &&
      ['nativeExecution', 'officeRender', 'terminal'].every(
        (key) => runtime.capabilities?.[key]?.status === 'available',
      );
    const parserPassed =
      parser?.passed === true &&
      parser.standardUser === true &&
      parser.exitCode === 0 &&
      parser.tests?.total === 3 &&
      parser.tests.passed === 3 &&
      parser.tests.failed === 0 &&
      parser.tests.pending === 0 &&
      Array.isArray(parser.missingCases) &&
      parser.missingCases.length === 0;
    if (!nativePassed || !parserPassed || finalFingerprint !== manifest.executionFingerprint)
      throw new Error('STANDARD_USER_PROBE_RESULTS_INCOMPLETE');
  } catch (error) {
    failure = redact(error.message);
  } finally {
    runtime ??= await readJson('docs/evidence/P00-03/runtime-probe.json');
    parser ??= await readJson('docs/evidence/P03-01/parser-probe.json');
    for (const file of [
      'resources/runtime/capabilities.json',
      'docs/evidence/P00-03/runtime-probe.json',
      'docs/evidence/P00-03/runtime-probe.log',
      'docs/evidence/P00-03/native-cases.jsonl',
      'docs/evidence/P03-01/parser-probe.json',
      'docs/evidence/P03-01/parser-probe.log',
      'test-results/P00-03-native.json',
      'test-results/P03-01-native-parser.json',
    ]) {
      try {
        await access(join(target, file));
        const original = await readFile(join(target, file));
        const exported = Buffer.from(redact(original.toString('utf8')));
        const output = file.replaceAll('/', '__');
        await writeFile(join(returned, output), exported);
        exports.push({
          file,
          output,
          originalSha256: sha(original),
          exportedSha256: sha(exported),
          redacted: !original.equals(exported),
        });
      } catch (error) {
        if (error.code !== 'ENOENT') failure ??= 'RESULT_EXPORT_FAILED: ' + error.code;
      }
    }
    const summary = {
      schemaVersion: 1,
      task: 'P02-03',
      purpose: 'attachment prerequisite in an independent standard-user copy',
      runId,
      endedAt: new Date().toISOString(),
      standardUser: true,
      status: failure ? 'failed' : 'standard_user_dependency_verified',
      originalAttachmentRecovered: false,
      productionCapabilitiesInstalled: false,
      expectedFingerprint: manifest.executionFingerprint,
      copiedFingerprint,
      finalFingerprint,
      nativeTests: runtime?.tests ?? null,
      parserTests: parser?.tests ?? null,
      commands,
      failure,
      exports,
    };
    await writeFile(join(returned, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log('\nRESULT=' + (failure ? 'FAIL' : 'PASS'));
    console.log('RETURN_DIRECTORY=' + returned);
    if (failure) {
      console.error('DETAIL=' + failure);
      process.exitCode = 1;
    }
    console.log(
      'Return to your usual Windows account and report this result. Do not start TapKit in this test copy.',
    );
  }
}
