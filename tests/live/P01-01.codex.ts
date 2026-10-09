import { app } from 'electron';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { AuthSecrets } from '../../apps/desktop/src/main/auth/secrets';
import {
  AccountCredentialStore,
  CodexAdapter,
  CodexCredentialSchema,
  configureProviderNetwork,
  type NativeStateStore,
} from '../../packages/providers/src';
import {
  z,
  IdSchema,
  ErrorCodeSchema,
  type ModelEvent,
  type ModelRequest,
  type CanonicalMessage,
} from '../../packages/contracts/src';
import type { Store } from '../../packages/storage/src';
// The runner is emitted two levels below the root and shares the built SQLite boundary.
const { openStore, newId } = createRequire(__filename)(
  '../../packages/storage/dist/index.cjs',
) as typeof import('../../packages/storage/src');

const directory = process.env.TAPKIT_LIVE_DATA_DIR;
const phase = process.argv[process.argv.indexOf('--phase') + 1];
const Checkpoint = z.strictObject({
  schemaVersion: z.literal(1),
  accountId: IdSchema,
  modelId: z.string().min(1).max(160),
  expiredVersion: z.number().int().positive(),
  pid: z.number().int().positive(),
  checks: z.tuple([
    z.literal('text'),
    z.literal('two-turn-native'),
    z.literal('echo'),
    z.literal('cancel'),
  ]),
});
if (
  !directory ||
  process.env.TAPKIT_CODEX_LIVE_R01 !== '1' ||
  !['conversation', 'restart-refresh'].includes(phase ?? '')
)
  app.exit(2);
else {
  app.setName('TapKit');
  app.setPath('userData', directory);
  if (!app.requestSingleInstanceLock()) app.exit(2);
  else void app.whenReady().then(() => validate(directory));
}
async function validate(directory: string) {
  let store: Store | undefined;
  const secrets = new AuthSecrets(join(directory, 'secrets'));
  const checkpointPath = join(directory, 'P01-01-live-checkpoint.json');
  const checks: string[] = [];
  let stage = 'profile';
  let exitCode = 1;
  try {
    configureProviderNetwork();
    store = await openStore(directory);
    const rows = store.db
      .prepare(
        "SELECT id FROM provider_accounts WHERE profile_id=? AND provider_id='codex-subscription' AND deleted_at IS NULL",
      )
      .all(store.profileId) as { id: string }[];
    if (rows.length !== 1) throw new Error('AUTH_REQUIRED');
    const accountId = rows[0]!.id;
    const hashes = new Map<string, string>();
    const native: NativeStateStore = {
      save: async (binding, value) => {
        const ref = newId();
        const saved = (await secrets.invoke('native.save', accountId, { ref, binding, value })) as {
          contentHash: string;
        };
        hashes.set(ref, saved.contentHash);
        return ref;
      },
      load: async (ref, binding) =>
        secrets.invoke('native.load', accountId, { ref, binding, contentHash: hashes.get(ref) }),
    };
    const credentials = () =>
      new AccountCredentialStore({
        read: async () => {
          const value = z
            .strictObject({
              version: z.number().int().nonnegative(),
              credential: CodexCredentialSchema.optional(),
            })
            .parse(await secrets.invoke('credential.read', accountId, {}));
          return {
            version: value.version,
            ...(value.credential ? { credential: value.credential } : {}),
          };
        },
        write: async (expectedVersion, credential) => {
          await secrets.invoke('credential.write', accountId, {
            expectedVersion,
            ...(credential ? { credential } : {}),
          });
        },
      });
    const adapter = new CodexAdapter(accountId, credentials(), native);
    if (!(await adapter.credentials.read('openai-codex'))) throw new Error('AUTH_REQUIRED');
    const candidates = await adapter.listModels(accountId, new AbortController().signal);
    const checkpoint =
      phase === 'restart-refresh'
        ? Checkpoint.parse(JSON.parse(await readFile(checkpointPath, 'utf8')))
        : undefined;
    if (checkpoint && (checkpoint.accountId !== accountId || checkpoint.pid === process.pid))
      throw new Error('VALIDATION_ERROR');
    const modelId =
      checkpoint?.modelId ??
      process.env.TAPKIT_LIVE_MODEL ??
      candidates.find((model) => model.modelId === 'gpt-5.5')?.modelId ??
      candidates[0]?.modelId;
    if (!modelId || !candidates.some((model) => model.modelId === modelId))
      throw new Error('MODEL_UNSUPPORTED');
    const request: ModelRequest = {
      accountId,
      model: { providerId: 'codex-subscription', modelId },
      logicalCallId: newId(),
      attemptId: newId(),
      branchId: newId(),
      taskVersion: 1,
      systemModules: [{ id: 'live-test', text: 'Follow the test instructions exactly.' }],
      messages: [{ role: 'user', text: 'Reply only TAPKIT_OK.' }],
      tools: [],
      outputLimit: 128,
      reasoning: 'off',
    };
    async function complete() {
      let text = '',
        nativeStateRef: string | undefined;
      const calls: NonNullable<Extract<CanonicalMessage, { role: 'assistant' }>['calls']> = [];
      for await (const event of adapter.stream(request, AbortSignal.timeout(90_000))) {
        if (event.type === 'error') throw new Error(event.error.code);
        if (event.type === 'text_delta') text += event.text;
        if (event.type === 'tool_end')
          calls.push({
            id: event.callId,
            name: event.name,
            arguments: event.arguments as Record<string, unknown>,
          });
        if (event.type === 'finish') nativeStateRef = event.nativeStateRef;
      }
      if (!nativeStateRef) throw new Error('STREAM_INTERRUPTED');
      request.nativeStateRef = nativeStateRef;
      request.messages.push({ role: 'assistant', text, calls });
      request.logicalCallId = newId();
      request.attemptId = newId();
      return { text, calls };
    }
    if (phase === 'conversation') {
      stage = 'text';
      if (!(await complete()).text.includes('TAPKIT_OK')) throw new Error('VALIDATION_ERROR');
      checks.push(stage);
      stage = 'two-turn-native';
      request.messages.push({
        role: 'user',
        text: 'Repeat the exact marker from your previous answer.',
      });
      if (!(await complete()).text.includes('TAPKIT_OK')) throw new Error('VALIDATION_ERROR');
      checks.push(stage);
      stage = 'echo';
      request.tools = [
        {
          name: 'echo',
          description: 'Echo the text.',
          parameters: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
            additionalProperties: false,
          },
        },
      ];
      request.messages.push({
        role: 'user',
        text: 'Call echo with text TAPKIT_ECHO. Do not answer in plain text.',
      });
      const proposed = await complete();
      const call = proposed.calls[0];
      if (
        proposed.calls.length !== 1 ||
        call?.name !== 'echo' ||
        call.arguments.text !== 'TAPKIT_ECHO'
      )
        throw new Error('VALIDATION_ERROR');
      request.tools = [];
      request.messages.push(
        { role: 'tool', callId: call.id, name: 'echo', text: 'TAPKIT_ECHO', isError: false },
        { role: 'user', text: 'Reply with the tool result only.' },
      );
      if (!(await complete()).text.includes('TAPKIT_ECHO')) throw new Error('VALIDATION_ERROR');
      checks.push(stage);
      stage = 'cancel';
      const controller = new AbortController();
      const cancelRequest: ModelRequest = {
        ...request,
        messages: [
          ...request.messages,
          { role: 'user', text: 'Write a long numbered list of 500 items. Begin immediately.' },
        ],
        outputLimit: 1024,
      };
      const events: ModelEvent[] = [];
      for await (const event of adapter.stream(
        cancelRequest,
        AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]),
      )) {
        events.push(event);
        if (event.type === 'text_delta' && event.text) controller.abort();
      }
      if (
        !events.some((event) => event.type === 'text_delta' && event.text) ||
        !events.some((event) => event.type === 'error' && event.error.code === 'CANCELLED') ||
        events.some((event) => event.type === 'finish' || event.type === 'tool_end')
      )
        throw new Error('VALIDATION_ERROR');
      checks.push(stage);
      stage = 'prepare-restart';
      const before = z
        .strictObject({ version: z.number(), credential: CodexCredentialSchema })
        .parse(await secrets.invoke('credential.read', accountId, {}));
      await secrets.invoke('credential.write', accountId, {
        expectedVersion: before.version,
        credential: { ...before.credential, expires: 0 },
      });
      await secrets.settled;
      await writeFile(
        checkpointPath,
        JSON.stringify(
          Checkpoint.parse({
            schemaVersion: 1,
            accountId,
            modelId,
            expiredVersion: before.version + 1,
            pid: process.pid,
            checks,
          }),
        ),
        { mode: 0o600 },
      );
      console.info(JSON.stringify({ taskId: 'P01-01', status: 'ready_for_restart', checks }));
      exitCode = 0;
      return;
    }
    stage = 'restart-refresh';
    if (!checkpoint) throw new Error('VALIDATION_ERROR');
    checks.push(...checkpoint.checks);
    const before = z
      .strictObject({ version: z.number(), credential: CodexCredentialSchema })
      .parse(await secrets.invoke('credential.read', accountId, {}));
    if (before.version !== checkpoint.expiredVersion || before.credential.expires !== 0)
      throw new Error('VALIDATION_ERROR');
    await adapter.models.getAuth('openai-codex');
    const refreshed = z
      .strictObject({ version: z.number(), credential: CodexCredentialSchema })
      .parse(await secrets.invoke('credential.read', accountId, {}));
    if (
      refreshed.version <= checkpoint.expiredVersion ||
      refreshed.credential.expires <= Date.now()
    )
      throw new Error('AUTH_EXPIRED');
    request.messages = [{ role: 'user', text: 'Reply only TAPKIT_REFRESH_OK.' }];
    if (!(await complete()).text.includes('TAPKIT_REFRESH_OK')) throw new Error('VALIDATION_ERROR');
    checks.push(stage);
    await unlink(checkpointPath);
    stage = 'logout';
    await adapter.models.logout('openai-codex');
    const after = (await secrets.invoke('credential.read', accountId, {})) as {
      credential?: unknown;
    };
    if (after.credential) throw new Error('VALIDATION_ERROR');
    const loggedOut: ModelEvent[] = [];
    for await (const event of adapter.stream(request, AbortSignal.timeout(10_000)))
      loggedOut.push(event);
    if (!loggedOut.some((event) => event.type === 'error' && event.error.code === 'AUTH_REQUIRED'))
      throw new Error('VALIDATION_ERROR');
    store.db
      .prepare(
        "UPDATE provider_accounts SET status='unconfigured',revision=revision+1,updated_at=?,deleted_at=? WHERE id=?",
      )
      .run(Date.now(), Date.now(), accountId);
    store.db
      .prepare('UPDATE opaque_states SET deleted_at=? WHERE account_id=?')
      .run(Date.now(), accountId);
    checks.push(stage);
    console.info(JSON.stringify({ taskId: 'P01-01', status: 'passed', checks }));
    exitCode = 0;
  } catch (error) {
    const code = ErrorCodeSchema.safeParse(error instanceof Error ? error.message : undefined);
    console.error(
      JSON.stringify({
        taskId: 'P01-01',
        status: 'failed',
        stage,
        checks,
        errorCode: code.success ? code.data : 'PROVIDER_UNAVAILABLE',
      }),
    );
  } finally {
    await secrets.settled;
    store?.close();
    app.exit(exitCode);
  }
}
