import { readFileSync, writeFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../../..');
const current = JSON.parse(readFileSync(join(directory, 'tool-trace-current.json'), 'utf8'));
const original = JSON.parse(
  readFileSync(
    join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
    'utf8',
  ),
);
const uuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const allowedNames = [
  'echo',
  'files.read',
  'history.search',
  'knowledge.query',
  'files_read',
  'history_search',
  'knowledge_query',
];
const count = (value) => {
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000)
    throw Error('Invalid trace count');
  return value;
};
const oneOf = (value, values) => {
  if (!values.includes(value)) throw Error('Invalid trace enum');
  return value;
};
const list = (value, values, limit) => {
  if (!Array.isArray(value) || value.length > limit) throw Error('Invalid trace list');
  return value.map((v) => oneOf(v, values));
};
const dataDir = realpathSync(current.dataDir);
if (
  original.root !== root ||
  dataDir !== realpathSync(original.dataDir) ||
  !uuid(current.caseId) ||
  current.profileId !== '01a13376-d6a6-7ca5-90dd-a27bf8a7bf10'
)
  throw Error('Unexpected trace binding');
const path = join(dataDir, 'logs', 'tool-trace-' + current.caseId + '.jsonl');
if (
  current.tracePath !== path ||
  statSync(path).size > 1_050_000 ||
  dirname(realpathSync(path)) !== join(dataDir, 'logs')
)
  throw Error('Invalid trace path/size');
const rows = readFileSync(path, 'utf8')
  .trim()
  .split(/\r?\n/)
  .map((line) => JSON.parse(line));
if (
  !rows.length ||
  rows[0].kind !== 'opened' ||
  rows[0].caseId !== current.caseId ||
  rows[0].profileId !== current.profileId
)
  throw Error('Trace has no matching opened receipt');
const attempts = rows.slice(1).map((row) => {
  if (
    row.kind !== 'attempt' ||
    row.caseId !== current.caseId ||
    row.profileId !== current.profileId ||
    row.schemaVersion !== 1
  )
    throw Error('Unexpected trace row');
  const raw = row.trace;
  if (
    raw.schemaVersion !== 1 ||
    raw.format !== 'openai-chat' ||
    !uuid(raw.attemptId) ||
    typeof raw.request.fetchInvoked !== 'boolean'
  )
    throw Error('Invalid trace header');
  const request = {
    fetchInvoked: raw.request.fetchInvoked,
    toolCount: count(raw.request.toolCount),
    knownToolNames: list(raw.request.knownToolNames, allowedNames, allowedNames.length),
    otherToolCount: count(raw.request.otherToolCount),
    toolChoice: oneOf(raw.request.toolChoice, [
      'omitted',
      'auto',
      'none',
      'required',
      'function',
      'other',
    ]),
  };
  const source = raw.response;
  if (
    source.httpStatus !== null &&
    (!Number.isInteger(source.httpStatus) || source.httpStatus < 100 || source.httpStatus > 599)
  )
    throw Error('Invalid HTTP status');
  const response = {
    httpStatus: source.httpStatus,
    knownToolNames: list(source.knownToolNames, allowedNames, allowedNames.length),
    finishReasons: list(source.finishReasons, ['stop', 'tool_calls', 'length', 'other'], 4),
    outcome: oneOf(source.outcome, ['interrupted', 'finished', 'error', 'cancelled']),
  };
  for (const key of [
    'frames',
    'deltaToolItems',
    'messageToolItems',
    'legacyFunctionFrames',
    'textFrames',
    'otherToolNameItems',
    'deliveredToolEnds',
  ])
    response[key] = count(source[key]);
  const classification = !request.fetchInvoked
    ? 'fetch_not_invoked'
    : !request.knownToolNames.some((name) => ['history.search', 'history_search'].includes(name))
      ? 'history_tool_not_in_serialized_request'
      : response.deliveredToolEnds
        ? 'normalized_tool_event_delivered'
        : response.messageToolItems && !response.deltaToolItems
          ? 'unexpected_message_field_tool_call'
          : response.deltaToolItems || response.legacyFunctionFrames
            ? 'tool_proposal_not_delivered'
            : response.httpStatus === 200 && response.outcome === 'finished'
              ? 'no_standard_tool_proposal_in_received_frames'
              : 'request_failed_or_incomplete';
  return { attemptId: raw.attemptId, request, response, classification };
});
const report = {
  task: 'P02-02',
  checkedAt: new Date().toISOString(),
  caseId: current.caseId,
  opened: true,
  attempts,
  modelRequestsByReader: 0,
  secretOrMessageBodiesExported: false,
};
const output = join(directory, 'tool-trace-review-' + Date.now() + '.json');
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ reportPath: output, ...report }));
