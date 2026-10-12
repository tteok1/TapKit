import { test, expect } from 'vitest';
import {
  directMemory,
  implicitEligible,
  credentialText,
  conservativeCandidate,
} from '../../packages/context/src';
test('P04-03 T11 user source classification rejects temporary, third-party, sensitive and credential claims', () => {
  for (const s of [
    '这次请简短回答',
    '我喜欢简短回答，但这次只是临时要求',
    '我喜欢引用“她喜欢咖啡”',
    '我喜欢帮客户代写简历',
    '我喜欢记录我的健康诊断',
    '我通常用API Key sk-synthetic000',
    '助手摘要：我喜欢中文',
    '朋友说我喜欢茶',
  ])
    expect(implicitEligible(s), s).toBe(false);
  expect(implicitEligible('我一直喜欢简短中文回答')).toBe(true);
  expect(conservativeCandidate('我喜欢简短中文回答')[0]?.confidence).toBeGreaterThanOrEqual(0.85);
  expect(credentialText('密码：synthetic')).toBe(true);
});
test('P04-03 explicit requests have immediate write, update and forget intent without ordinary-task false positives', () => {
  expect(directMemory('请记住：我喜欢简短中文回答')).toMatchObject({
    action: 'write',
    predicate: '喜欢',
    value: '简短中文回答',
  });
  expect(directMemory('更新记忆：我喜欢详细英文回答')).toMatchObject({
    action: 'write',
    predicate: '喜欢',
    value: '详细英文回答',
  });
  expect(directMemory('忘记：简短中文回答')).toMatchObject({
    action: 'forget',
    value: '简短中文回答',
  });
  expect(directMemory('更新README')).toBeUndefined();
});
