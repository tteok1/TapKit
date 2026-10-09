import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tapkit/ui';
import {
  BootstrapViewSchema,
  CatalogViewSchema,
  PreferencesViewSchema,
  PreviewViewSchema,
  UsageViewSchema,
  DiagnosticViewSchema,
  DEFAULT_MODEL_PREFERENCES,
  type ModelPreferences,
  type ModelDescriptor,
  type TapKitBridge,
  type z,
} from '@tapkit/contracts';
type Catalog = z.infer<typeof CatalogViewSchema>;
type Usage = z.infer<typeof UsageViewSchema>;
type Preview = z.infer<typeof PreviewViewSchema>;
type Result = z.infer<typeof DiagnosticViewSchema>;
const key = (model: { accountId: string | null; modelId: string }) =>
  `${model.accountId}:${model.modelId}`;
const requestId = () => {
  const time = Date.now().toString(16).padStart(12, '0');
  return time.slice(0, 8) + '-' + time.slice(8) + '-7' + crypto.randomUUID().slice(15);
};
const status = {
  ready: '可用',
  unconfigured: '待连接或检测',
  expired: '需重新登录',
  unavailable: '不可用，请重新检测',
};
const providers = {
  'codex-subscription': 'Codex 订阅',
  deepseek: 'DeepSeek',
  doubao: '豆包',
  hunyuan: '混元',
  xai: 'Grok',
  'openai-compatible': 'OpenAI 兼容',
  'anthropic-compatible': 'Anthropic 兼容',
};
const errorText: Record<string, string> = {
  BUDGET_EXCEEDED: '预算或并发限额已达到，请等待任务结束、下次重置或调整预算。',
  APPROVAL_REQUIRED: '需要先启用付费后备。',
  QUOTA_EXHAUSTED: '供应商额度耗尽；请查看供应商额度或选择已检测的其他账户。',
  RATE_LIMITED: '供应商暂时限流，请稍后再试。',
  AUTH_EXPIRED: '登录已过期，请重新登录。',
  AUTH_REQUIRED: '请先连接账户。',
  MODEL_UNSUPPORTED: '模型不支持当前设置，请调整设置或选择其他模型。',
  CONFLICT: '设置已变化，请刷新后重试。',
  VALIDATION_ERROR: '设置无效；金额限额需要完整核验价格。',
  STREAM_INTERRUPTED: '回答中断，已保留本次尝试，请检测连接后重试。',
  CANCELLED: '已取消；已发送的请求仍可能产生用量。',
  SIDE_EFFECT_UNKNOWN: '上次请求结果未知，已估算扣账，请检查结果后再发起新任务。',
};
export function ModelSettings() {
  const [profileId, setProfileId] = useState('');
  const [catalog, setCatalog] = useState<Catalog>({ catalog: [], sessions: [], priceVersion: '' });
  const [values, setValues] = useState<ModelPreferences>(DEFAULT_MODEL_PREFERENCES);
  const [revision, setRevision] = useState(1),
    [scope, setScope] = useState('profile'),
    [sessionId, setSessionId] = useState('');
  const [search, setSearch] = useState(''),
    [favoriteOnly, setFavoriteOnly] = useState(false);
  const [preview, setPreview] = useState<Preview>(),
    [usage, setUsage] = useState<Usage>(),
    [result, setResult] = useState<Result>();
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [callId, setCallId] = useState('');
  const [groupBy, setGroupBy] = useState<'date' | 'project' | 'model' | 'run'>('date');
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [modelFilter, setModelFilter] = useState(''),
    [runFilter, setRunFilter] = useState('');
  const [attachments, setAttachments] = useState(0),
    [needsTools, setNeedsTools] = useState(false),
    [inputTokens, setInputTokens] = useState(0);
  const [currency, setCurrency] = useState('USD'),
    [moneyLimit, setMoneyLimit] = useState('');
  const invoke = useCallback(
    async (
      command: Parameters<TapKitBridge['modelCommand']>[1],
      payload: unknown,
      expectedRevision?: number,
    ) => {
      const reply = await window.tapkit.modelCommand(
        { requestId: requestId(), ...(expectedRevision === undefined ? {} : { expectedRevision }) },
        command,
        payload,
      );
      if (!reply.ok)
        throw new Error(errorText[reply.error.code] ?? '操作未完成，请检查连接后重试。');
      return reply.data;
    },
    [],
  );
  const loadCatalog = useCallback(
    async () => setCatalog(CatalogViewSchema.parse(await invoke('models.catalog', {}))),
    [invoke],
  );
  const loadPreferences = useCallback(
    async (id: string, type: 'profile' | 'session' = 'profile') => {
      const data = PreferencesViewSchema.parse(
        await invoke('models.preferences.get', { scope: { type, id } }),
      );
      setValues(data.values);
      setRevision(data.revision);
      setMoneyLimit(
        data.values.moneyLimits[0]
          ? String(data.values.moneyLimits[0].dailyMicros / 1_000_000)
          : '',
      );
      setCurrency(data.values.moneyLimits[0]?.currency ?? 'USD');
    },
    [invoke],
  );
  const loadUsage = useCallback(
    async (cursor = 0, append = false) => {
      const data = UsageViewSchema.parse(
        await invoke('usage.list', {
          groupBy,
          cursor,
          limit: 50,
          ...(from ? { from: new Date(from + 'T00:00:00').getTime() } : {}),
          ...(to ? { to: new Date(to + 'T00:00:00').getTime() + 86_400_000 } : {}),
          ...(modelFilter ? { modelId: modelFilter } : {}),
          ...(runFilter ? { runId: runFilter } : {}),
        }),
      );
      setUsage((old) => (append && old ? { ...data, items: [...old.items, ...data.items] } : data));
    },
    [invoke, groupBy, from, to, modelFilter, runFilter],
  );
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const reply = await window.tapkit.bootstrap({ requestId: requestId() });
        if (!reply.ok) throw new Error('本地核心不可用。');
        const data = BootstrapViewSchema.parse(reply.data);
        if (!live) return;
        setProfileId(data.profile.id);
        await loadPreferences(data.profile.id);
        await loadCatalog();
      } catch (error) {
        if (live) setMessage(String(error instanceof Error ? error.message : error));
      }
    })();
    return () => {
      live = false;
    };
  }, [loadPreferences, loadCatalog]);
  useEffect(() => {
    void loadUsage().catch((error) => setMessage(error.message));
  }, [loadUsage]);
  useEffect(() => {
    let active = true;
    void invoke('models.preview', {
      current: values,
      ...(scope === 'session' && sessionId ? { sessionId } : {}),
      inputTokens,
      outputTokens: 128,
      attachments,
      needsTools,
    })
      .then((raw) => {
        if (active) setPreview(PreviewViewSchema.parse(raw));
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, [invoke, values, scope, sessionId, inputTokens, attachments, needsTools]);
  const act = async (operation: () => Promise<void>) => {
    setMessage('');
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作未完成。');
    } finally {
      setBusy(false);
    }
  };
  const changeScope = (next: string) => {
    setScope(next);
    if (next !== 'current' && profileId)
      void act(() =>
        loadPreferences(
          next === 'session' ? sessionId || catalog.sessions[0]!.id : profileId,
          next === 'session' ? 'session' : 'profile',
        ),
      );
    if (next === 'session' && !sessionId) setSessionId(catalog.sessions[0]!.id);
  };
  const save = () =>
    act(async () => {
      if (scope === 'current') {
        setMessage('本次设置已应用到下面的检测任务；默认设置未写入。');
        return;
      }
      const moneyLimits = moneyLimit
        ? [{ currency, dailyMicros: Math.round(Number(moneyLimit) * 1_000_000) }]
        : [];
      const data = PreferencesViewSchema.parse(
        await invoke(
          'models.preferences.set',
          {
            scope: { type: scope, id: scope === 'session' ? sessionId : profileId },
            values: { ...values, moneyLimits },
          },
          revision,
        ),
      );
      setValues(data.values);
      setRevision(data.revision);
      await loadUsage();
      setMessage('模型设置已保存。');
    });
  const run = () =>
    act(async () => {
      const logicalCallId = requestId();
      setCallId(logicalCallId);
      setResult(undefined);
      try {
        const data = DiagnosticViewSchema.parse(
          await invoke('models.diagnostic', {
            logicalCallId,
            current: values,
            ...(scope === 'session' ? { sessionId } : {}),
          }),
        );
        setResult(data);
        setMessage(
          data.errorCode
            ? (errorText[data.errorCode] ?? '没有可用模型，请连接或选择其他账户。')
            : '检测完成，实际模型与各次尝试见下方。',
        );
      } finally {
        setCallId('');
        await loadUsage();
        await loadCatalog();
      }
    });
  const visible = catalog.catalog.filter(
    (m) =>
      (!favoriteOnly || values.favorites.some((f) => key(f) === key(m))) &&
      `${m.displayName} ${m.modelId} ${m.accountLabel} ${providers[m.providerId]}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const selected = catalog.catalog.find(
    (m) => key(m) === (values.selection ? key(values.selection) : ''),
  );
  const choose = (m: ModelDescriptor) => {
    if (m.accountId)
      setValues((v) => ({ ...v, selection: { accountId: m.accountId!, modelId: m.modelId } }));
  };
  return (
    <section className="auth-diagnostic model-settings">
      <Link to="/">
        <span aria-hidden="true">← </span>运行状态
      </Link>
      <h1>模型与用量</h1>
      <p>优先使用订阅。API 由供应商计费，失败请求也可能收费；此处不会购买套餐或自动充值。</p>
      <div className="model-toolbar">
        <label>
          搜索模型
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="名称、账户或供应商"
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={favoriteOnly}
            onChange={(e) => setFavoriteOnly(e.target.checked)}
          />{' '}
          仅收藏
        </label>
        <button disabled={busy} onClick={() => void act(loadCatalog)}>
          刷新账户状态
        </button>
      </div>
      <div className="model-catalog" data-testid="model-catalog">
        {visible.length ? (
          visible.map((m) => (
            <article className="model-card" key={key(m)} data-testid="model-card">
              <strong>{m.displayName}</strong>
              <p>
                {providers[m.providerId]} · {m.accountLabel} · {status[m.status]}
              </p>
              {m.availabilityReason && (
                <p>{errorText[m.availabilityReason] ?? '请重新检测账户后再试。'}</p>
              )}
              <p>{m.scenario}</p>
              <p>
                上下文 {m.contextWindow?.toLocaleString() ?? '未知'} · 最大输出{' '}
                {m.maxOutput?.toLocaleString() ?? '未知'} · 价格{' '}
                {m.price ? `${m.price.currency}，版本 ${m.price.version}` : '未知'}
              </p>
              <p>
                思考强度：
                {m.reasoningLevels
                  .map((r) => ({ off: '关闭', low: '低', medium: '中', high: '高' })[r])
                  .join(' / ')}
                ；供应商剩余额度与恢复时间未知。
              </p>
              <button disabled={busy || !m.accountId} onClick={() => choose(m)}>
                {values.selection && key(values.selection) === key(m) ? '已选择' : '选择模型'}
              </button>
              {m.accountId && (
                <button
                  disabled={busy}
                  aria-label={`收藏 ${m.displayName} ${m.accountLabel}`}
                  aria-pressed={values.favorites.some((f) => key(f) === key(m))}
                  onClick={() =>
                    setValues((v) => ({
                      ...v,
                      favorites: v.favorites.some((f) => key(f) === key(m))
                        ? v.favorites.filter((f) => key(f) !== key(m))
                        : [...v.favorites, { accountId: m.accountId!, modelId: m.modelId }],
                    }))
                  }
                >
                  收藏
                </button>
              )}
              {m.status !== 'ready' && (
                <p>
                  <Link to={m.providerId === 'codex-subscription' ? '/dev/codex' : '/dev/api'}>
                    连接或检测此账户
                  </Link>
                </p>
              )}
            </article>
          ))
        ) : (
          <p>没有匹配模型；请调整搜索或连接账户。</p>
        )}
      </div>
      <h2>选择与回答偏好</h2>
      <fieldset disabled={busy} className="api-form">
        <legend>
          生效范围：{scope === 'profile' ? '默认' : scope === 'session' ? '会话' : '本次'}
        </legend>
        <label>
          设置范围
          <select value={scope} onChange={(e) => changeScope(e.target.value)}>
            <option value="profile">默认</option>
            <option value="current">本次</option>
            <option value="session" disabled={!catalog.sessions.length}>
              会话{!catalog.sessions.length ? '（暂无会话）' : ''}
            </option>
          </select>
        </label>
        {scope === 'session' && (
          <label>
            会话
            <select
              value={sessionId}
              onChange={(e) => {
                setSessionId(e.target.value);
                void act(() => loadPreferences(e.target.value, 'session'));
              }}
            >
              {catalog.sessions.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          首选模型
          <select
            value={values.selection ? key(values.selection) : ''}
            onChange={(e) => {
              const m = catalog.catalog.find((m) => key(m) === e.target.value);
              setValues((v) => ({
                ...v,
                selection: m?.accountId ? { accountId: m.accountId, modelId: m.modelId } : null,
              }));
            }}
          >
            <option value="">自动选择（订阅优先）</option>
            {catalog.catalog
              .filter((m) => m.accountId)
              .map((m) => (
                <option value={key(m)} key={key(m)}>
                  {m.displayName} · {m.accountLabel}
                </option>
              ))}
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={values.onlyThisModel}
            onChange={(e) => setValues((v) => ({ ...v, onlyThisModel: e.target.checked }))}
          />{' '}
          仅此模型，不自动切换
        </label>
        <label>
          回答方式
          <select
            value={values.mode}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                mode: e.target.value as ModelPreferences['mode'],
                reasoning:
                  e.target.value === 'quick'
                    ? 'off'
                    : (selected?.reasoningLevels.find((r) => r !== 'off') ?? 'medium'),
              }))
            }
          >
            <option value="quick">快速回答</option>
            <option value="deep">深入思考</option>
          </select>
        </label>
        <label>
          思考强度
          <select
            disabled={values.mode === 'quick'}
            value={values.reasoning}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                reasoning: e.target.value as ModelPreferences['reasoning'],
              }))
            }
          >
            {(['off', 'low', 'medium', 'high'] as const).map((r) => (
              <option
                value={r}
                key={r}
                disabled={Boolean(selected && !selected.reasoningLevels.includes(r))}
              >
                {{ off: '关闭', low: '低', medium: '中', high: '高' }[r]}
              </option>
            ))}
          </select>
        </label>
        {(['language', 'length', 'tone', 'format'] as const).map((field) => (
          <label key={field}>
            {
              { language: '回答语言', length: '回答长度', tone: '回答语气', format: '输出格式' }[
                field
              ]
            }
            <select
              value={values.answer[field]}
              onChange={(e) =>
                setValues((v) => ({ ...v, answer: { ...v.answer, [field]: e.target.value } }))
              }
            >
              {{
                language: [
                  ['auto', '自动'],
                  ['zh-CN', '中文'],
                  ['en', '英文'],
                ],
                length: [
                  ['short', '简短'],
                  ['normal', '正常'],
                  ['long', '详细'],
                ],
                tone: [
                  ['natural', '自然'],
                  ['professional', '专业'],
                  ['friendly', '友好'],
                ],
                format: [
                  ['auto', '自动'],
                  ['plain', '纯文本'],
                  ['markdown', 'Markdown'],
                  ['json', 'JSON（需预检支持）'],
                ],
              }[field].map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          聊天任务 Token 上限
          <input
            type="number"
            min="1"
            max="128000"
            value={values.rootTokenLimit}
            onChange={(e) => setValues((v) => ({ ...v, rootTokenLimit: Number(e.target.value) }))}
          />
        </label>
        <label>
          工作任务 Token 上限
          <input
            type="number"
            min="1"
            max="600000"
            value={values.workRootTokenLimit}
            onChange={(e) =>
              setValues((v) => ({ ...v, workRootTokenLimit: Number(e.target.value) }))
            }
          />
        </label>
        <label>
          每日 Token 上限
          <input
            type="number"
            min="1"
            max="2000000"
            value={values.dailyTokenLimit}
            onChange={(e) => setValues((v) => ({ ...v, dailyTokenLimit: Number(e.target.value) }))}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={values.allowPaidFallback}
            onChange={(e) => setValues((v) => ({ ...v, allowPaidFallback: e.target.checked }))}
          />{' '}
          允许自动切换到 API，并接受供应商费用
        </label>
        <div className="api-hint">
          API 后备顺序：
          {values.apiOrder.map((p, i) => (
            <span className="order-entry" key={p}>
              {providers[p]}{' '}
              <button
                aria-label={`提前 ${providers[p]}`}
                disabled={!i}
                onClick={() =>
                  setValues((v) => {
                    const order = [...v.apiOrder];
                    [order[i - 1], order[i]] = [order[i]!, order[i - 1]!];
                    return { ...v, apiOrder: order };
                  })
                }
              >
                ↑
              </button>
            </span>
          ))}
        </div>
        <label>
          金额币种
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={!catalog.catalog.some((m) => m.price)}
          >
            <option>USD</option>
            <option>CNY</option>
          </select>
        </label>
        <label>
          每日金额上限
          <input
            type="number"
            min="0.000001"
            step="0.01"
            value={moneyLimit}
            onChange={(e) => setMoneyLimit(e.target.value)}
            disabled={!catalog.catalog.some((m) => m.price)}
            placeholder="价格完整核验后可设"
          />
        </label>
        <p className="api-hint">
          价格未知时可设 Token
          上限，金额上限不可用。余额提醒依供应商数据，目前未知；自动充值未实现。
        </p>
        <button onClick={() => void save()}>
          {scope === 'current' ? '应用本次设置' : '保存设置'}
        </button>
      </fieldset>
      <h2>兼容预检与检测</h2>
      <div className="api-form">
        <label>
          估算上下文 Token
          <input
            type="number"
            min="0"
            max="2000000"
            value={inputTokens}
            onChange={(e) => setInputTokens(Number(e.target.value))}
          />
        </label>
        <label>
          附件数量
          <input
            type="number"
            min="0"
            max="100"
            value={attachments}
            onChange={(e) => setAttachments(Number(e.target.value))}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={needsTools}
            onChange={(e) => setNeedsTools(e.target.checked)}
          />{' '}
          需要工具
        </label>
        <p className="api-hint">
          预检不会删除附件或历史。检测任务只发送固定的简短文本，不执行工具。
        </p>
      </div>
      <div data-testid="model-preview">
        {preview?.issues.map((issue) => (
          <p key={issue} role="alert">
            {issue}
          </p>
        ))}
        <p>
          可用替代：
          {preview?.candidates
            .map((s) => catalog.catalog.find((m) => key(m) === key(s))?.displayName)
            .join('、') || '暂无'}
        </p>
        {preview?.candidates.slice(0, 3).map((s) => (
          <button
            key={key(s)}
            disabled={busy}
            onClick={() => {
              const m = catalog.catalog.find((m) => key(m) === key(s));
              if (m) choose(m);
            }}
          >
            改用 {catalog.catalog.find((m) => key(m) === key(s))?.displayName}
          </button>
        ))}
      </div>
      <p>{preview?.paidNotice}</p>
      <button
        disabled={busy || !preview?.candidates.length || Boolean(preview.issues.length)}
        onClick={() => void run()}
      >
        调用模型检测（可能计费）
      </button>
      {callId && (
        <button
          onClick={() =>
            void invoke('models.cancel', { logicalCallId: callId }).catch((error) =>
              setMessage(error.message),
            )
          }
        >
          取消检测
        </button>
      )}
      <p role="status">{busy ? '正在处理…' : message}</p>
      {result && (
        <div data-testid="routing-result">
          <h3>实际模型：{result.actualModel?.modelId ?? '尚未完成'}</h3>
          {result.attempts.map((a) => (
            <article key={a.attemptId}>
              <strong>
                尝试 {a.attemptNo} · {providers[a.providerId]} · {a.modelId}
              </strong>
              <p>
                {a.activeAnswer
                  ? '最终回答'
                  : a.status === 'interrupted'
                    ? '中断回答，未与其他回答拼接'
                    : '已结束尝试'}{' '}
                · {a.source === 'actual' ? '实际用量' : '估算用量'} {a.chargedTokens} Token
              </p>
              <pre>{a.text}</pre>
            </article>
          ))}
        </div>
      )}
      <h2>用量账本</h2>
      {usage && (
        <>
          <p data-testid="daily-usage">
            {usage.day} · {usage.timezone} · 已用 {usage.dailyUsed} + 预留 {usage.dailyReserved} /{' '}
            {usage.dailyLimit} Token
          </p>
          <p>本机预算重置：{new Date(usage.resetAt).toLocaleString()}</p>
          {usage.alert !== 'normal' && (
            <p role="alert">
              {usage.alert === 'near' ? '已接近每日限额。' : '已达到每日限额。'}
              可等待上方重置时间、调整预算或查看供应商额度后重新检测；更换模型不能绕过本机硬限额。
            </p>
          )}
          {usage.limitations.map((line) => (
            <p className="api-hint" key={line}>
              {line}
            </p>
          ))}
        </>
      )}
      <div className="api-form">
        <label>
          起始日期
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          结束日期
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          汇总方式
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
            <option value="date">日期</option>
            <option value="project">项目</option>
            <option value="model">模型</option>
            <option value="run">任务</option>
          </select>
        </label>
        <label>
          筛选模型
          <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}>
            <option value="">全部模型</option>
            {[...new Set(catalog.catalog.map((m) => m.modelId))].map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
        <label>
          筛选任务
          <select value={runFilter} onChange={(e) => setRunFilter(e.target.value)}>
            <option value="">全部任务</option>
            {[...new Set(usage?.items.map((a) => a.runId) ?? [])].map((id, i) => (
              <option value={id} key={id}>
                检测任务 {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="usage-table">
        <table>
          <caption>用量汇总（包含失败尝试）</caption>
          <thead>
            <tr>
              <th>分组</th>
              <th>Token</th>
              <th>尝试</th>
              <th>估算记录</th>
            </tr>
          </thead>
          <tbody>
            {usage?.groups.map((g) => (
              <tr key={g.key}>
                <td>{g.key}</td>
                <td>{g.tokens}</td>
                <td>{g.attempts}</td>
                <td>{g.estimated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div data-testid="usage-items">
        {usage?.items.length ? (
          usage.items.map((a) => (
            <p key={a.attemptId}>
              {new Date(a.occurredAt).toLocaleString()} · {a.modelId} · {a.chargedTokens} Token ·{' '}
              {a.source === 'actual' ? '实际' : '估算'} ·{' '}
              {a.amountMicros === null ? '金额未知' : `${a.amountMicros / 1_000_000} ${a.currency}`}{' '}
              · 缓存/推理为子集，不另加
            </p>
          ))
        ) : (
          <p>暂无模型调用记录。</p>
        )}
      </div>
      {usage?.nextCursor !== null && usage?.nextCursor !== undefined && (
        <button
          onClick={() =>
            void loadUsage(usage.nextCursor!, true).catch((error) => setMessage(error.message))
          }
        >
          加载更多
        </button>
      )}
    </section>
  );
}
