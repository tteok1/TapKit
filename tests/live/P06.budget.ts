import { readFileSync, writeFileSync } from 'node:fs';
export const P06_LIVE_LIMITS = { requests: 6, outputTokens: 2048, reservedTokens: 50000 } as const;
type State = { requests: number; reservedTokens: number; wireRequests: number };
/** Durable, conservative cap: consumed reservations are never refunded or reset on restart. */
export class P06LiveBudget {
  constructor(readonly path: string) {}
  initialize() {
    writeFileSync(this.path, JSON.stringify({ requests: 0, reservedTokens: 0, wireRequests: 0 }), {
      flag: 'wx',
    });
  }
  state(): State {
    const s = JSON.parse(readFileSync(this.path, 'utf8')) as State;
    if (
      ![s.requests, s.reservedTokens, s.wireRequests].every(Number.isSafeInteger) ||
      s.requests < 0 ||
      s.requests > P06_LIVE_LIMITS.requests ||
      s.reservedTokens < 0 ||
      s.reservedTokens > P06_LIVE_LIMITS.reservedTokens ||
      s.wireRequests < 0 ||
      s.wireRequests > s.requests
    )
      throw Error('CONFLICT');
    return s;
  }
  reserve(inputTokens: number, outputTokens: number) {
    const s = this.state();
    if (
      !Number.isSafeInteger(inputTokens) ||
      inputTokens < 0 ||
      !Number.isSafeInteger(outputTokens) ||
      outputTokens < 1 ||
      outputTokens > P06_LIVE_LIMITS.outputTokens ||
      s.requests >= P06_LIVE_LIMITS.requests ||
      s.reservedTokens + inputTokens + outputTokens > P06_LIVE_LIMITS.reservedTokens
    )
      throw Error('BUDGET_EXCEEDED');
    s.requests++;
    s.reservedTokens += inputTokens + outputTokens;
    writeFileSync(this.path, JSON.stringify(s));
  }
  wire() {
    const s = this.state();
    if (s.wireRequests >= s.requests) throw Error('BUDGET_EXCEEDED');
    s.wireRequests++;
    writeFileSync(this.path, JSON.stringify(s));
  }
}
