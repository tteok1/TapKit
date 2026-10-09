import { createHash } from 'node:crypto';
import { Store, StorageError, newId } from './foundation';
import {
  ModelPreferencesSchema,
  DEFAULT_MODEL_PREFERENCES,
  PreferencesViewSchema,
  PriceSchema,
  UsageViewSchema,
  AttemptViewSchema,
  ROUTING_LIMITS,
  type ModelPreferences,
  type Selection,
  type ModelPrice,
  type NormalizedUsage,
  type ModelRequest,
  type ProviderError,
  type AttemptView,
  type UsageQuerySchema,
  z,
} from '@tapkit/contracts';

type Scope = { type: 'profile' | 'session'; id: string };
type Limits = {
  schemaVersion: 1;
  tokens: number;
  activeMs: number;
  maxCalls: number;
  usedCalls: number;
  reservedMoney: Record<string, number>;
  moneyLimits: ModelPreferences['moneyLimits'];
};
type Budget = {
  id: string;
  owner_kind: 'root' | 'daily';
  limits_json: string;
  used_tokens: number;
  reserved_tokens: number;
  active_ms: number;
  money_by_currency_json: string;
};
const emptyUsage: NormalizedUsage = {
  inputTotal: null,
  outputTotal: null,
  inputCachedSubset: null,
  reasoningSubset: null,
  source: 'estimated',
};
export const knownPrice = (price: ModelPrice | null, now: number) =>
  price !== null && price.checkedAt <= now && now - price.checkedAt <= 30 * 86_400_000;
export function pricedMicros(price: ModelPrice, input: number, output: number) {
  const result =
    (BigInt(input) * BigInt(price.inputMicrosPerMillion) +
      BigInt(output) * BigInt(price.outputMicrosPerMillion) +
      999_999n) /
    1_000_000n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new StorageError('BUDGET_EXCEEDED');
  return Number(result);
}
const moneyParse = (raw: string): Record<string, number> =>
  Object.fromEntries(
    (JSON.parse(raw).amounts as { currency: string; amount: string }[]).map((a) => [
      a.currency,
      Number(
        BigInt(a.amount.split('.')[0]!) * 1_000_000n +
          BigInt((a.amount.split('.')[1] ?? '').padEnd(6, '0').slice(0, 6)),
      ),
    ]),
  );
const moneyJSON = (values: Record<string, number>) =>
  JSON.stringify({
    schemaVersion: 1,
    amounts: Object.entries(values).map(([currency, micros]) => ({
      currency,
      amount: `${Math.floor(micros / 1_000_000)}.${String(micros % 1_000_000).padStart(6, '0')}`,
    })),
  });

export class UsageLedger {
  constructor(readonly store: Store) {}
  scope(scope: Scope) {
    if (scope.type === 'profile') {
      if (scope.id !== this.store.profileId) throw new StorageError('PERMISSION_DENIED');
    } else if (
      !this.store.db
        .prepare('SELECT id FROM sessions WHERE id=? AND profile_id=? AND deleted_at IS NULL')
        .get(scope.id, this.store.profileId)
    )
      throw new StorageError('NOT_FOUND');
  }
  hasPreferences(scope: Scope) {
    return Boolean(
      this.store.db
        .prepare(
          "SELECT id FROM settings WHERE scope_type=? AND scope_id=? AND profile_id=? AND key='modelPreferences' AND deleted_at IS NULL",
        )
        .get(scope.type, scope.id, this.store.profileId),
    );
  }
  preferences(scope: Scope): z.infer<typeof PreferencesViewSchema> {
    this.scope(scope);
    const row = this.store.db
      .prepare(
        "SELECT value_json,revision FROM settings WHERE scope_type=? AND scope_id=? AND profile_id=? AND key='modelPreferences' AND deleted_at IS NULL",
      )
      .get(scope.type, scope.id, this.store.profileId) as
      { value_json: string; revision: number } | undefined;
    const inherited =
      scope.type === 'session'
        ? this.preferences({ type: 'profile', id: this.store.profileId }).values
        : DEFAULT_MODEL_PREFERENCES;
    return PreferencesViewSchema.parse({
      scope,
      values: row ? ModelPreferencesSchema.parse(JSON.parse(row.value_json).values) : inherited,
      revision: row?.revision ?? 1,
    });
  }
  setPreferences(scope: Scope, values: ModelPreferences, revision: number) {
    this.scope(scope);
    const current = this.preferences(scope);
    if (revision !== current.revision) throw new StorageError('CONFLICT', current.revision);
    const now = this.store.now();
    this.store.db
      .prepare(
        "INSERT INTO settings(id,profile_id,created_at,updated_at,scope_type,scope_id,key,value_json,revision) VALUES(?,?,?,?,?,?,'modelPreferences',?,?) ON CONFLICT(scope_type,scope_id,key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision,updated_at=excluded.updated_at,deleted_at=NULL",
      )
      .run(
        newId(),
        this.store.profileId,
        now,
        now,
        scope.type,
        scope.id,
        JSON.stringify({ schemaVersion: 1, values: ModelPreferencesSchema.parse(values) }),
        revision + 1,
      );
    this.store.emit('model.preferences.updated', {
      kind: 'model.preferences',
      scopeId: scope.id,
      revision: revision + 1,
    });
    return this.preferences(scope);
  }
  calendar(time = this.store.now()) {
    const { timezone } = this.store.db
      .prepare('SELECT timezone FROM profiles WHERE id=?')
      .get(this.store.profileId) as { timezone: string };
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(time);
    const part = (type: string) => parts.find((p) => p.type === type)!.value;
    return { day: `${part('year')}-${part('month')}-${part('day')}`, timezone };
  }
  resetAt() {
    const today = this.calendar().day;
    let low = this.store.now(),
      high = low + 30 * 3_600_000;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (this.calendar(middle).day === today) low = middle;
      else high = middle;
    }
    return high;
  }
  private budget(
    kind: 'root' | 'daily',
    owner: string,
    p: ModelPreferences,
    mode: 'chat' | 'work',
  ): Budget {
    const now = this.store.now();
    const tokens =
      kind === 'daily'
        ? Math.min(p.dailyTokenLimit, this.store.settings.values.dailyTokenLimit)
        : mode === 'chat'
          ? Math.min(p.rootTokenLimit, ROUTING_LIMITS.chatTokens)
          : Math.min(p.workRootTokenLimit, ROUTING_LIMITS.workTokens);
    const initial: Limits = {
      schemaVersion: 1,
      tokens,
      activeMs:
        kind === 'root' && mode === 'chat'
          ? ROUTING_LIMITS.chatActiveMs
          : ROUTING_LIMITS.workActiveMs,
      maxCalls:
        kind === 'daily'
          ? Number.MAX_SAFE_INTEGER
          : mode === 'chat'
            ? ROUTING_LIMITS.chatCalls
            : ROUTING_LIMITS.workCalls,
      usedCalls: 0,
      reservedMoney: {},
      moneyLimits: p.moneyLimits,
    };
    this.store.db
      .prepare(
        'INSERT OR IGNORE INTO budgets(id,profile_id,created_at,updated_at,owner_kind,owner_id,limits_json,money_by_currency_json) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        newId(),
        this.store.profileId,
        now,
        now,
        kind,
        owner,
        JSON.stringify(initial),
        moneyJSON({}),
      );
    const row = this.store.db
      .prepare('SELECT * FROM budgets WHERE owner_kind=? AND owner_id=? AND profile_id=?')
      .get(kind, owner, this.store.profileId) as Budget;
    const limits = { ...initial, ...JSON.parse(row.limits_json), tokens };
    limits.tokens = Math.min(tokens, limits.tokens);
    // Daily setting changes take effect before the next dispatch; a root keeps its original ceiling.
    if (kind === 'daily') limits.tokens = tokens;
    limits.moneyLimits = p.moneyLimits;
    row.limits_json = JSON.stringify(limits);
    return row;
  }
  reserve(input: {
    request: ModelRequest;
    runId: string;
    rootRunId: string;
    projectId?: string;
    inputTokens: number;
    preferences: ModelPreferences;
    price: ModelPrice | null;
    mode: 'chat' | 'work';
  }) {
    return this.store.db.transaction(() => {
      const request = input.request;
      if (
        this.store.db.prepare('SELECT id FROM provider_attempts WHERE id=?').get(request.attemptId)
      )
        throw new StorageError('CONFLICT');
      const reserved = input.inputTokens + request.outputLimit;
      const { day } = this.calendar();
      const profilePreferences = this.preferences({
        type: 'profile',
        id: this.store.profileId,
      }).values;
      const p = {
        ...input.preferences,
        rootTokenLimit: Math.min(
          input.preferences.rootTokenLimit,
          profilePreferences.rootTokenLimit,
        ),
        dailyTokenLimit: Math.min(
          input.preferences.dailyTokenLimit,
          profilePreferences.dailyTokenLimit,
        ),
        workRootTokenLimit: Math.min(
          input.preferences.workRootTokenLimit,
          profilePreferences.workRootTokenLimit,
        ),
        moneyLimits: profilePreferences.moneyLimits,
      };
      const price = knownPrice(input.price, this.store.now())
        ? PriceSchema.parse(input.price)
        : null;
      const reservedMoney = price
        ? pricedMicros(price, input.inputTokens, request.outputLimit)
        : null;
      if (
        p.moneyLimits.length &&
        (!price || !p.moneyLimits.some((limit) => limit.currency === price.currency))
      )
        throw new StorageError('BUDGET_EXCEEDED');
      const budgets = [
        this.budget('root', input.rootRunId, p, input.mode),
        this.budget('daily', this.store.profileId + ':' + day, p, input.mode),
      ];
      for (const budget of budgets) {
        const l = JSON.parse(budget.limits_json) as Limits;
        if (
          reserved + budget.reserved_tokens + budget.used_tokens > l.tokens ||
          l.usedCalls >= l.maxCalls ||
          (budget.owner_kind === 'root' && budget.active_ms >= l.activeMs)
        )
          throw new StorageError('BUDGET_EXCEEDED');
        if (price && reservedMoney !== null) {
          const used = moneyParse(budget.money_by_currency_json)[price.currency] ?? 0;
          const limit = p.moneyLimits.find((m) => m.currency === price.currency)?.dailyMicros;
          if (
            limit !== undefined &&
            used + (l.reservedMoney[price.currency] ?? 0) + reservedMoney > limit
          )
            throw new StorageError('BUDGET_EXCEEDED');
          l.reservedMoney[price.currency] = (l.reservedMoney[price.currency] ?? 0) + reservedMoney;
        }
        l.usedCalls++;
        this.store.db
          .prepare(
            'UPDATE budgets SET reserved_tokens=reserved_tokens+?,limits_json=?,updated_at=?,revision=revision+1 WHERE id=?',
          )
          .run(reserved, JSON.stringify(l), this.store.now(), budget.id);
      }
      const n = this.store.db
        .prepare(
          'SELECT coalesce(max(attempt_no),0)+1 AS n FROM provider_attempts WHERE logical_call_id=? AND profile_id=?',
        )
        .get(request.logicalCallId, this.store.profileId) as { n: number };
      this.store.db
        .prepare(
          "INSERT INTO provider_attempts(id,profile_id,created_at,updated_at,run_id,root_run_id,project_id,logical_call_id,attempt_no,provider_account_id,provider_id,model_ref,request_fingerprint,status,reserved_tokens,budget_day,price_json,reserved_money_micros,currency) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'running',?,?,?,?,?)",
        )
        .run(
          request.attemptId,
          this.store.profileId,
          this.store.now(),
          this.store.now(),
          input.runId,
          input.rootRunId,
          input.projectId ?? null,
          request.logicalCallId,
          n.n,
          request.accountId,
          request.model.providerId,
          request.model.modelId,
          createHash('sha256').update(JSON.stringify(request)).digest('hex'),
          reserved,
          day,
          price ? JSON.stringify(price) : null,
          reservedMoney,
          price?.currency ?? null,
        );
      return n.n;
    })();
  }
  // Temporary runs keep their detailed ledger in memory. Only aggregate daily
  // token/money counters are reserved in the durable profile budget.
  reserveSharedDaily(
    tokens: number,
    preferences: ModelPreferences,
    price: ModelPrice | null,
    inputTokens: number,
    outputTokens: number,
  ) {
    const profile = this.preferences({ type: 'profile', id: this.store.profileId }).values;
    const p = {
      ...preferences,
      dailyTokenLimit: Math.min(preferences.dailyTokenLimit, profile.dailyTokenLimit),
      moneyLimits: profile.moneyLimits,
    };
    const amount = knownPrice(price, this.store.now())
      ? pricedMicros(price!, inputTokens, outputTokens)
      : null;
    const currency = amount !== null ? price!.currency : null;
    const budgetId = this.store.db.transaction(() => {
      const b = this.budget('daily', this.store.profileId + ':' + this.calendar().day, p, 'chat');
      const limits = JSON.parse(b.limits_json) as Limits;
      if (
        tokens + b.used_tokens + b.reserved_tokens > limits.tokens ||
        (p.moneyLimits.length && !currency)
      )
        throw new StorageError('BUDGET_EXCEEDED');
      if (currency && amount !== null) {
        const cap = p.moneyLimits.find((m) => m.currency === currency);
        if (
          p.moneyLimits.length &&
          (!cap ||
            (moneyParse(b.money_by_currency_json)[currency] ?? 0) +
              (limits.reservedMoney[currency] ?? 0) +
              amount >
              cap.dailyMicros)
        )
          throw new StorageError('BUDGET_EXCEEDED');
        limits.reservedMoney[currency] = (limits.reservedMoney[currency] ?? 0) + amount;
      }
      this.store.db
        .prepare(
          'UPDATE budgets SET reserved_tokens=reserved_tokens+?,limits_json=?,revision=revision+1 WHERE id=?',
        )
        .run(tokens, JSON.stringify(limits), b.id);
      return b.id;
    })();
    let settled = false;
    return (charged: number, money: number | null) => {
      if (settled) return;
      this.store.db.transaction(() => {
        const b = this.store.db.prepare('SELECT * FROM budgets WHERE id=?').get(budgetId) as Budget;
        const limits = JSON.parse(b.limits_json) as Limits,
          amounts = moneyParse(b.money_by_currency_json);
        if (currency) {
          limits.reservedMoney[currency] = Math.max(
            0,
            (limits.reservedMoney[currency] ?? 0) - (amount ?? 0),
          );
          amounts[currency] = (amounts[currency] ?? 0) + (money ?? 0);
        }
        this.store.db
          .prepare(
            'UPDATE budgets SET reserved_tokens=reserved_tokens-?,used_tokens=used_tokens+?,limits_json=?,money_by_currency_json=?,revision=revision+1 WHERE id=?',
          )
          .run(tokens, charged, JSON.stringify(limits), moneyJSON(amounts), budgetId);
      })();
      settled = true;
    };
  }
  recoverSharedDaily() {
    // A crash can lose an in-memory run. Charge its remaining aggregate bound
    // conservatively rather than making its budget available for another run.
    this.store.db.transaction(() => {
      const rows = this.store.db
        .prepare(
          "SELECT * FROM budgets WHERE profile_id=? AND owner_kind='daily' AND reserved_tokens>0",
        )
        .all(this.store.profileId) as Budget[];
      for (const b of rows) {
        const limits = JSON.parse(b.limits_json) as Limits,
          amounts = moneyParse(b.money_by_currency_json);
        for (const [currency, value] of Object.entries(limits.reservedMoney))
          amounts[currency] = (amounts[currency] ?? 0) + value;
        limits.reservedMoney = {};
        this.store.db
          .prepare(
            'UPDATE budgets SET used_tokens=used_tokens+reserved_tokens,reserved_tokens=0,limits_json=?,money_by_currency_json=?,revision=revision+1 WHERE id=?',
          )
          .run(JSON.stringify(limits), moneyJSON(amounts), b.id);
      }
    })();
  }
  settle(
    attemptId: string,
    result: {
      status: AttemptView['status'];
      usage?: NormalizedUsage;
      text: string;
      error?: ProviderError;
      nativeStateRef?: string;
      activeMs: number;
    },
  ) {
    this.store.db.transaction(() => {
      const row = this.store.db
        .prepare('SELECT * FROM provider_attempts WHERE id=? AND profile_id=?')
        .get(attemptId, this.store.profileId) as
        | {
            id: string;
            status: string;
            logical_call_id: string;
            root_run_id: string;
            provider_account_id: string;
            budget_day: string;
            reserved_tokens: number;
            price_json: string | null;
            currency: string | null;
            reserved_money_micros: number | null;
          }
        | undefined;
      if (!row) throw new StorageError('NOT_FOUND');
      if (row.status !== 'running') return; // Exactly-once settlement, including crash recovery.
      const u = result.usage ?? emptyUsage;
      for (const value of [u.inputTotal, u.outputTotal, u.inputCachedSubset, u.reasoningSubset])
        if (value !== null && (!Number.isSafeInteger(value) || value < 0))
          throw new StorageError('VALIDATION_ERROR');
      if (
        (u.inputCachedSubset !== null &&
          u.inputTotal !== null &&
          u.inputCachedSubset > u.inputTotal) ||
        (u.reasoningSubset !== null && u.outputTotal !== null && u.reasoningSubset > u.outputTotal)
      )
        throw new StorageError('VALIDATION_ERROR');
      const actual = u.source === 'actual' && u.inputTotal !== null && u.outputTotal !== null;
      const charged = actual
        ? u.inputTotal! + u.outputTotal!
        : Math.max(row.reserved_tokens, (u.inputTotal ?? 0) + (u.outputTotal ?? 0));
      if (!Number.isSafeInteger(charged)) throw new StorageError('VALIDATION_ERROR');
      const price: ModelPrice | null = row.price_json
        ? PriceSchema.parse(JSON.parse(row.price_json))
        : null;
      const amount = price
        ? actual
          ? pricedMicros(price, u.inputTotal!, u.outputTotal!)
          : Math.max(
              row.reserved_money_micros ?? 0,
              pricedMicros(price, u.inputTotal ?? 0, u.outputTotal ?? 0),
            )
        : null;
      for (const [kind, owner] of [
        ['root', row.root_run_id],
        ['daily', this.store.profileId + ':' + row.budget_day],
      ]) {
        const budget = this.store.db
          .prepare('SELECT * FROM budgets WHERE owner_kind=? AND owner_id=? AND profile_id=?')
          .get(kind, owner, this.store.profileId) as Budget;
        const l = JSON.parse(budget.limits_json) as Limits;
        const money = moneyParse(budget.money_by_currency_json);
        if (price && amount !== null) {
          l.reservedMoney[price.currency] = Math.max(
            0,
            (l.reservedMoney[price.currency] ?? 0) - (row.reserved_money_micros ?? 0),
          );
          money[price.currency] = (money[price.currency] ?? 0) + amount;
        }
        this.store.db
          .prepare(
            'UPDATE budgets SET reserved_tokens=reserved_tokens-?,used_tokens=used_tokens+?,active_ms=active_ms+?,limits_json=?,money_by_currency_json=?,updated_at=?,revision=revision+1 WHERE id=?',
          )
          .run(
            row.reserved_tokens,
            charged,
            Math.max(0, Math.floor(result.activeMs)),
            JSON.stringify(l),
            moneyJSON(money),
            this.store.now(),
            budget.id,
          );
      }
      if (result.status === 'completed')
        this.store.db
          .prepare('UPDATE provider_attempts SET is_active_answer=0 WHERE logical_call_id=?')
          .run(row.logical_call_id);
      this.store.db
        .prepare(
          'UPDATE provider_attempts SET status=?,error_code=?,usage_json=?,public_text=?,native_state_ref=?,is_active_answer=?,updated_at=?,revision=revision+1 WHERE id=?',
        )
        .run(
          result.status,
          result.error?.code ?? null,
          JSON.stringify(u),
          result.text.slice(0, 200_000),
          result.nativeStateRef ?? null,
          result.status === 'completed' ? 1 : 0,
          this.store.now(),
          attemptId,
        );
      this.store.db
        .prepare(
          'INSERT INTO usage_ledger(id,profile_id,created_at,provider_attempt_id,root_run_id,account_id,input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,charged_tokens,source,price_version,currency,amount_micros) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          this.store.profileId,
          this.store.now(),
          attemptId,
          row.root_run_id,
          row.provider_account_id,
          u.inputTotal,
          u.inputCachedSubset,
          u.outputTotal,
          u.reasoningSubset,
          charged,
          actual ? 'actual' : 'estimated',
          price?.version ?? null,
          price?.currency ?? null,
          amount,
        );
    })();
  }
  recover() {
    const rows = this.store.db
      .prepare(
        "SELECT id,public_text FROM provider_attempts WHERE profile_id=? AND status='running'",
      )
      .all(this.store.profileId) as { id: string; public_text: string }[];
    for (const row of rows)
      this.settle(row.id, {
        status: 'unknown',
        text: row.public_text,
        activeMs: 0,
        error: { code: 'SIDE_EFFECT_UNKNOWN', retryable: false },
      });
  }
  checkpoint(attemptId: string, text: string) {
    this.store.db
      .prepare(
        "UPDATE provider_attempts SET public_text=?,updated_at=? WHERE id=? AND profile_id=? AND status='running'",
      )
      .run(text.slice(0, 200_000), this.store.now(), attemptId, this.store.profileId);
  }
  disableAccount(accountId: string, error: ProviderError, expectedRevision?: number | null) {
    const account = this.store.db
      .prepare(
        'SELECT revision FROM provider_accounts WHERE id=? AND profile_id=? AND deleted_at IS NULL',
      )
      .get(accountId, this.store.profileId) as { revision: number } | undefined;
    if (account && (expectedRevision == null || account.revision === expectedRevision))
      this.store.db
        .prepare(
          'INSERT INTO provider_route_state(account_id,profile_id,disabled_until,account_revision,error_code) VALUES(?,?,NULL,?,?) ON CONFLICT(account_id) DO UPDATE SET disabled_until=NULL,account_revision=excluded.account_revision,error_code=excluded.error_code',
        )
        .run(accountId, this.store.profileId, account.revision, error.code);
  }
  isDisabled(accountId: string) {
    return Boolean(
      this.store.db
        .prepare(
          'SELECT s.account_id FROM provider_route_state s JOIN provider_accounts a ON a.id=s.account_id WHERE s.account_id=? AND s.profile_id=? AND s.account_revision=a.revision AND (s.disabled_until IS NULL OR s.disabled_until>?)',
        )
        .get(accountId, this.store.profileId, this.store.now()),
    );
  }
  disabledReason(accountId: string) {
    if (!this.isDisabled(accountId)) return null;
    const row = this.store.db
      .prepare('SELECT error_code FROM provider_route_state WHERE account_id=? AND profile_id=?')
      .get(accountId, this.store.profileId) as { error_code: string };
    return row.error_code;
  }
  switch(
    logicalCallId: string,
    oldAttemptId: string,
    newAttemptId: string,
    from: Selection,
    to: Selection,
  ) {
    this.store.db.transaction(() =>
      this.store.emit('provider.switched', {
        kind: 'provider.switch',
        logicalCallId,
        oldAttemptId,
        newAttemptId,
        from,
        to,
      }),
    )();
  }
  list(query: z.infer<typeof UsageQuerySchema>, logicalCallId?: string) {
    const where = ['a.profile_id=?'],
      values: (string | number)[] = [this.store.profileId];
    if (logicalCallId) {
      where.push('a.logical_call_id=?');
      values.push(logicalCallId);
    }
    for (const [field, value, op] of [
      ['a.created_at', query.from, '>='],
      ['a.created_at', query.to, '<'],
      ['a.project_id', query.projectId, '='],
      ['a.model_ref', query.modelId, '='],
      ['a.run_id', query.runId, '='],
    ] as const)
      if (value !== undefined) {
        where.push(field + op + '?');
        values.push(value);
      }
    const from =
      'FROM provider_attempts a LEFT JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE ' +
      where.join(' AND ');
    const rows = this.store.db
      .prepare(
        `SELECT a.*, u.input_tokens,u.output_tokens,u.cached_input_tokens,u.reasoning_tokens,u.charged_tokens,u.source,u.price_version,u.amount_micros ${from} ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...values, query.limit + 1, query.cursor) as Record<string, any>[];
    const items = rows.slice(0, query.limit).map((row) =>
      AttemptViewSchema.parse({
        attemptId: row.id,
        logicalCallId: row.logical_call_id,
        runId: row.run_id,
        accountId: row.provider_account_id,
        providerId: row.provider_id,
        modelId: row.model_ref,
        attemptNo: row.attempt_no,
        status: row.status,
        errorCode: row.error_code,
        activeAnswer: Boolean(row.is_active_answer),
        text: row.public_text,
        inputTokens: row.input_tokens ?? null,
        outputTokens: row.output_tokens ?? null,
        cachedInputSubset: row.cached_input_tokens ?? null,
        reasoningSubset: row.reasoning_tokens ?? null,
        chargedTokens: row.charged_tokens ?? row.reserved_tokens,
        source: row.source ?? 'estimated',
        currency: row.currency,
        amountMicros: row.amount_micros ?? null,
        priceVersion: row.price_version ?? null,
        occurredAt: row.created_at,
      }),
    );
    const field = {
      date: 'a.budget_day',
      project: "coalesce(a.project_id,'未归属项目')",
      model: "a.provider_id || ':' || a.model_ref",
      run: 'a.run_id',
    }[query.groupBy];
    const groups = this.store.db
      .prepare(
        `SELECT ${field} AS key,sum(coalesce(u.charged_tokens,a.reserved_tokens)) AS tokens,count(*) AS attempts,sum(CASE WHEN u.source='actual' THEN 0 ELSE 1 END) AS estimated ${from} GROUP BY ${field} ORDER BY key LIMIT 1000`,
      )
      .all(...values);
    const { day, timezone } = this.calendar();
    const budget = this.store.db
      .prepare(
        "SELECT used_tokens,reserved_tokens FROM budgets WHERE owner_kind='daily' AND owner_id=? AND profile_id=?",
      )
      .get(this.store.profileId + ':' + day, this.store.profileId) as
      { used_tokens: number; reserved_tokens: number } | undefined;
    const dailyLimit = Math.min(
      this.preferences({ type: 'profile', id: this.store.profileId }).values.dailyTokenLimit,
      this.store.settings.values.dailyTokenLimit,
    );
    const total = (budget?.used_tokens ?? 0) + (budget?.reserved_tokens ?? 0);
    return UsageViewSchema.parse({
      items,
      nextCursor: rows.length > query.limit ? query.cursor + query.limit : null,
      groups,
      day,
      timezone,
      dailyUsed: budget?.used_tokens ?? 0,
      dailyReserved: budget?.reserved_tokens ?? 0,
      dailyLimit,
      alert: total >= dailyLimit ? 'reached' : total >= dailyLimit * 0.8 ? 'near' : 'normal',
      resetAt: this.resetAt(),
      remainingProviderQuota: null,
      limitations: [
        '供应商剩余额度与恢复时间未知，请查看供应商账户页；本机每日预算将在上方时间重置。',
        '媒体生成和存储计费未实现；消息/工作/研究以其模型调用账本统计，不提供应用套餐。',
        '价格未知的模型不显示金额；金额硬限额仅支持完整、核验过的同币种计价。',
      ],
    });
  }
  attempts(logicalCallId: string) {
    return this.list({ groupBy: 'run', cursor: 0, limit: 100 }, logicalCallId).items.sort(
      (a, b) => a.attemptNo - b.attemptNo,
    );
  }
}
