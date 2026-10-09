import { safeStorage } from 'electron';
import { mkdir, readFile, open, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { IdSchema, SaveApiKeySchema } from '@tapkit/contracts';
export const ApiCredentialDocumentSchema = SaveApiKeySchema.extend({
  accountId: IdSchema.optional(),
});
const exec = promisify(execFile);
let startupTraceSequence = 0;
function startupTrace(scope: string) {
  if (process.env.TAPKIT_STARTUP_DIAGNOSTICS !== '1') return (_stage: string) => {};
  const trace = ++startupTraceSequence;
  const start = performance.now();
  let previous = start;
  return (stage: string) => {
    const clockMs = performance.now();
    try {
      console.info(
        'TAPKIT_STARTUP_DIAGNOSTIC',
        JSON.stringify({
          scope,
          trace,
          stage,
          pid: process.pid,
          clockMs,
          elapsedMs: clockMs - start,
          stepMs: clockMs - previous,
        }),
      );
    } catch {
      // Optional CI diagnostics must not change credential behavior or expose data.
    }
    previous = clockMs;
  };
}
export class VaultError extends Error {
  constructor(readonly code: 'AUTH_REQUIRED' | 'CONFLICT' | 'PERMISSION_DENIED') {
    super(code);
  }
}
export async function restrictToCurrentUser(directory: string) {
  if (process.platform !== 'win32') throw new VaultError('AUTH_REQUIRED');
  const trace = startupTrace('vault.acl');
  trace('whoami.begin');
  const { stdout } = await exec('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
    windowsHide: true,
  });
  trace('whoami.complete');
  const sid = stdout.match(/S-1-5-[0-9-]+/)?.[0];
  if (!sid) throw new VaultError('AUTH_REQUIRED');
  // Replace the entire DACL in one operation, including pre-existing explicit grants.
  const quoted = directory.replaceAll("'", "''");
  const script =
    "$ErrorActionPreference='Stop'; $sid=[System.Security.Principal.SecurityIdentifier]::new('" +
    sid +
    "'); " +
    '$acl=[System.Security.AccessControl.DirectorySecurity]::new(); $acl.SetAccessRuleProtection($true,$false); ' +
    "$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); " +
    "$acl.AddAccessRule($rule); [System.IO.Directory]::SetAccessControl('" +
    quoted +
    "',$acl)";
  trace('powershell.begin');
  await exec(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ],
    { windowsHide: true },
  );
  trace('powershell.complete');
}
export class VaultService {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    readonly directory: string,
    private readonly crypto = safeStorage,
    private readonly protect = restrictToCurrentUser,
  ) {}
  save(credentialId: string, input: unknown): Promise<string> {
    const work = async () => {
      const trace = startupTrace('vault.save');
      trace('validation.begin');
      IdSchema.parse(credentialId);
      const value = SaveApiKeySchema.parse(input);
      trace('encryption-availability.begin');
      if (!this.crypto.isEncryptionAvailable()) throw new VaultError('AUTH_REQUIRED');
      trace('directory.begin');
      await mkdir(this.directory, { recursive: true });
      trace('acl.begin');
      await this.protect(this.directory);
      trace('existing-ciphertext.begin');
      const path = join(this.directory, credentialId);
      try {
        await readFile(join(this.directory, 'revoked-' + credentialId));
        throw new VaultError('CONFLICT');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      let old: Buffer | undefined;
      try {
        old = await readFile(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      const plaintext = JSON.stringify(value);
      if (old) {
        trace('decrypt.begin');
        const { accountId: _accountId, ...saved } = ApiCredentialDocumentSchema.parse(
          JSON.parse(this.crypto.decryptString(old)),
        );
        if (JSON.stringify(saved) !== plaintext) throw new VaultError('CONFLICT');
        trace('complete');
        return credentialId;
      }
      trace('encrypt.begin');
      const ciphertext = this.crypto.encryptString(plaintext);
      trace('file-open.begin');
      const tmp = path + '.tmp';
      const file = await open(tmp, 'w');
      try {
        trace('file-write.begin');
        await file.writeFile(ciphertext);
        trace('file-sync.begin');
        await file.sync();
      } finally {
        trace('file-close.begin');
        await file.close();
        ciphertext.fill(0);
      }
      trace('rename.begin');
      await rename(tmp, path);
      trace('complete');
      return credentialId;
    };
    const result = this.tail.then(work);
    this.tail = result.catch(() => {});
    return result;
  }
  // Host-private only. No Renderer channel exposes decryption.
  async withCredential<T>(credentialId: string, use: (key: string) => Promise<T>): Promise<T> {
    IdSchema.parse(credentialId);
    if (!this.crypto.isEncryptionAvailable()) throw new VaultError('AUTH_REQUIRED');
    const encrypted = await readFile(join(this.directory, credentialId));
    const value = ApiCredentialDocumentSchema.parse(
      JSON.parse(this.crypto.decryptString(encrypted)),
    );
    try {
      return await use(value.key);
    } finally {
      value.key = '';
      encrypted.fill(0);
    }
  }
  get settled() {
    return this.tail;
  }
}
