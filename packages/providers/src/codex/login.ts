import type { AuthPrompt, Models } from '@earendil-works/pi-ai';
import type { StartLogin, LoginView } from '@tapkit/contracts';

export function assertAuthUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.origin !== 'https://auth.openai.com' ||
    url.username ||
    url.password ||
    !['/oauth/authorize', '/codex/device'].includes(url.pathname)
  )
    throw new Error('PERMISSION_DENIED');
  return url;
}
export class CodexLogin {
  readonly controller = new AbortController();
  private state: string | undefined;
  private prompt:
    { id: string; resolve: (value: string) => void; reject: (error: Error) => void } | undefined;
  private readonly timer;
  readonly view: LoginView;
  readonly completed: Promise<void>;
  constructor(
    readonly loginId: string,
    input: StartLogin,
    models: Models,
    private readonly id: () => string,
    private readonly openBrowser: (url: string) => Promise<void>,
    private readonly finish: () => Promise<void>,
  ) {
    this.view = { loginId, status: 'waiting', browserOpened: false };
    this.timer = setTimeout(() => this.cancel(), 15 * 60_000);
    this.completed = this.run(input, models).finally(() => {
      clearTimeout(this.timer);
      this.controller.abort();
      this.clearPrompt();
    });
  }
  private clearPrompt() {
    this.prompt?.reject(new Error('CANCELLED'));
    this.prompt = undefined;
    delete this.view.promptId;
    delete this.view.promptKind;
  }
  private async ask(prompt: AuthPrompt, method: StartLogin['method']) {
    this.controller.signal.throwIfAborted();
    if (prompt.type === 'select') return method;
    if (prompt.type !== 'manual_code') throw new Error('MODEL_UNSUPPORTED');
    const signal = prompt.signal
      ? AbortSignal.any([this.controller.signal, prompt.signal])
      : this.controller.signal;
    const promptId = this.id();
    this.view.promptId = promptId;
    this.view.promptKind = 'manual_callback';
    return new Promise<string>((resolve, reject) => {
      const onAbort = () => {
        this.clearPrompt();
      };
      const settle = (fn: () => void) => {
        signal.removeEventListener('abort', onAbort);
        delete this.view.promptId;
        delete this.view.promptKind;
        this.prompt = undefined;
        fn();
      };
      this.prompt = {
        id: promptId,
        resolve: (value) => settle(() => resolve(value)),
        reject: (error) => settle(() => reject(error)),
      };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  }
  private async run(input: StartLogin, models: Models) {
    try {
      const host = process.env.PI_OAUTH_CALLBACK_HOST;
      if (host && !['127.0.0.1', 'localhost', '::1'].includes(host))
        throw new Error('PERMISSION_DENIED');
      let browser: Promise<void> = Promise.resolve();
      await models.login('openai-codex', 'oauth', {
        signal: this.controller.signal,
        prompt: (prompt) => this.ask(prompt, input.method),
        notify: (event) => {
          if (event.type === 'auth_url') {
            this.state = assertAuthUrl(event.url).searchParams.get('state') ?? undefined;
            if (!this.state) throw new Error('VALIDATION_ERROR');
            browser = this.openBrowser(event.url)
              .then(() => {
                this.view.browserOpened = true;
              })
              .catch(() => {
                this.view.browserOpened = false;
              });
          } else if (event.type === 'device_code') {
            assertAuthUrl(event.verificationUri);
            this.view.deviceCode = event.userCode;
            browser = this.openBrowser(event.verificationUri)
              .then(() => {
                this.view.browserOpened = true;
              })
              .catch(() => {
                this.view.browserOpened = false;
              });
          }
        },
      });
      await browser;
      this.controller.signal.throwIfAborted();
      await this.finish();
      this.controller.signal.throwIfAborted();
      this.view.status = 'completed';
    } catch {
      this.view.status = this.controller.signal.aborted ? 'cancelled' : 'failed';
      this.view.errorCode = this.controller.signal.aborted ? 'CANCELLED' : 'AUTH_REQUIRED';
    } finally {
      delete this.view.deviceCode;
      this.state = undefined;
    }
  }
  answer(promptId: string, value: string) {
    if (this.view.status !== 'waiting' || !this.prompt || this.prompt.id !== promptId)
      throw new Error('CONFLICT');
    const url = new URL(value);
    if (
      url.origin !== 'http://localhost:1455' ||
      url.pathname !== '/auth/callback' ||
      url.username ||
      url.password ||
      !url.searchParams.get('code') ||
      !this.state ||
      url.searchParams.get('state') !== this.state ||
      url.searchParams.getAll('state').length !== 1 ||
      url.searchParams.getAll('code').length !== 1
    )
      throw new Error('VALIDATION_ERROR');
    this.prompt.resolve(url.href);
  }
  cancel() {
    this.controller.abort();
    this.clearPrompt();
  }
  snapshot() {
    return structuredClone(this.view);
  }
}
