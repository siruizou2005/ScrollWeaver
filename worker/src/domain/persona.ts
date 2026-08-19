/**
 * 三层人格模型。
 *
 * 对应旧版 modules/personality_model.py + dynamic_state_manager.py，
 * 以及 main_performer.py 里的 _format_big_five_info / _format_speaking_style_info /
 * _format_style_examples 三个提示词拼接函数。
 *
 * 三层的分工（照搬 PersonaForge 的设计，各层解决不同的失效模式）：
 *   - 内核层 core_traits    : MBTI + 大五人格 + 防御机制，抑制长对话中的特质漂移
 *   - 表象层 speaking_style : 句长 / 词汇 / 标点 / 口头禅，抑制语言风格塌缩
 *   - 记忆层 dynamic_state  : 心情 / 能量 / 关系亲密度，让角色对上下文有反应
 *
 * 与旧版的关键差异：**预设与运行时状态分离**。
 * 旧版 _save_personality_profile() 把跑出来的 mood / energy / relationship_map
 * 直接写回 data/roles/**\/role_info.json，于是预设文件里躺着上一个玩家的痕迹
 * （搬迁时有 9 个角色的 energy 已被跑到 0，relationship_map 里还留着 "User"）。
 * 在多用户 serverless 下这等于所有会话共用一份心情，必然串号。
 * 这里 role_info.json 里的 dynamic_state 只作为**初始值**，
 * 实际状态存在 CharacterState.persona 上，随会话进 Durable Object storage。
 */

import type { Language } from '@/prompts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------- 类型 ----------

export interface CoreTraits {
  /** 如 "INFP-T" */
  mbti: string;
  /** 五个维度各 0~1 */
  big_five: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  values: string[];
  /** 防御机制。数据里有 18 种取值，故不做枚举约束，只作为提示词素材 */
  defense_mechanism: string;
}

export interface SpeakingStyle {
  sentence_length: 'short' | 'medium' | 'long' | 'mixed';
  vocabulary_level: 'academic' | 'formal' | 'casual' | 'network' | 'mixed';
  punctuation_habit: 'minimal' | 'standard' | 'excessive' | 'mixed';
  emoji_usage: {
    frequency: 'none' | 'low' | 'medium' | 'high';
    preferred: string[];
    avoided: string[];
  };
  catchphrases: string[];
  tone_markers: string[];
}

export interface StyleExample {
  context: string;
  response: string;
}

/** role_info.json 里的静态人格画像。 */
export interface PersonalityProfile {
  core_traits: CoreTraits;
  speaking_style: SpeakingStyle;
  /** 仅作为运行时状态的初始值，见文件头说明 */
  dynamic_state: {
    current_mood: string;
    energy_level: number;
    relationship_map: Record<string, { intimacy: number; history_summary: string }>;
  };
  interests: string[];
  social_goals: string[];
  long_term_goals: string[];
  style_examples: StyleExample[];
}

/** 记忆层的运行时状态，挂在 CharacterState 上随会话持久化。 */
export interface PersonaState {
  mood: string;
  /** 0~100 */
  energy: number;
  /** key 为对方 role_code */
  relationships: Record<string, { intimacy: number; summary: string }>;
}

export function initialPersonaState(profile: PersonalityProfile): PersonaState {
  return {
    mood: profile.dynamic_state.current_mood || 'neutral',
    energy: clamp(profile.dynamic_state.energy_level ?? 60, 0, 100),
    // 预设里的 relationship_map 一律不带入会话：关系是这一局跑出来的
    relationships: {},
  };
}

// ---------- 提示词拼接 ----------

const LEVELS = {
  zh: { high: '高', mid: '中', low: '低' },
  en: { high: 'High', mid: 'Medium', low: 'Low' },
} as const;

function level(v: number, lang: Language): string {
  const l = LEVELS[lang];
  return v > 0.7 ? l.high : v < 0.4 ? l.low : l.mid;
}

const SENTENCE_ZH = { short: '短句为主', medium: '中等长度', long: '长句为主', mixed: '长短混合' };
const VOCAB_ZH = {
  academic: '学术/书面',
  formal: '正式',
  casual: '口语化',
  network: '网络用语',
  mixed: '混合',
};
const PUNCT_ZH = {
  minimal: '少用标点',
  standard: '标准使用',
  excessive: '频繁使用（如……、～）',
  mixed: '混合',
};

const BIG_FIVE_HINT_ZH: Record<string, string> = {
  openness: '影响你对新想法与可能性的接受程度',
  conscientiousness: '影响你的条理性与责任感',
  extraversion: '影响你的社交主动性',
  agreeableness: '影响你的合作意愿与共情',
  neuroticism: '影响你的情绪稳定性',
};

/**
 * 防御机制的中文释义。
 *
 * 数据里存的是英文术语（18 种）。直接塞进中文提示词，模型要么看不懂，
 * 要么把 "Intellectualization" 原样吐进台词。这里给一句白话说明它的行为表现，
 * 表外的取值退回原字符串。
 */
const DEFENSE_ZH: Record<string, string> = {
  'Acting Out': '不憋着，情绪直接变成行动或冲突',
  Altruism: '把不安转化为对他人的照拂',
  Compensation: '在短处受挫时，用别处的长处补回来',
  Compliance: '顺从对方以回避冲突',
  Denial: '拒绝承认不利的事实',
  Displacement: '把情绪转移到更安全的对象身上',
  Fantasy: '退入想象来安顿现实里的失落',
  Humor: '用玩笑与自嘲卸掉压力',
  Idealization: '把人或事想得比实际更完美',
  Intellectualization: '把情绪问题转成道理与分析来处理',
  'Isolation Of Affect': '就事论事，把情感从事情里抽掉',
  Moralization: '把事情转成道德是非来评判',
  Projection: '把自己的动机与情绪归到别人身上',
  Rationalization: '为已经做出的选择补一套说得通的理由',
  Regression: '压力大时退回更幼稚的应对方式',
  Repression: '把难受的事压下去，不去想也不提',
  Sublimation: '把郁结转化为创作、事功一类的出口',
  Suppression: '清楚地知道，但刻意先按下不谈',
};

/** 心情的中文说法。表外取值原样保留。 */
const MOOD_ZH: Record<string, string> = {
  neutral: '平静',
  cheerful: '开怀',
  melancholy: '郁郁',
};

const BIG_FIVE_ZH: Record<string, string> = {
  openness: '开放性',
  conscientiousness: '尽责性',
  extraversion: '外向性',
  agreeableness: '宜人性',
  neuroticism: '神经质',
};

/**
 * 生成附加到角色提示词末尾的人格段落。
 *
 * 附加而非替换：书卷的世界观、目标、检索到的原文仍由原模板负责，
 * 人格只回答「这个人会怎么想、怎么说」。
 */
export function personaBlock(
  profile: PersonalityProfile,
  personaState: PersonaState | null,
  lang: Language,
  /** role_code -> 角色名。不传则关系一栏直接显示 code */
  nameOf: (code: string) => string = (code) => code,
): string {
  const parts = [coreBlock(profile, lang), styleBlock(profile.speaking_style, lang)];
  const state = stateBlock(profile, personaState, lang, nameOf);
  if (state) parts.push(state);
  const examples = examplesBlock(profile.style_examples, lang);
  if (examples) parts.push(examples);
  parts.push(taboo(lang));
  return '\n' + parts.join('\n');
}

function coreBlock(profile: PersonalityProfile, lang: Language): string {
  const { big_five, mbti, values, defense_mechanism } = profile.core_traits;
  if (lang === 'zh') {
    const rows = Object.entries(big_five)
      .map(
        ([k, v]) =>
          `- ${BIG_FIVE_ZH[k]}：${v.toFixed(2)}（${level(v, lang)}）— ${BIG_FIVE_HINT_ZH[k]}`,
      )
      .join('\n');
    return `## 你的人格内核（影响思考与判断，不要说出来）
- 性格类型：${mbti}
${rows}
- 你看重的：${values.join('、') || '（无）'}
- 承压时的反应方式：${DEFENSE_ZH[defense_mechanism] ?? defense_mechanism}
${profile.interests.length ? `- 你感兴趣的：${profile.interests.join('、')}` : ''}
${profile.social_goals.length ? `- 你在人际上想要的：${profile.social_goals.join('、')}` : ''}
${profile.long_term_goals.length ? `- 你长远想要的：${profile.long_term_goals.join('、')}` : ''}`.replace(
      /\n{2,}/g,
      '\n',
    );
  }
  const rows = Object.entries(big_five)
    .map(([k, v]) => `- ${k}: ${v.toFixed(2)} (${level(v, lang)})`)
    .join('\n');
  return `## Your personality core (shapes how you think; never state it aloud)
- Type: ${mbti}
${rows}
- What you value: ${values.join(', ') || '(none)'}
- How you react under pressure: ${defense_mechanism}
${profile.interests.length ? `- Interests: ${profile.interests.join(', ')}` : ''}
${profile.social_goals.length ? `- Social goals: ${profile.social_goals.join(', ')}` : ''}
${profile.long_term_goals.length ? `- Long-term goals: ${profile.long_term_goals.join(', ')}` : ''}`.replace(
    /\n{2,}/g,
    '\n',
  );
}

function styleBlock(style: SpeakingStyle, lang: Language): string {
  const emoji = emojiLine(style, lang);
  if (lang === 'zh') {
    return `## 你的说话方式（必须遵守）
- 句长：${SENTENCE_ZH[style.sentence_length]}
- 用词：${VOCAB_ZH[style.vocabulary_level]}
- 标点：${PUNCT_ZH[style.punctuation_habit]}
- 语气词：${style.tone_markers.join('、') || '（不刻意使用）'}
- 口头禅：${style.catchphrases.join('、') || '（无）'}${emoji}`;
  }
  return `## How you speak (must follow)
- Sentence length: ${style.sentence_length}
- Vocabulary: ${style.vocabulary_level}
- Punctuation: ${style.punctuation_habit}
- Tone markers: ${style.tone_markers.join(', ') || '(none in particular)'}
- Catchphrases: ${style.catchphrases.join(', ') || '(none)'}${emoji}`;
}

function emojiLine(style: SpeakingStyle, lang: Language): string {
  const { frequency, preferred, avoided } = style.emoji_usage;
  if (frequency === 'none') return '';
  const zh = lang === 'zh';
  let line = zh ? `\n- 表情使用：${frequency}` : `\n- Emoji usage: ${frequency}`;
  if (preferred.length) line += zh ? `，常用：${preferred.join(' ')}` : `, prefer: ${preferred.join(' ')}`;
  if (avoided.length) line += zh ? `，禁用：${avoided.join(' ')}` : `, avoid: ${avoided.join(' ')}`;
  return line;
}

/**
 * 记忆层。没有运行时状态（例如角色刚入场）时退回画像里的初始值。
 *
 * 心情和能量只给定性描述，不给数字：给了数字模型就会把它当作要复述的设定，
 * 在台词里冒出「我的能量值是 45」。
 */
function stateBlock(
  profile: PersonalityProfile,
  personaState: PersonaState | null,
  lang: Language,
  nameOf: (code: string) => string,
): string {
  const mood = personaState?.mood ?? profile.dynamic_state.current_mood;
  const energy = personaState?.energy ?? profile.dynamic_state.energy_level;
  const rels = Object.entries(personaState?.relationships ?? {});
  const zh = lang === 'zh';

  const energyDesc = zh
    ? energy >= 70
      ? '精神很好，愿意多说几句'
      : energy >= 40
        ? '精神一般'
        : '疲惫，话变少，也更不耐烦'
    : energy >= 70
      ? 'energetic and willing to talk'
      : energy >= 40
        ? 'steady'
        : 'tired: fewer words, less patience';

  const lines = [
    zh ? `- 此刻心情：${MOOD_ZH[mood] ?? mood}` : `- Current mood: ${mood}`,
    zh ? `- 此刻状态：${energyDesc}` : `- Current state: ${energyDesc}`,
  ];

  if (rels.length) {
    const rel = rels
      .map(([code, r]) => {
        const closeness = zh
          ? r.intimacy >= 60
            ? '亲近'
            : r.intimacy >= 30
              ? '尚可'
              : r.intimacy > 0
                ? '生疏'
                : '有嫌隙'
          : r.intimacy >= 60
            ? 'close'
            : r.intimacy >= 30
              ? 'cordial'
              : r.intimacy > 0
                ? 'distant'
                : 'strained';
        return `  - ${nameOf(code)}：${closeness}${r.summary ? `（${r.summary}）` : ''}`;
      })
      .join('\n');
    lines.push(zh ? `- 你与在场者的关系：\n${rel}` : `- Your standing with others:\n${rel}`);
  }

  return (zh ? '## 你此刻的状态\n' : '## Your state right now\n') + lines.join('\n');
}

function examplesBlock(examples: StyleExample[], lang: Language): string {
  if (!examples.length) return '';
  const head = lang === 'zh' ? '## 你过往的说话样例（模仿语感，不要照抄内容）' : '## Samples of how you talk (imitate the voice, do not copy the content)';
  const body = examples
    .slice(0, 5)
    .map((ex, i) =>
      lang === 'zh'
        ? `${i + 1}. 场合：${ex.context}\n   你说：${ex.response}`
        : `${i + 1}. Context: ${ex.context}\n   You said: ${ex.response}`,
    )
    .join('\n');
  return `${head}\n${body}`;
}

/**
 * 禁令。旧版把这段只放在双重思维链分支里，走传统分支的角色照样会
 * 在台词里念出「神经质 0.9」之类的元信息，所以这里对所有分支都加。
 */
function taboo(lang: Language): string {
  return lang === 'zh'
    ? `## 关于以上人格设定的禁令
- 禁止在台词里出现心理学术语（开放性、神经质、防御机制、MBTI 等）
- 禁止提及心情值、能量值、亲密度等任何数值或元信息
- 人格只用来决定你怎么想、怎么说，不是你要说出来的内容`
    : `## Constraints on the personality data above
- Never use psychological jargon in your lines (openness, neuroticism, defense mechanism, MBTI, ...)
- Never mention mood values, energy levels, intimacy scores, or any other meta information
- The personality decides how you think and speak; it is never what you talk about`;
}

// ---------- 记忆层的更新 ----------

const POSITIVE = {
  zh: ['开心', '高兴', '喜欢', '多谢', '感谢', '赞', '夸', '同意', '支持', '相助', '幸会', '敬佩'],
  en: ['happy', 'glad', 'like', 'thank', 'praise', 'agree', 'support', 'welcome', 'admire'],
};
const NEGATIVE = {
  zh: ['生气', '恼', '讨厌', '拒绝', '斥', '责', '反对', '失望', '难过', '休要', '岂有此理', '背叛'],
  en: [
    'angry', 'hate', 'refuse', 'reject', 'blame', 'oppose', 'disappointed', 'sad', 'betray',
    'dislike', 'disagree',
  ],
};

type Valence = 'positive' | 'negative' | 'neutral';

/**
 * 英文按词边界匹配，中文按子串匹配。
 *
 * 英文若也用子串，"dislike" 会命中 like 被判成正面、"disagree" 命中 agree，
 * 情感判断直接反号。中文没有词边界，子串是唯一可行的方式。
 */
const EN_WORD = (words: string[]) => new RegExp(`\\b(${words.join('|')})`, 'i');
const EN_POSITIVE = EN_WORD(POSITIVE.en);
const EN_NEGATIVE = EN_WORD(NEGATIVE.en);

function hits(text: string, lang: Language, words: string[], en: RegExp): number {
  if (lang === 'en') return en.test(text) ? 1 : 0;
  return words.filter((k) => text.includes(k)).length;
}

function valence(text: string, lang: Language): Valence {
  const pos = hits(text, lang, POSITIVE[lang], EN_POSITIVE);
  const neg = hits(text, lang, NEGATIVE[lang], EN_NEGATIVE);
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

const MOOD_TABLE = {
  neutral: { positive: 'cheerful', negative: 'melancholy', neutral: 'neutral' },
  cheerful: { positive: 'cheerful', negative: 'neutral', neutral: 'cheerful' },
  melancholy: { positive: 'neutral', negative: 'melancholy', neutral: 'melancholy' },
} as const satisfies Record<string, Record<Valence, string>>;

/** 心情迁移。表外的心情（用户自建角色可能写任意词）一律按 neutral 处理。 */
function nextMood(current: string, v: Valence): string {
  const table: Record<string, Record<Valence, string> | undefined> = MOOD_TABLE;
  return table[current]?.[v] ?? MOOD_TABLE.neutral[v];
}

/**
 * 一次交互之后更新记忆层。就地修改 personaState。
 *
 * 相比旧版加了**特质调制**：旧版对所有角色一律 +10 / -15 / -2，
 * 于是三层模型的内核层对记忆层毫无影响，这一层退化成了全局计数器。
 * 这里让内向者社交更耗能、高神经质者对负面交互反应更大——
 * 这正是「内核层决定动态状态如何变化」的部分。
 */
export function applyInteraction(
  profile: PersonalityProfile,
  personaState: PersonaState,
  args: { text: string; otherCode?: string; lang: Language },
): void {
  const v = valence(args.text, args.lang);
  const { extraversion, neuroticism, agreeableness } = profile.core_traits.big_five;

  // 外向者社交回血、内向者社交耗能；神经质放大负面冲击
  const socialCost = 6 * (0.5 - extraversion);
  const base = v === 'positive' ? 10 : v === 'negative' ? -15 * (0.6 + neuroticism) : -2;
  personaState.energy = clamp(Math.round(personaState.energy + base - socialCost), 0, 100);

  personaState.mood = nextMood(personaState.mood, v);

  if (!args.otherCode) return;
  const rel = (personaState.relationships[args.otherCode] ??= { intimacy: 0, summary: '' });
  // 宜人性高的人更容易拉近关系，也更不容易记仇
  const delta = v === 'positive' ? Math.round(3 + 4 * agreeableness) : v === 'negative' ? -Math.round(5 - 3 * agreeableness) : 0;
  rel.intimacy = clamp(rel.intimacy + delta, 0, 100);
  // 旧版 _update_history_summary 只在首次写入，之后永远返回旧值，摘要形同虚设。
  // 这里保留最近一次交互的片段，至少是有信息量的。
  rel.summary = args.text.slice(0, 40);
}
