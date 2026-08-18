/**
 * 多人房间的 REST 面。
 *
 * 房间的**实时状态**（谁在、谁确认了、谁选了哪个角色）由 Room Durable Object
 * 持有并通过 WebSocket 广播；这里只负责房间的创建与检索，即需要跨房间查询的部分。
 * 这个分工是刻意的：DO 各自独立，无法互相枚举，所以“房间列表”必须有一份注册表。
 *
 * 旧版把这两件事都塞进 socketio_manager 的内存字典，进程重启后房间全部蒸发，
 * 且没有任何持久化的房间列表。
 */

import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { loadPack } from '@/domain/content';

import { currentUser, optionalAuth, requireAuth, type App } from './middleware';

export const roomRoutes = new Hono<App>();

interface RoomRecord {
  id: string;
  name: string;
  scroll_id: string;
  scroll_title: string;
  host: string;
  max_players: number;
  created_at: number;
}

const REGISTRY_KEY = 'index:rooms';
/** 房间注册表的存活时间：demo 场景下过期房间自动消失，省去清理任务。 */
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

async function readRegistry(kv: KVNamespace): Promise<RoomRecord[]> {
  const rooms = (await kv.get<RoomRecord[]>(REGISTRY_KEY, 'json')) ?? [];
  const cutoff = Date.now() - ROOM_TTL_MS;
  return rooms.filter((r) => r.created_at > cutoff);
}

async function writeRegistry(kv: KVNamespace, rooms: RoomRecord[]): Promise<void> {
  await kv.put(REGISTRY_KEY, JSON.stringify(rooms.slice(-50)));
}

const createBody = z.object({
  scroll_id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().default(''),
  max_players: z.coerce.number().int().min(2).max(8).default(4),
});

async function createRoom(c: Context<App>) {
  const parsed = createBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ detail: '缺少 scroll_id' }, 400);

  let pack;
  try {
    pack = await loadPack(c.env.CONTENT, parsed.data.scroll_id);
  } catch {
    return c.json({ detail: '书卷不存在' }, 404);
  }

  const user = currentUser(c);
  const room: RoomRecord = {
    id: crypto.randomUUID().slice(0, 8),
    name: parsed.data.name || `${user.username} 的雅集`,
    scroll_id: parsed.data.scroll_id,
    scroll_title: pack.preset.title,
    host: user.username,
    max_players: parsed.data.max_players,
    created_at: Date.now(),
  };

  const rooms = await readRegistry(c.env.CONTENT);
  rooms.push(room);
  await writeRegistry(c.env.CONTENT, rooms);
  return c.json({ success: true, room_id: room.id, room });
}

roomRoutes.post('/multiplayer/create-room', requireAuth, createRoom);
/** 广场页用的别名，与旧版保持一致 */
roomRoutes.post('/rooms/create', requireAuth, createRoom);
roomRoutes.post('/game/create-room', requireAuth, createRoom);

roomRoutes.get('/multiplayer/rooms', optionalAuth, async (c) => {
  const rooms = await readRegistry(c.env.CONTENT);
  return c.json({ success: true, rooms });
});

roomRoutes.get('/multiplayer/room/:id', optionalAuth, async (c) => {
  const rooms = await readRegistry(c.env.CONTENT);
  const room = rooms.find((r) => r.id === c.req.param('id'));
  if (!room) return c.json({ detail: '房间不存在或已过期' }, 404);
  return c.json({ success: true, room });
});

/**
 * 以下动作的**权威实现在 Room DO 的 WebSocket 上**（join / confirm / select-role /
 * start / leave 都是实时广播语义）。这里保留 REST 端点是因为前端在建立 WS 之前
 * 会先调它们做乐观更新；返回 success 让前端流程继续，真实状态以 WS 广播为准。
 */
const wsBackedActions = [
  '/multiplayer/join-room',
  '/multiplayer/leave-room',
  '/multiplayer/confirm',
  '/multiplayer/select-role',
  '/multiplayer/start-room',
] as const;

for (const path of wsBackedActions) {
  roomRoutes.post(path, requireAuth, (c) =>
    c.json({ success: true, via: 'websocket', detail: '该动作由房间 WebSocket 实时同步' }),
  );
}

roomRoutes.post('/game/join-room/:id', requireAuth, async (c) => {
  const rooms = await readRegistry(c.env.CONTENT);
  const room = rooms.find((r) => r.id === c.req.param('id'));
  if (!room) return c.json({ detail: '房间不存在或已过期' }, 404);
  return c.json({ success: true, room });
});
