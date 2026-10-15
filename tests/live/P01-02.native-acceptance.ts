import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProviderService, type PrivateVault } from '../../packages/core/src/provider-service';
import { ModelService } from '../../packages/core/src/model-service';
import { API_ADAPTER_VERSION } from '../../packages/providers/src/api/adapter';
import { IdSchema, ErrorCodeSchema, z, type CanonicalMessage } from '../../packages/contracts/src';
import { createRequire } from 'node:module';
import type { Store } from '../../packages/storage/src';
import { nativeSelectionHash, type NativeSelection } from './P01-02.native-profile';

const { newId } = createRequire(__filename)(
  '../../packages/storage/dist/index.cjs',
) as typeof import('../../packages/storage/src');

export const NATIVE_FIRST_PROMPT = 'Reply only TAPKIT_NATIVE_OK.';
export const NATIVE_SECOND_PROMPT = 'Repeat the exact marker from your previous answer only.';
const CheckpointSchema = z.strictObject({
  schemaVersion: z.literal(1),
  caseId: z.string().uuid(),
  selectionHash: z.string().regex(/^[a-f0-9]{64}$/),
  profileId: IdSchema,
  rootRunId: IdSchema,
  branchId: IdSchema,
  firstCallId: IdSchema,
  firstInstanceId: z.string().uuid(),
  firstPid: z.number().int().positive(),
  state: z.enum(['saving', 'saved', 'resuming', 'completed', 'failed']),
  nativeRef: IdSchema.optional(),
});
export function safeNativeError(error: unknown) {
  const code = ErrorCodeSchema.safeParse(
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : error instanceof Error
        ? error.message
        : undefined,
  );
  return code.success ? code.data : 'INTERNAL_ERROR';
}
export async function runNativePhase(options: {
  store: Store;
  selection: NativeSelection;
  vault: PrivateVault;
  reportDir: string;
  caseId: string;
  phase: 'save' | 'resume';
  configure?: (providers: ProviderService) => void;
}) {
  const { store, selection, vault, reportDir, caseId, phase } = options;
  const instanceId = randomUUID();
  const selectionHash = nativeSelectionHash(selection);
  const checkpointPath = join(reportDir, 'checkpoint.json');
  let duringStream = false,
    nativeLoads = 0,
    nativeSaves = 0,
    keyReads = 0;
  let stage = 'checkpoint',
    diagnosticCode: string | undefined;
  const providers = new ProviderService(store, async (operation, accountId, payload) => {
    const result = await vault(operation, accountId, payload);
    if (operation === 'native.load' && duringStream) nativeLoads++;
    if (operation === 'native.save' && duringStream) nativeSaves++;
    if (operation === 'api-key.read') keyReads++;
    return result;
  });
  let models: ModelService | undefined;
  let attemptId: string | undefined;
  const report = {
    schemaVersion: 1,
    task: 'P01-02',
    modelId: selection.config.modelId,
    apiFormat: selection.config.apiFormat,
    adapterVersion: API_ADAPTER_VERSION,
    nativeStorage: 'host-dpapi',
    nodeVersion: process.version,
    electronVersion: process.versions.electron ?? null,
    platform: process.platform,
    caseId,
    phase,
    checkedAt: new Date().toISOString(),
    pid: process.pid,
    instanceId,
    status: 'failed',
    stage,
    errorCode: null as string | null,
    diagnosticCode: null as string | null,
    actualProcessRestart: false,
    encryptedCanonicalRestored: false,
    nativeRefSupplied: false,
    nativeReuseConfirmed: false,
    nativeLoadsDuringAdapter: 0,
    nativeSaves: 0,
    attempts: 0,
    retries: 0,
    tools: 0,
    maximumOutputTokens: 128,
    resultMarkerMatched: false,
    encryptedFileExists: false,
    plaintextMarkerAbsent: false,
    ledgerVerified: false,
    ledgerScope: 'same-isolated-application-profile',
    usage: null as null | {
      source: string;
      chargedTokens: number;
      inputTokens: number | null;
      outputTokens: number | null;
    },
    reservationsReleased: false,
    duplicateSettlements: 0,
    privateKeyReadsInsideHost: 0,
    settingsChanged: false,
    automaticTitleOrMemoryRequests: 0,
  };
  try {
    if (selection.profileId !== store.profileId) throw new Error('CONFLICT');
    let checkpoint;
    let messages: CanonicalMessage[];
    if (phase === 'save') {
      checkpoint = CheckpointSchema.parse({
        schemaVersion: 1,
        caseId,
        selectionHash,
        profileId: store.profileId,
        rootRunId: newId(),
        branchId: newId(),
        firstCallId: newId(),
        firstInstanceId: instanceId,
        firstPid: process.pid,
        state: 'saving',
      });
      // Exclusive creation prevents a failed/unknown first request from being silently replayed.
      await writeFile(checkpointPath, JSON.stringify(checkpoint), { flag: 'wx' });
      messages = [{ role: 'user', text: NATIVE_FIRST_PROMPT }];
    } else {
      checkpoint = CheckpointSchema.parse(JSON.parse(await readFile(checkpointPath, 'utf8')));
      if (
        checkpoint.caseId !== caseId ||
        checkpoint.selectionHash !== selectionHash ||
        checkpoint.profileId !== store.profileId ||
        checkpoint.state !== 'saved' ||
        !checkpoint.nativeRef ||
        checkpoint.firstInstanceId === instanceId ||
        checkpoint.firstPid === process.pid
      )
        throw new Error('CONFLICT');
      report.actualProcessRestart = true;
      // Consume before any request. A crash during resume remains unknown and must not be resent.
      checkpoint.state = 'resuming';
      await writeFile(checkpointPath, JSON.stringify(checkpoint));
      stage = 'encrypted-restore';
      const row = store.db
        .prepare(
          `SELECT content_hash,account_id,model_ref,adapter_version,branch_id
        FROM opaque_states WHERE id=? AND profile_id=? AND deleted_at IS NULL`,
        )
        .get(checkpoint.nativeRef, store.profileId) as
        | {
            content_hash: string;
            account_id: string;
            model_ref: string;
            adapter_version: string;
            branch_id: string;
          }
        | undefined;
      const version =
        API_ADAPTER_VERSION +
        ':' +
        selection.config.apiFormat +
        ':' +
        createHash('sha256').update(selection.config.baseURL).digest('hex');
      const first = store.db
        .prepare(
          `SELECT a.native_state_ref FROM provider_attempts a
        JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.logical_call_id=?
        AND a.root_run_id=? AND a.status='completed'`,
        )
        .get(checkpoint.firstCallId, checkpoint.rootRunId) as
        { native_state_ref: string } | undefined;
      if (
        !row ||
        row.account_id !== selection.accountId ||
        row.model_ref !== selection.config.modelId ||
        row.adapter_version !== version ||
        row.branch_id !== checkpoint.branchId ||
        first?.native_state_ref !== checkpoint.nativeRef
      )
        throw new Error('PERMISSION_DENIED');
      const value = await vault('native.load', selection.accountId, {
        ref: checkpoint.nativeRef,
        contentHash: row.content_hash,
        binding: {
          accountId: selection.accountId,
          modelId: row.model_ref,
          adapterVersion: version,
          branchId: checkpoint.branchId,
        },
      });
      const restored = z
        .object({
          canonical: z.tuple([
            z.strictObject({ role: z.literal('user'), text: z.literal(NATIVE_FIRST_PROMPT) }),
            z.strictObject({ role: z.literal('assistant'), text: z.string().min(1).max(256) }),
          ]),
        })
        .parse(value);
      if (restored.canonical[1].text.trim() !== 'TAPKIT_NATIVE_OK')
        throw new Error('VALIDATION_ERROR');
      report.encryptedCanonicalRestored = true;
      messages = [...restored.canonical, { role: 'user', text: NATIVE_SECOND_PROMPT }];
    }
    stage = 'routing';
    options.configure?.(providers);
    models = new ModelService(store, providers);
    const effective = models.effective(undefined, {
      selection: { accountId: selection.accountId, modelId: selection.config.modelId },
      onlyThisModel: true,
      mode: 'quick',
      reasoning: 'off',
    }).values;
    const logicalCallId = phase === 'save' ? checkpoint.firstCallId : newId();
    const signal = AbortSignal.timeout(90_000);
    let text = '',
      nativeRef: string | undefined,
      finished = false;
    duringStream = true;
    report.nativeRefSupplied = phase === 'resume';
    for await (const event of models.router.stream(
      {
        logicalCallId,
        runId: checkpoint.rootRunId,
        rootRunId: checkpoint.rootRunId,
        mode: 'chat',
        singleAttempt: true,
        preferences: effective,
        allowedAccounts: new Set([selection.accountId]),
        ...(phase === 'resume'
          ? { nativeOrigin: { accountId: selection.accountId, modelId: selection.config.modelId } }
          : {}),
        need: { inputTokens: 2048, outputTokens: 128, attachments: 0, needsTools: false },
        request: {
          messages,
          systemModules: [],
          tools: [],
          outputLimit: 128,
          branchId: checkpoint.branchId,
          taskVersion: 1,
          ...(phase === 'resume' ? { nativeStateRef: checkpoint.nativeRef! } : {}),
        },
      },
      signal,
    )) {
      if (event.type === 'attempt') {
        report.attempts++;
        attemptId = event.attemptId;
      }
      if (event.type === 'route.error') {
        diagnosticCode = event.error.diagnosticCode;
        throw new Error(event.error.code);
      }
      if (event.type !== 'model.event') continue;
      if (event.event.type === 'text_delta') {
        text += event.event.text;
        if (Buffer.byteLength(text) > 1024) throw new Error('OUTPUT_LIMIT_REACHED');
      }
      if (event.event.type === 'finish') {
        finished = event.event.reason === 'stop';
        nativeRef = event.event.nativeStateRef;
      }
      if (event.event.type === 'tool_end') throw new Error('PERMISSION_DENIED');
    }
    duringStream = false;
    report.resultMarkerMatched = text.trim() === 'TAPKIT_NATIVE_OK';
    if (
      !finished ||
      !nativeRef ||
      !report.resultMarkerMatched ||
      report.attempts !== 1 ||
      nativeSaves !== 1 ||
      (phase === 'resume' && nativeLoads !== 1)
    )
      throw new Error('STREAM_INTERRUPTED');
    stage = 'ciphertext';
    report.nativeReuseConfirmed = phase === 'resume' && nativeLoads === 1;
    const bytes = await readFile(join(store.dataDir, 'secrets', 'opaque-' + nativeRef));
    try {
      report.encryptedFileExists = bytes.length > 0;
      report.plaintextMarkerAbsent = !bytes.includes(Buffer.from('TAPKIT_NATIVE_OK'));
    } finally {
      bytes.fill(0);
    }
    if (!report.encryptedFileExists || !report.plaintextMarkerAbsent)
      throw new Error('PERMISSION_DENIED');
    stage = 'ledger';
    const usage = store.db
      .prepare(
        `SELECT source,charged_tokens chargedTokens,input_tokens inputTokens,output_tokens outputTokens
      FROM usage_ledger WHERE provider_attempt_id=?`,
      )
      .all(attemptId) as NonNullable<typeof report.usage>[];
    if (usage.length !== 1) throw new Error('CONFLICT');
    report.usage = usage[0]!;
    report.ledgerVerified = true;
    checkpoint.state = phase === 'save' ? 'saved' : 'completed';
    if (phase === 'save') checkpoint.nativeRef = nativeRef;
    await writeFile(checkpointPath, JSON.stringify(checkpoint));
    report.status = 'passed';
    stage = 'completed';
  } catch (error) {
    report.errorCode = safeNativeError(error);
    report.diagnosticCode = diagnosticCode ?? null;
  } finally {
    duringStream = false;
    await models?.stop();
    await providers.stop();
    report.stage = stage;
    report.nativeLoadsDuringAdapter = nativeLoads;
    report.nativeSaves = nativeSaves;
    report.privateKeyReadsInsideHost = keyReads;
    report.reservationsReleased = !store.db
      .prepare('SELECT 1 FROM budgets WHERE reserved_tokens<>0 LIMIT 1')
      .get();
    report.duplicateSettlements = (
      store.db
        .prepare(
          `SELECT count(*) n FROM
      (SELECT provider_attempt_id FROM usage_ledger GROUP BY provider_attempt_id HAVING count(*)>1)`,
        )
        .get() as { n: number }
    ).n;
    if (!report.reservationsReleased || report.duplicateSettlements) {
      report.status = 'failed';
      report.errorCode = 'CONFLICT';
    }
    // Preserve a settled failed attempt's usage in its failure report too.
    if (!report.usage && attemptId) {
      report.usage = store.db
        .prepare(
          `SELECT source,charged_tokens chargedTokens,input_tokens inputTokens,output_tokens outputTokens
        FROM usage_ledger WHERE provider_attempt_id=?`,
        )
        .get(attemptId) as typeof report.usage;
      report.ledgerVerified = Boolean(report.usage);
    }
    await writeFile(
      join(reportDir, phase + '-report.json'),
      JSON.stringify(report, null, 2) + '\n',
      { flag: 'wx' },
    );
  }
  return report;
}
