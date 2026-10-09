import { useCallback, useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, RefreshCw, X, ArrowRight, ArrowLeft, Link } from '@tapkit/ui';
import {
  ProviderListSchema,
  LoginViewSchema,
  ProbeViewSchema,
  type AccountView,
  type ModelView,
  type LoginView,
  type Reply,
} from '@tapkit/contracts';
import text from '../locales/zh-CN.json';
const options = (revision?: number) => {
  const time = Date.now().toString(16).padStart(12, '0');
  const requestId = time.slice(0, 8) + '-' + time.slice(8) + '-7' + crypto.randomUUID().slice(15);
  return { requestId, ...(revision ? { expectedRevision: revision } : {}) };
};
function requireReply(reply: Reply) {
  if (!reply.ok) throw new Error(reply.error.code);
  return reply.data;
}
export function AuthDiagnostic() {
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [models, setModels] = useState<ModelView[]>([]);
  const [login, setLogin] = useState<LoginView>();
  const activeLogin = useRef<LoginView | undefined>(undefined);
  activeLogin.current = login;
  const [method, setMethod] = useState<'browser' | 'device_code'>('browser');
  const [callback, setCallback] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<string>();
  const [error, setError] = useState('');
  const [probe, setProbe] = useState('');
  const [notice, setNotice] = useState('');
  const [disconnecting, setDisconnecting] = useState<string>();
  const reload = useCallback(async () => {
    const data = ProviderListSchema.parse(
      requireReply(await window.tapkit.listProviders(options())),
    );
    setAccounts(data.accounts.filter((account) => account.providerId === 'codex-subscription'));
    setModels(data.models.filter((model) => model.providerId === 'codex-subscription'));
  }, []);
  useEffect(() => {
    void reload().catch(() => setError(text.auth.connectionFailed));
  }, [reload]);
  useEffect(
    () => () => {
      const pending = activeLogin.current;
      if (pending?.status === 'waiting')
        void window.tapkit.cancelLogin(options(), pending.loginId).catch(() => {});
    },
    [],
  );
  useEffect(() => {
    if (!login || login.status !== 'waiting') return;
    let stopped = false;
    const timer = setInterval(() => {
      void window.tapkit
        .loginStatus(options(), login.loginId)
        .then(requireReply)
        .then(LoginViewSchema.parse)
        .then((value) => {
          if (stopped) return;
          setLogin(value);
          if (value.status === 'completed')
            void reload().catch(() => setError(text.auth.connectionFailed));
        })
        .catch(() => {
          if (!stopped) {
            setLogin(undefined);
            setError(text.auth.connectionFailed);
          }
        });
    }, 500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [login?.loginId, login?.status, reload]);
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
          ? text.auth.invalidCallback
          : code === 'CONFLICT'
            ? text.auth.conflict
            : text.auth.connectionFailed,
      );
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    await run(async () => {
      setCallback('');
      setLogin(
        LoginViewSchema.parse(
          requireReply(
            await window.tapkit.startLogin(options(), {
              providerId: 'codex-subscription',
              method,
              label: 'Codex',
            }),
          ),
        ),
      );
    });
  }
  async function check(account: AccountView) {
    setChecking(account.accountId);
    setProbe('');
    setError('');
    setNotice('');
    try {
      const modelId =
        selected[account.accountId] ??
        models.find((model) => model.accountId === account.accountId)?.modelId;
      const result = ProbeViewSchema.parse(
        requireReply(
          await window.tapkit.checkProvider(options(account.revision), {
            accountId: account.accountId,
            ...(modelId ? { modelId } : {}),
          }),
        ),
      );
      setProbe(
        result.status === 'ready'
          ? text.auth.probePassed
          : text.auth.probeFailed +
              (result.errorCode ? ' (' + result.errorCode + ')' : '') +
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
                  (result.diagnostic.upstreamCode
                    ? ' [' + result.diagnostic.upstreamCode + ']'
                    : '')
                : ''),
      );
    } catch {
      setError(text.auth.connectionFailed);
    } finally {
      setChecking(undefined);
      await reload().catch(() => setError(text.auth.connectionFailed));
    }
  }
  async function disconnect(account: AccountView) {
    setDisconnecting(account.accountId);
    try {
      await run(async () => {
        requireReply(
          await window.tapkit.disconnectProvider(options(account.revision), account.accountId),
        );
        setProbe('');
        setNotice(
          account.hasCredential === false ? text.auth.accountCleared : text.auth.disconnected,
        );
        if (login?.accountId === account.accountId) setLogin(undefined);
        await reload();
      });
    } finally {
      setDisconnecting(undefined);
    }
  }
  const status = {
    unconfigured: text.auth.unconfigured,
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
      <h1>{text.auth.title}</h1>
      <div className="auth-toolbar">
        <select
          aria-label={text.auth.method}
          value={method}
          onChange={(event) => setMethod(event.target.value as typeof method)}
          disabled={login?.status === 'waiting'}
        >
          <option value="browser">{text.auth.browser}</option>
          <option value="device_code">{text.auth.device}</option>
        </select>
        <button onClick={() => void start()} disabled={busy || login?.status === 'waiting'}>
          <LogIn size={16} />
          {text.auth.login}
        </button>
        <button
          title={text.auth.refresh}
          aria-label={text.auth.refresh}
          onClick={() => void run(reload)}
          disabled={busy}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {login?.status === 'waiting' && (
        <div className="login-panel">
          <div className="auth-toolbar">
            <span role="status">
              {login.deviceCode
                ? text.auth.deviceCode + ': ' + login.deviceCode
                : text.auth.waiting}
            </span>
            <button
              onClick={() =>
                void run(async () => {
                  setLogin(
                    LoginViewSchema.parse(
                      requireReply(await window.tapkit.cancelLogin(options(), login.loginId)),
                    ),
                  );
                  setCallback('');
                  await reload();
                })
              }
              disabled={busy}
            >
              <X size={16} />
              {text.auth.cancel}
            </button>
          </div>
          {login.promptId && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  requireReply(
                    await window.tapkit.answerLogin(options(), {
                      loginId: login.loginId,
                      promptId: login.promptId!,
                      value: callback,
                    }),
                  );
                  setCallback('');
                });
              }}
            >
              <label htmlFor="oauth-callback">{text.auth.callback}</label>
              <div className="auth-toolbar">
                <input
                  id="oauth-callback"
                  type="password"
                  autoComplete="off"
                  value={callback}
                  onChange={(event) => setCallback(event.target.value)}
                />
                <button
                  aria-label={text.auth.submit}
                  title={text.auth.submit}
                  disabled={busy || !callback}
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}
        </div>
      )}
      {login && login.status !== 'waiting' && (
        <p role="status">
          {login.status === 'completed'
            ? text.auth.signedIn
            : login.status === 'cancelled'
              ? text.auth.cancelled
              : text.auth.loginFailed}
        </p>
      )}
      <div className="account-list">
        {!accounts.length && (
          <p role="status" data-testid="codex-empty">
            {text.auth.unconfigured}
          </p>
        )}
        {accounts.map((account) => (
          <div className="account-row" key={account.accountId}>
            <div>
              <strong>{account.label}</strong>
              <p>
                {account.hasCredential === false ? text.auth.unconfigured : status[account.status]}
              </p>
            </div>
            <select
              aria-label={text.auth.model}
              value={
                selected[account.accountId] ??
                models.find((model) => model.accountId === account.accountId)?.modelId ??
                ''
              }
              onChange={(event) =>
                setSelected((current) => ({ ...current, [account.accountId]: event.target.value }))
              }
              disabled={busy || checking === account.accountId || account.hasCredential === false}
            >
              {models
                .filter((model) => model.accountId === account.accountId)
                .map((model) => (
                  <option value={model.modelId} key={model.modelId}>
                    {model.displayName}
                    {model.verification === 'probed' ? ' (' + text.auth.verified + ')' : ''}
                  </option>
                ))}
            </select>
            <button
              disabled={
                busy ||
                checking !== undefined ||
                login?.status === 'waiting' ||
                account.hasCredential === false
              }
              onClick={() => void check(account)}
            >
              <RefreshCw size={16} />
              {checking === account.accountId ? text.auth.checking : text.auth.check}
            </button>
            <button
              disabled={busy || checking !== undefined}
              onClick={() => void disconnect(account)}
            >
              {account.hasCredential === false ? <X size={16} /> : <LogOut size={16} />}
              {disconnecting === account.accountId
                ? account.hasCredential === false
                  ? text.auth.clearingAccount
                  : text.auth.disconnecting
                : account.hasCredential === false
                  ? text.auth.clearAccount
                  : text.auth.disconnect}
            </button>
          </div>
        ))}
      </div>
      {probe && <p role="status">{probe}</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
