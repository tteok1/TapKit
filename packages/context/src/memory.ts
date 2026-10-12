import { createHash } from 'node:crypto';
import type { MemoryCandidate } from '@tapkit/contracts';
export const credentialText = (s: string) =>
  /(?:api[ _-]?key|密钥|密码|口令|令牌|bearer\s|sk-[a-z0-9]{8}|access[_ -]?token|refresh[_ -]?token)/i.test(
    s,
  );
export const sensitiveText = (s: string) =>
  /(?:疾病|病史|诊断|抑郁|焦虑|健康|癌|糖尿病|怀孕|宗教|信仰|政治|性取向|身份证|银行卡|住址)/.test(
    s,
  );
export const implicitEligible = (s: string) =>
  !credentialText(s) &&
  !sensitiveText(s) &&
  !/(?:这次|此次|今天|暂时|临时|本次|假设|代写|帮.*写|引用|他说|她说|客户|同事|朋友|用户说|["“”「」>]|```)/.test(
    s,
  ) &&
  /^我(?:一直|通常|习惯|喜欢|偏好|更喜欢|希望以后)/.test(s.trim());
export function directMemory(
  text: string,
): { action: 'write' | 'forget'; predicate: string; value: string; previous?: string } | undefined {
  const match = text
    .trim()
    .match(/^(?:请)?(?:帮我)?(记住|更新记忆|纠正记忆|忘记|删除记忆)[：:\s]*(.{1,2000})$/s);
  if (!match) return;
  const value = match[2]!.trim().replace(/[。！]$/, '');
  if (/忘记|删除/.test(match[1]!)) return { action: 'forget', predicate: '', value };
  const replacement = value.match(/^把(.+?)(?:更新为|改为|更正为|纠正为)(.+)$/s);
  if (
    /更新|纠正/.test(match[1]!) &&
    /^把.*(?:更新为|改为|更正为|纠正为)/s.test(value) &&
    !replacement
  )
    return { action: 'write', predicate: '', value: '' };
  if (replacement && /更新|纠正/.test(match[1]!))
    return {
      action: 'write',
      predicate: '',
      value: replacement[2]!.trim(),
      previous: replacement[1]!.trim(),
    };
  const pair =
    value.match(/^(?:我)?(喜欢|偏好|更喜欢|名字是|叫|职业是|希望以后)(.+)$/s) ??
    value.match(/^([^：:=]{1,160})[：:=](.+)$/s);
  return {
    action: 'write',
    predicate: pair
      ? pair[1]!.replace('更喜欢', '喜欢').replace('偏好', '喜欢')
      : '事实:' + createHash('sha256').update(value).digest('hex').slice(0, 24),
    value: pair ? pair[2]!.trim() : value,
  };
}
export function conservativeCandidate(text: string): MemoryCandidate[] {
  if (!implicitEligible(text)) return [];
  const match = text
    .trim()
    .match(/^我(?:一直|通常)?(喜欢|偏好|更喜欢)([^。！？\n]{1,1000})[。！]?$/);
  if (!match) return [];
  return [
    {
      subject: 'user',
      predicate: '喜欢',
      value: match[2]!.trim(),
      confidence: 0.9,
      quote: text,
      stable: true,
      sensitive: false,
      expiry: null,
    },
  ];
}
