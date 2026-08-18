/**
 * 狼人杀：8 人简化局（2 狼 / 1 预言家 / 1 女巫 / 4 村民），1 人类 + 7 AI。
 *
 * 对应旧版 modules/werewolf/（3352 行，拆成 config_loader / role_registry /
 * rule_engine / game_state / orchestrator / performer / session 七个文件，
 * 角色能力还外置成 JSON 定义再由注册表加载）。那套抽象是为「自定义角色」准备的，
 * 但项目里从未用到自定义角色——只有内置的 6 个。
 *
 * 这里按实际使用的规模实现：阶段流转写成显式状态机，角色能力直接编码。
 * 行为与旧版 simple_8 预设一致：
 *   night_werewolf → night_seer → night_witch → day_announce → day_discussion → day_vote
 */

import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';

import { loadConfig, type Env } from '@/config';
import { getLLM } from '@/llm';

type RoleId = 'werewolf' | 'seer' | 'witch' | 'villager';

const COMPOSITION: RoleId[] = [
  'werewolf', 'werewolf',
  'seer',
  'witch',
  'villager', 'villager', 'villager', 'villager',
];

const AI_NAMES = ['子安', '仲平', '叔明', '季常', '伯言', '幼麟', '元直'];

type Phase =
  | 'waiting'
  | 'night_werewolf'
  | 'night_seer'
  | 'night_witch'
  | 'day_announce'
  | 'day_discussion'
  | 'day_vote'
  | 'ended';

const PHASE_FLOW: Phase[] = [
  'night_werewolf',
  'night_seer',
  'night_witch',
  'day_announce',
  'day_discussion',
  'day_vote',
];

interface Player {
  id: string;
  name: string;
  role: RoleId;
  alive: boolean;
  isHuman: boolean;
}

interface NightStatus {
  killTarget: string | null;
  saved: boolean;
  poisoned: string | null;
  seerChecked: { target: string; isWerewolf: boolean } | null;
}

interface GameState {
  round: number;
  phase: Phase;
  players: Player[];
  humanId: string;
  night: NightStatus;
  /** 女巫的解药/毒药是否已用 */
  witchAntidoteUsed: boolean;
  witchPoisonUsed: boolean;
  speeches: { round: number; playerId: string; text: string }[];
  votes: Record<string, string>;
  winner: 'werewolf' | 'villager' | null;
  log: string[];
}

const STATE_KEY = 'werewolf';

const ROLE_LABEL: Record<RoleId, string> = {
  werewolf: '狼人',
  seer: '预言家',
  witch: '女巫',
  villager: '村民',
};

const Speech = z.object({
  speech: z.string().describe('你的发言，60-120字，符合你的身份策略，不要暴露不该暴露的信息'),
});

const Choice = z.object({
  target_name: z.string().describe('目标玩家的名字'),
  reason: z.string().describe('简短理由，30字以内'),
});

const WitchChoice = z.object({
  use_antidote: z.boolean().describe('是否使用解药救人'),
  poison_target: z.string().nullable().describe('要毒杀的玩家名字；不使用毒药则为 null'),
  reason: z.string().describe('简短理由'),
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
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;
    let msg: { type?: string; target?: string; text?: string; use_antidote?: boolean; poison?: string | null };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return;
    }

    try {
      switch (msg.type) {
        case 'start_game':
          return await this.start(ws);
        case 'action':
          return await this.handleAction(ws, msg);
        case 'speech':
          return await this.handleSpeech(ws, String(msg.text ?? ''));
        case 'vote':
          return await this.handleVote(ws, String(msg.target ?? ''));
        default:
          return this.sendStates(ws, await this.load());
      }
    } catch (err) {
      console.error('[Werewolf] 处理失败:', err);
      this.send(ws, { type: 'error', message: err instanceof Error ? err.message : '服务端错误' });
    }
  }

  // ---------- 开局 ----------

  private async start(ws: WebSocket): Promise<void> {
    const roles = [...COMPOSITION];
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j] as RoleId, roles[i] as RoleId];
    }

    const humanIndex = Math.floor(Math.random() * roles.length);
    const players: Player[] = roles.map((role, i) => ({
      id: `p${i}`,
      name: i === humanIndex ? '你' : (AI_NAMES[i < humanIndex ? i : i - 1] as string),
      role,
      alive: true,
      isHuman: i === humanIndex,
    }));

    const game: GameState = {
      round: 1,
      phase: 'night_werewolf',
      players,
      humanId: players[humanIndex]?.id as string,
      night: { killTarget: null, saved: false, poisoned: null, seerChecked: null },
      witchAntidoteUsed: false,
      witchPoisonUsed: false,
      speeches: [],
      votes: {},
      winner: null,
      log: [],
    };
    await this.save(game);

    const human = this.human(game);
    this.send(ws, {
      type: 'game_start',
      round: game.round,
      players: players.map((p) => ({ id: p.id, name: p.name, alive: p.alive })),
    });
    this.send(ws, {
      type: 'role_reveal',
      role: human.role,
      role_name: ROLE_LABEL[human.role],
      // 狼人之间互相可见，与标准规则一致
      teammates:
        human.role === 'werewolf'
          ? players.filter((p) => p.role === 'werewolf' && p.id !== human.id).map((p) => p.name)
          : [],
    });
    this.sendStates(ws, game);
    await this.advance(ws, game);
  }

  // ---------- 阶段推进 ----------

  /**
   * 推进到下一个需要人类介入的点。
   *
   * 旧版把阶段流转铺在 orchestrator 的多层回调里，很难看出「什么时候该等玩家」。
   * 这里的规则很简单：轮到人类行动就停下来发 action_request，否则一路自动跑。
   */
  private async advance(ws: WebSocket, game: GameState): Promise<void> {
    for (;;) {
      if (game.winner) return;

      switch (game.phase) {
        case 'night_werewolf': {
          const human = this.human(game);
          if (human.alive && human.role === 'werewolf' && !game.night.killTarget) {
            await this.save(game);
            return this.send(ws, {
              type: 'action_request',
              action: 'werewolf_kill',
              phase: game.phase,
              candidates: this.candidates(game, (p) => p.role !== 'werewolf'),
            });
          }
          if (!game.night.killTarget) {
            game.night.killTarget = await this.aiWerewolfKill(game);
            this.send(ws, { type: 'announcement', text: '狼人已行动。' });
          }
          break;
        }

        case 'night_seer': {
          const human = this.human(game);
          if (human.alive && human.role === 'seer' && !game.night.seerChecked) {
            await this.save(game);
            return this.send(ws, {
              type: 'action_request',
              action: 'seer_check',
              phase: game.phase,
              candidates: this.candidates(game, (p) => p.id !== human.id),
            });
          }
          if (!game.night.seerChecked) {
            const seer = game.players.find((p) => p.role === 'seer' && p.alive);
            if (seer) {
              const target = await this.aiSeerCheck(game, seer);
              game.night.seerChecked = {
                target,
                isWerewolf: this.byId(game, target)?.role === 'werewolf',
              };
            }
            this.send(ws, { type: 'announcement', text: '预言家已查验。' });
          }
          break;
        }

        case 'night_witch': {
          const witch = game.players.find((p) => p.role === 'witch' && p.alive);
          if (witch?.isHuman) {
            await this.save(game);
            return this.send(ws, {
              type: 'action_request',
              action: 'witch_action',
              phase: game.phase,
              killed_name: game.night.killTarget ? this.nameOf(game, game.night.killTarget) : null,
              antidote_available: !game.witchAntidoteUsed,
              poison_available: !game.witchPoisonUsed,
              candidates: this.candidates(game, () => true),
            });
          }
          if (witch) await this.aiWitchAction(game, witch);
          this.send(ws, { type: 'announcement', text: '女巫已行动。' });
          break;
        }

        case 'day_announce': {
          const deaths: string[] = [];
          if (game.night.killTarget && !game.night.saved) deaths.push(game.night.killTarget);
          if (game.night.poisoned) deaths.push(game.night.poisoned);
          for (const id of deaths) {
            const p = this.byId(game, id);
            if (p) p.alive = false;
          }
          const text = deaths.length
            ? `天亮了。昨夜 ${deaths.map((id) => this.nameOf(game, id)).join('、')} 倒下了。`
            : '天亮了。昨夜是平安夜。';
          game.log.push(text);
          this.send(ws, { type: 'announcement', text });
          this.sendStates(ws, game);

          // 预言家是人类时，把查验结果单独告知
          const human = this.human(game);
          if (human.role === 'seer' && game.night.seerChecked) {
            const { target, isWerewolf } = game.night.seerChecked;
            this.send(ws, {
              type: 'action_result',
              action: 'seer_check',
              text: `你查验 ${this.nameOf(game, target)} 的结果是：${isWerewolf ? '狼人' : '好人'}。`,
            });
          }
          if (this.checkWin(ws, game)) return;
          break;
        }

        case 'day_discussion': {
          // AI 依次发言；轮到人类时停下等输入
          for (const p of game.players.filter((x) => x.alive)) {
            if (game.speeches.some((s) => s.round === game.round && s.playerId === p.id)) continue;
            if (p.isHuman) {
              await this.save(game);
              return this.send(ws, {
                type: 'action_request',
                action: 'speech',
                phase: game.phase,
              });
            }
            const text = await this.aiSpeech(game, p);
            game.speeches.push({ round: game.round, playerId: p.id, text });
            this.send(ws, { type: 'speech', player: p.name, player_id: p.id, text });
          }
          break;
        }

        case 'day_vote': {
          const human = this.human(game);
          if (human.alive && !(human.id in game.votes)) {
            await this.save(game);
            return this.send(ws, {
              type: 'action_request',
              action: 'vote',
              phase: game.phase,
              candidates: this.candidates(game, (p) => p.id !== human.id),
            });
          }
          await this.resolveVote(ws, game);
          if (game.winner) return;
          break;
        }

        case 'ended':
        case 'waiting':
          return;
      }

      this.nextPhase(game);
      await this.save(game);
      this.send(ws, { type: 'phase_change', phase: game.phase, round: game.round });
    }
  }

  private nextPhase(game: GameState): void {
    const idx = PHASE_FLOW.indexOf(game.phase);
    if (idx === -1 || idx === PHASE_FLOW.length - 1) {
      // 一整轮结束，回到夜晚并清空夜间状态
      game.round += 1;
      game.phase = PHASE_FLOW[0] as Phase;
      game.night = { killTarget: null, saved: false, poisoned: null, seerChecked: null };
      game.votes = {};
    } else {
      game.phase = PHASE_FLOW[idx + 1] as Phase;
    }
  }

  // ---------- 人类动作 ----------

  private async handleAction(
    ws: WebSocket,
    msg: { target?: string; use_antidote?: boolean; poison?: string | null },
  ): Promise<void> {
    const game = await this.load();
    const human = this.human(game);

    if (game.phase === 'night_werewolf' && human.role === 'werewolf') {
      const target = this.resolveTarget(game, msg.target);
      if (!target) return this.send(ws, { type: 'error', message: '目标无效' });
      game.night.killTarget = target;
    } else if (game.phase === 'night_seer' && human.role === 'seer') {
      const target = this.resolveTarget(game, msg.target);
      if (!target) return this.send(ws, { type: 'error', message: '目标无效' });
      game.night.seerChecked = {
        target,
        isWerewolf: this.byId(game, target)?.role === 'werewolf',
      };
      this.send(ws, {
        type: 'action_result',
        action: 'seer_check',
        text: `${this.nameOf(game, target)} 是${game.night.seerChecked.isWerewolf ? '狼人' : '好人'}。`,
      });
    } else if (game.phase === 'night_witch' && human.role === 'witch') {
      if (msg.use_antidote && !game.witchAntidoteUsed && game.night.killTarget) {
        game.night.saved = true;
        game.witchAntidoteUsed = true;
      }
      const poison = msg.poison ? this.resolveTarget(game, msg.poison) : null;
      if (poison && !game.witchPoisonUsed) {
        game.night.poisoned = poison;
        game.witchPoisonUsed = true;
      }
    } else {
      return this.send(ws, { type: 'error', message: '当前阶段没有你的行动' });
    }

    await this.save(game);
    await this.advance(ws, game);
  }

  private async handleSpeech(ws: WebSocket, text: string): Promise<void> {
    const game = await this.load();
    if (game.phase !== 'day_discussion') {
      return this.send(ws, { type: 'error', message: '当前不是发言阶段' });
    }
    const human = this.human(game);
    game.speeches.push({ round: game.round, playerId: human.id, text: text.trim() || '（沉默）' });
    this.send(ws, { type: 'speech', player: human.name, player_id: human.id, text });
    await this.save(game);
    await this.advance(ws, game);
  }

  private async handleVote(ws: WebSocket, target: string): Promise<void> {
    const game = await this.load();
    if (game.phase !== 'day_vote') {
      return this.send(ws, { type: 'error', message: '当前不是投票阶段' });
    }
    const resolved = this.resolveTarget(game, target);
    if (!resolved) return this.send(ws, { type: 'error', message: '投票目标无效' });
    game.votes[this.human(game).id] = resolved;
    await this.save(game);
    await this.advance(ws, game);
  }

  // ---------- 结算 ----------

  private async resolveVote(ws: WebSocket, game: GameState): Promise<void> {
    const alive = game.players.filter((p) => p.alive);
    for (const p of alive) {
      if (p.isHuman || p.id in game.votes) continue;
      game.votes[p.id] = await this.aiVote(game, p);
    }

    const counts: Record<string, number> = {};
    for (const t of Object.values(game.votes)) counts[t] = (counts[t] ?? 0) + 1;
    const max = Math.max(0, ...Object.values(counts));
    const top = Object.keys(counts).filter((id) => counts[id] === max);

    this.send(ws, {
      type: 'vote_result',
      votes: Object.entries(game.votes).map(([voter, target]) => ({
        voter: this.nameOf(game, voter),
        target: this.nameOf(game, target),
      })),
      counts: Object.fromEntries(Object.entries(counts).map(([id, n]) => [this.nameOf(game, id), n])),
    });

    // 平票不放逐，与常见规则一致（旧版 rule_engine 亦然）
    if (top.length === 1 && max > 0) {
      const exiled = this.byId(game, top[0] as string);
      if (exiled) {
        exiled.alive = false;
        game.log.push(`${exiled.name} 被放逐。`);
        this.send(ws, {
          type: 'exile',
          player: exiled.name,
          player_id: exiled.id,
          text: `${exiled.name} 被投票放逐。`,
        });
      }
    } else {
      this.send(ws, { type: 'announcement', text: '平票，本轮无人被放逐。' });
    }
    this.sendStates(ws, game);
    this.checkWin(ws, game);
  }

  private checkWin(ws: WebSocket, game: GameState): boolean {
    const alive = game.players.filter((p) => p.alive);
    const wolves = alive.filter((p) => p.role === 'werewolf').length;
    const others = alive.length - wolves;

    if (wolves === 0) game.winner = 'villager';
    else if (wolves >= others) game.winner = 'werewolf';
    else return false;

    game.phase = 'ended';
    this.send(ws, {
      type: 'game_end',
      winner: game.winner,
      message: game.winner === 'werewolf' ? '狼人阵营获胜。' : '好人阵营获胜。',
    });
    this.send(ws, {
      type: 'game_review',
      players: game.players.map((p) => ({
        name: p.name,
        role: p.role,
        role_name: ROLE_LABEL[p.role],
        alive: p.alive,
      })),
      log: game.log,
    });
    void this.save(game);
    return true;
  }

  // ---------- AI ----------

  private async aiWerewolfKill(game: GameState): Promise<string | null> {
    const targets = game.players.filter((p) => p.alive && p.role !== 'werewolf');
    if (targets.length === 0) return null;
    const prompt =
      `你是狼人杀里的狼人。存活的非狼玩家：${targets.map((p) => p.name).join('、')}。\n` +
      (game.speeches.length
        ? `白天发言摘要：\n${game.speeches.slice(-6).map((s) => `${this.nameOf(game, s.playerId)}：${s.text}`).join('\n')}\n`
        : '') +
      '请选择今晚要击杀的目标，优先击杀威胁最大的神职或发言强势者。';
    return this.pickByLLM(game, prompt, targets);
  }

  private async aiSeerCheck(game: GameState, seer: Player): Promise<string> {
    const targets = game.players.filter((p) => p.alive && p.id !== seer.id);
    const prompt =
      `你是预言家。存活玩家：${targets.map((p) => p.name).join('、')}。\n` +
      '请选择今晚要查验身份的玩家，优先查验发言可疑的人。';
    return (await this.pickByLLM(game, prompt, targets)) ?? (targets[0]?.id as string);
  }

  private async aiWitchAction(game: GameState, witch: Player): Promise<void> {
    const killed = game.night.killTarget ? this.nameOf(game, game.night.killTarget) : null;
    const alive = game.players.filter((p) => p.alive);
    const prompt =
      `你是女巫。今晚${killed ? ` ${killed} 被狼人击杀` : '无人被击杀'}。\n` +
      `解药${game.witchAntidoteUsed ? '已用完' : '可用'}，毒药${game.witchPoisonUsed ? '已用完' : '可用'}。\n` +
      `存活玩家：${alive.map((p) => p.name).join('、')}。\n` +
      '请决定是否使用解药，以及是否毒杀某人（不确定就不要用毒）。';

    try {
      const r = await getLLM(loadConfig(this.env)).structured(prompt, WitchChoice, {
        temperature: 0.7,
      });
      if (r.use_antidote && !game.witchAntidoteUsed && game.night.killTarget) {
        game.night.saved = true;
        game.witchAntidoteUsed = true;
      }
      if (r.poison_target && !game.witchPoisonUsed) {
        const target = alive.find((p) => p.name === r.poison_target?.trim());
        if (target) {
          game.night.poisoned = target.id;
          game.witchPoisonUsed = true;
        }
      }
    } catch (err) {
      console.warn('[Werewolf] 女巫决策失败，本回合不用药:', err);
    }
  }

  private async aiSpeech(game: GameState, player: Player): Promise<string> {
    const alive = game.players.filter((p) => p.alive).map((p) => p.name).join('、');
    const heard = game.speeches
      .filter((s) => s.round === game.round)
      .map((s) => `${this.nameOf(game, s.playerId)}：${s.text}`)
      .join('\n');

    const roleHint =
      player.role === 'werewolf'
        ? '你是狼人，要隐藏身份、误导好人，但不要过于急躁。'
        : player.role === 'seer'
          ? `你是预言家${game.night.seerChecked ? `，你查验过 ${this.nameOf(game, game.night.seerChecked.target)}，结果是${game.night.seerChecked.isWerewolf ? '狼人' : '好人'}` : ''}。要不要跳身份由你判断。`
          : player.role === 'witch'
            ? '你是女巫，注意不要轻易暴露身份。'
            : '你是村民，靠逻辑分析找出狼人。';

    const prompt =
      `这是狼人杀第 ${game.round} 天的讨论。存活玩家：${alive}。\n` +
      `你是 ${player.name}。${roleHint}\n` +
      (heard ? `本轮已有的发言：\n${heard}\n` : '你是第一个发言的。\n') +
      '请发表你的看法（60-120字），符合身份策略，语气自然。';

    try {
      const r = await getLLM(loadConfig(this.env)).structured(prompt, Speech, { temperature: 0.9 });
      return r.speech.trim();
    } catch (err) {
      console.warn(`[Werewolf] ${player.name} 发言失败:`, err);
      return '我再听听大家怎么说。';
    }
  }

  private async aiVote(game: GameState, player: Player): Promise<string> {
    const targets = game.players.filter((p) => p.alive && p.id !== player.id);
    const heard = game.speeches
      .filter((s) => s.round === game.round)
      .map((s) => `${this.nameOf(game, s.playerId)}：${s.text}`)
      .join('\n');
    const roleHint =
      player.role === 'werewolf'
        ? '你是狼人，要把票投给对狼人威胁最大的好人，避免投给同伴。'
        : '你是好人，投给你认为最可能是狼人的玩家。';
    const prompt =
      `狼人杀投票环节。${roleHint}\n候选：${targets.map((p) => p.name).join('、')}\n` +
      (heard ? `本轮发言：\n${heard}\n` : '') +
      '请选择你要投票的玩家。';
    return (await this.pickByLLM(game, prompt, targets)) ?? (targets[0]?.id as string);
  }

  /** 让模型在候选中选一个，失败则随机——保证流程永不卡死。 */
  private async pickByLLM(
    game: GameState,
    prompt: string,
    candidates: Player[],
  ): Promise<string | null> {
    if (candidates.length === 0) return null;
    try {
      const r = await getLLM(loadConfig(this.env)).structured(prompt, Choice, { temperature: 0.8 });
      const matched = candidates.find((p) => p.name === r.target_name.trim());
      if (matched) return matched.id;
    } catch (err) {
      console.warn('[Werewolf] AI 选择失败，随机选取:', err);
    }
    return candidates[Math.floor(Math.random() * candidates.length)]?.id ?? null;
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

  private nameOf(game: GameState, id: string): string {
    return this.byId(game, id)?.name ?? id;
  }

  /** 前端可能传 id 也可能传名字，两者都接受。 */
  private resolveTarget(game: GameState, raw: string | undefined | null): string | null {
    if (!raw) return null;
    const byId = game.players.find((p) => p.id === raw && p.alive);
    if (byId) return byId.id;
    const byName = game.players.find((p) => p.name === raw.trim() && p.alive);
    return byName?.id ?? null;
  }

  private candidates(game: GameState, filter: (p: Player) => boolean) {
    return game.players
      .filter((p) => p.alive && filter(p))
      .map((p) => ({ id: p.id, name: p.name }));
  }

  private sendStates(ws: WebSocket, game: GameState): void {
    this.send(ws, {
      type: 'player_states',
      round: game.round,
      phase: game.phase,
      players: game.players.map((p) => ({ id: p.id, name: p.name, alive: p.alive })),
    });
  }

  private async load(): Promise<GameState> {
    if (!this.game) {
      const saved = await this.ctx.storage.get<GameState>(STATE_KEY);
      if (!saved) throw new Error('游戏尚未开始，请先发送 start_game');
      this.game = saved;
    }
    return this.game;
  }

  private async save(game: GameState): Promise<void> {
    this.game = game;
    await this.ctx.storage.put(STATE_KEY, game);
  }

  private send(ws: WebSocket, payload: unknown): void {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // 连接已断开
    }
  }
}
