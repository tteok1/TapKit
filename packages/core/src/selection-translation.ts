import type { ModelPreferences } from '@tapkit/contracts';

type Language = ModelPreferences['answer']['language'];
export type TranslationLanguage = Exclude<Language, 'auto'>;

export function translationLanguage(source: string, preference: Language): TranslationLanguage {
  if (preference !== 'auto') return preference;
  return /\p{Script=Han}/u.test(source) ? 'en' : 'zh-CN';
}

export function translationInstruction(language: TranslationLanguage) {
  const label = language === 'zh-CN' ? '简体中文' : '英文';
  return (
    `本轮目标语言：${label}（${language}）。把选区原文翻译为${label}，只输出译文；` +
    '原文与目标语言不同时，不得原样复述原文。名称、代码和无需翻译的符号可以保留。'
  );
}

/** A conservative echo check for foreign-language prose, not a general quality/language judge. */
export function unchangedTranslation(source: string, result: string, target: TranslationLanguage) {
  const original = source.trim();
  if (!original || original.replace(/\s+/g, ' ') !== result.trim().replace(/\s+/g, ' '))
    return false;
  // A literal identifier, code, URL or a list of product names may correctly remain unchanged.
  if (/[`{}<>]|:\/\//.test(original)) return false;
  if (target === 'en')
    return (original.match(/\p{Script=Han}/gu)?.length ?? 0) >= 8 && /[。！？]/.test(original);
  if (/\p{Script=Han}/u.test(original) || !/[.!?](?:["'”’)]*)$/.test(original)) return false;
  const words = original.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? [];
  return words.length >= 4 && words.some((word) => /^[a-z]/.test(word));
}
