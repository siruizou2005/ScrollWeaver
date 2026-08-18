/**
 * 一个匹配 / 多人房间 = 一个 Durable Object 实例。
 *
 * 旧版用 socket.io 做房间（socketio_manager.py，300 行），而 Workers 上跑不了
 * socket.io（它有自己的握手与长轮询降级，需要专门的服务端）。
 * DO 本身就是「单实例 + 强一致状态 + 天然知道自己有哪些连接」的模型，
 * 比原来的内存字典更贴合房间语义。
 *
 * 线协议刻意做成 socket.io 的形状 { event, data }，配合前端的
 * common/room-socket.js 垫片，两个页面的 .on/.emit 调用一行都不用改。
 */

import { DurableObject } from 'cloudflare:workers';

import type { Env } from '@/config';

interface Player {
  id: string;
  name: string;
  confirmed: boolean;
  roleCode: string | null;
}

interface RoomState {
  players: Player[];
  started: boolean;
  scrollId: string | null;
}

const STATE_KEY = 'room';

interface Wire {
  event: string;
  data?: Record<string, unknown>;
}

export class Room extends DurableObject<Env> {
  private state: RoomState | null = null;

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const url = new URL(request.url);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    // 把玩家身份挂在连接上，断开时才知道是谁走了——
    // 旧版靠 sid->user 的全局字典维护，进程重启就对不上了
    this.ctx.acceptWebSocket(server, [url.searchParams.get('player') ?? crypto.randomUUID()]);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;
    let msg: Wire;
    try {
      msg = JSON.parse(raw) as Wire;
    } catch {
      return;
    }

    const state = await this.load();
    const playerId = this.playerIdOf(ws);
    const data = msg.data ?? {};

    switch (msg.event) {
      case 'join_matching_room':
      case 'join_multiplayer_room': {
        const name = String(data.player_name ?? data.name ?? playerId.slice(0, 6));
        if (!state.players.some((p) => p.id === playerId)) {
          state.players.push({ id: playerId, name, confirmed: false, roleCode: null });
        }
        if (data.scroll_id) state.scrollId = String(data.scroll_id);
        await this.save(state);
        this.broadcast('player_joined', { player_id: playerId, players: state.players });
        this.broadcast('players_updated', { players: state.players });
        return;
      }

      case 'player_confirm': {
        const player = state.players.find((p) => p.id === playerId);
        if (player) player.confirmed = true;
        await this.save(state);
        this.broadcast('player_confirmed', { player_id: playerId, players: state.players });
        return;
      }

      case 'role_selected': {
        const player = state.players.find((p) => p.id === playerId);
        const roleCode = data.role_code ? String(data.role_code) : null;
        // 一个角色只能被一个人选走
        if (roleCode && state.players.some((p) => p.roleCode === roleCode && p.id !== playerId)) {
          this.send(ws, 'error', { message: '该角色已被其他玩家选择' });
          return;
        }
        if (player) player.roleCode = roleCode;
        await this.save(state);
        this.broadcast('role_selected', {
          player_id: playerId,
          role_code: roleCode,
          players: state.players,
        });
        this.broadcast('players_updated', { players: state.players });
        return;
      }

      case 'start_game': {
        state.started = true;
        await this.save(state);
        this.broadcast('room_started', {
          scroll_id: state.scrollId,
          players: state.players,
        });
        return;
      }

      default:
        this.send(ws, 'error', { message: `未知事件: ${msg.event}` });
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    const state = await this.load();
    const playerId = this.playerIdOf(ws);
    state.players = state.players.filter((p) => p.id !== playerId);
    await this.save(state);
    this.broadcast('player_left', { player_id: playerId, players: state.players });
    this.broadcast('players_updated', { players: state.players });
  }

  // ---------- 工具 ----------

  private playerIdOf(ws: WebSocket): string {
    const tags = this.ctx.getTags(ws);
    return tags[0] ?? 'unknown';
  }

  private async load(): Promise<RoomState> {
    if (!this.state) {
      this.state = (await this.ctx.storage.get<RoomState>(STATE_KEY)) ?? {
        players: [],
        started: false,
        scrollId: null,
      };
    }
    return this.state;
  }

  private async save(state: RoomState): Promise<void> {
    this.state = state;
    await this.ctx.storage.put(STATE_KEY, state);
  }

  private send(ws: WebSocket, event: string, data: Record<string, unknown>): void {
    try {
      ws.send(JSON.stringify({ event, data }));
    } catch {
      // 连接已断开
    }
  }

  private broadcast(event: string, data: Record<string, unknown>): void {
    const text = JSON.stringify({ event, data });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(text);
      } catch {
        // 忽略已断开的连接
      }
    }
  }
}
