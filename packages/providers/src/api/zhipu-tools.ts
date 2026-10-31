import { ApiFailure } from './http';

// Canonical names remain unchanged in Core, permissions, tool results and storage.
// The official Chat API FunctionObject.name pattern excludes dots.
const aliases: Readonly<Record<string, string>> = Object.freeze({
  'files.read': 'files_read',
  'history.search': 'history_search',
  'knowledge.query': 'knowledge_query',
  'artifact.write': 'artifact_write',
  'document.create': 'document_create',
  'document.revise': 'document_revise',
  'document.fields': 'document_fields',
  'workspace.patch': 'workspace_patch',
  'python.analyze': 'python_analyze',
  'data.analyze': 'data_analyze',
  'slides.create': 'slides_create',
  'slides.revise': 'slides_revise',
  'office.convert': 'office_convert',
  'browser.open': 'browser_open',
  'browser.observe': 'browser_observe',
  'browser.act': 'browser_act',
  'user.ask': 'user_ask',
});

export function zhipuToolName(name: string): string {
  const wire = Object.hasOwn(aliases, name) ? aliases[name]! : name;
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(wire))
    throw new ApiFailure({ code: 'VALIDATION_ERROR', retryable: false });
  return wire;
}

export function zhipuToolNames(tools: { name: string }[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const tool of tools) {
    const wire = zhipuToolName(tool.name);
    if (names.has(wire)) throw new ApiFailure({ code: 'VALIDATION_ERROR', retryable: false });
    names.set(wire, tool.name);
  }
  return names;
}

// Apply to freshly converted AND loaded private prefixes. Re-encoding an alias
// is idempotent, so the existing native schema/binding remains compatible.
export function zhipuToolMessages(messages: Record<string, any>[]) {
  return messages.map((message) =>
    message.role === 'assistant' && Array.isArray(message.tool_calls)
      ? {
          ...message,
          tool_calls: message.tool_calls.map((call: Record<string, any>) => ({
            ...call,
            function: { ...call.function, name: zhipuToolName(call.function.name) },
          })),
        }
      : message,
  );
}
