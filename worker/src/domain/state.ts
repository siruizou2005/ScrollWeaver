/**
 * 会话状态。
 *
 * 旧版把状态摊在活对象上：Simulator 持有 performers（每个是含 LLM 客户端和向量库的
 * 实例）、orchestrator、history_manager、event_manager…… 全在进程内存里。
 * 服务器一重启，进行中的剧情全丢；也无法迁移到别的实例。
 *
 * 这里的状态是**纯数据**，可 JSON 序列化，能直接存进 Durable Object storage。
 * 所有行为都是「(状态, 内容包) -> 新状态」的函数，不挂在状态上。
 */

import type { Language } from '@/prompts';

import { initialPersonaState, type PersonalityProfile, type PersonaState } from './persona';

export interface CharacterState {
  code: string;
  locationCode: string;
  /** 长期动机，开局生成后基本不变 */
  motivation: string;
  /** 短期目标，每轮可能更新 */
  goal: string;
  /** 当前状态描述 */
  status: string;
  activity: number;
  /** 正在移动时的目的地与剩余距离；null 表示未在移动 */
  moving: { to: string; remaining: number } | null;
  /**
   * 三层人格的记忆层（心情 / 能量 / 关系）。角色没有人格画像时为 null。
   *
   * 放在这里而不是写回 role_info.json：预设是所有会话共享的只读内容，
   * 而心情和关系是这一局特有的。旧版把二者混在一个文件里，见 persona.ts 的说明。
   */
  persona: PersonaState | null;
}

export type ActorType = 'role' | 'world' | 'system' | 'npc';

export interface HistoryEntry {
  id: string;
  round: number;
  actorType: ActorType;
  /** role_code，或 world / system */
  actor: string;
  actType: string;
  detail: string;
  /** 能看到这条记录的角色；空数组表示全局可见 */
  group: string[];
}

/**
 * 会话推进的阶段。
 *
 * 旧版用 meta_info 里的 location_setted / goal_setted 两个布尔量加轮次隐式表达，
 * 恢复存档时要靠一串 if 判断走到哪了。显式状态机让「从任意点续跑」变成查表。
 */
export type Phase = 'init' | 'event' | 'motivation' | 'running' | 'ended';

export interface SessionState {
  scrollId: string;
  language: Language;
  mode: 'free' | 'script';
  sceneMode: boolean;
  maxRounds: number;

  phase: Phase;
  round: number;
  subRound: number;

  /** 当前事件（free 模式）*/
  event: string;
  /** 剧本（script 模式）*/
  script: string;
  /** 剧本进度 */
  progress: string;

  characters: Record<string, CharacterState>;
  /** 本轮出场角色 */
  groupCodes: string[];
  /** 已在近几幕出场过的角色，用于换幕时避开 */
  selectedRoleCodes: string[];
  /** 最近发言者名字，喂给 decide_next_actor 降低连续发言概率 */
  recentSpeakers: string[];

  history: HistoryEntry[];
  /** 本轮起始的历史下标，用于判断本轮是否该结束 */
  roundStartIndex: number;

  /** 玩家选择扮演的角色；轮到它行动时由玩家写台词而不是 LLM 生成 */
  userRoleCode: string | null;
  /** 正在等待玩家为该角色输入；非空时推进循环暂停 */
  awaitingUserFor: string | null;
}

export interface CreateOptions {
  scrollId: string;
  language: Language;
  roleCodes: string[];
  mode?: 'free' | 'script';
  sceneMode?: boolean;
  maxRounds?: number;
  script?: string;
  intervention?: string;
  /**
   * 角色的人格画像，用来初始化记忆层。直接传 pack.roles 即可（结构兼容）。
   * 不传则所有角色的 persona 为 null，行为与加入人格模型之前一致。
   */
  roles?: Record<string, { personality?: PersonalityProfile }>;
}

export function createSession(opts: CreateOptions): SessionState {
  const characters: Record<string, CharacterState> = {};
  for (const code of opts.roleCodes) {
    const profile = opts.roles?.[code]?.personality;
    characters[code] = {
      code,
      locationCode: '',
      motivation: '',
      goal: '',
      status: '',
      activity: 1,
      moving: null,
      persona: profile ? initialPersonaState(profile) : null,
    };
  }
  return {
    scrollId: opts.scrollId,
    language: opts.language,
    mode: opts.mode ?? 'free',
    sceneMode: opts.sceneMode ?? true,
    maxRounds: opts.maxRounds ?? 10,
    phase: 'init',
    round: 0,
    subRound: 0,
    event: opts.intervention ?? '',
    script: opts.script ?? '',
    progress: '',
    characters,
    groupCodes: [],
    selectedRoleCodes: [],
    recentSpeakers: [],
    history: [],
    roundStartIndex: 0,
    userRoleCode: null,
    awaitingUserFor: null,
  };
}

/** 历史记录上限。DO 存储有大小限制，且过长历史对提示词也无益。 */
const MAX_HISTORY = 400;

export function appendHistory(state: SessionState, entry: Omit<HistoryEntry, 'id'>): HistoryEntry {
  const full: HistoryEntry = { ...entry, id: crypto.randomUUID() };
  state.history.push(full);
  if (state.history.length > MAX_HISTORY) {
    state.history.splice(0, state.history.length - MAX_HISTORY);
    state.roundStartIndex = Math.max(0, state.roundStartIndex - 1);
  }
  return full;
}

export function recentHistory(state: SessionState, count: number): string[] {
  return state.history.slice(-count).map(formatEntry);
}

export function historySince(state: SessionState, index: number): string[] {
  return state.history.slice(index).map(formatEntry);
}

function formatEntry(entry: HistoryEntry): string {
  return entry.actorType === 'role' ? `${entry.actor}: ${entry.detail}` : entry.detail;
}

/** 与某角色同处一地、且都不在移动中的角色（含自己）。 */
export function findGroup(state: SessionState, code: string): string[] {
  const self = state.characters[code];
  if (!self) return [];
  return Object.values(state.characters)
    .filter((c) => c.locationCode === self.locationCode && !c.moving)
    .map((c) => c.code);
}

export function roleCodes(state: SessionState): string[] {
  return Object.keys(state.characters);
}

export function allMoving(state: SessionState): boolean {
  const all = Object.values(state.characters);
  return all.length > 0 && all.every((c) => c.moving !== null);
}
