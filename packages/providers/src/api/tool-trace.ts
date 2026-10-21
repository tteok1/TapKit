import { IdSchema, z } from '@tapkit/contracts';

const names = [
  'echo',
  'files.read',
  'history.search',
  'knowledge.query',
  'files_read',
  'history_search',
  'knowledge_query',
] as const;
const reasons = ['stop', 'tool_calls', 'length', 'other'] as const;
const count = z.number().int().min(0).max(1_000_000);
export const ZhipuToolTraceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  attemptId: IdSchema.nullable(),
  format: z.literal('openai-chat'),
  request: z.strictObject({
    fetchInvoked: z.boolean(),
    toolCount: count,
    knownToolNames: z.array(z.enum(names)).max(names.length),
    otherToolCount: count,
    toolChoice: z.enum(['omitted', 'auto', 'none', 'required', 'function', 'other']),
  }),
  response: z.strictObject({
    httpStatus: z.number().int().min(100).max(599).nullable(),
    frames: count,
    deltaToolItems: count,
    messageToolItems: count,
    legacyFunctionFrames: count,
    textFrames: count,
    knownToolNames: z.array(z.enum(names)).max(names.length),
    otherToolNameItems: count,
    finishReasons: z.array(z.enum(reasons)).max(reasons.length),
    deliveredToolEnds: count,
    outcome: z.enum(['interrupted', 'finished', 'error', 'cancelled']),
  }),
});
export type ZhipuToolTrace = z.infer<typeof ZhipuToolTraceSchema>;
export type ZhipuToolTraceSink = (trace: ZhipuToolTrace) => void;
type Json = Record<string, any>;
const bounded = (n: number) => Math.min(1_000_000, n);

// No raw strings, arguments, content, headers, URLs, native state or errors are retained.
export class ZhipuToolTraceRecorder {
  readonly summary: ZhipuToolTrace;
  constructor(
    attemptId: string,
    private readonly sink: ZhipuToolTraceSink,
  ) {
    this.summary = {
      schemaVersion: 1,
      attemptId: IdSchema.safeParse(attemptId).success ? attemptId : null,
      format: 'openai-chat',
      request: {
        fetchInvoked: false,
        toolCount: 0,
        knownToolNames: [],
        otherToolCount: 0,
        toolChoice: 'omitted',
      },
      response: {
        httpStatus: null,
        frames: 0,
        deltaToolItems: 0,
        messageToolItems: 0,
        legacyFunctionFrames: 0,
        textFrames: 0,
        knownToolNames: [],
        otherToolNameItems: 0,
        finishReasons: [],
        deliveredToolEnds: 0,
        outcome: 'interrupted',
      },
    };
  }
  prepared(body: Json) {
    const tools = Array.isArray(body.tools) ? body.tools : [];
    const known = new Set<(typeof names)[number]>();
    let other = 0;
    for (const tool of tools) {
      const name = tool?.function?.name;
      if (names.includes(name)) known.add(name);
      else other++;
    }
    this.summary.request = {
      fetchInvoked: true,
      toolCount: bounded(tools.length),
      knownToolNames: [...known],
      otherToolCount: bounded(other),
      toolChoice:
        body.tool_choice === undefined
          ? 'omitted'
          : ['auto', 'none', 'required'].includes(body.tool_choice)
            ? body.tool_choice
            : body.tool_choice?.type === 'function'
              ? 'function'
              : 'other',
    };
  }
  http(status: number) {
    this.summary.response.httpStatus = status >= 100 && status <= 599 ? status : null;
  }
  frame(event: Json) {
    const r = this.summary.response;
    r.frames = bounded(r.frames + 1);
    for (const choice of Array.isArray(event.choices) ? event.choices : []) {
      const deltaCalls = Array.isArray(choice?.delta?.tool_calls) ? choice.delta.tool_calls : [];
      const messageCalls = Array.isArray(choice?.message?.tool_calls)
        ? choice.message.tool_calls
        : [];
      r.deltaToolItems = bounded(r.deltaToolItems + deltaCalls.length);
      r.messageToolItems = bounded(r.messageToolItems + messageCalls.length);
      if (choice?.delta?.function_call || choice?.message?.function_call)
        r.legacyFunctionFrames = bounded(r.legacyFunctionFrames + 1);
      if (typeof choice?.delta?.content === 'string' && choice.delta.content.length)
        r.textFrames = bounded(r.textFrames + 1);
      for (const call of [...deltaCalls, ...messageCalls]) {
        const name = call?.function?.name;
        if (name === undefined || name === '') continue;
        if (names.includes(name)) {
          if (!r.knownToolNames.includes(name)) r.knownToolNames.push(name);
        } else r.otherToolNameItems = bounded(r.otherToolNameItems + 1);
      }
      if (choice?.finish_reason !== undefined && choice.finish_reason !== null) {
        const reason = reasons.includes(choice.finish_reason) ? choice.finish_reason : 'other';
        if (!r.finishReasons.includes(reason)) r.finishReasons.push(reason);
      }
    }
  }
  delivered() {
    this.summary.response.deliveredToolEnds = bounded(this.summary.response.deliveredToolEnds + 1);
  }
  finish() {
    this.summary.response.outcome = 'finished';
  }
  fail(cancelled: boolean) {
    this.summary.response.outcome = cancelled ? 'cancelled' : 'error';
  }
  publish() {
    try {
      this.sink(ZhipuToolTraceSchema.parse(this.summary));
    } catch {
      /* Optional diagnostics must not affect provider execution. */
    }
  }
}
