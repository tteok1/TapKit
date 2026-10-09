import { z } from '@tapkit/contracts';
import type { CredentialStore, Credential, AuthOperationOptions } from '@earendil-works/pi-ai';
export const CodexCredentialSchema = z.strictObject({
  type: z.literal('oauth'),
  access: z.string().min(1).max(32768),
  refresh: z.string().min(1).max(32768),
  expires: z.number().finite().nonnegative(),
  accountId: z.string().min(1).max(256),
});
export type CredentialSnapshot = { version: number; credential?: Credential };
export interface CredentialBackend {
  read(): Promise<CredentialSnapshot>;
  write(expectedVersion: number, credential: Credential | undefined): Promise<void>;
}
export class AccountCredentialStore implements CredentialStore {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly backend: CredentialBackend) {}
  private validate(providerId: string, options?: AuthOperationOptions) {
    if (providerId !== 'openai-codex') throw new Error('MODEL_UNSUPPORTED');
    options?.signal?.throwIfAborted();
  }
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.catch(() => {});
    return result;
  }
  async read(providerId: string, options?: AuthOperationOptions) {
    this.validate(providerId, options);
    await this.tail;
    const snapshot = await this.backend.read();
    this.validate(providerId, options);
    return snapshot.credential ? CodexCredentialSchema.parse(snapshot.credential) : undefined;
  }
  async list(options?: AuthOperationOptions) {
    return (await this.read('openai-codex', options))
      ? [{ providerId: 'openai-codex', type: 'oauth' as const }]
      : [];
  }
  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: AuthOperationOptions,
  ) {
    return this.serialize(async () => {
      this.validate(providerId, options);
      const snapshot = await this.backend.read();
      const current = snapshot.credential
        ? CodexCredentialSchema.parse(snapshot.credential)
        : undefined;
      const next = await fn(current);
      this.validate(providerId, options);
      if (next) {
        const value = CodexCredentialSchema.parse(next);
        if (JSON.stringify(value) !== JSON.stringify(current))
          await this.backend.write(snapshot.version, value);
        return value;
      }
      return current;
    });
  }
  delete(providerId: string, options?: AuthOperationOptions) {
    return this.serialize(async () => {
      this.validate(providerId, options);
      const snapshot = await this.backend.read();
      await this.backend.write(snapshot.version, undefined);
    });
  }
}
