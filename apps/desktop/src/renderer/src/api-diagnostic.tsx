import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, X, Link } from '@tapkit/ui';
import {
  API_PRESETS,
  SaveApiKeySchema,
  ProviderListSchema,
  ProbeViewSchema,
  type ApiConfig,
  type ApiFormat,
  type AccountView,
  type Reply,
} from '@tapkit/contracts';
import text from '../locales/zh-CN.json';
const options = (revision?: number) => {
  const time = Date.now().toString(16).padStart(12, '0');
  return {
    requestId: time.slice(0, 8) + '-' + time.slice(8) + '-7' + crypto.randomUUID().slice(15),
    ...(revision ? { expectedRevision: revision } : {}),
  };
};
function data(reply: Reply) {
  if (!reply.ok) throw new Error(reply.error.code);
  return reply.data;
}
export function ApiDiagnostic() {
  const secretInputs = useRef(new Set<{ key: string }>());
  useEffect(
    () => () => {
      for (const input of secretInputs.current) input.key = '';
      secretInputs.current.clear();
    },
    [],
  );
  const [provider, setProvider] = useState<ApiConfig['providerId']>('openai-compatible');
  const [format, setFormat] = useState<ApiFormat>('openai-chat');
  const [baseURL, setBaseURL] = useState<string>(API_PRESETS['openai-compatible'].baseURL);
  const [modelId, setModelId] = useState(''),
    [label, setLabel] = useState(''),
    [key, setKey] = useState('');
  const [accounts, setAccounts] = useState<AccountView[]>([]),
    [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  const reload = useCallback(async () => {
    const result = ProviderListSchema.parse(data(await window.tapkit.listProviders(options())));
    setAccounts(result.accounts.filter((account) => account.providerId !== 'codex-subscription'));
  }, []);
  useEffect(() => {
    void reload().catch(() => setError(text.auth.connectionFailed));
  }, [reload]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      setError(
        code === 'VALIDATION_ERROR'
          ? text.api.invalid
          : code === 'CONFLICT'
            ? text.auth.conflict
            : text.auth.connectionFailed,
      );
    } finally {
      setBusy(false);
    }
  }
  const changedOrigin = (() => {
    try {
      return new URL(baseURL).origin !== new URL(API_PRESETS[provider].baseURL).origin;
    } catch {
      return false;
    }
  })();
  const status = {
    unconfigured: text.api.pending,
    ready: text.auth.ready,
    expired: text.auth.expired,
    unavailable: text.auth.unavailable,
  };
  return (
    <section className="auth-diagnostic">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} />
        {text.auth.back}
      </Link>
      <h1>{text.api.title}</h1>
      <p>{text.api.description}</p>
      <form
        className="api-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const validated = SaveApiKeySchema.safeParse({
              providerId: provider,
              apiFormat: format,
              baseURL,
              modelId,
              label: label.trim() || text.api.providers[provider],
              key,
            });
            if (!validated.success) throw new Error('VALIDATION_ERROR');
            const input = validated.data;
            secretInputs.current.add(input);
            try {
              data(await window.tapkit.saveApiKey(options(), input));
            } finally {
              input.key = '';
              secretInputs.current.delete(input);
            }
            setKey('');
            setNotice(text.api.saved);
            await reload();
          });
        }}
      >
        <label>
          {text.api.provider}
          <select
            value={provider}
            disabled={busy}
            onChange={(event) => {
              const value = event.target.value as typeof provider;
              setProvider(value);
              setFormat(API_PRESETS[value].apiFormat);
              setBaseURL(API_PRESETS[value].baseURL);
              setModelId(API_PRESETS[value].modelId);
              setKey('');
            }}
          >
            {Object.keys(API_PRESETS).map((value) => (
              <option key={value} value={value}>
                {text.api.providers[value as typeof provider]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text.api.format}
          <select
            value={format}
            disabled={busy}
            onChange={(event) => setFormat(event.target.value as ApiFormat)}
          >
            <option value="openai-chat">OpenAI Chat Completions</option>
            <option value="openai-responses">OpenAI Responses</option>
            <option value="anthropic-messages">Anthropic Messages</option>
          </select>
        </label>
        <label>
          {text.api.label}
          <input
            value={label}
            maxLength={80}
            disabled={busy}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={text.api.providers[provider]}
          />
        </label>
        <label>
          {text.api.baseURL}
          <input
            type="url"
            required
            value={baseURL}
            maxLength={2048}
            disabled={busy}
            onChange={(event) => setBaseURL(event.target.value)}
          />
        </label>
        <label>
          {text.auth.model}
          <input
            required
            value={modelId}
            maxLength={160}
            disabled={busy}
            onChange={(event) => setModelId(event.target.value)}
            placeholder={text.api.modelHint}
          />
        </label>
        <label>
          API Key
          <input
            type="password"
            required
            autoComplete="off"
            spellCheck={false}
            value={key}
            maxLength={8192}
            disabled={busy}
            onChange={(event) => setKey(event.target.value)}
          />
        </label>
        <p className="api-hint">{text.api.baseHint}</p>
        {changedOrigin && (
          <p className="api-hint" role="status">
            {text.api.originWarning}
          </p>
        )}
        <button disabled={busy || !modelId.trim() || !key.trim()}>
          {busy ? text.api.saving : text.api.save}
        </button>
      </form>
      <div className="auth-toolbar">
        <h2>{text.api.accounts}</h2>
        <button aria-label={text.auth.refresh} disabled={busy} onClick={() => void run(reload)}>
          <RefreshCw size={16} />
        </button>
      </div>
      {!accounts.length && <p data-testid="api-empty">{text.api.empty}</p>}
      {accounts.map((account) => (
        <div className="account-row api-account" key={account.accountId} data-testid="api-account">
          <div>
            <strong>{account.label}</strong>
            {account.credentialHint && (
              <small className="credential-hint">API Key ····{account.credentialHint}</small>
            )}
            <p>
              {account.hasCredential === false ? text.auth.unconfigured : status[account.status]}
            </p>
          </div>
          <div className="api-details">
            <strong>{account.modelId}</strong>
            <p>{account.apiFormat ? text.api.formats[account.apiFormat] : ''}</p>
            <p>{account.baseURL}</p>
          </div>
          <button
            disabled={busy || !account.modelId || account.hasCredential === false}
            onClick={() =>
              void run(async () => {
                const result = ProbeViewSchema.parse(
                  data(
                    await window.tapkit.checkProvider(options(account.revision), {
                      accountId: account.accountId,
                      modelId: account.modelId!,
                    }),
                  ),
                );
                setNotice(
                  account.label +
                    '：' +
                    (result.status === 'ready'
                      ? text.auth.probePassed
                      : text.auth.probeFailed +
                        ' (' +
                        (result.errorCode ?? 'MODEL_UNSUPPORTED') +
                        ')') +
                    (result.diagnostic
                      ? ' · ' +
                        (result.diagnostic.phase === 'text'
                          ? text.auth.textPhase
                          : text.auth.toolsPhase) +
                        '：' +
                        text.auth.diagnosticReasons[result.diagnostic.reason] +
                        (result.diagnostic.httpStatus
                          ? ' [HTTP ' + result.diagnostic.httpStatus + ']'
                          : '') +
                        (result.diagnostic.responseType
                          ? ' [' +
                            text.auth.responseType +
                            ' ' +
                            text.auth.responseTypes[result.diagnostic.responseType] +
                            ']'
                          : '') +
                        (result.diagnostic.upstreamCode
                          ? ' [' +
                            text.auth.upstreamCode +
                            ' ' +
                            result.diagnostic.upstreamCode +
                            ']'
                          : '') +
                        (result.diagnostic.request
                          ? ' [' +
                            text.auth.requestLimit +
                            ' ' +
                            result.diagnostic.request.outputLimit +
                            ' Token] [' +
                            text.auth.requestReasoning +
                            ' ' +
                            result.diagnostic.request.reasoning +
                            ']'
                          : '') +
                        (result.diagnostic.usage
                          ? ' [' +
                            text.auth.usageInput +
                            ' ' +
                            (result.diagnostic.usage.inputTotal ?? text.auth.unknownUsage) +
                            '] [' +
                            text.auth.usageOutput +
                            ' ' +
                            (result.diagnostic.usage.outputTotal ?? text.auth.unknownUsage) +
                            '] [' +
                            text.auth.usageReasoning +
                            ' ' +
                            (result.diagnostic.usage.reasoningSubset ?? text.auth.unknownUsage) +
                            ']'
                          : '')
                      : ''),
                );
                await reload();
              })
            }
          >
            <RefreshCw size={16} />
            {text.auth.check}
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                data(
                  await window.tapkit.disconnectProvider(
                    options(account.revision),
                    account.accountId,
                  ),
                );
                setNotice(text.api.cleared);
                await reload();
              })
            }
          >
            <X size={16} />
            {text.auth.clearAccount}
          </button>
        </div>
      ))}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
