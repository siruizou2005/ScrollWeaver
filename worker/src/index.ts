/**
 * Worker 入口。
 *
 * 旧版把 3545 行路由堆在一个 server.py 里：认证、书卷、故事、私语、狼人杀、
 * 商业博弈、文件上传混在一起，其中 /api/scroll/{id} 还被重复定义了两次
 * （server.py:2233 覆盖了 1463 行那个）。这里按领域拆分挂载，入口只负责组装。
 */

import { Hono, type Context } from 'hono';

import { authRoutes } from '@/api/auth';
import { chatRoutes } from '@/api/chat';
import { creationRoutes } from '@/api/creation';
import { gameRoutes } from '@/api/games';
import { withRepo, type App } from '@/api/middleware';
import { roomRoutes } from '@/api/rooms';
import { scrollRoutes } from '@/api/scrolls';
import { storyRoutes } from '@/api/stories';
import { loadConfig } from '@/config';

export { StorySession } from '@/durable/StorySession';
export { Room } from '@/durable/Room';
export { BusinessGame } from '@/durable/BusinessGame';
export { WhoIsHuman } from '@/durable/WhoIsHuman';
export { WerewolfGame } from '@/durable/WerewolfGame';

const app = new Hono<App>();

app.use('/api/*', withRepo);

/**
 * 根路径。
 *
 * assets 的 html_handling 被关掉了（否则 /frontend/pages/x.html 会被 307 成
 * 无扩展名 URL，而前端 JS 里全是带 .html 的硬编码路径），代价是目录索引也没了，
 * 所以这里显式把 / 映射到 index.html。
 */
app.get('/', (c) => c.env.ASSETS.fetch(new URL('/index.html', c.req.url)));

/**
 * 健康检查：同时暴露“配置是否可用”。
 * 旧版要等玩家点进书卷、跑完 96MB 模型下载，才会发现 API key 是失效的。
 */
app.get('/api/health', (c) => {
  const config = loadConfig(c.env);
  const configured = config.providers.filter((p) => p.apiKey).map((p) => p.name);
  return c.json({
    status: configured.length > 0 ? 'ok' : 'unconfigured',
    roleModel: config.roleModel,
    worldModel: config.worldModel,
    providers: configured,
  });
});

app.route('/api', authRoutes);
app.route('/api', scrollRoutes);
app.route('/api', chatRoutes);
app.route('/api', creationRoutes);
app.route('/api', storyRoutes);
app.route('/api', roomRoutes);
app.route('/api', gameRoutes);

/**
 * 剧情会话 WebSocket。
 *
 * 用 clientId 作为 Durable Object 的名字：同一个 clientId 重连会落到同一个实例，
 * 因而能接着上次的剧情继续——旧版重连必然丢失全部进度。
 */
app.get('/ws/:clientId', (c) => {
  if (c.req.header('upgrade') !== 'websocket') {
    return c.json({ detail: '该端点仅接受 WebSocket 连接' }, 426);
  }
  const id = c.env.STORY_SESSION.idFromName(c.req.param('clientId'));
  return c.env.STORY_SESSION.get(id).fetch(c.req.raw);
});

/**
 * 三个玩法各自的 WebSocket。
 * 路径沿用旧版，因此 business.js / who-is-human.js / werewolf.js 不用改。
 */
const gameSocket =
  (binding: 'BUSINESS_GAME' | 'WHO_IS_HUMAN' | 'WEREWOLF_GAME') =>
  (c: Context<App>) => {
    if (c.req.header('upgrade') !== 'websocket') {
      return c.json({ detail: '该端点仅接受 WebSocket 连接' }, 426);
    }
    const ns = c.env[binding];
    const gameId = c.req.param('gameId') ?? 'default';
    return ns.get(ns.idFromName(gameId)).fetch(c.req.raw);
  };

app.get('/ws/business/:gameId', gameSocket('BUSINESS_GAME'));
app.get('/ws/who-is-human/:gameId', gameSocket('WHO_IS_HUMAN'));
app.get('/ws/werewolf/:gameId', gameSocket('WEREWOLF_GAME'));
app.get('/ws/werewolf/:gameId/:playerId', gameSocket('WEREWOLF_GAME'));

/** 匹配 / 多人房间 WebSocket。 */
app.get('/ws/room/:roomId', (c) => {
  if (c.req.header('upgrade') !== 'websocket') {
    return c.json({ detail: '该端点仅接受 WebSocket 连接' }, 426);
  }
  const id = c.env.ROOM.idFromName(c.req.param('roomId'));
  return c.env.ROOM.get(id).fetch(c.req.raw);
});

app.notFound((c) => {
  const path = new URL(c.req.url).pathname;
  // API 路径返回 JSON，其余交给静态资源（assets 已在 Worker 之前处理过一轮）
  return c.json({ detail: `接口不存在: ${path}` }, 404);
});

app.onError((err, c) => {
  console.error('[worker] 未捕获异常:', err);
  return c.json({ detail: err.message || '服务端内部错误' }, 500);
});

export default app;
