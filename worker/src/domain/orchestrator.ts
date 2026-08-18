/**
 * 编排器：世界层面的决策。
 *
 * 对应旧版 modules/orchestrator.py + simulation/{scene,event}_manager.py。
 * 全部做成纯函数（依赖以参数传入），不持有 LLM 客户端或向量库实例，
 * 因此可以在 Durable Object 里随时被反序列化重建。
 */

import type { LLM } from '@/llm';
import { orchestratorPrompts, render, type Language } from '@/prompts';

import {
  type ContentPack,
  locationName,
  nameToCode,
} from './content';
import { searchWorld } from './retrieval';
import {
  EventText,
  JudgeIfEnded,
  SceneActors,
  ScriptInstruction,
  ScriptText,
  StoryText,
} from './schemas';
import { recentHistory, type SessionState } from './state';

export interface OrchestratorDeps {
  llm: LLM;
  pack: ContentPack;
  topK: number;
}

/** 角色信息文本，喂给需要“谁在场、在哪、什么状态”的提示词。 */
export function rolesInfoText(
  pack: ContentPack,
  state: SessionState,
  codes: string[],
  withStatus = true,
): string {
  return codes
    .map((code) => {
      const role = pack.roles[code];
      const cs = state.characters[code];
      if (!role || !cs) return '';
      const loc = locationName(pack, cs.locationCode);
      const status = withStatus && cs.status ? `，当前状态：${cs.status}` : '';
      return `${role.role_name}（${code}）位于 ${loc}${status}`;
    })
    .filter(Boolean)
    .join('\n');
}

// ---------- 事件 ----------

export async function generateEvent(
  deps: OrchestratorDeps,
  state: SessionState,
  codes: string[],
): Promise<string> {
  const P = orchestratorPrompts(state.language);
  const prompt = render(P.GENERATE_INTERVENTION_PROMPT, {
    world_description: deps.pack.world.description,
    roles_info: rolesInfoText(deps.pack, state, codes, false),
    history_text: recentHistory(state, 10).join('\n'),
  });
  const result = await deps.llm.structured(prompt, EventText);
  return result.event.trim();
}

export async function updateEvent(
  deps: OrchestratorDeps,
  state: SessionState,
): Promise<string> {
  const P = orchestratorPrompts(state.language);
  const prompt = render(P.UPDATE_EVENT_PROMPT, {
    intervention: state.event,
    history: recentHistory(state, 10).join('\n'),
    event: state.event,
  });
  const result = await deps.llm.structured(prompt, EventText);
  return result.event.trim();
}

export async function generateScript(
  deps: OrchestratorDeps,
  state: SessionState,
  codes: string[],
): Promise<string> {
  const P = orchestratorPrompts(state.language);
  const prompt = render(P.GENERATE_INTERVENTION_PROMPT, {
    world_description: deps.pack.world.description,
    roles_info: rolesInfoText(deps.pack, state, codes, false),
    history_text: recentHistory(state, 10).join('\n'),
  });
  const result = await deps.llm.structured(prompt, ScriptText);
  return result.script.trim();
}

export async function scriptInstruction(
  deps: OrchestratorDeps,
  state: SessionState,
  codes: string[],
): Promise<ScriptInstruction> {
  const P = orchestratorPrompts(state.language);
  const prompt = render(P.SCRIPT_INSTRUCTION_PROMPT, {
    script: state.script,
    last_progress: state.progress,
    roles_info: rolesInfoText(deps.pack, state, codes),
    event: state.event,
    history_text: recentHistory(state, 10).join('\n'),
  });
  return deps.llm.structured(prompt, ScriptInstruction);
}

// ---------- 选角 ----------

/**
 * 选出下一幕的出场角色。
 *
 * 旧版提示词要求“返回能被 eval() 解析的列表”，然后真的用 eval 去解析；
 * 现在走 JSON Schema，并且对结果做有效性过滤——旧版不过滤，
 * 模型偶尔返回不存在的 role_code 就会让后续用它当字典键而 KeyError。
 */
export async function decideSceneActors(
  deps: OrchestratorDeps,
  state: SessionState,
  candidates: string[],
): Promise<string[]> {
  const P = orchestratorPrompts(state.language);
  const prompt = render(P.SELECT_SCREEN_ACTORS_PROMPT, {
    previous_role_codes: state.selectedRoleCodes.join(', '),
    roles_info: rolesInfoText(deps.pack, state, candidates),
    history_text: recentHistory(state, 6).join('\n'),
    event: state.event,
  });

  try {
    const result = await deps.llm.structured(prompt, SceneActors);
    const valid = result.role_codes
      .map((c) => (deps.pack.roles[c] ? c : nameToCode(deps.pack, c)))
      .filter((c): c is string => Boolean(c) && candidates.includes(c as string));
    if (valid.length > 0) return [...new Set(valid)];
  } catch (err) {
    console.warn('[orchestrator] 选角失败，回退到同地点分组:', err);
  }

  // 回退：取人数最多的地点上的角色，保证“同一地点”这条硬要求成立
  return fallbackSceneActors(state, candidates);
}

function fallbackSceneActors(state: SessionState, candidates: string[]): string[] {
  const byLocation = new Map<string, string[]>();
  for (const code of candidates) {
    const cs = state.characters[code];
    if (!cs || cs.moving) continue;
    const list = byLocation.get(cs.locationCode) ?? [];
    list.push(code);
    byLocation.set(cs.locationCode, list);
  }
  let best: string[] = [];
  for (const list of byLocation.values()) {
    if (list.length > best.length) best = list;
  }
  return best.length > 0 ? best : candidates.slice(0, 1);
}

/**
 * 决定下一个行动的角色。
 *
 * 旧版把“最近发言者”作为一段中文指令拼在提示词尾部（模板里没有这个占位符），
 * 这里保持同样做法以维持提示词语义一致。
 */
export async function decideNextActor(
  deps: OrchestratorDeps,
  state: SessionState,
  group: string[],
  fallback: string,
): Promise<string> {
  const P = orchestratorPrompts(state.language);
  let prompt = render(P.DECIDE_NEXT_ACTOR_PROMPT, {
    roles_info: rolesInfoText(deps.pack, state, group),
    history_text: recentHistory(state, 3).join('\n'),
  });

  const recent = state.recentSpeakers.slice(-2);
  if (recent.length > 0) {
    prompt +=
      state.language === 'zh'
        ? `\n请注意，以下角色最近刚刚发言过：${recent.join(', ')}。` +
          '为了保持对话流畅，请尽量选择其他角色发言，除非当前情境必须由该角色回应。'
        : `\nNote that the following characters have just spoken: ${recent.join(', ')}.` +
          ' To keep the conversation flowing, please try to choose other characters to speak,' +
          ' unless the current situation requires a response from that character.';
  }

  try {
    const raw = await deps.llm.complete(prompt, { temperature: 0.6 });
    const code = deps.pack.roles[raw.trim()] ? raw.trim() : nameToCode(deps.pack, raw);
    if (code && group.includes(code)) return code;
    console.warn(`[orchestrator] decide_next_actor 返回无效角色 "${raw}"，回退到 ${fallback}`);
  } catch (err) {
    console.warn('[orchestrator] decide_next_actor 失败，回退:', err);
  }
  return fallback;
}

// ---------- 判定与叙述 ----------

/**
 * 判断本幕是否该结束。
 *
 * 旧版把默认值设成 `{"if_end": True}`——三次调用都失败时会**直接把故事结束掉**。
 * 这里默认不结束：判定失败只是少了一次收束机会，轮次上限仍然兜底，
 * 比让玩家的剧情凭空中断要好。
 */
export async function judgeIfEnded(
  deps: OrchestratorDeps,
  state: SessionState,
  historyText: string,
): Promise<{ ifEnd: boolean; detail: string }> {
  const P = orchestratorPrompts(state.language);
  const prompt = render(P.JUDGE_IF_ENDED_PROMPT, { history: historyText });
  try {
    const result = await deps.llm.structured(prompt, JudgeIfEnded);
    return { ifEnd: result.if_end, detail: result.detail };
  } catch (err) {
    console.warn('[orchestrator] 结束判定失败，按“继续”处理:', err);
    return { ifEnd: false, detail: '' };
  }
}

export async function environmentInteraction(
  deps: OrchestratorDeps,
  state: SessionState,
  args: { roleName: string; locationCode: string; action: string; actionDetail: string },
): Promise<string> {
  const P = orchestratorPrompts(state.language);
  const loc = deps.pack.locations[args.locationCode];
  const references = await searchWorld(deps.pack, args.actionDetail, deps.topK);
  const prompt = render(P.ENVIROMENT_INTERACTION_PROMPT, {
    role_name: args.roleName,
    location: locationName(deps.pack, args.locationCode),
    action: args.action,
    action_detail: args.actionDetail,
    location_description: loc?.detail ?? loc?.description ?? '',
    world_description: deps.pack.world.description,
    references: references.join('\n'),
  });
  return deps.llm.complete(prompt);
}

export async function npcInteraction(
  deps: OrchestratorDeps,
  state: SessionState,
  args: { target: string; roleName: string; locationCode: string; actionDetail: string },
): Promise<string> {
  const P = orchestratorPrompts(state.language);
  const references = await searchWorld(deps.pack, args.actionDetail, deps.topK);
  const prompt = render(P.NPC_INTERACTION_PROMPT, {
    target: args.target,
    role_name: args.roleName,
    location: locationName(deps.pack, args.locationCode),
    action_detail: args.actionDetail,
    world_description: deps.pack.world.description,
    references: references.join('\n'),
  });
  return deps.llm.complete(prompt);
}

export async function locationPrologue(
  deps: OrchestratorDeps,
  state: SessionState,
  locationCode: string,
): Promise<string> {
  const P = orchestratorPrompts(state.language);
  const loc = deps.pack.locations[locationCode];
  const prompt = render(P.LOCATION_PROLOGUE_PROMPT, {
    event: state.event,
    world_description: deps.pack.world.description,
    location_info: loc?.detail ?? '',
    history_text: recentHistory(state, 5).join('\n'),
    location_name: locationName(deps.pack, locationCode),
    location_description: loc?.description ?? '',
  });
  return deps.llm.complete(prompt);
}

/** 把行动日志改写成小说体故事。 */
export async function logsToStory(
  deps: OrchestratorDeps,
  language: Language,
  logs: string,
): Promise<string> {
  const P = orchestratorPrompts(language);
  const prompt = render(P.LOG2STORY_PROMPT, { logs });
  const result = await deps.llm.structured(prompt, StoryText);
  return result.story;
}
