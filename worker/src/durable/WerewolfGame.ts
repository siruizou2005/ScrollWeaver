/**
 * 狼人杀：人类 1 名 + AI 若干，支持 6/8/12 人三种板子。
 *
 * 对应旧版 modules/werewolf/（3352 行，拆成 config_loader / role_registry /
 * rule_engine / game_state / orchestrator / performer / session 七个文件，
 * 角色能力还外置成 JSON 再由注册表加载）。那套抽象是为「自定义角色」准备的，
 * 但项目里只用到内置的 6 个角色，所以这里按实际规模实现：
 * 阶段流转是显式状态机，角色能力直接编码。
 *
 * 线协议完全对齐 frontend/js/pages/werewolf.js，不改前端：
 *   服务端 → 客户端： { type, data }
 *   客户端 → 服务端： { action_type, target } 或 { action_type: 'speech', content }
 *   玩家 ID 必须是 player_0(人类) … player_{N-1}，前端用 split('_')[1] 取编号
 */

import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';

import { loadConfig, type Env } from '@/config';
import { getLLM } from '@/llm';

type RoleId = 'werewolf' | 'seer' | 'witch' | 'hunter' | 'guard' | 'villager';
type Camp = 'werewolf' | 'villager';

interface RoleMeta {
  name: string;
  camp: Camp;
  description: string;
}

const ROLES: Record<RoleId, RoleMeta> = {
  werewolf: { name: '狼人', camp: 'werewolf', description: '每晚与同伴共同选择一名玩家击杀，白天伪装成好人。' },
  seer: { name: '预言家', camp: 'villager', description: '每晚可查验一名玩家的真实阵营。' },
  witch: { name: '女巫', camp: 'villager', description: '拥有一瓶解药和一瓶毒药，各只能用一次。' },
  hunter: { name: '猎人', camp: 'villager', description: '被狼人击杀或被投票放逐时，可以开枪带走一名玩家。' },
  guard: { name: '守卫', camp: 'villager', description: '每晚守护一名玩家免于狼人击杀，不能连续两晚守同一人。' },
  villager: { name: '村民', camp: 'villager', description: '没有特殊能力，靠推理找出狼人。' },
};

/** 三种板子，与 frontend/pages/werewolf.html 的选项一一对应。 */
const PRESETS: Record<string, RoleId[]> = {
  // 12人标准局 (4狼4神4民)
  standard_12: [
    'werewolf', 'werewolf', 'werewolf', 'werewolf',
    'seer', 'witch', 'hunter', 'guard',
    'villager', 'villager', 'villager', 'villager',
  ],
  // 8人娱乐局 (2狼2神4民)
  simple_8: [
    'werewolf', 'werewolf',
    'seer', 'witch',
    'villager', 'villager', 'villager', 'villager',
  ],
  // 6人新手局 (2狼2神2民)
  simple_6: ['werewolf', 'werewolf', 'seer', 'witch', 'villager', 'villager'],
};

type Phase =
  | 'waiting'
  | 'night_guard'
  | 'night_werewolf'
  | 'night_seer'
  | 'night_witch'
  | 'day_announce'
  | 'day_discussion'
  | 'day_vote'
  | 'ended';

interface Player {
  id: string;
  role: RoleId;
  alive: boolean;
  isHuman: boolean;
}

interface NightStatus {
  killTarget: string | null;
  guarded: string | null;
  saved: boolean;
  poisoned: string | null;
  seerResult: { target: string; isWerewolf: boolean } | null;
}

interface GameState {
  preset: string;
  round: number;
  phase: Phase;
  players: Player[];
  humanId: string;
  night: NightStatus;
  witchAntidoteUsed: boolean;
  witchPoisonUsed: boolean;
  /** 守卫上一晚守护的对象，用于「不能连守」规则 */
  lastGuarded: string | null;
  /** 待开枪的猎人；非空时流程会停下来等他选择 */
  pendingHunter: string | null;
  speeches: { round: number; playerId: string; content: string }[];
  votes: Record<string, string>;
  winner: Camp | null;
}

const STATE_KEY = 'werewolf';
const ACTION_TIMEOUT = 60;

const Speech = z.object({
  speech: z.string().describe('你的发言，60-120字，符合身份策略，不要暴露不该暴露的信息'),
});

const Choice = z.object({
  target: z.string().describe('目标玩家的编号，例如 "玩家3"'),
  reason: z.string().describe('简短理由，30字以内'),
});

const WitchChoice = z.object({
  use_antidote: z.boolean().describe('是否使用解药救人'),
  poison_target: z.string().nullable().describe('要毒杀的玩家编号；不用毒药则为 null'),
});

export class WerewolfGame extends DurableObject<Env> {
  private game: GameState | null = null;

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);

    // 建连即开局：前端连上后不再发 start，直接等 game_start
    const preset = new URL(request.url).searchParams.get('preset') ?? 'simple_8';
    const preferred = new URL(request.url).searchParams.get('preferred_role') ?? '';
    this.ctx.waitUntil(this.bootstrap(preset, preferred));
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;
    let msg: { action_type?: string; target?: string | null; content?: string };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return;
    }

    try {
      const game = await this.load();
      if (!game) return this.send(ws, 'error', { message: '对局尚未开始' });

      if (msg.action_type === 'speech') {
        return await this.onSpeech(ws, game, String(msg.content ?? ''));
      }
      return await this.onAction(ws, game, msg.action_type ?? '', msg.target ?? null);
    } catch (err) {
      console.error('[Werewolf] 处理失败:', err);
      this.send(ws, 'error', { message: err instanceof Error ? err.message : '服务端错误' });
    }
  }

  // ---------- 开局 ----------

  private async bootstrap(presetName: string, preferredRole: string): Promise<void> {
    if (await this.load()) return; // 重连时不重开

    const composition = PRESETS[presetName] ?? PRESETS.simple_8 as RoleId[];
    const roles = [...composition];
    shuffle(roles);

    // 人类固定是 player_0（前端硬编码），若指定了身份就把它换到 0 号位
    if (preferredRole && roles.includes(preferredRole as RoleId)) {
      const idx = roles.indexOf(preferredRole as RoleId);
      [roles[0], roles[idx]] = [roles[idx] as RoleId, roles[0] as RoleId];
    }

    const players: Player[] = roles.map((role, i) => ({
      id: `player_${i}`,
      role,
      alive: true,
      isHuman: i === 0,
    }));

    const game: GameState = {
      preset: presetName,
      round: 1,
      phase: 'waiting',
      players,
      humanId: 'player_0',
      night: { killTarget: null, guarded: null, saved: false, poisoned: null, seerResult: null },
      witchAntidoteUsed: false,
      witchPoisonUsed: false,
      lastGuarded: null,
      pendingHunter: null,
      speeches: [],
      votes: {},
      winner: null,
    };
    await this.save(game);

    const human = this.human(game);
    const meta = ROLES[human.role];
    this.broadcast('game_start', { config: { total_players: players.length, preset: presetName } });
    this.broadcast('role_reveal', {
      role_id: human.role,
      role_name: meta.name,
      description: meta.description,
      camp: meta.camp,
      // 狼人之间互相可见
      teammates:
        human.role === 'werewolf'
          ? players.filter((p) => p.role === 'werewolf' && p.id !== human.id).map((p) => p.id)
          : [],
    });
    this.sendStates(game);

    game.phase = this.firstPhase(game);
    await this.save(game);
    this.broadcast('phase_change', { phase: game.phase, round: game.round });
    await this.advance(game);
  }

  /** 板子里没有守卫时跳过守卫夜。 */
  private firstPhase(game: GameState): Phase {
    return game.players.some((p) => p.role === 'guard') ? 'night_guard' : 'night_werewolf';
  }

  // ---------- 阶段推进 ----------

  private async advance(game: GameState): Promise<void> {
    for (;;) {
      if (game.winner) return;

      // 猎人开枪会打断任何阶段
      if (game.pendingHunter) {
        const hunter = this.byId(game, game.pendingHunter);
        if (hunter?.isHuman) {
          await this.save(game);
          return this.requestAction(game, [
            {
              action_type: 'hunter_shoot',
              description: '开枪带走一名玩家',
              targets: this.aliveIds(game, hunter.id),
              can_skip: true,
            },
          ]);
        }
        if (hunter) await this.aiHunterShoot(game, hunter);
        game.pendingHunter = null;
        if (this.checkWin(game)) return;
      }

      switch (game.phase) {
        case 'night_guard': {
          const guard = game.players.find((p) => p.role === 'guard' && p.alive);
          if (guard?.isHuman) {
            await this.save(game);
            return this.requestAction(game, [
              {
                action_type: 'guard_protect',
                description: '守护一名玩家',
                // 不能连续两晚守同一人
                targets: this.aliveIds(game).filter((id) => id !== game.lastGuarded),
                can_skip: true,
              },
            ]);
          }
          if (guard) game.night.guarded = await this.aiPick(game, guard, 'guard');
          this.broadcast('announcement', { message: '守卫已行动。' });
          break;
        }

        case 'night_werewolf': {
          const human = this.human(game);
          if (human.alive && human.role === 'werewolf' && !game.night.killTarget) {
            await this.save(game);
            return this.requestAction(game, [
              {
                action_type: 'werewolf_kill',
                description: '选择今晚要击杀的玩家',
                targets: game.players
                  .filter((p) => p.alive && p.role !== 'werewolf')
                  .map((p) => p.id),
              },
            ]);
          }
          if (!game.night.killTarget) {
            const wolf = game.players.find((p) => p.role === 'werewolf' && p.alive && !p.isHuman);
            if (wolf) game.night.killTarget = await this.aiPick(game, wolf, 'kill');
          }
          this.broadcast('announcement', { message: '狼人已行动。' });
          break;
        }

        case 'night_seer': {
          const seer = game.players.find((p) => p.role === 'seer' && p.alive);
          if (seer?.isHuman && !game.night.seerResult) {
            await this.save(game);
            return this.requestAction(game, [
              {
                action_type: 'seer_check',
                description: '查验一名玩家的身份',
                targets: this.aliveIds(game, seer.id),
              },
            ]);
          }
          if (seer && !game.night.seerResult) {
            const target = await this.aiPick(game, seer, 'check');
            if (target) {
              game.night.seerResult = {
                target,
                isWerewolf: this.byId(game, target)?.role === 'werewolf',
              };
            }
          }
          this.broadcast('announcement', { message: '预言家已查验。' });
          break;
        }

        case 'night_witch': {
          const witch = game.players.find((p) => p.role === 'witch' && p.alive);
          if (witch?.isHuman) {
            const options = [];
            if (!game.witchAntidoteUsed && game.night.killTarget) {
              options.push({
                action_type: 'witch_antidote',
                description: '使用解药救人',
                targets: [] as string[],
                can_skip: true,
              });
            }
            if (!game.witchPoisonUsed) {
              options.push({
                action_type: 'witch_poison',
                description: '使用毒药',
                targets: this.aliveIds(game),
                can_skip: true,
              });
            }
            if (options.length > 0) {
              await this.save(game);
              return this.requestAction(game, options, {
                kill_target: game.night.killTarget,
                kill_target_name: game.night.killTarget
                  ? this.displayName(game, game.night.killTarget)
                  : null,
              });
            }
          } else if (witch) {
            await this.aiWitch(game, witch);
          }
          this.broadcast('announcement', { message: '女巫已行动。' });
          break;
        }

        case 'day_announce': {
          const deaths: string[] = [];
          // 守卫守中且女巫没同时用药时，击杀无效
          const killBlocked =
            game.night.saved || (game.night.guarded !== null && game.night.guarded === game.night.killTarget);
          if (game.night.killTarget && !killBlocked) deaths.push(game.night.killTarget);
          if (game.night.poisoned) deaths.push(game.night.poisoned);

          for (const id of deaths) {
            const p = this.byId(game, id);
            if (p) p.alive = false;
          }

          this.broadcast('announcement', {
            message: deaths.length
              ? `天亮了。昨夜 ${deaths.map((id) => this.displayName(game, id)).join('、')} 倒下了。`
              : '天亮了。昨夜是平安夜。',
          });
          this.sendStates(game);

          // 预言家是人类时把结果单独告知
          const human = this.human(game);
          if (human.role === 'seer' && game.night.seerResult) {
            const { target, isWerewolf } = game.night.seerResult;
            this.broadcast('action_result', {
              message: `查验结果：${this.displayName(game, target)} 是${isWerewolf ? '狼人' : '好人'}。`,
            });
          }

          // 被毒死的猎人不能开枪（常见规则）
          const deadHunter = deaths.find(
            (id) => this.byId(game, id)?.role === 'hunter' && id !== game.night.poisoned,
          );
          if (deadHunter) game.pendingHunter = deadHunter;

          if (this.checkWin(game)) return;
          break;
        }

        case 'day_discussion': {
          for (const p of game.players.filter((x) => x.alive)) {
            if (game.speeches.some((s) => s.round === game.round && s.playerId === p.id)) continue;
            if (p.isHuman) {
              await this.save(game);
              return this.requestAction(game, [
                { action_type: 'speech', description: '发言', targets: [], is_speech: true },
              ]);
            }
            const content = await this.aiSpeech(game, p);
            game.speeches.push({ round: game.round, playerId: p.id, content });
            this.broadcast('speech', { player_id: p.id, content });
          }
          break;
        }

        case 'day_vote': {
          const human = this.human(game);
          if (human.alive && !(human.id in game.votes)) {
            await this.save(game);
            return this.requestAction(game, [
              {
                action_type: 'vote',
                description: '投票放逐一名玩家',
                targets: this.aliveIds(game, human.id),
                can_skip: true,
              },
            ]);
          }
          await this.resolveVote(game);
          if (game.winner || game.pendingHunter) break;
          break;
        }

        case 'waiting':
        case 'ended':
          return;
      }

      const phase = this.nextPhase(game);
      await this.save(game);
      if (phase !== 'ended') {
        this.broadcast('phase_change', { phase, round: game.round });
      }
    }
  }

  /** 推进到下一阶段并返回它（返回值避免调用处沿用被窄化的 game.phase 类型）。 */
  private nextPhase(game: GameState): Phase {
    const flow: Phase[] = [
      ...(game.players.some((p) => p.role === 'guard') ? (['night_guard'] as Phase[]) : []),
      'night_werewolf',
      'night_seer',
      'night_witch',
      'day_announce',
      'day_discussion',
      'day_vote',
    ];
    const idx = flow.indexOf(game.phase);
    if (idx === -1 || idx === flow.length - 1) {
      game.round += 1;
      game.phase = flow[0] as Phase;
      game.lastGuarded = game.night.guarded;
      game.night = { killTarget: null, guarded: null, saved: false, poisoned: null, seerResult: null };
      game.votes = {};
    } else {
      game.phase = flow[idx + 1] as Phase;
    }
    return game.phase;
  }

  // ---------- 人类动作 ----------

  private async onAction(
    ws: WebSocket,
    game: GameState,
    actionType: string,
    rawTarget: string | null,
  ): Promise<void> {
    const target = rawTarget && this.byId(game, rawTarget)?.alive ? rawTarget : null;

    switch (actionType) {
      case 'guard_protect':
        game.night.guarded = target;
        break;
      case 'werewolf_kill':
        game.night.killTarget = target;
        break;
      case 'seer_check':
        if (target) {
          game.night.seerResult = {
            target,
            isWerewolf: this.byId(game, target)?.role === 'werewolf',
          };
          this.send(ws, 'action_result', {
            message: `${this.displayName(game, target)} 是${game.night.seerResult.isWerewolf ? '狼人' : '好人'}。`,
          });
        }
        break;
      case 'witch_antidote':
        if (!game.witchAntidoteUsed && game.night.killTarget) {
          game.night.saved = true;
          game.witchAntidoteUsed = true;
        }
        break;
      case 'witch_poison':
        if (!game.witchPoisonUsed && target) {
          game.night.poisoned = target;
          game.witchPoisonUsed = true;
        }
        break;
      case 'hunter_shoot':
        if (target) {
          const victim = this.byId(game, target);
          if (victim) {
            victim.alive = false;
            this.broadcast('announcement', {
              message: `猎人开枪带走了 ${this.displayName(game, target)}。`,
            });
            this.sendStates(game);
          }
        }
        game.pendingHunter = null;
        break;
      case 'vote':
        if (target) game.votes[game.humanId] = target;
        break;
      case 'skip':
        // 跳过：什么都不做，继续流程
        if (game.pendingHunter === game.humanId) game.pendingHunter = null;
        break;
      default:
        return this.send(ws, 'error', { message: `未知动作: ${actionType}` });
    }

    await this.save(game);
    if (this.checkWin(game)) return;
    await this.advance(game);
  }

  private async onSpeech(ws: WebSocket, game: GameState, content: string): Promise<void> {
    if (game.phase !== 'day_discussion') {
      return this.send(ws, 'error', { message: '当前不是发言阶段' });
    }
    const human = this.human(game);
    const text = content.trim() || '（沉默）';
    game.speeches.push({ round: game.round, playerId: human.id, content: text });
    this.broadcast('speech', { player_id: human.id, content: text });
    await this.save(game);
    await this.advance(game);
  }

  // ---------- 结算 ----------

  private async resolveVote(game: GameState): Promise<void> {
    for (const p of game.players.filter((x) => x.alive)) {
      if (p.isHuman || p.id in game.votes) continue;
      const target = await this.aiPick(game, p, 'vote');
      if (target) game.votes[p.id] = target;
    }

    // 前端 handleVoteResult 直接把 data 当作 { voter: target } 使用
    this.broadcast('vote_result', { ...game.votes });

    const counts: Record<string, number> = {};
    for (const t of Object.values(game.votes)) counts[t] = (counts[t] ?? 0) + 1;
    const max = Math.max(0, ...Object.values(counts));
    const top = Object.keys(counts).filter((id) => counts[id] === max);

    if (top.length === 1 && max > 0) {
      const exiled = this.byId(game, top[0] as string);
      if (exiled) {
        exiled.alive = false;
        this.broadcast('exile', { player_id: exiled.id });
        this.sendStates(game);
        if (exiled.role === 'hunter') game.pendingHunter = exiled.id;
      }
    } else {
      this.broadcast('announcement', { message: '平票，本轮无人被放逐。' });
    }
    this.checkWin(game);
  }

  private checkWin(game: GameState): boolean {
    const alive = game.players.filter((p) => p.alive);
    const wolves = alive.filter((p) => p.role === 'werewolf').length;
    const others = alive.length - wolves;

    if (wolves === 0) game.winner = 'villager';
    else if (wolves >= others) game.winner = 'werewolf';
    else return false;

    game.phase = 'ended';
    this.broadcast('game_end', { winner: game.winner === 'werewolf' ? '狼人阵营' : '好人阵营' });
    this.broadcast('game_review', {
      title: '本局复盘',
      players: game.players.map((p) => ({
        player_name: this.displayName(game, p.id),
        role_name: ROLES[p.role].name,
        camp: ROLES[p.role].camp,
        status: p.alive ? 'alive' : 'dead',
      })),
    });
    void this.save(game);
    return true;
  }

  // ---------- AI ----------

  private async aiPick(
    game: GameState,
    actor: Player,
    kind: 'kill' | 'check' | 'guard' | 'vote',
  ): Promise<string | null> {
    let candidates: Player[];
    let instruction: string;

    switch (kind) {
      case 'kill':
        candidates = game.players.filter((p) => p.alive && p.role !== 'werewolf');
        instruction = '你是狼人，请选择今晚击杀的目标，优先击杀威胁最大的神职或发言强势者。';
        break;
      case 'check':
        candidates = game.players.filter((p) => p.alive && p.id !== actor.id);
        instruction = '你是预言家，请选择今晚查验的玩家，优先查验发言可疑的人。';
        break;
      case 'guard':
        candidates = game.players.filter((p) => p.alive && p.id !== game.lastGuarded);
        instruction = '你是守卫，请选择今晚守护的玩家，优先守护可能是神职的人。';
        break;
      case 'vote':
        candidates = game.players.filter((p) => p.alive && p.id !== actor.id);
        instruction =
          actor.role === 'werewolf'
            ? '你是狼人，请把票投给对狼人威胁最大的好人，避免投给同伴。'
            : '你是好人，请投给你认为最可能是狼人的玩家。';
        break;
    }
    if (candidates.length === 0) return null;

    const heard = game.speeches
      .filter((s) => s.round === game.round)
      .map((s) => `${this.displayName(game, s.playerId)}：${s.content}`)
      .join('\n');

    const prompt =
      `${instruction}\n存活玩家：${candidates.map((p) => this.displayName(game, p.id)).join('、')}\n` +
      (heard ? `本轮发言：\n${heard}\n` : '') +
      '请给出目标玩家的编号。';

    try {
      const r = await getLLM(loadConfig(this.env)).structured(prompt, Choice, { temperature: 0.8 });
      const matched = candidates.find((p) => this.displayName(game, p.id) === r.target.trim());
      if (matched) return matched.id;
      // 模型可能只回了数字
      const num = r.target.match(/\d+/)?.[0];
      if (num) {
        const byNum = candidates.find((p) => p.id === `player_${num}`);
        if (byNum) return byNum.id;
      }
    } catch (err) {
      console.warn('[Werewolf] AI 选择失败，随机选取:', err);
    }
    return candidates[Math.floor(Math.random() * candidates.length)]?.id ?? null;
  }

  private async aiWitch(game: GameState, witch: Player): Promise<void> {
    const killed = game.night.killTarget ? this.displayName(game, game.night.killTarget) : null;
    const alive = game.players.filter((p) => p.alive);
    const prompt =
      `你是女巫。今晚${killed ? ` ${killed} 被狼人击杀` : '无人被击杀'}。\n` +
      `解药${game.witchAntidoteUsed ? '已用完' : '可用'}，毒药${game.witchPoisonUsed ? '已用完' : '可用'}。\n` +
      `存活玩家：${alive.map((p) => this.displayName(game, p.id)).join('、')}。\n` +
      '请决定是否用解药，以及是否毒杀某人（不确定就不要用毒）。';

    try {
      const r = await getLLM(loadConfig(this.env)).structured(prompt, WitchChoice, {
        temperature: 0.7,
      });
      if (r.use_antidote && !game.witchAntidoteUsed && game.night.killTarget) {
        game.night.saved = true;
        game.witchAntidoteUsed = true;
      }
      if (r.poison_target && !game.witchPoisonUsed) {
        const t = alive.find((p) => this.displayName(game, p.id) === r.poison_target?.trim());
        if (t) {
          game.night.poisoned = t.id;
          game.witchPoisonUsed = true;
        }
      }
    } catch (err) {
      console.warn('[Werewolf] 女巫决策失败，本回合不用药:', err);
    }
  }

  private async aiHunterShoot(game: GameState, hunter: Player): Promise<void> {
    const target = await this.aiPick(game, hunter, 'vote');
    if (!target) return;
    const victim = this.byId(game, target);
    if (victim) {
      victim.alive = false;
      this.broadcast('announcement', {
        message: `猎人开枪带走了 ${this.displayName(game, target)}。`,
      });
      this.sendStates(game);
    }
  }

  private async aiSpeech(game: GameState, player: Player): Promise<string> {
    const alive = game.players
      .filter((p) => p.alive)
      .map((p) => this.displayName(game, p.id))
      .join('、');
    const heard = game.speeches
      .filter((s) => s.round === game.round)
      .map((s) => `${this.displayName(game, s.playerId)}：${s.content}`)
      .join('\n');

    const hint =
      player.role === 'werewolf'
        ? '你是狼人，要隐藏身份、误导好人，但不要过于急躁。'
        : player.role === 'seer'
          ? `你是预言家${game.night.seerResult ? `，你查验过 ${this.displayName(game, game.night.seerResult.target)}，结果是${game.night.seerResult.isWerewolf ? '狼人' : '好人'}` : ''}。要不要跳身份由你判断。`
          : player.role === 'witch'
            ? '你是女巫，注意不要轻易暴露身份。'
            : player.role === 'guard'
              ? '你是守卫，注意不要暴露自己守了谁。'
              : player.role === 'hunter'
                ? '你是猎人，可以适度威慑，但不必急于表明身份。'
                : '你是村民，靠逻辑分析找出狼人。';

    const prompt =
      `这是狼人杀第 ${game.round} 天的讨论。存活玩家：${alive}。\n` +
      `你是 ${this.displayName(game, player.id)}。${hint}\n` +
      (heard ? `本轮已有的发言：\n${heard}\n` : '你是第一个发言的。\n') +
      '请发表你的看法（60-120字），语气自然。';

    try {
      const r = await getLLM(loadConfig(this.env)).structured(prompt, Speech, { temperature: 0.9 });
      return r.speech.trim();
    } catch (err) {
      console.warn(`[Werewolf] ${player.id} 发言失败:`, err);
      return '我再听听大家怎么说。';
    }
  }

  // ---------- 工具 ----------

  private human(game: GameState): Player {
    const p = game.players.find((x) => x.id === game.humanId);
    if (!p) throw new Error('人类玩家不存在');
    return p;
  }

  private byId(game: GameState, id: string): Player | undefined {
    return game.players.find((p) => p.id === id);
  }

  /** 前端用 player_N 的 N 作为显示编号，这里保持一致。 */
  private displayName(game: GameState, id: string): string {
    const n = id.split('_')[1];
    return id === game.humanId ? `玩家${n}（你）` : `玩家${n}`;
  }

  private aliveIds(game: GameState, exclude?: string): string[] {
    return game.players.filter((p) => p.alive && p.id !== exclude).map((p) => p.id);
  }

  private requestAction(
    game: GameState,
    options: {
      action_type: string;
      description: string;
      targets: string[];
      can_skip?: boolean;
      is_speech?: boolean;
    }[],
    context?: Record<string, unknown>,
  ): void {
    this.broadcast('action_request', {
      phase: game.phase,
      round: game.round,
      timeout: ACTION_TIMEOUT,
      options,
      context: context ?? {},
    });
  }

  private sendStates(game: GameState): void {
    const human = this.human(game);
    const humanIsWolf = human.role === 'werewolf';
    this.broadcast('player_states', {
      players: game.players.map((p) => ({
        id: p.id,
        alive: p.alive,
        // 狼人能看见同伴；其余人看不到任何身份
        revealed_role: humanIsWolf && p.role === 'werewolf' ? '狼人' : null,
      })),
    });
  }

  private async load(): Promise<GameState | null> {
    if (!this.game) {
      this.game = (await this.ctx.storage.get<GameState>(STATE_KEY)) ?? null;
    }
    return this.game;
  }

  private async save(game: GameState): Promise<void> {
    this.game = game;
    await this.ctx.storage.put(STATE_KEY, game);
  }

  private send(ws: WebSocket, type: string, data: Record<string, unknown>): void {
    try {
      ws.send(JSON.stringify({ type, data }));
    } catch {
      // 连接已断开
    }
  }

  private broadcast(type: string, data: Record<string, unknown>): void {
    const text = JSON.stringify({ type, data });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(text);
      } catch {
        // 忽略已断开的连接
      }
    }
  }
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
}
