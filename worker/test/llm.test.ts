import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { loadConfig, providerForModel, type Env } from '@/config';
import { cleanText, getLLM, parseJsonObject } from '@/llm/client';

function env(overrides: Partial<Env> = {}): Env {
  return {
    JWT_SECRET: 'test',
    // 纯配置逻辑不该依赖真实密钥：没有真 key 时用占位符，
    // 这样供应商解析的用例在 CI 上（无密钥）也能跑
    GLM_API_KEY: process.env.GLM_API_KEY ?? 'placeholder-key',
    ROLE_MODEL: 'glm-4.7',
    ...overrides,
  } as Env;
}

describe('配置与供应商解析', () => {
  it('按模型名前缀选中正确的端点', () => {
    const cfg = loadConfig(env({ OPENAI_API_KEY: 'sk-x' }));
    expect(providerForModel(cfg, 'glm-4.7').name).toBe('GLM');
    expect(providerForModel(cfg, 'gpt-4o').name).toBe('OPENAI');
  });

  it('未知模型名回落到第一个已配置端点（支持任意中转）', () => {
    const cfg = loadConfig(env());
    expect(providerForModel(cfg, 'some-relay-model').name).toBe('GLM');
  });

  it('没有任何 key 时给出可操作的报错', () => {
    const cfg = loadConfig({ JWT_SECRET: 't' } as Env);
    expect(() => providerForModel(cfg, 'glm-4.7')).toThrow(/wrangler secret put/);
  });
});

describe('输出清洗与解析', () => {
  it('剥掉推理模型的 <think> 块', () => {
    expect(cleanText('<think>盘算中</think>正文')).toBe('正文');
  });

  it('剥掉 ```json 代码围栏', () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('能从夹带前后文的输出里抠出 JSON', () => {
    expect(parseJsonObject('好的，结果是 {"a":2} 。')).toEqual({ a: 2 });
  });

  it('绝不对模型输出求值（旧版用 eval 的注入面）', () => {
    // 旧版 sw_utils.json_parser 会 eval 这段
    expect(() => parseJsonObject('{"a": __import__("os").system("id")}')).toThrow();
  });
});

const live = process.env.GLM_API_KEY ? describe : describe.skip;

live('对接真实 GLM 端点', () => {
  it('纯文本补全', async () => {
    const llm = getLLM(loadConfig(env()));
    const out = await llm.complete('用一句话介绍诸葛亮');
    expect(out.length).toBeGreaterThan(5);
    expect(out).not.toContain('<think>');
  });

  it('结构化输出返回校验过的对象', async () => {
    const Plan = z.object({
      action: z.string(),
      detail: z.string(),
      targets: z.array(z.string()),
    });
    const llm = getLLM(loadConfig(env()));
    const plan = await llm.structured('你是诸葛亮，正在隆中。给出下一步计划。', Plan);
    expect(typeof plan.action).toBe('string');
    expect(Array.isArray(plan.targets)).toBe(true);
  });
});
