// Read-only Host audit: expose schema error paths only, never native wire text,
// reasoning, API credentials, or argument values. No provider request is made.
import { app } from 'electron';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { AuthSecrets } from '../../apps/desktop/src/main/auth/secrets';
import { WorkToolArgsSchema } from '../../packages/contracts/src';

async function main() {
  const round = process.argv[2];
  if (!round || !/^[a-f0-9-]{36}$/.test(round)) throw Error('PERMISSION_DENIED');
  const root = process.cwd(),
    manifest = JSON.parse(
      readFileSync(join(root, '.test-data/P07-ui-live-' + round + '.json'), 'utf8'),
    ),
    directory = realpathSync(manifest.directory),
    out = realpathSync(manifest.out);
  if (
    dirname(directory) !== resolve('.test-data') ||
    !basename(directory).startsWith('P07-02-live-profile-') ||
    dirname(out) !== resolve('docs/evidence/P07-02') ||
    !basename(out).endsWith(round)
  )
    throw Error('PERMISSION_DENIED');
  const marker = JSON.parse(readFileSync(join(directory, 'P07.live-profile.json'), 'utf8'));
  if (!marker.closed) throw Error('ACTIVE_PROFILE_REFUSED');
  const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
  const runId = report.tasks.find((t: { kind: string }) => t.kind.startsWith('slides'))?.runId;
  app.setName('TapKit');
  app.setPath('userData', directory);
  if (!app.requestSingleInstanceLock()) throw Error('CONFLICT');
  await app.whenReady();
  const db = new DatabaseSync(join(directory, 'db/app.sqlite'), { readOnly: true });
  try {
    const row = db
      .prepare(
        "SELECT p.native_state_ref ref,o.account_id,o.model_ref,o.adapter_version,o.branch_id,o.content_hash FROM provider_attempts p JOIN opaque_states o ON o.id=p.native_state_ref WHERE p.run_id=? AND p.status='completed'",
      )
      .get(runId) as
      | {
          ref: string;
          account_id: string;
          model_ref: string;
          adapter_version: string;
          branch_id: string;
          content_hash: string;
        }
      | undefined;
    if (!row) throw Error('COMPLETED_STATE_MISSING');
    const value = (await new AuthSecrets(join(directory, 'secrets')).invoke(
      'native.load',
      row.account_id,
      {
        ref: row.ref,
        binding: {
          accountId: row.account_id,
          modelId: row.model_ref,
          adapterVersion: row.adapter_version,
          branchId: row.branch_id,
        },
        contentHash: row.content_hash,
      },
    )) as {
      canonical: Array<{
        role: string;
        calls?: Array<{ name: string; arguments: Record<string, unknown> }>;
      }>;
    };
    const assistant = value.canonical.at(-1);
    if (assistant?.role !== 'assistant') throw Error('ASSISTANT_MISSING');
    const audit = {
      networkRequests: 0,
      credentialReads: 0,
      calls: (assistant.calls ?? []).map((c) => {
        const parsed = WorkToolArgsSchema.safeParse({ tool: c.name, ...c.arguments });
        return {
          tool: c.name,
          valid: parsed.success,
          argumentKeys: Object.keys(c.arguments).filter((k) => /^[a-zA-Z_]+$/.test(k)),
          nameEndsPptx: typeof c.arguments.name === 'string' && c.arguments.name.endsWith('.pptx'),
          issues: parsed.success
            ? []
            : parsed.error.issues.map((i) => ({
                code: i.code,
                path: i.path.filter(
                  (p) => typeof p === 'number' || (typeof p === 'string' && /^[a-zA-Z_]+$/.test(p)),
                ),
              })),
        };
      }),
    };
    writeFileSync(join(out, 'validation-audit.json'), JSON.stringify(audit, null, 2) + '\n', {
      flag: 'wx',
    });
    console.log(JSON.stringify(audit));
  } finally {
    db.close();
  }
}
main().then(
  () => app.exit(0),
  () => {
    console.log(JSON.stringify({ status: 'failed', code: 'READ_ONLY_AUDIT_FAILED' }));
    app.exit(1);
  },
);
