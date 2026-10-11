import { stableSerialize } from './budget';
export type CacheScope = {
  profile: string;
  scope: string;
  permissionVersion: string;
  sourceVersions: string[];
  model: string;
  taskVersion: number;
};
export class ContextCache<T> {
  private entries = new Map<string, { value: T; bytes: number }>();
  hits = 0;
  misses = 0;
  key(scope: CacheScope) {
    return stableSerialize(scope);
  }
  get(scope: CacheScope, authorize: () => void): T | undefined {
    const key = this.key(scope);
    try {
      authorize();
    } catch (e) {
      this.entries.delete(key);
      throw e;
    }
    const hit = this.entries.get(key);
    if (!hit) {
      this.misses++;
      return;
    }
    this.hits++;
    return structuredClone(hit.value);
  }
  set(scope: CacheScope, value: T) {
    const bytes = new TextEncoder().encode(stableSerialize(value)).byteLength;
    if (bytes > 2_000_000) return;
    while (this.entries.size >= 32) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(this.key(scope), { value: structuredClone(value), bytes });
  }
  clear() {
    this.entries.clear();
  }
  stats() {
    return {
      hits: this.hits,
      misses: this.misses,
      bytes: [...this.entries.values()].reduce((n, e) => n + e.bytes, 0),
    };
  }
}
