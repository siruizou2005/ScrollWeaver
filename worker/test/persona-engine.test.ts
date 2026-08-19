/**
 * 记忆层在引擎里的接线测试。
 *
 * 用桩 LLM 而非真实模型：这里要验的是「角色互动之后双方的心情、能量、
 * 亲密度确实被更新了」，与模型输出质量无关。真实模型跑一轮未必会产生
 * 角色间互动（可能各自走开或只与环境交互），拿它测这条路径并不可靠。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ContentPack } from '@/domain/content';
import { StoryEngine, type OutMessage } from '@/domain/engine';
import { createSession } from '@/domain/state';
import type { LLM } from '@/llm';

const bulk = JSON.parse(readFileSync(join(__dirname, '../../dist/kv-bulk.json'), 'utf8')) as {
  key: string;
  value: string;
}[];
const FULL = JSON.parse(
  bulk.find((e) => e.key === 'pack:experiment_red_mansions')!.value,
) as ContentPack;

/**
 * 只留一个地点。doInit 是随机撒位置的，多地点时两个角色多半碰不上，
 * 也就走不到角色互动那条分支。
 */
const [ONLY_LOC] = Object.keys(FULL.locations);
const PACK: ContentPack = {
  ...FULL,
  locations: { [ONLY_LOC!]: FULL.locations[ONLY_LOC!]! },
  adjacency: {},
};

/**
 * 按 zod schema 的形状返回固定结果的桩。
 * 靠 schema 上的字段名分辨调用意图——比按调用顺序断言稳。
 */
function stubLLM(lines: { plan: string; reply: string }): LLM {
  const structured = async (_prompt: unknown, schema: { shape?: Record<string, unknown> }) => {
    const keys = Object.keys(schema.shape ?? {});
    if (keys.includes('motivations')) {
      return {
        motivations: Object.values(PACK.roles).map((r) => ({
          role_name: r.role_name,
          motivation: '推动剧情',
        })),
      };
    }
    if (keys.includes('interact_type')) {
      return {
        detail: lines.plan,
        interact_type: 'role',
        target_role_codes: ['JiaBaoyu-zh'],
        target_npc_name: '',
      };
    }
    if (keys.includes('if_end_interaction')) {
      return {
        detail: lines.reply,
        if_end_interaction: true,
        extra_interact_type: 'no',
        target_npc_name: '',
      };
    }
    if (keys.includes('if_move')) return { if_move: false, destination_code: null, reason: '' };
    if (keys.includes('if_change_goal')) return { if_change_goal: false, updated_goal: '' };
    if (keys.includes('updated_status')) return { updated_status: '如常', activity: 1 };
    if (keys.includes('location_code')) return { location_code: ONLY_LOC };
    // 其余（事件生成、场景描述等）统一给一段文本字段
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = '（桩）';
    return out;
  };
  return {
    model: 'stub',
    complete: async () => '（桩）',
    structured,
  } as unknown as LLM;
}

async function run(lines: { plan: string; reply: string }) {
  const codes = ['LinDaiyu-zh', 'JiaBaoyu-zh'];
  const state = createSession({
    scrollId: 'experiment_red_mansions',
    language: 'zh',
    roleCodes: codes,
    roles: PACK.roles,
    maxRounds: 1,
  });
  const llm = stubLLM(lines);
  const engine = new StoryEngine(PACK, state, llm, llm, 3);
  const msgs: OutMessage[] = [];
  for (let i = 0; i < 20; i++) if (!(await engine.step((m) => msgs.push(m)))) break;
  return state;
}

describe('记忆层在引擎里的更新', () => {
  it('一次友善的对话让双方都亲近一分', async () => {
    const state = await run({
      plan: '妹妹近来可好？我心里很喜欢你写的那几句。',
      reply: '多谢哥哥记挂，我很高兴。',
    });
    const daiyu = state.characters['LinDaiyu-zh']!.persona!;
    const baoyu = state.characters['JiaBaoyu-zh']!.persona!;

    // 关系是双向记的：旧版只更新应答方，发起方那边永远是空的
    expect(daiyu.relationships['JiaBaoyu-zh']!.intimacy).toBeGreaterThan(0);
    expect(baoyu.relationships['LinDaiyu-zh']!.intimacy).toBeGreaterThan(0);
    // 各自记的是**对方说了什么**：黛玉是发起方，她听到的是宝玉的回话
    expect(daiyu.relationships['JiaBaoyu-zh']!.summary).toContain('多谢哥哥记挂');
    expect(baoyu.relationships['LinDaiyu-zh']!.summary).toContain('妹妹近来可好');
  });

  it('冲突让亲密度下降、心情转差', async () => {
    const state = await run({
      plan: '你这话我实在讨厌，也太让人失望了。',
      reply: '我拒绝再听下去，你太让我难过了。',
    });
    const daiyu = state.characters['LinDaiyu-zh']!.persona!;
    expect(daiyu.relationships['JiaBaoyu-zh']!.intimacy).toBe(0);
    expect(daiyu.mood).toBe('melancholy');
    // 黛玉 neuroticism 0.9，负面交互掉能量应明显多于初始的小额消耗
    expect(daiyu.energy).toBeLessThan(45);
  });

  it('没有人格画像的角色不会因为记忆层更新而报错', async () => {
    const bare: ContentPack = {
      ...PACK,
      roles: Object.fromEntries(
        Object.entries(PACK.roles).map(([c, r]) => [c, { ...r, personality: undefined }]),
      ),
    };
    const state = createSession({
      scrollId: 'experiment_red_mansions',
      language: 'zh',
      roleCodes: ['LinDaiyu-zh', 'JiaBaoyu-zh'],
      roles: bare.roles,
      maxRounds: 1,
    });
    const llm = stubLLM({ plan: '你好', reply: '你好' });
    const engine = new StoryEngine(bare, state, llm, llm, 3);
    for (let i = 0; i < 20; i++) if (!(await engine.step(() => {}))) break;
    expect(state.characters['LinDaiyu-zh']!.persona).toBeNull();
  });
});
