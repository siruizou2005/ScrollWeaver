/**
 * 谁是人类：3 个 AI + 1 个玩家轮流描述同一件物品，互相投票找出人类。
 *
 * 对应旧版 modules/gathering/who_is_human_game.py（557 行）。规则照搬：
 * 全局固定一件物品；每轮所有存活玩家各写一句描述，然后投票；
 * 得票最多者出局；平票则只让平票者进入加时赛；人类出局即游戏结束。
 *
 * 旧版硬编码 MODEL_NAME = "gemini-2.5-flash" 且直连 genai，
 * 且 AI 描述是逐个串行生成的；这里并发生成，一轮少等好几秒。
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

interface Player {
  id: string;
  name: string;
  isHuman: boolean;
}

type Phase = 'waiting' | 'describing' | 'voting' | 'ended';

interface GameState {
  item: string;
  round: number;
  phase: Phase;
  players: Player[];
  activeIds: string[];
  eliminatedIds: string[];
  humanId: string;
  descriptions: Record<string, string>;
  votes: Record<string, string>;
  history: unknown[];
  winner: 'human' | 'ai' | null;
}

const STATE_KEY = 'wih';

const Description = z.object({
  description: z.string().describe('对该物品的一句话描述，15-30字，像真人随口说的，不要太完美'),
});

const Vote = z.object({
  target_name: z.string().describe('你认为最可能是人类的玩家名字'),
  reason: z.string().describe('简短理由，20字以内'),
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
          return this.send(ws, { type: 'game_state', ...(await this.load()) });
      }
    } catch (err) {
      console.error('[WhoIsHuman] 处理失败:', err);
      this.send(ws, { type: 'error', message: err instanceof Error ? err.message : '服务端错误' });
    }
  }

  private async startGame(ws: WebSocket): Promise<void> {
    const humanId = 'human';
    const players: Player[] = [
      ...AI_NAMES.map((name, i) => ({ id: `ai${i + 1}`, name, isHuman: false })),
      { id: humanId, name: '你', isHuman: true },
    ];
    // 打乱出场顺序，避免人类永远在最后一位而被轻易识别
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j] as Player, players[i] as Player];
    }

    const game: GameState = {
      item: ITEMS[Math.floor(Math.random() * ITEMS.length)] as string,
      round: 1,
      phase: 'describing',
      players,
      activeIds: players.map((p) => p.id),
      eliminatedIds: [],
      humanId,
      descriptions: {},
      votes: {},
      history: [],
      winner: null,
    };
    await this.save(game);

    this.send(ws, { type: 'game_start', item: game.item, players: game.players });
    this.send(ws, { type: 'round_start', round: game.round, item: game.item });
    this.sendState(ws, game);
  }

  private async submitDescription(ws: WebSocket, text: string): Promise<void> {
    const game = await this.load();
    if (game.phase !== 'describing') return this.send(ws, { type: 'error', message: '当前不是描述阶段' });
    if (!text.trim()) return this.send(ws, { type: 'error', message: '描述不能为空' });
    if (!game.activeIds.includes(game.humanId)) {
      return this.send(ws, { type: 'error', message: '你已被淘汰' });
    }

    game.descriptions[game.humanId] = text.trim();
    this.send(ws, { type: 'descriptions_ready', player_id: game.humanId, description: text.trim() });

    // AI 并发生成描述——旧版逐个串行，4 人一轮要等好几倍时间
    const aiIds = game.activeIds.filter((id) => id !== game.humanId);
    const results = await Promise.all(aiIds.map((id) => this.aiDescribe(game, id)));
    aiIds.forEach((id, i) => {
      game.descriptions[id] = results[i] as string;
    });

    game.phase = 'voting';
    await this.save(game);

    this.send(ws, {
      type: 'all_descriptions_ready',
      descriptions: game.activeIds.map((id) => ({
        player_id: id,
        name: this.nameOf(game, id),
        description: game.descriptions[id] ?? '',
      })),
    });
    this.sendState(ws, game);
  }

  private async submitVote(ws: WebSocket, targetId: string): Promise<void> {
    const game = await this.load();
    if (game.phase !== 'voting') return this.send(ws, { type: 'error', message: '当前不是投票阶段' });
    if (!game.activeIds.includes(targetId)) {
      return this.send(ws, { type: 'error', message: '投票目标无效' });
    }
    if (targetId === game.humanId) {
      return this.send(ws, { type: 'error', message: '不能投给自己' });
    }

    game.votes[game.humanId] = targetId;
    // AI 投票同样并发
    const aiIds = game.activeIds.filter((id) => id !== game.humanId);
    const aiVotes = await Promise.all(aiIds.map((id) => this.aiVote(game, id)));
    aiIds.forEach((id, i) => {
      game.votes[id] = aiVotes[i] as string;
    });

    // 统计票数
    const counts: Record<string, number> = {};
    for (const id of game.activeIds) counts[id] = 0;
    for (const target of Object.values(game.votes)) {
      if (target in counts) counts[target] = (counts[target] ?? 0) + 1;
    }
    const max = Math.max(...Object.values(counts));
    const mostVoted = Object.keys(counts).filter((id) => counts[id] === max);
    const isTie = mostVoted.length > 1;

    const result: Record<string, unknown> = {
      type: 'round_result',
      round: game.round,
      item: game.item,
      descriptions: game.activeIds.map((id) => ({
        player_id: id,
        name: this.nameOf(game, id),
        description: game.descriptions[id] ?? '',
      })),
      vote_counts: counts,
      is_tie: isTie,
    };

    if (isTie) {
      // 平票：只让平票者进入加时赛，与旧版一致
      game.activeIds = game.activeIds.filter((id) => mostVoted.includes(id));
      result.message = `平局！${mostVoted.length} 位玩家得票相同，进入加时赛`;
      result.tie_players = mostVoted;
    } else {
      const eliminated = mostVoted[0] as string;
      game.activeIds = game.activeIds.filter((id) => id !== eliminated);
      game.eliminatedIds.push(eliminated);
      result.eliminated_player = eliminated;
      result.eliminated_player_name = this.nameOf(game, eliminated);
      result.message = `${this.nameOf(game, eliminated)} 被投票出局`;
    }

    game.history.push(result);
    this.send(ws, result);

    // 判定胜负
    const humanAlive = game.activeIds.includes(game.humanId);
    if (!humanAlive) {
      game.phase = 'ended';
      game.winner = 'ai';
      await this.save(game);
      return this.send(ws, {
        type: 'game_end',
        winner: 'ai',
        message: '你被识破了——AI 找出了人类。',
        item: game.item,
      });
    }
    if (game.activeIds.length <= 1) {
      game.phase = 'ended';
      game.winner = 'human';
      await this.save(game);
      return this.send(ws, {
        type: 'game_end',
        winner: 'human',
        message: '你活到了最后——成功伪装成 AI。',
        item: game.item,
      });
    }

    game.round += 1;
    game.phase = 'describing';
    game.descriptions = {};
    game.votes = {};
    await this.save(game);
    this.send(ws, { type: 'round_start', round: game.round, item: game.item });
    this.sendState(ws, game);
  }

  // ---------- AI ----------

  private async aiDescribe(game: GameState, id: string): Promise<string> {
    const others = Object.entries(game.descriptions)
      .filter(([pid]) => pid !== id)
      .map(([pid, d]) => `${this.nameOf(game, pid)}：${d}`)
      .join('\n');

    const prompt =
      `你在玩一个「找出人类」的游戏。所有人都在描述同一件物品：「${game.item}」。\n` +
      `你要伪装成普通人类玩家，描述要自然、口语化，不要百科式的完美定义，` +
      `也不要和别人的描述雷同。\n` +
      (others ? `本轮已有的描述：\n${others}\n` : '') +
      `请用一句话（15-30字）描述「${game.item}」。`;

    try {
      const r = await getLLM(loadConfig(this.env)).structured(prompt, Description, {
        temperature: 1.0,
      });
      return r.description.trim();
    } catch (err) {
      console.warn(`[WhoIsHuman] ${id} 描述生成失败:`, err);
      return `这东西挺常见的，我一时说不好。`;
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
      `人类的描述通常更口语、更主观、可能带个人经历或不精确。请指出你认为最可能是人类的那位。`;

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

  private sendState(ws: WebSocket, game: GameState): void {
    this.send(ws, {
      type: 'game_state',
      round: game.round,
      phase: game.phase,
      item: game.item,
      players: game.players,
      active_players: game.activeIds,
      eliminated_players: game.eliminatedIds,
      human_player_id: game.humanId,
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
