/**
 * 表演者：角色层面的决策与行动。
 *
 * 对应旧版 modules/main_performer.py（约 800 行，每个方法都重复
 * “try 结构化 → except 回退文本 → json_parser(eval)”三段式）。
 * 这里结构化输出的重试与自修已经下沉到 LLM 层，本文件只表达业务语义。
 */

import type { LLM } from '@/llm';
import { performerPrompts, render } from '@/prompts';

import { type ContentPack, locationName } from './content';
import { searchWorld } from './retrieval';
import {
  BatchMotivations,
  MoveResponse,
  MultiRoleResponse,
  NPCRoleResponse,
  RolePlan,
  SingleRoleResponse,
  UpdateGoal,
  UpdateStatus,
} from './schemas';
import { recentHistory, type CharacterState, type SessionState } from './state';

export interface PerformerDeps {
  llm: LLM;
  pack: ContentPack;
  topK: number;
}

/** 同场其他角色的信息，含关系描述。 */
export function otherRolesInfo(
  pack: ContentPack,
  state: SessionState,
  selfCode: string,
  group: string[],
): string {
  return group
    .filter((code) => code !== selfCode)
    .map((code) => {
      const role = pack.roles[code];
      const cs = state.characters[code];
      if (!role || !cs) return '';
      const rel = pack.roles[selfCode]?.relation?.[code];
      const relText = rel ? `，与你的关系：${rel.relation.join('、')}` : '';
      return `${role.role_name}（${code}），${role.profile}${relText}`;
    })
    .filter(Boolean)
    .join('\n');
}

function relationText(pack: ContentPack, selfCode: string, otherCode: string): string {
  const rel = pack.roles[selfCode]?.relation?.[otherCode];
  if (!rel) return '';
  return `${rel.relation.join('、')}：${rel.detail}`;
}

/** 角色可见的历史（只含 group 为空或包含自己的记录）。 */
function visibleHistory(state: SessionState, code: string, count: number): string {
  return state.history
    .filter((h) => h.group.length === 0 || h.group.includes(code))
    .slice(-count)
    .map((h) => (h.actorType === 'role' ? `${h.actor}: ${h.detail}` : h.detail))
    .join('\n');
}

// ---------- 动机 ----------

/**
 * 批量生成所有角色的动机。
 *
 * 旧版为此单独写了一个 MotivationGenerator 类（431 行），内部又直接 new 了一个
 * genai 客户端绕过适配器层，并且硬编码 model="gemini-2.5-flash"。
 * 这里就是一次结构化调用。
 */
export async function generateMotivations(
  deps: PerformerDeps,
  state: SessionState,
  codes: string[],
): Promise<Record<string, string>> {
  const P = performerPrompts(state.language);
  const roster = codes
    .map((code) => {
      const role = deps.pack.roles[code];
      return role ? `${role.role_name}：${role.profile}` : '';
    })
    .filter(Boolean)
    .join('\n');

  const prompt =
    render(P.ROLE_SET_MOTIVATION_PROMPT, {
      role_name: '（见下方角色列表中的每一位）',
      profile: roster,
      world_description: deps.pack.world.description,
      other_roles_description: roster,
    }) +
    (state.language === 'zh'
      ? `\n\n请为以下每一个角色各生成一条动机，一个都不能少：\n${roster}`
      : `\n\nGenerate one motivation for each of the following characters, omitting none:\n${roster}`);

  const result = await deps.llm.structured(prompt, BatchMotivations);

  const byName = new Map(result.motivations.map((m) => [m.role_name.trim(), m.motivation]));
  const out: Record<string, string> = {};
  for (const code of codes) {
    const role = deps.pack.roles[code];
    if (!role) continue;
    out[code] =
      byName.get(role.role_name) ??
      byName.get(role.nickname) ??
      (state.language === 'zh' ? '追求个人目标和成长' : 'Pursue personal goals and growth');
  }
  return out;
}

// ---------- 目标与状态 ----------

export async function updateGoal(
  deps: PerformerDeps,
  state: SessionState,
  code: string,
  otherRolesStatus: string,
): Promise<string | null> {
  const P = performerPrompts(state.language);
  const cs = state.characters[code];
  if (!cs) return null;

  const prompt = render(P.UPDATE_GOAL_PROMPT, {
    goal: cs.goal,
    motivation: cs.motivation,
    history: visibleHistory(state, code, 8),
    other_roles_status: otherRolesStatus,
    location: locationName(deps.pack, cs.locationCode),
  });
  try {
    const result = await deps.llm.structured(prompt, UpdateGoal);
    return result.if_change_goal && result.updated_goal ? result.updated_goal : null;
  } catch (err) {
    console.warn(`[performer] ${code} 目标更新失败，保持原目标:`, err);
    return null;
  }
}

export async function updateStatus(
  deps: PerformerDeps,
  state: SessionState,
  code: string,
): Promise<{ status: string; activity: number } | null> {
  const P = performerPrompts(state.language);
  const cs = state.characters[code];
  const role = deps.pack.roles[code];
  if (!cs || !role) return null;

  const prompt = render(P.UPDATE_STATUS_PROMPT, {
    role_name: role.role_name,
    status: cs.status,
    history_text: visibleHistory(state, code, 6),
    activity: String(cs.activity),
  });
  try {
    const result = await deps.llm.structured(prompt, UpdateStatus);
    return { status: result.updated_status, activity: result.activity };
  } catch (err) {
    console.warn(`[performer] ${code} 状态更新失败，保持原状态:`, err);
    return null;
  }
}

// ---------- 行动 ----------

export async function makePlan(
  deps: PerformerDeps,
  state: SessionState,
  code: string,
  group: string[],
): Promise<RolePlan> {
  const P = performerPrompts(state.language);
  const cs = state.characters[code] as CharacterState;
  const role = deps.pack.roles[code];
  if (!role) throw new Error(`角色 ${code} 不在内容包中`);

  const history = visibleHistory(state, code, 10);
  const references = await searchWorld(deps.pack, `${cs.goal} ${history}`, deps.topK);
  const knowledges = await searchWorld(deps.pack, role.profile, deps.topK);

  let prompt = render(P.ROLE_PLAN_PROMPT, {
    role_name: role.role_name,
    nickname: role.nickname,
    history,
    profile: role.profile,
    goal: cs.goal,
    status: cs.status,
    location: locationName(deps.pack, cs.locationCode),
    other_roles_info: otherRolesInfo(deps.pack, state, code, group),
    references: references.join('\n'),
    knowledges: knowledges.join('\n'),
  });

  if (state.event) {
    prompt += '\n' + render(P.INTERVENTION_PROMPT, { intervention: state.event });
  }
  if (state.mode === 'script' && state.script) {
    prompt += '\n' + render(P.SCRIPT_ATTENTION_PROMPT, { script: state.script });
  }

  return deps.llm.structured(prompt, RolePlan);
}

export async function singleRoleResponse(
  deps: PerformerDeps,
  state: SessionState,
  args: { code: string; actionMakerCode: string; actionDetail: string },
): Promise<SingleRoleResponse> {
  const P = performerPrompts(state.language);
  const role = deps.pack.roles[args.code];
  const maker = deps.pack.roles[args.actionMakerCode];
  const cs = state.characters[args.code];
  if (!role || !maker || !cs) throw new Error('角色不存在');

  const history = visibleHistory(state, args.code, 8);
  const references = await searchWorld(deps.pack, args.actionDetail, deps.topK);
  const knowledges = await searchWorld(deps.pack, role.profile, deps.topK);

  const prompt = render(P.ROLE_SINGLE_ROLE_RESPONSE_PROMPT, {
    role_name: role.role_name,
    nickname: role.nickname,
    action_maker_name: maker.role_name,
    action_detail: args.actionDetail,
    profile: role.profile,
    relation: relationText(deps.pack, args.code, args.actionMakerCode),
    history,
    goal: cs.goal,
    status: cs.status,
    references: references.join('\n'),
    knowledges: knowledges.join('\n'),
  });
  return deps.llm.structured(prompt, SingleRoleResponse);
}

export async function multiRoleResponse(
  deps: PerformerDeps,
  state: SessionState,
  args: { code: string; actionMakerCode: string; actionDetail: string; group: string[] },
): Promise<MultiRoleResponse> {
  const P = performerPrompts(state.language);
  const role = deps.pack.roles[args.code];
  const maker = deps.pack.roles[args.actionMakerCode];
  const cs = state.characters[args.code];
  if (!role || !maker || !cs) throw new Error('角色不存在');

  const references = await searchWorld(deps.pack, args.actionDetail, deps.topK);
  const knowledges = await searchWorld(deps.pack, role.profile, deps.topK);

  const prompt = render(P.ROLE_MULTI_ROLE_RESPONSE_PROMPT, {
    role_name: role.role_name,
    nickname: role.nickname,
    action_maker_name: maker.role_name,
    action_detail: args.actionDetail,
    history: visibleHistory(state, args.code, 8),
    profile: role.profile,
    goal: cs.goal,
    status: cs.status,
    other_roles_info: otherRolesInfo(deps.pack, state, args.code, args.group),
    references: references.join('\n'),
    knowledges: knowledges.join('\n'),
  });
  return deps.llm.structured(prompt, MultiRoleResponse);
}

export async function npcResponse(
  deps: PerformerDeps,
  state: SessionState,
  args: { code: string; npcName: string; dialogueHistory: string },
): Promise<NPCRoleResponse> {
  const P = performerPrompts(state.language);
  const role = deps.pack.roles[args.code];
  const cs = state.characters[args.code];
  if (!role || !cs) throw new Error('角色不存在');

  const references = await searchWorld(deps.pack, args.dialogueHistory, deps.topK);
  const knowledges = await searchWorld(deps.pack, role.profile, deps.topK);

  const prompt = render(P.ROLE_NPC_RESPONSE_PROMPT, {
    role_name: role.role_name,
    nickname: role.nickname,
    npc_name: args.npcName,
    profile: role.profile,
    goal: cs.goal,
    dialogue_history: args.dialogueHistory,
    references: references.join('\n'),
    knowledges: knowledges.join('\n'),
  });
  return deps.llm.structured(prompt, NPCRoleResponse);
}

// ---------- 移动 ----------

export async function decideMove(
  deps: PerformerDeps,
  state: SessionState,
  code: string,
): Promise<MoveResponse | null> {
  const P = performerPrompts(state.language);
  const cs = state.characters[code];
  const role = deps.pack.roles[code];
  if (!cs || !role) return null;

  const locationsInfo = Object.values(deps.pack.locations)
    .map((l) => `${l.location_name}（${l.location_code}）：${l.description}`)
    .join('\n');

  const prompt = render(P.ROLE_MOVE_PROMPT, {
    role_name: role.role_name,
    profile: role.profile,
    goal: cs.goal,
    status: cs.status,
    history: visibleHistory(state, code, 6),
    location: locationName(deps.pack, cs.locationCode),
    locations_info_text: locationsInfo,
  });

  try {
    const result = await deps.llm.structured(prompt, MoveResponse);
    // 旧版不校验目的地是否存在，模型编一个地点就会让角色卡在无效位置
    if (result.if_move && (!result.destination_code || !deps.pack.locations[result.destination_code])) {
      console.warn(`[performer] ${code} 返回了无效目的地 ${result.destination_code}，视为不移动`);
      return { ...result, if_move: false, destination_code: null };
    }
    return result;
  } catch (err) {
    console.warn(`[performer] ${code} 移动决策失败，视为不移动:`, err);
    return null;
  }
}
