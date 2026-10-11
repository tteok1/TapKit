import { CONTEXT_LIMITS, type CanonicalMessage } from '@tapkit/contracts';

// Count the serialized provider input. Unknown tokenizers use a UTF-8 byte upper bound.
export function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableSerialize).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([k, v]) => JSON.stringify(k) + ':' + stableSerialize(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
export function countTokens(value: unknown, tokenizer?: (text: string) => number): number {
  const text = stableSerialize(value);
  const count = tokenizer?.(text);
  if (count !== undefined) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('VALIDATION_ERROR');
    return count;
  }
  return new TextEncoder().encode(text).byteLength;
}
export type BudgetLimits = {
  contextWindow: number | null;
  maxInput?: number | null;
  inputLimit: number;
  outputLimit: number;
  reasoningTokens?: number;
  reasoningIncludedInOutput?: boolean;
  nextToolTokens?: number;
  safetyTokens?: number;
  rootRemaining?: number;
};
export function budget(limits: BudgetLimits, inputTokens: number) {
  const reasoning = limits.reasoningIncludedInOutput ? 0 : (limits.reasoningTokens ?? 0);
  const safety = limits.safetyTokens ?? CONTEXT_LIMITS.safetyTokens;
  const nextTool = limits.nextToolTokens ?? CONTEXT_LIMITS.nextToolTokens;
  const window =
    limits.contextWindow ?? limits.inputLimit + limits.outputLimit + safety + nextTool + reasoning;
  const effective = Math.max(
    0,
    Math.min(
      limits.inputLimit,
      limits.maxInput ?? Infinity,
      window - limits.outputLimit - reasoning - nextTool - safety,
      (limits.rootRemaining ?? Infinity) - limits.outputLimit - reasoning - nextTool - safety,
    ),
  );
  return {
    inputTokens,
    effective,
    output: limits.outputLimit,
    reasoning,
    nextTool,
    safety,
    total: inputTokens + limits.outputLimit + reasoning + nextTool + safety,
    ratio: effective ? inputTokens / effective : Infinity,
    evaluate: inputTokens >= effective * CONTEXT_LIMITS.evaluateRatio,
    stopLargeResults: inputTokens >= effective * CONTEXT_LIMITS.stopLargeRatio,
    target: Math.floor(effective * CONTEXT_LIMITS.targetRatio),
    fits: inputTokens <= effective,
  };
}
export function requestTokens(
  systemModules: { id: string; text: string }[],
  messages: CanonicalMessage[],
  tools: unknown[],
  tokenizer?: (text: string) => number,
) {
  // Covers protocol framing and provider-specific wrappers as well as the canonical payload.
  return countTokens({ systemModules, messages, tools }, tokenizer) + 1024;
}
