import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ContentPack } from '@/domain/content';
import {
  applyInteraction,
  initialPersonaState,
  personaBlock,
  type PersonalityProfile,
} from '@/domain/persona';
import { createSession } from '@/domain/state';

function loadPack(scrollId: string): ContentPack {
  const bulk = JSON.parse(readFileSync(join(__dirname, '../../dist/kv-bulk.json'), 'utf8')) as {
    key: string;
    value: string;
  }[];
  const entry = bulk.find((e) => e.key === `pack:${scrollId}`);
  if (!entry) throw new Error(`内容包 ${scrollId} 不存在，请先运行 scripts/import-content.mjs`);
  return JSON.parse(entry.value) as ContentPack;
}

const PACK = loadPack('experiment_three_kindoms');
const ALICE = loadPack('experiment_alice');

function profileOf(pack: ContentPack, code: string): PersonalityProfile {
  const p = pack.roles[code]?.personality;
  if (!p) throw new Error(`${code} 没有人格画像`);
  return p;
}

describe('人格画像数据', () => {
  it('内容包里每个角色都带三层人格', () => {
    for (const [code, role] of Object.entries(PACK.roles)) {
      expect(role.personality, `${code} 缺 personality`).toBeDefined();
    }
  });

  it('大五人格取值都在 0~1 之间', () => {
    for (const role of Object.values(PACK.roles)) {
      for (const [dim, v] of Object.entries(role.personality!.core_traits.big_five)) {
        expect(v, `${role.role_code} 的 ${dim}`).toBeGreaterThanOrEqual(0);
        expect(v, `${role.role_code} 的 ${dim}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('预设不携带运行时关系（否则会把上一局的痕迹带进新会话）', () => {
    for (const role of Object.values(PACK.roles)) {
      expect(
        Object.keys(role.personality!.dynamic_state.relationship_map),
        `${role.role_code} 的 relationship_map 应为空`,
      ).toHaveLength(0);
    }
  });
});

describe('人格提示词段落', () => {
  const zhugeliang = profileOf(PACK, 'zhugeliang-zh');

  it('三层信息与禁令都在', () => {
    const block = personaBlock(zhugeliang, null, 'zh');
    expect(block).toContain('INTJ-A');
    expect(block).toContain('开放性');
    expect(block).toContain('此乃天意'); // 口头禅
    expect(block).toContain('禁止'); // 元信息禁令
  });

  it('不把心情能量的数值写进提示词', () => {
    const state = initialPersonaState(zhugeliang);
    state.energy = 45;
    const block = personaBlock(zhugeliang, state, 'zh');
    expect(block).not.toContain('45');
    expect(block).toMatch(/精神|疲惫/);
  });

  it('英文书卷走英文段落', () => {
    const hatter = profileOf(ALICE, 'Hatter-en');
    const block = personaBlock(hatter, null, 'en');
    expect(block).toContain('How you speak');
    expect(block).not.toMatch(/[一-龥]/);
  });

  it('关系只在有记录时出现，且以定性词而非分数呈现', () => {
    const state = initialPersonaState(zhugeliang);
    expect(personaBlock(zhugeliang, state, 'zh')).not.toContain('你与在场者的关系');
    state.relationships['liubei-zh'] = { intimacy: 80, summary: '三顾茅庐' };
    const withRel = personaBlock(zhugeliang, state, 'zh', (c) => PACK.roles[c]?.role_name ?? c);
    expect(withRel).toContain('刘备'); // 显示角色名而非 role_code
    expect(withRel).toContain('亲近');
    expect(withRel).not.toContain('80');
  });
});

describe('记忆层更新', () => {
  it('正面交互提升亲密度，负面交互降低', () => {
    const p = profileOf(PACK, 'liubei-zh');
    const s = initialPersonaState(p);
    applyInteraction(p, s, { text: '多谢先生相助，备感激不尽', otherCode: 'zhugeliang-zh', lang: 'zh' });
    const after = s.relationships['zhugeliang-zh']!.intimacy;
    expect(after).toBeGreaterThan(0);

    applyInteraction(p, s, { text: '汝背叛于我，岂有此理', otherCode: 'zhugeliang-zh', lang: 'zh' });
    expect(s.relationships['zhugeliang-zh']!.intimacy).toBeLessThan(after);
  });

  it('心情按迁移表变化', () => {
    const p = profileOf(PACK, 'liubei-zh');
    const s = initialPersonaState(p);
    s.mood = 'neutral';
    applyInteraction(p, s, { text: '多谢，甚好', lang: 'zh' });
    expect(s.mood).toBe('cheerful');
    applyInteraction(p, s, { text: '岂有此理，失望之至', lang: 'zh' });
    expect(s.mood).toBe('neutral');
  });

  it('能量被夹在 0~100 内', () => {
    const p = profileOf(PACK, 'liubei-zh');
    const s = initialPersonaState(p);
    for (let i = 0; i < 50; i++) {
      applyInteraction(p, s, { text: '汝等背叛，可恶', lang: 'zh' });
    }
    expect(s.energy).toBe(0);
    for (let i = 0; i < 50; i++) {
      applyInteraction(p, s, { text: '多谢支持，甚好', lang: 'zh' });
    }
    expect(s.energy).toBeLessThanOrEqual(100);
  });

  it('英文按词边界判断情感：dislike / disagree 不会被读成 like / agree', () => {
    const hatter = profileOf(ALICE, 'Hatter-en');
    const check = (text: string) => {
      const s = initialPersonaState(hatter);
      s.mood = 'neutral';
      applyInteraction(hatter, s, { text, lang: 'en' });
      return s.mood;
    };
    expect(check('I like this tea, thank you.')).toBe('cheerful');
    // 子串匹配会把这两句判成正面，词边界匹配才判得对
    expect(check('I really dislike this tea.')).toBe('melancholy');
    expect(check('I disagree with all of it.')).toBe('melancholy');
  });

  it('内向者社交更耗能（内核层确实在驱动记忆层）', () => {
    // 诸葛亮 extraversion 0.35，张飞 0.85
    const introvert = profileOf(PACK, 'zhugeliang-zh');
    const extravert = profileOf(PACK, 'zhangfei-zh');
    expect(introvert.core_traits.big_five.extraversion).toBeLessThan(
      extravert.core_traits.big_five.extraversion,
    );

    const si = initialPersonaState(introvert);
    const se = initialPersonaState(extravert);
    si.energy = se.energy = 80;
    const neutral = { text: '今日天色尚可', lang: 'zh' as const };
    applyInteraction(introvert, si, neutral);
    applyInteraction(extravert, se, neutral);
    expect(si.energy).toBeLessThan(se.energy);
  });
});

describe('会话初始化', () => {
  it('createSession 传入 pack.roles 时给每个角色建好记忆层', () => {
    const state = createSession({
      scrollId: 'experiment_three_kindoms',
      language: 'zh',
      roleCodes: Object.keys(PACK.roles),
      roles: PACK.roles,
    });
    for (const code of Object.keys(PACK.roles)) {
      const persona = state.characters[code]!.persona;
      expect(persona, `${code} 的 persona`).not.toBeNull();
      expect(persona!.relationships).toEqual({});
    }
  });

  it('不传 roles 时退回无人格行为，不报错', () => {
    const state = createSession({
      scrollId: 'experiment_three_kindoms',
      language: 'zh',
      roleCodes: ['liubei-zh'],
    });
    expect(state.characters['liubei-zh']!.persona).toBeNull();
  });
});
