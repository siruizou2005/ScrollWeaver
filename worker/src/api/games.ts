/**
 * 三个独立玩法的 REST 面：创建对局、排行榜、存档。
 *
 * 对局的实时逻辑全部在各自的 Durable Object 里（BusinessGame / WhoIsHuman /
 * WerewolfGame），这里只负责发号（game_id）与跨对局的数据（排行榜）。
 *
 * 旧版把三套 GameManager 放在 server.py 的模块级全局字典里，进程重启即丢；
 * 且每个 manager 都自己维护一份 session 字典和清理逻辑。
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { currentUser, optionalAuth, requireAuth, type App } from './middleware';

export const gameRoutes = new Hono<App>();

const LEADERBOARD_KEY = 'index:business_leaderboard';

interface LeaderboardEntry {
  username: string;
  profit: number;
  rounds: number;
  at: number;
}

const newGameId = () => crypto.randomUUID().slice(0, 12);

// ---------- 商业博弈 ----------

gameRoutes.post('/business/create', (c) =>
  c.json({ success: true, game_id: newGameId() }),
);

const saveResult = z.object({
  profit: z.coerce.number(),
  rounds: z.coerce.number().int().min(1).default(1),
});

gameRoutes.post('/business/save-result', requireAuth, async (c) => {
  const parsed = saveResult.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ detail: '参数不合法' }, 400);

  const board = (await c.env.CONTENT.get<LeaderboardEntry[]>(LEADERBOARD_KEY, 'json')) ?? [];
  board.push({
    username: currentUser(c).username,
    profit: parsed.data.profit,
    rounds: parsed.data.rounds,
    at: Date.now(),
  });
  // 只留前 50，避免 KV 值无限增长
  board.sort((a, b) => b.profit - a.profit);
  await c.env.CONTENT.put(LEADERBOARD_KEY, JSON.stringify(board.slice(0, 50)));
  return c.json({ success: true });
});

gameRoutes.get('/business/leaderboard', optionalAuth, async (c) => {
  const board = (await c.env.CONTENT.get<LeaderboardEntry[]>(LEADERBOARD_KEY, 'json')) ?? [];
  return c.json({ success: true, leaderboard: board.slice(0, 20) });
});

// ---------- 谁是人类 ----------

// 同样不加鉴权：前端这几个 create 都不带 Authorization 头
gameRoutes.post('/who-is-human/create', (c) =>
  c.json({ success: true, game_id: newGameId() }),
);

// ---------- 狼人杀 ----------

/**
 * 创建狼人杀对局。
 *
 * 不加 requireAuth：werewolf.js:146 的 fetch 只带 Content-Type，不带 Authorization，
 * 加了鉴权会直接 401，整个玩法进不去。
 *
 * 板子与指定身份透传到 WebSocket 的查询参数，由 WerewolfGame 在建连时发牌。
 */
const werewolfBody = z.object({
  preset: z.enum(['standard_12', 'simple_8', 'simple_6']).default('simple_8'),
  preferred_role: z
    .enum(['werewolf', 'seer', 'witch', 'hunter', 'guard', 'villager'])
    .optional(),
});

gameRoutes.post('/werewolf/create', async (c) => {
  const parsed = werewolfBody.safeParse(await c.req.json().catch(() => ({})));
  const { preset, preferred_role } = parsed.success ? parsed.data : { preset: 'simple_8' as const, preferred_role: undefined };
  // 用 ~ 编进 game_id：前端把它拼进路径 /ws/werewolf/{game_id}/{player_id}，
  // 若用 ? 会把后半段变成查询串、截断路径，所以只能用路径安全的分隔符。
  // Worker 路由会解析出这三段。
  return c.json({
    success: true,
    game_id: `${newGameId()}~${preset}~${preferred_role ?? ''}`,
    player_id: 'player_0',
    preset,
  });
});

/**
 * 旧版有独立的 start 接口；现在开局由 WebSocket 的 start_game 消息触发
 * （因为发牌结果要通过同一条连接推给玩家）。保留端点让前端流程不变。
 */
gameRoutes.post('/werewolf/start', (c) =>
  c.json({ success: true, via: 'websocket', detail: '请通过 WebSocket 发送 start_game 开始对局' }),
);
