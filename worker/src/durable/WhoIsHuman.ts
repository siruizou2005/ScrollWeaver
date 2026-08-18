/**
 * 谁是人类：3 个 AI + 1 个玩家轮流描述同一件物品，互相投票找出人类。
 *
 * 对应旧版 modules/gathering/who_is_human_game.py（557 行）。规则照搬：
 * 全局固定一件物品；每轮存活玩家各写一句描述后投票；得票最多者出局；
 * 平票则只让平票者进入加时赛；人类出局即结束。
 *
 * 流程顺序必须是「AI 先描述 → 人类再描述」：前端在 round_start 后显示
 * 「AI正在生成描述中…」并隐藏输入框，只有收到 descriptions_ready 才放开输入
 * （who-is-human.js:294）。反过来会死锁在等待界面。
 *
 * 线协议：所有字段直接挂在消息顶层（不是 data 嵌套），descriptions 是
 * { playerId: text } 对象而非数组。
 */

import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';

import { loadConfig, type Env } from '@/config';
import { getLLM } from '@/llm';

const ITEMS = [
  '苹果', '手机', '书', '椅子', '杯子', '电脑', '汽车', '花', '猫', '狗',
  '雨伞', '钥匙', '钱包', '眼镜', '手表', '笔', '纸', '灯', '门', '窗',
  '树', '山', '海', '云', '太阳', '月亮', '星星', '风', '雨', '雪',
  '茶', '咖啡', '面包', '米饭', '水', '火', '冰', '糖', '盐', '油',
];

const AI_NAMES = ['小明', '小红', '小刚'];
/** 基础轮数；平票加时会把上限顶上去 */
const BASE_ROUNDS = 2;

interface Player {
  id: string;
  name: string;
  /** 前端用 p.type === 'human' 找人类玩家 */
  type: 'human' | 'ai';
}

type Phase = 'waiting' | 'describing' | 'voting' | 'ended';

interface GameState {
  item: string;
  round: number;
  maxRounds: number;
  phase: Phase;
  players: Player[];
  activeIds: string[];
  eliminatedIds: string[];
  humanId: string;
  descriptions: Record<string, string>;
  previousRound: { descriptions: Record<string, string>; eliminated_player: string | null } | null;
  humanEliminatedRound: number | null;
}

const STATE_KEY = 'wih';

const Description = z.object({
  description: z.string().describe('对该物品的一句话描述，15-30字，像真人随口说的，不要太完美'),
});

const Vote = z.object({
  target_name: z.string().describe('你认为最可能是人类的玩家名字'),
});

export class WhoIsHuman extends DurableObject<Env> {
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
    let msg: { type?: string; description?: string; voted_player_id?: string };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return;
    }

    try {
      switch (msg.type) {
        case 'start_game':
          return await this.startGame(ws);
        case 'submit_description':
          return await this.submitDescription(ws, String(msg.description ?? ''));
        case 'submit_vote':
          return await this.submitVote(ws, String(msg.voted_player_id ?? ''));
        default:
          return;
      }
    } catch (err) {
      console.error('[WhoIsHuman] 处理失败:', err);
      this.send(ws, { type: 'error', message: err instanceof Error ? err.message : '服务端错误' });
    }
  }

  // ---------- 开局 ----------

  private async startGame(ws: WebSocket): Promise<void> {
    const humanId = 'human';
    const players: Player[] = [
      ...AI_NAMES.map((name, i) => ({ id: `ai${i + 1}`, name, type: 'ai' as const })),
      { id: humanId, name: '你', type: 'human' as const },
    ];
    // 打乱出场顺序，避免人类永远排在最后而被轻易识别
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j] as Player, players[i] as Player];
    }

    const game: GameState = {
      item: ITEMS[Math.floor(Math.random() * ITEMS.length)] as string,
      round: 1,
      maxRounds: BASE_ROUNDS,
      phase: 'describing',
      players,
      activeIds: players.map((p) => p.id),
      eliminatedIds: [],
      humanId,
      descriptions: {},
      previousRound: null,
      humanEliminatedRound: null,
    };
    await this.save(game);

    this.send(ws, {
      type: 'game_start',
      item: game.item,
      all_players: game.players,
      players: game.players,
      max_rounds: game.maxRounds,
      human_player_id: humanId,
    });
    await this.beginRound(ws, game);
  }

  /**
   * 开始一轮：先广播 round_start，再生成 AI 描述并发 descriptions_ready。
   * 顺序不能反——前端要等 descriptions_ready 才放开输入框。
   */
  private async beginRound(ws: WebSocket, game: GameState): Promise<void> {
    game.phase = 'describing';
    game.descriptions = {};
    await this.save(game);

    this.send(ws, {
      type: 'round_start',
      round: game.round,
      max_rounds: game.maxRounds,
      item: game.item,
      active_players: game.players.filter((p) => game.activeIds.includes(p.id)),
      eliminated_players: game.eliminatedIds,
      previous_round: game.previousRound,
    });

    // 必须串行：每个 AI 要看到前面已有的描述才会岔开说法。
    // 并发虽然快 2-3 秒，但三个 AI 拿到的上下文都是空的，会收敛出几乎一样的句子
    // （实测「就是那种很高很大的土堆，爬上去很累」三连），游戏也就没意义了。
    const aiIds = game.activeIds.filter((id) => id !== game.humanId);
    for (const id of aiIds) {
      game.descriptions[id] = await this.aiDescribe(game, id);
    }
    await this.save(game);

    this.send(ws, {
      type: 'descriptions_ready',
      descriptions: game.descriptions,
      active_players: game.players.filter((p) => game.activeIds.includes(p.id)),
      players: game.players,
      round: game.round,
    });
  }

  // ---------- 人类动作 ----------

  private async submitDescription(ws: WebSocket, text: string): Promise<void> {
    const game = await this.load();
    if (game.phase !== 'describing') {
      return this.send(ws, { type: 'error', message: '当前不是描述阶段' });
    }
    if (!text.trim()) return this.send(ws, { type: 'error', message: '描述不能为空' });
    if (!game.activeIds.includes(game.humanId)) {
      return this.send(ws, { type: 'error', message: '你已被淘汰' });
    }

    game.descriptions[game.humanId] = text.trim();
    game.phase = 'voting';
    await this.save(game);

    // 前端 handleAllDescriptionsReady 用 message.descriptions.forEach，需要数组
    this.send(ws, {
      type: 'all_descriptions_ready',
      // who-is-human.js:339/362 读的是 desc.player_name（不是 name），
      // 用错字段会让投票按钮渲染成空白
      descriptions: game.activeIds.map((id) => ({
        player_id: id,
        player_name: this.nameOf(game, id),
        name: this.nameOf(game, id),
        description: game.descriptions[id] ?? '',
      })),
      active_players: game.players.filter((p) => game.activeIds.includes(p.id)),
      players: game.players,
      human_player_id: game.humanId,
      round: game.round,
    });
  }

  private async submitVote(ws: WebSocket, targetId: string): Promise<void> {
    const game = await this.load();
    if (game.phase !== 'voting') {
      return this.send(ws, { type: 'error', message: '当前不是投票阶段' });
    }
    if (!game.activeIds.includes(targetId) || targetId === game.humanId) {
      return this.send(ws, { type: 'error', message: '投票目标无效' });
    }

    const votes: Record<string, string> = { [game.humanId]: targetId };
    const aiIds = game.activeIds.filter((id) => id !== game.humanId);
    const aiVotes = await Promise.all(aiIds.map((id) => this.aiVote(game, id)));
    aiIds.forEach((id, i) => {
      votes[id] = aiVotes[i] as string;
    });

    const counts: Record<string, number> = {};
    for (const id of game.activeIds) counts[id] = 0;
    for (const t of Object.values(votes)) {
      if (t in counts) counts[t] = (counts[t] ?? 0) + 1;
    }
    const max = Math.max(...Object.values(counts));
    const mostVoted = Object.keys(counts).filter((id) => counts[id] === max);
    const isTie = mostVoted.length > 1;

    const result: Record<string, unknown> = {
      type: 'round_result',
      round: game.round,
      current_round: game.round,
      item: game.item,
      vote_counts: counts,
      most_voted: mostVoted,
      is_tie: isTie,
      all_players: game.players,
      players: game.players,
      human_player_id: game.humanId,
      descriptions: game.descriptions,
      eliminated_player: null as string | null,
    };

    const prevDescriptions = { ...game.descriptions };

    if (isTie) {
      // 平票：只让平票者进加时赛，总轮数相应加一
      game.activeIds = game.activeIds.filter((id) => mostVoted.includes(id));
      game.maxRounds += 1;
      result.tie_players = mostVoted;
      result.max_rounds = game.maxRounds;
      result.message = `平局！${mostVoted.length} 位玩家得票相同，将进行加时赛`;
    } else {
      const eliminated = mostVoted[0] as string;
      game.activeIds = game.activeIds.filter((id) => id !== eliminated);
      game.eliminatedIds.push(eliminated);
      result.eliminated_player = eliminated;
      result.eliminated_player_name = this.nameOf(game, eliminated);
      result.message = `${this.nameOf(game, eliminated)} 被投票出局`;
      if (eliminated === game.humanId) game.humanEliminatedRound = game.round;
    }
    result.eliminated_players = game.eliminatedIds;
    result.active_players = game.players.filter((p) => game.activeIds.includes(p.id));

    game.previousRound = {
      descriptions: prevDescriptions,
      eliminated_player: (result.eliminated_player as string | null) ?? null,
    };
    await this.save(game);
    this.send(ws, result);

    // 判定胜负
    const humanAlive = game.activeIds.includes(game.humanId);
    if (!humanAlive) {
      game.phase = 'ended';
      await this.save(game);
      return this.send(ws, {
        type: 'game_end',
        human_survived: false,
        eliminated_round: game.humanEliminatedRound,
        total_rounds: game.round,
        item: game.item,
        all_players: game.players,
        message: '你被识破了——AI 找出了人类。',
      });
    }
    if (game.activeIds.length <= 1 || game.round >= game.maxRounds) {
      game.phase = 'ended';
      await this.save(game);
      return this.send(ws, {
        type: 'game_end',
        human_survived: true,
        total_rounds: game.round,
        item: game.item,
        all_players: game.players,
        message: '你活到了最后——成功伪装成 AI。',
      });
    }

    game.round += 1;
    await this.beginRound(ws, game);
  }

  // ---------- AI ----------

  private async aiDescribe(game: GameState, id: string): Promise<string> {
    const others = Object.entries(game.descriptions)
      .filter(([pid]) => pid !== id)
      .map(([pid, d]) => `${this.nameOf(game, pid)}：${d}`)
      .join('\n');
    const history = game.previousRound
      ? Object.entries(game.previousRound.descriptions)
          .map(([pid, d]) => `${this.nameOf(game, pid)}：${d}`)
          .join('\n')
      : '';

    const prompt =
      `你在玩一个「找出人类」的游戏。所有人都在描述同一件物品：「${game.item}」。\n` +
      '你要伪装成普通人类玩家，描述要自然、口语化，不要百科式的完美定义，也不要和别人的描述雷同。\n' +
      (history ? `上一轮的描述：\n${history}\n` : '') +
      (others ? `本轮已有的描述：\n${others}\n` : '') +
      `请用一句话（15-30字）描述「${game.item}」。`;

    try {
      const r = await getLLM(loadConfig(this.env)).structured(prompt, Description, {
        temperature: 1.0,
      });
      return r.description.trim();
    } catch (err) {
      console.warn(`[WhoIsHuman] ${id} 描述生成失败:`, err);
      return '这东西挺常见的，我一时说不好。';
    }
  }

  private async aiVote(game: GameState, id: string): Promise<string> {
    const candidates = game.activeIds.filter((pid) => pid !== id);
    const list = candidates
      .map((pid) => `${this.nameOf(game, pid)}：${game.descriptions[pid] ?? ''}`)
      .join('\n');

    const prompt =
      `所有人都在描述「${game.item}」，其中恰好有一位是人类，其余都是 AI。\n` +
      `候选人的描述：\n${list}\n\n` +
      '人类的描述通常更口语、更主观、可能带个人经历或不精确。请指出你认为最可能是人类的那位。';

    try {
      const r = await getLLM(loadConfig(this.env)).structured(prompt, Vote, { temperature: 0.8 });
      const matched = candidates.find((pid) => this.nameOf(game, pid) === r.target_name.trim());
      if (matched) return matched;
    } catch (err) {
      console.warn(`[WhoIsHuman] ${id} 投票失败，随机投:`, err);
    }
    return candidates[Math.floor(Math.random() * candidates.length)] as string;
  }

  // ---------- 工具 ----------

  private nameOf(game: GameState, id: string): string {
    return game.players.find((p) => p.id === id)?.name ?? id;
  }

  private async load(): Promise<GameState> {
    if (!this.game) {
      // hibernation 会把内存字段清空，必须从存储恢复
      const saved = await this.ctx.storage.get<GameState>(STATE_KEY);
      if (!saved) throw new Error('游戏尚未开始，请刷新页面重新开始');
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
