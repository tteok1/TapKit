// Opt-in, read-only live response inspection. Build diagnostic.vite.config.ts first.
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { root } from '../../scripts/lib.mjs';

function main() {
  const input = process.env.TAPKIT_LIVE_DATA_DIR;
  if (
    process.platform !== 'win32' ||
    process.env.TAPKIT_CODEX_DIAGNOSTIC_R01 !== '1' ||
    !input ||
    !isAbsolute(input)
  )
    return 2;
  const testRoot = realpathSync(join(root, '.test-data'));
  const target = realpathSync(input);
  const targetChild = relative(testRoot, target);
  if (
    !targetChild ||
    targetChild.startsWith('..') ||
    isAbsolute(targetChild) ||
    !/^P01-01-live-[^\\/]+$/.test(targetChild)
  )
    return 2;
  const host = mkdtempSync(join(testRoot, 'P01-01-diagnostic-host-'));
  try {
    const sid = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
      windowsHide: true,
      encoding: 'utf8',
    }).match(/S-1-5-[0-9-]+/)?.[0];
    if (!sid) return 2;
    const script =
      `$sid=[System.Security.Principal.SecurityIdentifier]::new('${sid}'); ` +
      '$acl=[System.Security.AccessControl.DirectorySecurity]::new(); $acl.SetAccessRuleProtection($true,$false); ' +
      "$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); " +
      `$acl.AddAccessRule($rule); [System.IO.Directory]::SetAccessControl('${host.replaceAll("'", "''")}',$acl)`;
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
    // Copy only the Chromium DPAPI-sealed key, after protecting the temporary directory.
    const state = JSON.parse(readFileSync(join(target, 'Local State'), 'utf8'));
    if (typeof state.os_crypt?.encrypted_key !== 'string') return 2;
    writeFileSync(
      join(host, 'Local State'),
      JSON.stringify({ os_crypt: { encrypted_key: state.os_crypt.encrypted_key } }),
    );
    const env = { ...process.env, TAPKIT_LIVE_DATA_DIR: target, TAPKIT_DIAGNOSTIC_HOST_DIR: host };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(
      join(root, 'node_modules/electron/dist/electron.exe'),
      [join(testRoot, 'P01-01-diagnostic-runner/index.cjs')],
      {
        cwd: root,
        env,
        windowsHide: true,
        encoding: 'utf8',
        timeout: 45000,
      },
    );
    const lines = (result.stdout ?? '')
      .split(/\r?\n/)
      .filter((line) => line.startsWith('{"taskId":"P01-01"'));
    console.log(lines.join('\n'));
    console.log(
      JSON.stringify({
        processExit: result.status,
        launchError: !!result.error,
        stderrPresent: !!result.stderr,
        diagnosticLines: lines.length,
      }),
    );
    return result.status ?? 1;
  } finally {
    const child = relative(testRoot, realpathSync(host));
    if (
      child &&
      !child.startsWith('..') &&
      !isAbsolute(child) &&
      /^P01-01-diagnostic-host-[^\\/]+$/.test(child)
    )
      rmSync(host, { recursive: true });
  }
}
try {
  process.exitCode = main();
} catch {
  console.log(JSON.stringify({ setupFailed: true }));
  process.exitCode = 1;
}
