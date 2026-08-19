/**
 * 剧情引擎。
 *
 * 旧版是一个 400 行的生成器 simulate_generator()：从选地点、生成事件、批量动机
 * 一路 yield 到轮次循环，全部状态挂在活对象上。进程一停，剧情就没了。
 *
 * 这里改成**显式状态机**：每次 step() 推进一小段，把消息交给 emit 回调，
 * 并就地更新可序列化的 SessionState。Durable Object 在每步之后落盘，
 * 因此实例被驱逐、重启、迁移都能从断点继续。
 */

import type { LLM } from '@/llm';

import { type ContentPack, locationName, nameToCode } from './content';
import * as orch from './orchestrator';
import { applyInteraction } from './persona';
import * as perf from './performer';
import type { RolePlan } from './schemas';
import {
  allMoving,
  appendHistory,
  findGroup,
  historySince,
  roleCodes,
  type SessionState,
} from './state';

export interface OutMessage {
  /** await_user 不是一条展示消息，而是让 DO 发 waiting_for_user_input 的信号 */
  type: 'system' | 'world' | 'role' | 'npc' | 'await_user';
  roleCode?: string;
  name?: string;
  text: string;
  id?: string;
}

export type Emit = (msg: OutMessage) => void;

/** 每轮内的子回合数，与旧版一致。 */
const SUB_ROUNDS = 3;

export class StoryEngine {
  private readonly roleDeps: perf.PerformerDeps;
  private readonly worldDeps: orch.OrchestratorDeps;

  constructor(
    private readonly pack: ContentPack,
    private readonly state: SessionState,
    roleLlm: LLM,
    worldLlm: LLM,
    topK: number,
  ) {
    this.roleDeps = { llm: roleLlm, pack, topK };
    this.worldDeps = { llm: worldLlm, pack, topK };
  }

  get snapshot(): SessionState {
    return this.state;
  }

  /**
   * 推进一步。返回 false 表示故事已结束。
   *
   * 一步的粒度刻意做小（一个子回合内的一个角色行动），
   * 这样单次调用的耗时可控，落盘频率也够密。
   */
  async step(emit: Emit): Promise<boolean> {
    switch (this.state.phase) {
      case 'init':
        await this.doInit(emit);
        return true;
      case 'event':
        await this.doEvent(emit);
        return true;
      case 'motivation':
        await this.doMotivation(emit);
        return true;
      case 'running':
        return this.doRound(emit);
      case 'ended':
        return false;
    }
  }

  // ---------- 阶段实现 ----------

  /** 给所有角色随机分配初始地点。 */
  private async doInit(emit: Emit): Promise<void> {
    const locations = Object.keys(this.pack.locations);
    if (locations.length === 0) throw new Error('内容包里没有任何地点');

    for (const code of roleCodes(this.state)) {
      const pick = locations[Math.floor(Math.random() * locations.length)] as string;
      const cs = this.state.characters[code];
      if (cs) cs.locationCode = pick;
    }
    this.state.phase = 'event';
    emit({ type: 'system', text: this.t('书卷加载中...', 'Loading scroll...') });
  }

  private async doEvent(emit: Emit): Promise<void> {
    const codes = roleCodes(this.state);
    if (this.state.mode === 'script') {
      if (!this.state.script) {
        this.state.script = await orch.generateScript(this.worldDeps, this.state, codes);
      }
      emit({ type: 'system', text: `--------- 设定剧本 ---------\n${this.state.script}\n` });
    } else {
      if (!this.state.event) {
        this.state.event = await orch.generateEvent(this.worldDeps, this.state, codes);
      }
      emit({ type: 'system', text: `--------- Current Event ---------\n${this.state.event}\n` });
    }
    appendHistory(this.state, {
      round: this.state.round,
      actorType: 'world',
      actor: 'world',
      actType: 'event',
      detail: this.state.event || this.state.script,
      group: [],
    });
    this.state.phase = 'motivation';
  }

  /**
   * 批量设定动机。
   *
   * 与旧版一致：动机只记录进历史，不推送到对话页面（它是角色的隐藏驱动力，
   * 直接展示会剧透）。
   */
  private async doMotivation(emit: Emit): Promise<void> {
    const codes = roleCodes(this.state);
    try {
      const motivations = await perf.generateMotivations(this.roleDeps, this.state, codes);
      for (const code of codes) {
        const cs = this.state.characters[code];
        const role = this.pack.roles[code];
        if (!cs || !role) continue;
        cs.motivation = motivations[code] ?? '';
        cs.goal = cs.motivation;
        const detail = this.t(
          `${role.nickname} 设立了动机: ${cs.motivation}`,
          `${role.nickname} has set the motivation: ${cs.motivation}`,
        );
        const entry = appendHistory(this.state, {
          round: 0,
          actorType: 'role',
          actor: code,
          actType: 'goal setting',
          detail,
          group: [code],
        });
        // 推到前端显示。早期版本（cc905dc）就是 yield 出去的，stable 改成了只记录，
        // 但角色多时开局要等很久，没有任何反馈；显示出来既有进度感也交代了人物动机。
        emit({ type: 'role', roleCode: code, name: role.role_name, text: detail, id: entry.id });
      }
    } catch (err) {
      // 动机缺失不该阻断开局——用角色简介兜底，剧情仍可推进
      console.warn('[engine] 批量动机生成失败，使用简介兜底:', err);
      for (const code of codes) {
        const cs = this.state.characters[code];
        const role = this.pack.roles[code];
        if (cs && role && !cs.motivation) {
          cs.motivation = role.profile.slice(0, 60);
          cs.goal = cs.motivation;
        }
      }
    }
    this.state.phase = 'running';
    this.state.roundStartIndex = this.state.history.length;
    emit({ type: 'system', text: '-- Simulation Started --' });
  }

  /** 推进一个子回合。 */
  private async doRound(emit: Emit): Promise<boolean> {
    if (this.state.round >= this.state.maxRounds) {
      this.state.phase = 'ended';
      emit({ type: 'system', text: this.t('-- 故事结束 --', '-- The End --') });
      return false;
    }

    // 全员都在路上：直接结算移动，跳过本轮
    if (allMoving(this.state)) {
      this.settleMovement(emit);
      this.state.round += 1;
      return true;
    }

    // 子回合 0：选出本幕出场角色
    if (this.state.subRound === 0) {
      await this.pickScene(emit);
    }

    const group = this.state.groupCodes;
    if (group.length === 0) {
      this.state.round += 1;
      this.state.subRound = 0;
      return true;
    }

    // 更新本幕角色的目标
    const statusText = orch.rolesInfoText(this.pack, this.state, roleCodes(this.state));
    for (const code of group) {
      const updated = await perf.updateGoal(this.roleDeps, this.state, code, statusText);
      const cs = this.state.characters[code];
      if (updated && cs) cs.goal = updated;
    }

    // 依次让角色行动
    for (const code of group) {
      if (this.state.awaitingUserFor) return true; // 等玩家输入，先让出控制权
      const actor = this.state.sceneMode
        ? await orch.decideNextActor(this.worldDeps, this.state, group, code)
        : code;
      const role = this.pack.roles[actor];
      if (role) {
        this.state.recentSpeakers.push(role.role_name);
        this.state.recentSpeakers = this.state.recentSpeakers.slice(-4);
      }
      await this.performAction(emit, actor, group);
    }

    // 判断本幕是否收束
    const since = historySince(this.state, this.state.roundStartIndex).join('\n');
    const verdict = await orch.judgeIfEnded(this.worldDeps, this.state, since);
    this.state.subRound += 1;

    if (verdict.ifEnd || this.state.subRound >= SUB_ROUNDS) {
      if (verdict.ifEnd && verdict.detail) {
        const entry = appendHistory(this.state, {
          round: this.state.round,
          actorType: 'world',
          actor: 'world',
          actType: 'epilogue',
          detail: verdict.detail,
          group: [],
        });
        emit({ type: 'world', text: `--Epilogue--: ${verdict.detail}`, id: entry.id });
      }
      await this.endRound(emit, group);
    }
    return true;
  }

  private async pickScene(emit: Emit): Promise<void> {
    const all = roleCodes(this.state);
    if (this.state.sceneMode) {
      const candidates = all.filter((c) => !this.state.characters[c]?.moving);
      const group = await orch.decideSceneActors(this.worldDeps, this.state, candidates);
      this.state.groupCodes = group;
      this.state.selectedRoleCodes = [...this.state.selectedRoleCodes, ...group];
      if (this.state.selectedRoleCodes.length >= all.length) {
        this.state.selectedRoleCodes = [];
      }
    } else {
      this.state.groupCodes = all;
    }
    this.state.roundStartIndex = this.state.history.length;

    // 换幕时给一段地点开场白，与旧版的 LOCATION_PROLOGUE 行为一致
    const first = this.state.groupCodes[0];
    const loc = first ? this.state.characters[first]?.locationCode : undefined;
    if (loc && this.state.round > 0) {
      try {
        const prologue = await orch.locationPrologue(this.worldDeps, this.state, loc);
        if (prologue.trim()) {
          emit({ type: 'world', text: prologue });
        }
      } catch (err) {
        console.warn('[engine] 开场白生成失败，跳过:', err);
      }
    }
  }

  /**
   * 让一个角色行动，并按互动类型展开后续对话。
   *
   * 这里修掉了旧版的一处硬伤：interaction_handler 判断的是
   * `single` / `multi` / `enviroment`（拼写错误），而 schema 与提示词给出的
   * 取值是 `role` / `environment` / `npc` / `no`——四种互动里三种永远命中不了，
   * 角色发完各自的独白就结束，从不真正互相回应。
   */
  private async performAction(emit: Emit, code: string, group: string[]): Promise<void> {
    const role = this.pack.roles[code];
    const cs = this.state.characters[code];
    if (!role || !cs) return;

    // 玩家扮演的角色由玩家自己写台词：挂起循环，等 user_message 回来再继续
    if (this.state.userRoleCode === code) {
      this.state.awaitingUserFor = code;
      emit({
        type: 'await_user',
        roleCode: code,
        name: role.role_name,
        text: this.t('轮到你行动了', 'It is your turn to act'),
      });
      return;
    }

    let plan: RolePlan;
    try {
      plan = await perf.makePlan(this.roleDeps, this.state, code, group);
    } catch (err) {
      console.warn(`[engine] ${code} 行动规划失败，跳过本次行动:`, err);
      return;
    }

    // 模型给的可能是角色名而非 code，统一归一化并过滤掉不在场的
    const targets = plan.target_role_codes
      .map((t) => (this.pack.roles[t] ? t : nameToCode(this.pack, t)))
      .filter((t): t is string => Boolean(t) && group.includes(t as string) && t !== code);

    const entry = appendHistory(this.state, {
      round: this.state.round,
      actorType: 'role',
      actor: code,
      actType: 'plan',
      detail: plan.detail,
      group: [...targets, code],
    });
    emit({ type: 'role', roleCode: code, name: role.role_name, text: plan.detail, id: entry.id });

    switch (plan.interact_type) {
      case 'role':
        if (targets.length === 1) {
          await this.roleInteraction(emit, code, targets[0] as string, plan.detail);
        } else if (targets.length > 1) {
          await this.multiInteraction(emit, code, targets, plan.detail, group);
        }
        break;
      case 'environment':
        await this.environmentInteraction(emit, code, plan);
        break;
      case 'npc':
        if (plan.target_npc_name) {
          await this.npcInteraction(emit, code, plan.target_npc_name, plan.detail);
        }
        break;
      case 'no':
        break;
    }
  }

  /**
   * 一次对话之后更新双方的记忆层（心情 / 能量 / 亲密度）。
   *
   * 旧版只更新应答方，而且传的是**它自己刚说出口的那句话**，等于让角色
   * 对自己的话产生情绪；发起方则完全不受影响，关系永远是单向的。
   * 这里两边都更新，且各自处理的是「对方说了什么」。
   */
  private exchange(aCode: string, bCode: string, aHeard: string, bHeard: string): void {
    this.updatePersona(aCode, bCode, aHeard);
    this.updatePersona(bCode, aCode, bHeard);
  }

  private updatePersona(code: string, otherCode: string, heard: string): void {
    const profile = this.pack.roles[code]?.personality;
    const cs = this.state.characters[code];
    if (!profile || !cs?.persona) return;
    applyInteraction(profile, cs.persona, {
      text: heard,
      otherCode,
      lang: this.state.language,
    });
  }

  private async roleInteraction(
    emit: Emit,
    makerCode: string,
    targetCode: string,
    detail: string,
  ): Promise<void> {
    try {
      const reply = await perf.singleRoleResponse(this.roleDeps, this.state, {
        code: targetCode,
        actionMakerCode: makerCode,
        actionDetail: detail,
      });
      const role = this.pack.roles[targetCode];
      const entry = appendHistory(this.state, {
        round: this.state.round,
        actorType: 'role',
        actor: targetCode,
        actType: 'response',
        detail: reply.detail,
        group: [makerCode, targetCode],
      });
      emit({
        type: 'role',
        roleCode: targetCode,
        name: role?.role_name,
        text: reply.detail,
        id: entry.id,
      });
      this.exchange(targetCode, makerCode, detail, reply.detail);
    } catch (err) {
      console.warn(`[engine] ${targetCode} 回应失败:`, err);
    }
  }

  private async multiInteraction(
    emit: Emit,
    makerCode: string,
    targets: string[],
    detail: string,
    group: string[],
  ): Promise<void> {
    for (const targetCode of targets) {
      try {
        const reply = await perf.multiRoleResponse(this.roleDeps, this.state, {
          code: targetCode,
          actionMakerCode: makerCode,
          actionDetail: detail,
          group,
        });
        const role = this.pack.roles[targetCode];
        const entry = appendHistory(this.state, {
          round: this.state.round,
          actorType: 'role',
          actor: targetCode,
          actType: 'response',
          detail: reply.detail,
          group: [...targets, makerCode],
        });
        emit({
          type: 'role',
          roleCode: targetCode,
          name: role?.role_name,
          text: reply.detail,
          id: entry.id,
        });
        this.exchange(targetCode, makerCode, detail, reply.detail);
        if (reply.if_end_interaction) break;
      } catch (err) {
        console.warn(`[engine] ${targetCode} 群体回应失败:`, err);
      }
    }
  }

  private async environmentInteraction(emit: Emit, code: string, plan: RolePlan): Promise<void> {
    const role = this.pack.roles[code];
    const cs = this.state.characters[code];
    if (!role || !cs) return;
    try {
      const text = await orch.environmentInteraction(this.worldDeps, this.state, {
        roleName: role.role_name,
        locationCode: cs.locationCode,
        action: plan.action,
        actionDetail: plan.detail,
      });
      if (!text.trim()) return;
      const entry = appendHistory(this.state, {
        round: this.state.round,
        actorType: 'world',
        actor: 'world',
        actType: 'environment',
        detail: text,
        group: [code],
      });
      emit({ type: 'world', text, id: entry.id });
    } catch (err) {
      console.warn('[engine] 环境互动失败:', err);
    }
  }

  private async npcInteraction(
    emit: Emit,
    code: string,
    npcName: string,
    detail: string,
  ): Promise<void> {
    const cs = this.state.characters[code];
    const role = this.pack.roles[code];
    if (!cs || !role) return;
    try {
      const npcText = await orch.npcInteraction(this.worldDeps, this.state, {
        target: npcName,
        roleName: role.role_name,
        locationCode: cs.locationCode,
        actionDetail: detail,
      });
      const entry = appendHistory(this.state, {
        round: this.state.round,
        actorType: 'npc',
        actor: npcName,
        actType: 'npc',
        detail: npcText,
        group: [code],
      });
      emit({ type: 'npc', name: npcName, text: npcText, id: entry.id });

      const reply = await perf.npcResponse(this.roleDeps, this.state, {
        code,
        npcName,
        dialogueHistory: `${detail}\n${npcName}: ${npcText}`,
      });
      const replyEntry = appendHistory(this.state, {
        round: this.state.round,
        actorType: 'role',
        actor: code,
        actType: 'npc response',
        detail: reply.detail,
        group: [code],
      });
      emit({
        type: 'role',
        roleCode: code,
        name: role.role_name,
        text: reply.detail,
        id: replyEntry.id,
      });
    } catch (err) {
      console.warn('[engine] NPC 互动失败:', err);
    }
  }

  /** 一轮结束：更新状态、决定移动、推进事件。 */
  private async endRound(emit: Emit, group: string[]): Promise<void> {
    for (const code of group) {
      const move = await perf.decideMove(this.roleDeps, this.state, code);
      const cs = this.state.characters[code];
      if (!cs) continue;

      if (move?.if_move && move.destination_code) {
        cs.moving = {
          to: move.destination_code,
          remaining: this.distanceTo(cs.locationCode, move.destination_code),
        };
        const entry = appendHistory(this.state, {
          round: this.state.round,
          actorType: 'role',
          actor: code,
          actType: 'move',
          detail: move.detail,
          group: findGroup(this.state, code),
        });
        emit({
          type: 'role',
          roleCode: code,
          name: this.pack.roles[code]?.role_name,
          text: move.detail,
          id: entry.id,
        });
      }

      const status = await perf.updateStatus(this.roleDeps, this.state, code);
      if (status) {
        cs.status = status.status;
        cs.activity = status.activity;
      }
    }

    this.settleMovement(emit);

    if (this.state.mode === 'free') {
      try {
        this.state.event = await orch.updateEvent(this.worldDeps, this.state);
      } catch (err) {
        console.warn('[engine] 事件更新失败，沿用原事件:', err);
      }
    }

    this.state.round += 1;
    this.state.subRound = 0;
    this.state.groupCodes = [];
    this.state.recentSpeakers = [];
  }

  /** 结算移动：每轮推进一格，到达后落地。 */
  private settleMovement(emit: Emit): void {
    for (const cs of Object.values(this.state.characters)) {
      if (!cs.moving) continue;
      cs.moving.remaining -= 1;
      if (cs.moving.remaining <= 0) {
        cs.locationCode = cs.moving.to;
        cs.moving = null;
        const role = this.pack.roles[cs.code];
        emit({
          type: 'system',
          text: this.t(
            `${role?.role_name ?? cs.code} 抵达了 ${locationName(this.pack, cs.locationCode)}`,
            `${role?.role_name ?? cs.code} arrived at ${locationName(this.pack, cs.locationCode)}`,
          ),
        });
      }
    }
  }

  private distanceTo(from: string, to: string): number {
    const key = `${from}\t${to}`;
    const rev = `${to}\t${from}`;
    return Math.max(1, this.pack.adjacency[key] ?? this.pack.adjacency[rev] ?? 1);
  }

  private t(zh: string, en: string): string {
    return this.state.language === 'zh' ? zh : en;
  }
}
