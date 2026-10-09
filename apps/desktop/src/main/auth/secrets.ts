import { safeStorage, shell } from 'electron';
import { mkdir, readFile, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { IdSchema, z, ApiConfigSchema, resolveApiConfig } from '@tapkit/contracts';
import { restrictToCurrentUser, VaultError, ApiCredentialDocumentSchema } from '../vault';

const Credential = z.strictObject({
  type: z.literal('oauth'),
  access: z.string().min(1).max(32768),
  refresh: z.string().min(1).max(32768),
  expires: z.number().finite().nonnegative(),
  accountId: z.string().min(1).max(256),
});
const CredentialDocument = z.strictObject({
  schemaVersion: z.literal(1),
  version: z.number().int().nonnegative(),
  credential: Credential.optional(),
});
const Binding = z.strictObject({
  accountId: IdSchema,
  modelId: z.string().min(1).max(160),
  adapterVersion: z.string().min(1).max(160),
  branchId: z.string().min(1).max(160),
});
const NativeDocument = z.strictObject({
  schemaVersion: z.literal(1),
  binding: Binding,
  value: z.unknown(),
});
export class AuthSecrets {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly directory: string,
    private readonly crypto = safeStorage,
    private readonly protect = restrictToCurrentUser,
    private readonly browser = shell.openExternal,
  ) {}
  private serialize<T>(work: () => Promise<T>) {
    const result = this.tail.then(work);
    this.tail = result.catch(() => {});
    return result;
  }
  private async read(name: string): Promise<unknown> {
    if (!this.crypto.isEncryptionAvailable()) throw new VaultError('AUTH_REQUIRED');
    let bytes: Buffer;
    try {
      bytes = await readFile(join(this.directory, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    try {
      return JSON.parse(this.crypto.decryptString(bytes));
    } finally {
      bytes.fill(0);
    }
  }
  private async write(name: string, document: unknown) {
    if (!this.crypto.isEncryptionAvailable()) throw new VaultError('AUTH_REQUIRED');
    await mkdir(this.directory, { recursive: true });
    await this.protect(this.directory);
    const plaintext = JSON.stringify(document);
    if (Buffer.byteLength(plaintext) > 8_388_608) throw new VaultError('PERMISSION_DENIED');
    const bytes = this.crypto.encryptString(plaintext);
    const temp = join(this.directory, name + '.tmp');
    try {
      const handle = await open(temp, 'w');
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temp, join(this.directory, name));
    } finally {
      bytes.fill(0);
      await unlink(temp).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      });
    }
  }
  invoke(operation: string, accountId: string, payload: unknown): Promise<unknown> {
    IdSchema.parse(accountId);
    return this.serialize(async () => {
      const key = 'codex-' + accountId;
      if (operation === 'api-key.read' || operation === 'api-key.delete') {
        const input = ApiConfigSchema.extend({ credentialId: IdSchema }).parse(payload);
        const revoked = await this.read('revoked-' + input.credentialId);
        if (revoked !== undefined) {
          const tombstone = z
            .strictObject({ schemaVersion: z.literal(1), accountId: IdSchema })
            .parse(revoked);
          if (tombstone.accountId !== accountId) throw new VaultError('PERMISSION_DENIED');
          if (operation === 'api-key.delete')
            await unlink(join(this.directory, input.credentialId)).catch((error) => {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            });
          return {};
        }
        const raw = await this.read(input.credentialId);
        if (raw === undefined) return {};
        const document = ApiCredentialDocumentSchema.parse(raw);
        if (document.accountId && document.accountId !== accountId)
          throw new VaultError('PERMISSION_DENIED');
        const binding = resolveApiConfig(document.providerId, {
          ...(document.apiFormat ? { apiFormat: document.apiFormat } : {}),
          ...(document.baseURL ? { baseURL: document.baseURL } : {}),
          ...(document.modelId ? { modelId: document.modelId } : {}),
        });
        const { credentialId: _credentialId, ...expected } = input;
        if (JSON.stringify(binding) !== JSON.stringify(expected))
          throw new VaultError('PERMISSION_DENIED');
        if (operation === 'api-key.delete') {
          await this.write('revoked-' + input.credentialId, { schemaVersion: 1, accountId });
          await unlink(join(this.directory, input.credentialId));
          document.key = '';
          return {};
        }
        if (!document.accountId) {
          document.accountId = accountId;
          await this.write(input.credentialId, document);
        }
        return { key: document.key };
      }
      if (operation === 'credential.read') {
        z.strictObject({}).parse(payload);
        const raw = await this.read(key);
        const document =
          raw === undefined
            ? { schemaVersion: 1 as const, version: 0 }
            : CredentialDocument.parse(raw);
        return {
          version: document.version,
          ...('credential' in document && document.credential
            ? { credential: document.credential }
            : {}),
        };
      }
      if (operation === 'credential.write') {
        const input = z
          .strictObject({
            expectedVersion: z.number().int().nonnegative(),
            credential: Credential.optional(),
          })
          .parse(payload);
        const raw = await this.read(key);
        const old = raw === undefined ? { version: 0 } : CredentialDocument.parse(raw);
        if (old.version !== input.expectedVersion) throw new VaultError('CONFLICT');
        await this.write(key, {
          schemaVersion: 1,
          version: old.version + 1,
          ...(input.credential ? { credential: input.credential } : {}),
        });
        return {};
      }
      if (operation === 'native.save') {
        const input = z
          .strictObject({ ref: IdSchema, binding: Binding, value: z.unknown() })
          .parse(payload);
        if (input.binding.accountId !== accountId) throw new VaultError('PERMISSION_DENIED');
        const document = NativeDocument.parse({
          schemaVersion: 1,
          binding: input.binding,
          value: input.value,
        });
        if ((await this.read('opaque-' + input.ref)) !== undefined)
          throw new VaultError('CONFLICT');
        await this.write('opaque-' + input.ref, document);
        return { contentHash: createHash('sha256').update(JSON.stringify(document)).digest('hex') };
      }
      if (operation === 'native.load') {
        const input = z
          .strictObject({
            ref: IdSchema,
            binding: Binding,
            contentHash: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .parse(payload);
        const document = NativeDocument.parse(await this.read('opaque-' + input.ref));
        if (
          input.binding.accountId !== accountId ||
          JSON.stringify(document.binding) !== JSON.stringify(input.binding)
        )
          throw new VaultError('PERMISSION_DENIED');
        if (
          createHash('sha256').update(JSON.stringify(document)).digest('hex') !== input.contentHash
        )
          throw new VaultError('CONFLICT');
        return document.value;
      }
      if (operation === 'native.purge') {
        const input = z
          .strictObject({
            refs: z.array(z.strictObject({ ref: IdSchema, branchId: IdSchema })).max(1000),
          })
          .parse(payload);
        const paths: string[] = [];
        for (const item of input.refs) {
          const raw = await this.read('opaque-' + item.ref);
          if (raw === undefined) continue;
          const document = NativeDocument.parse(raw);
          if (
            document.binding.accountId !== accountId ||
            document.binding.branchId !== item.branchId
          )
            throw new VaultError('PERMISSION_DENIED');
          paths.push(join(this.directory, 'opaque-' + item.ref));
        }
        for (const path of new Set(paths)) await unlink(path);
        return {};
      }
      if (operation === 'browser.open') {
        const input = z.strictObject({ url: z.string().url().max(8192) }).parse(payload);
        const url = new URL(input.url);
        if (
          url.origin !== 'https://auth.openai.com' ||
          url.username ||
          url.password ||
          !['/oauth/authorize', '/codex/device'].includes(url.pathname)
        )
          throw new VaultError('PERMISSION_DENIED');
        await this.browser(url.href);
        return {};
      }
      throw new VaultError('PERMISSION_DENIED');
    });
  }
  get settled() {
    return this.tail;
  }
}
