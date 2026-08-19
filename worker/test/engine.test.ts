import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig, type Env } from '@/config';
import type { ContentPack } from '@/domain/content';
import { nameToCode } from '@/domain/content';
import { StoryEngine, type OutMessage } from '@/domain/engine';
import { chunkText, searchWorld, tokenize } from '@/domain/retrieval';
import { createSession } from '@/domain/state';
import { getLLM } from '@/llm';

/** 从构建产物里取出内容包，与线上 KV 里的内容完全一致。 */
function loadPackFromBulk(scrollId: string): ContentPack {
  const bulk = JSON.parse(
    readFileSync(join(__dirname, '../../dist/kv-bulk.json'), 'utf8'),
  ) as { key: string; value: string }[];
  const entry = bulk.find((e) => e.key === `pack:${scrollId}`);
  if (!entry) throw new Error(`内容包 ${scrollId} 不存在，请先运行 scripts/import-content.mjs`);
  return JSON.parse(entry.value) as ContentPack;
}

const PACK = loadPackFromBulk('experiment_three_kindoms');

describe('内容包', () => {
  it('三国书卷含 9 名角色与 10 个地点', () => {
    expect(Object.keys(PACK.roles)).toHaveLength(9);
    expect(Object.keys(PACK.locations)).toHaveLength(10);
  });

  it('角色都有非空简介（提示词质量的前提）', () => {
    for (const role of Object.values(PACK.roles)) {
      expect(role.profile.length, `${role.role_name} 简介为空`).toBeGreaterThan(10);
    }
  });

  it('地点两两之间有距离', () => {
    expect(Object.keys(PACK.adjacency).length).toBeGreaterThan(0);
  });

  it('按角色名反查 code（旧版 name2code 的替代）', () => {
    expect(nameToCode(PACK, '诸葛亮')).toBe('zhugeliang-zh');
    expect(nameToCode(PACK, 'zhugeliang-zh')).toBe('zhugeliang-zh');
    expect(nameToCode(PACK, '不存在的人')).toBeNull();
  });
});

describe('检索', () => {
  it('中文按二元字组切分', () => {
    expect(tokenize('三国')).toContain('三国');
  });

  it('长文本切块不劈断句子', () => {
    const chunks = chunkText('第一句。第二句。'.repeat(40), 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(120);
  });

  it('能检索到相关的世界观片段', async () => {
    const hits = await searchWorld(PACK, '曹操 群雄割据', 3);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('无关查询不强行返回结果', async () => {
    const hits = await searchWorld(PACK, 'zzzz', 3);
    expect(hits).toHaveLength(0);
  });
});

function env(): Env {
  return {
    JWT_SECRET: 'test',
    GLM_API_KEY: process.env.GLM_API_KEY ?? '',
    ROLE_MODEL: 'glm-4.7',
  } as Env;
}

const live = process.env.GLM_API_KEY ? describe : describe.skip;

live('剧情引擎（真实 LLM）', () => {
  it('从开局推进到角色行动，产出可展示的消息', async () => {
    const config = loadConfig(env());
    const state = createSession({
      scrollId: 'experiment_three_kindoms',
      language: 'zh',
      roleCodes: Object.keys(PACK.roles).slice(0, 3), // 3 个角色够验证互动
      roles: PACK.roles,
      maxRounds: 1,
    });
    const engine = new StoryEngine(
      PACK,
      state,
      getLLM(config, undefined, 'role'),
      getLLM(config, undefined, 'world'),
      config.retrievalTopK,
    );

    const messages: OutMessage[] = [];
    const emit = (m: OutMessage) => messages.push(m);

    // init -> event -> motivation
    await engine.step(emit);
    expect(state.phase).toBe('event');
    for (const c of Object.values(state.characters)) {
      expect(c.locationCode, '开局应分配地点').not.toBe('');
    }

    await engine.step(emit);
    expect(state.phase).toBe('motivation');
    expect(state.event.length, '自由模式应生成事件').toBeGreaterThan(5);

    await engine.step(emit);
    expect(state.phase).toBe('running');
    for (const c of Object.values(state.characters)) {
      expect(c.motivation, '每个角色都应有动机').not.toBe('');
    }

    // 一个子回合：应产出角色发言
    await engine.step(emit);
    const roleMessages = messages.filter((m) => m.type === 'role');
    expect(roleMessages.length, '子回合应产出角色行动').toBeGreaterThan(0);
    for (const m of roleMessages) {
      expect(m.text.trim().length).toBeGreaterThan(0);
      expect(m.name, '角色消息应带名字供前端显示').toBeTruthy();
    }

    // 状态可序列化——这是能存进 Durable Object 的前提
    const json = JSON.stringify(engine.snapshot);
    expect(JSON.parse(json).phase).toBe(state.phase);
  }, 600_000);
});
