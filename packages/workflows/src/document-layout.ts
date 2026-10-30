/** Fixed repair presets only; no model-provided CSS or OOXML is accepted. */
export function documentLayoutPreset(attempt: number) {
  const presets = [
    { bodyHalfPoints: 22, marginTwips: 1134, lineTwips: undefined },
    { bodyHalfPoints: 21, marginTwips: 1021, lineTwips: 260 },
    { bodyHalfPoints: 20, marginTwips: 907, lineTwips: 240 },
  ] as const;
  if (!Number.isInteger(attempt) || attempt < 0 || attempt >= presets.length)
    throw new Error('LAYOUT_REPAIR_LIMIT');
  return presets[attempt]!;
}
