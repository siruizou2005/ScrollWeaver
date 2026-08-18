/**
 * 商业博弈：与 AI 对手进行 Bertrand 价格竞争。
 *
 * 对应旧版 modules/business/business_game.py（570 行）。规则完全照搬：
 * 需求 Q = max(0, 20 - min(p1,p2))，成本 10，低价方吃下全部需求，同价平分。
 *
 * 旧版的 AI 用一段自然语言 Q 表 + 经验回放喂给 LLM 决策，硬编码
 * MODEL_NAME = "gemini-3-flash-preview" 并直连 genai。这里保留同样的博弈策略，
 * 但走统一 LLM 层，且 LLM 不可用时退到确定性策略而不是让整局卡死。
 */

import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';

import { loadConfig, type Env } from '@/config';
import { getLLM } from '@/llm';

const DEMAND_A = 20;
const COST = 10;
const MAX_ROUNDS = 20;

type PriceCategory = 'LOW' | 'MEDIUM' | 'HIGH';
type StateName = 'NO_HISTORY' | 'BOTH_HIGH' | 'ME_HIGH_OTHER_LOW' | 'ME_LOW_OTHER_HIGH' | 'BOTH_NOT_HIGH';

interface RoundRecord {
  round: number;
  priceHuman: number;
  priceAi: number;
  profitHuman: number;
  profitAi: number;
  reasoning: string;
}

interface GameState {
  round: number;
  totalHuman: number;
  totalAi: number;
  lastHuman: number | null;
  lastAi: number | null;
  history: RoundRecord[];
  finished: boolean;
}

const STATE_KEY = 'business';

/** 与旧版 compute_profits 逐行等价。 */
export function computeProfits(p1: number, p2: number): [number, number, number] {
  const Q = Math.max(0, DEMAND_A - Math.min(p1, p2));
  if (Q === 0) return [0, 0, 0];
  let q1: number;
  let q2: number;
  if (p1 < p2) [q1, q2] = [Q, 0];
  else if (p2 < p1) [q1, q2] = [0, Q];
  else [q1, q2] = [Q / 2, Q / 2];
  return [Q, (p1 - COST) * q1, (p2 - COST) * q2];
}

function priceCategory(price: number | null): PriceCategory | null {
  if (price === null) return null;
  if (price <= 11) return 'LOW';
  if (price <= 14) return 'MEDIUM';
  return 'HIGH';
}

export function makeStateName(mine: number | null, other: number | null): StateName {
  const a = priceCategory(mine);
  const b = priceCategory(other);
  if (a === null || b === null) return 'NO_HISTORY';
  if (a === 'HIGH' && b === 'HIGH') return 'BOTH_HIGH';
  if (a === 'HIGH') return 'ME_HIGH_OTHER_LOW';
  if (b === 'HIGH') return 'ME_LOW_OTHER_HIGH';
  return 'BOTH_NOT_HIGH';
}

const AiDecision = z.object({
  reasoning: z.string().describe('简要说明定价理由，50字以内'),
  price: z.number().int().min(COST).max(DEMAND_A).describe(`本轮定价，整数，范围 ${COST}-${DEMAND_A}`),
});

export class BusinessGame extends DurableObject<Env> {
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
    let msg: { type?: string; price?: number };
    try {
      msg = JSON.parse(raw) as { type?: string; price?: number };
    } catch {
      return;
    }

    const game = await this.load();
    if (msg.type === 'get_state') return this.sendState(ws, game);
    if (msg.type !== 'submit_price') return;

    if (game.finished || game.round >= MAX_ROUNDS) {
      return this.send(ws, { type: 'error', message: '本局已结束' });
    }

    const price = Math.round(Number(msg.price));
    if (!Number.isFinite(price) || price < 1 || price > 100) {
      return this.send(ws, { type: 'error', message: '价格必须是 1-100 的整数' });
    }

    this.send(ws, { type: 'ai_thinking' });
    const decision = await this.decideAiPrice(game);
    this.send(ws, { type: 'ai_ready' });

    const [, profitHuman, profitAi] = computeProfits(price, decision.price);
    game.round += 1;
    game.totalHuman += profitHuman;
    game.totalAi += profitAi;
    game.lastHuman = price;
    game.lastAi = decision.price;
    game.history.push({
      round: game.round,
      priceHuman: price,
      priceAi: decision.price,
      profitHuman,
      profitAi,
      reasoning: decision.reasoning,
    });
    if (game.round >= MAX_ROUNDS) game.finished = true;
    await this.save(game);

    this.send(ws, {
      type: 'round_result',
      round: game.round,
      price_human: price,
      price_ai: decision.price,
      profit_human: Number(profitHuman.toFixed(2)),
      profit_ai: Number(profitAi.toFixed(2)),
      ai_reasoning: decision.reasoning,
      total_profit_human: Number(game.totalHuman.toFixed(2)),
      total_profit_ai: Number(game.totalAi.toFixed(2)),
    });
    this.sendState(ws, game);
  }

  /**
   * AI 定价。
   *
   * LLM 不可用时退到确定性策略——旧版此处若 genai 客户端为空会一路抛异常，
   * 整局无法进行。演示场景下宁可 AI 变笨，也不该让玩家卡住。
   */
  private async decideAiPrice(game: GameState): Promise<{ price: number; reasoning: string }> {
    const state = makeStateName(game.lastAi, game.lastHuman);
    const recent = game.history
      .slice(-5)
      .map(
        (r) =>
          `第${r.round}轮：我方 ${r.priceAi} / 对手 ${r.priceHuman}，我方利润 ${r.profitAi.toFixed(1)}`,
      )
      .join('\n');

    const prompt =
      `你是一家企业的定价决策者，与对手进行价格竞争。\n` +
      `规则：市场需求 Q = ${DEMAND_A} - 较低价格；报价低的一方吃下全部需求，同价平分；` +
      `你的边际成本是 ${COST} 元，低于 ${COST} 元必然亏损。\n` +
      `当前是第 ${game.round + 1}/${MAX_ROUNDS} 轮，局面状态：${state}。\n` +
      (recent ? `近几轮记录：\n${recent}\n` : '这是第一轮，没有历史。\n') +
      `请给出本轮定价（${COST}-${DEMAND_A} 的整数）与简要理由。`;

    try {
      const result = await getLLM(loadConfig(this.env)).structured(prompt, AiDecision, {
        temperature: 0.7,
      });
      return { price: Math.min(DEMAND_A, Math.max(COST, result.price)), reasoning: result.reasoning };
    } catch (err) {
      console.warn('[BusinessGame] AI 决策失败，退到确定性策略:', err);
      return { price: this.fallbackPrice(game), reasoning: '（策略模式）根据上轮结果调整报价' };
    }
  }

  /** 简单的针锋相对：对手低就跟一点，对手高就试探性抬价。 */
  private fallbackPrice(game: GameState): number {
    if (game.lastHuman === null) return 15;
    if (game.lastHuman <= 11) return Math.max(COST, game.lastHuman);
    if (game.lastHuman >= 15) return game.lastHuman - 1;
    return game.lastHuman;
  }

  private sendState(ws: WebSocket, game: GameState): void {
    this.send(ws, {
      type: 'game_state',
      current_round: game.round,
      max_rounds: MAX_ROUNDS,
      total_profit_human: Number(game.totalHuman.toFixed(2)),
      total_profit_ai: Number(game.totalAi.toFixed(2)),
      history: game.history,
      finished: game.finished,
      state_description: game.round > 0 ? makeStateName(game.lastHuman, game.lastAi) : 'NO_HISTORY',
    });
  }

  private async load(): Promise<GameState> {
    if (!this.game) {
      this.game = (await this.ctx.storage.get<GameState>(STATE_KEY)) ?? {
        round: 0,
        totalHuman: 0,
        totalAi: 0,
        lastHuman: null,
        lastAi: null,
        history: [],
        finished: false,
      };
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
