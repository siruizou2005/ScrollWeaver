/**
 * 一个游戏会话 = 一个 Durable Object 实例。
 *
 * 旧版把会话放在 ConnectionManager 的内存字典里（server.py:140），进程一重启，
 * 所有进行中的剧情全部丢失；而且 ScrollWeaver 实例内含 LLM 客户端与向量库，
 * 根本无法序列化，所以“存档”只能另写一套 persistence 去手工挑字段。
 *
 * 这里状态本身就是纯数据（domain/state.ts），每推进一步就落盘到 DO storage，
 * 实例被驱逐、重启、迁移都能从断点继续。
 *
 * WebSocket 协议与旧版保持一致，因此 frontend/js/message.js 一行都不用改。
 */

import { DurableObject } from 'cloudflare:workers';

import { loadConfig, type Env } from '@/config';
import { loadPack, nameToCode, type ContentPack } from '@/domain/content';
import { StoryEngine, type OutMessage } from '@/domain/engine';
import { logsToStory } from '@/domain/orchestrator';
import { createSession, type SessionState } from '@/domain/state';
import { getLLM } from '@/llm';

const STATE_KEY = 'session';
const SCROLL_KEY = 'scrollId';

interface ClientMessage {
  type: string;
  scroll_id?: string | number;
  action?: string;
  text?: string;
  role_name?: string | null;
  [key: string]: unknown;
}

export class StorySession extends DurableObject<Env> {
  private pack: ContentPack | null = null;
  private state: SessionState | null = null;
  /** 剧情推进中；用于 pause 与防止重复启动 */
  private running = false;
  private stopRequested = false;

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    // hibernation：空闲时 DO 可被驱逐而不断开连接，这是免费额度下长时间挂着会话的关键
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return this.sendError(ws, '消息不是合法 JSON');
    }

    try {
      switch (msg.type) {
        case 'init':
          return await this.handleInit(ws, msg);
        case 'control':
          return await this.handleControl(ws, msg);
        case 'request_characters':
        case 'request_scene_characters':
          // 前端在切换场景时发后者，语义与前者相同（都要一份角色名单）
          return await this.sendCharacters(ws);
        case 'generate_story':
          return await this.handleExportStory(ws);
        case 'reset_session':
          return await this.handleReset(ws);
        case 'select_role':
          return await this.handleSelectRole(ws, msg);
        case 'user_message':
          // 旧版支持玩家扮演角色发言；这里先记入历史，剧情引擎会在下一步读到
          return await this.handleUserMessage(ws, msg);
        default:
          return this.sendError(ws, `未知消息类型: ${msg.type}`);
      }
    } catch (err) {
      console.error('[StorySession] 处理消息失败:', err);
      this.sendError(ws, err instanceof Error ? err.message : '服务端错误');
    }
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    this.stopRequested = true;
    ws.close(code, 'closing');
  }

  // ---------- 消息处理 ----------

  private async handleInit(ws: WebSocket, msg: ClientMessage): Promise<void> {
    const scrollId = String(msg.scroll_id ?? '');
    if (!scrollId) return this.sendError(ws, '缺少 scroll_id');

    await this.ensureLoaded(scrollId);
    const pack = this.pack as ContentPack;
    const state = this.state as SessionState;

    this.send(ws, {
      type: 'initial_data',
      data: {
        characters: Object.values(pack.roles).map((r, i) => ({
          id: i,
          role_code: r.role_code,
          name: r.role_name,
          nickname: r.nickname,
          profile: r.profile,
        })),
        history_messages: state.history.map((h) => ({
          username: this.displayName(h.actor),
          text: h.detail,
          timestamp: '',
          scene: h.round,
          from: h.actorType === 'role' ? 'role' : h.actorType,
        })),
        status: {
          round: state.round,
          phase: state.phase,
          characters: this.characterSnapshot(),
          group: state.groupCodes,
        },
      },
    });
  }

  private async handleControl(ws: WebSocket, msg: ClientMessage): Promise<void> {
    if (!(await this.hydrate())) {
      return this.sendError(ws, '会话尚未初始化，请刷新页面重试');
    }
    switch (msg.action) {
      case 'start':
        if (this.running) return;
        this.send(ws, { type: 'story_started', data: { message: '故事已开始' } });
        // 必须用 waitUntil 而不是 void：runLoop 是个跨多次 LLM 调用的长任务，
        // webSocketMessage 一返回，未被运行时跟踪的悬空 Promise 就可能随实例
        // 一起被回收（开了 hibernation 更是明确允许在事件之间驱逐）。
        // 症状是角色多的书卷（红楼梦 12 人，首步实测 48 秒）永远等不到第一条发言，
        // 而角色少的（三国 9 人）碰巧能在被回收前吐出消息。
        this.ctx.waitUntil(this.runLoop(ws));
        return;
      case 'pause':
        this.stopRequested = true;
        this.send(ws, { type: 'story_paused', data: { message: '故事已暂停' } });
        return;
      case 'stop':
        this.stopRequested = true;
        this.send(ws, { type: 'story_stopped', data: { message: '故事已停止' } });
        return;
      default:
        return this.sendError(ws, `未知控制指令: ${msg.action}`);
    }
  }

  private async handleUserMessage(ws: WebSocket, msg: ClientMessage): Promise<void> {
    if (!(await this.hydrate())) {
      return this.sendError(ws, '会话尚未初始化，请刷新页面重试');
    }
    const state = this.state as SessionState;
    const text = String(msg.text ?? '').trim();
    if (!text) return;

    // 若正在等玩家为某个角色行动，就把这段话记成那个角色的行动并继续推进
    const actingAs = state.awaitingUserFor;
    const actor = actingAs ?? 'user';
    state.history.push({
      id: crypto.randomUUID(),
      round: state.round,
      actorType: 'role',
      actor,
      actType: actingAs ? 'plan' : 'user',
      detail: text,
      group: actingAs ? state.groupCodes : [],
    });
    if (actingAs) state.awaitingUserFor = null;
    await this.persist();

    this.broadcast({
      type: 'message',
      data: {
        type: 'role',
        username: actingAs ? (this.pack?.roles[actingAs]?.role_name ?? '你') : '你',
        role_code: actingAs,
        text,
        timestamp: new Date().toISOString(),
        scene: state.round,
        is_user: true,
      },
    });

    // 玩家这一步走完，恢复自动推进
    if (actingAs && !this.running) {
      this.ctx.waitUntil(this.runLoop(ws));
    }
  }

  /**
   * 选择要扮演的角色。
   *
   * 选中后，轮到该角色行动时引擎会挂起并发 waiting_for_user_input，
   * 由玩家写台词而不是让 LLM 代写；再次点同一角色即取消（role_name 传 null）。
   */
  private async handleSelectRole(ws: WebSocket, msg: ClientMessage): Promise<void> {
    if (!(await this.hydrate())) {
      return this.sendError(ws, '会话尚未初始化，请刷新页面重试');
    }
    const pack = this.pack as ContentPack;
    const state = this.state as SessionState;
    const roleName = msg.role_name;

    if (!roleName) {
      state.userRoleCode = null;
      state.awaitingUserFor = null;
      await this.persist();
      return this.send(ws, { type: 'role_cleared', data: { message: '已取消角色选择' } });
    }

    const code = pack.roles[String(roleName)] ? String(roleName) : nameToCode(pack, String(roleName));
    if (!code) {
      return this.sendError(ws, `未找到角色: ${roleName}`);
    }
    state.userRoleCode = code;
    await this.persist();
    this.send(ws, {
      type: 'role_selected',
      data: {
        role_name: pack.roles[code]?.role_name ?? code,
        role_code: code,
        message: `已选择角色: ${pack.roles[code]?.role_name ?? code}`,
      },
    });
  }

  private async sendCharacters(ws: WebSocket): Promise<void> {
    if (!(await this.hydrate())) {
      return this.sendError(ws, '会话尚未初始化，请刷新页面重试');
    }
    const pack = this.pack as ContentPack;
    this.send(ws, {
      type: 'characters_list',
      data: Object.values(pack.roles).map((r) => ({
        role_code: r.role_code,
        name: r.role_name,
        nickname: r.nickname,
      })),
    });
  }

  private async handleExportStory(ws: WebSocket): Promise<void> {
    if (!(await this.hydrate())) {
      return this.sendError(ws, '会话尚未初始化，请刷新页面重试');
    }
    const state = this.state as SessionState;
    const pack = this.pack as ContentPack;

    const config = loadConfig(this.env);
    const logs = state.history
      .filter((h) => h.actType !== 'goal setting')
      .map((h) => `${this.displayName(h.actor)}: ${h.detail}`)
      .join('\n');

    try {
      const story = await logsToStory(
        { llm: getLLM(config, undefined, 'world'), pack, topK: config.retrievalTopK },
        state.language,
        logs,
      );
      this.send(ws, { type: 'story_exported', data: { story } });
      this.send(ws, {
        type: 'message',
        data: { type: 'story', text: story, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      this.sendError(ws, `故事导出失败: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async handleReset(ws: WebSocket): Promise<void> {
    const scrollId = (await this.ctx.storage.get<string>(SCROLL_KEY)) ?? '';
    this.stopRequested = true;
    await this.ctx.storage.delete(STATE_KEY);
    this.state = null;
    if (scrollId) await this.ensureLoaded(scrollId);
    this.send(ws, { type: 'session_reset', data: { message: '会话已重置' } });
    this.send(ws, { type: 'clear_messages', data: {} });
  }

  // ---------- 剧情推进 ----------

  /**
   * 推进循环。
   *
   * 每步之后落盘：Workers 的 DO 可能在任意时刻被驱逐，落盘频率决定了最坏情况
   * 丢失多少进度。一步大约是一个角色的行动，代价可接受。
   */
  private async runLoop(ws: WebSocket): Promise<void> {
    if (!(await this.hydrate())) {
      return this.sendError(ws, '会话尚未初始化，请刷新页面重试');
    }
    const pack = this.pack as ContentPack;
    const state = this.state as SessionState;

    this.running = true;
    this.stopRequested = false;

    const config = loadConfig(this.env);
    const engine = new StoryEngine(
      pack,
      state,
      getLLM(config, undefined, 'role'),
      getLLM(config, undefined, 'world'),
      config.retrievalTopK,
    );

    try {
      while (!this.stopRequested) {
        const emit = (m: OutMessage) => {
          if (m.type === 'await_user') {
            // 引擎让出控制权：告诉前端启用输入框，等这个角色的台词
            this.broadcast({
              type: 'waiting_for_user_input',
              data: { role_name: m.name, role_code: m.roleCode, message: m.text },
            });
            return;
          }
          this.broadcast(this.toWire(m, state.round));
        };
        const canContinue = await engine.step(emit);
        await this.persist();
        this.broadcast({
          type: 'status_update',
          data: {
            round: state.round,
            phase: state.phase,
            characters: this.characterSnapshot(),
            group: state.groupCodes,
            location_code: state.groupCodes[0]
              ? state.characters[state.groupCodes[0]]?.locationCode
              : null,
          },
        });
        if (!canContinue) {
          this.broadcast({ type: 'story_ended', data: { message: '故事已完结' } });
          break;
        }
        // 轮到玩家扮演的角色了，停下来等 user_message
        if (state.awaitingUserFor) break;
      }
    } catch (err) {
      console.error('[StorySession] 推进失败:', err);
      this.sendError(ws, err instanceof Error ? err.message : '剧情推进失败');
    } finally {
      this.running = false;
      await this.persist();
    }
  }

  // ---------- 工具 ----------

  /**
   * 从存储恢复会话。
   *
   * hibernation 是把双刃剑：WebSocket 连接能在 DO 实例被驱逐后存活（这正是免费额度
   * 下能长时间挂着会话的原因），但实例是**重新构造**的——this.pack / this.state
   * 这些内存字段会归零。因此每个处理器都必须先 hydrate，不能假设 init 时设的值还在。
   *
   * 返回 false 表示这个连接还没 init 过，调用方应提示刷新。
   */
  private async hydrate(): Promise<boolean> {
    if (this.pack && this.state) return true;
    const scrollId = await this.ctx.storage.get<string>(SCROLL_KEY);
    if (!scrollId) return false;
    try {
      this.pack = await loadPack(this.env.CONTENT, scrollId);
    } catch (err) {
      console.error('[StorySession] 内容包加载失败:', err);
      return false;
    }
    this.state = (await this.ctx.storage.get<SessionState>(STATE_KEY)) ?? null;
    return Boolean(this.pack && this.state);
  }

  private async ensureLoaded(scrollId: string): Promise<void> {
    if (this.pack?.preset.id !== scrollId) {
      this.pack = await loadPack(this.env.CONTENT, scrollId);
      await this.ctx.storage.put(SCROLL_KEY, scrollId);
    }
    if (!this.state) {
      const saved = await this.ctx.storage.get<SessionState>(STATE_KEY);
      this.state =
        saved ??
        createSession({
          scrollId,
          language: this.pack.preset.language,
          roleCodes: Object.keys(this.pack.roles),
          roles: this.pack.roles,          // 供 createSession 初始化记忆层
          intervention: this.pack.preset.intervention,
          script: this.pack.preset.script,
          mode: this.pack.preset.script ? 'script' : 'free',
        });
      await this.persist();
    }
  }

  private async persist(): Promise<void> {
    if (this.state) await this.ctx.storage.put(STATE_KEY, this.state);
  }

  /**
   * 角色运行时状态快照。
   *
   * 左侧「角色档案」的 位置 / 目标 / 状态 三栏读的是
   * character.location / goal / state（profile-panel.js:284-286），
   * 只发 {round, phase} 的话这三栏永远是 Empty。
   */
  private characterSnapshot(): Record<string, unknown>[] {
    const pack = this.pack;
    const state = this.state;
    if (!pack || !state) return [];
    return Object.values(pack.roles).map((role) => {
      const cs = state.characters[role.role_code];
      const loc = cs?.locationCode ? pack.locations[cs.locationCode]?.location_name : '';
      return {
        code: role.role_code,
        role_code: role.role_code,
        character_id: role.role_code,
        name: role.role_name,
        nickname: role.nickname,
        location: cs?.moving
          ? `前往 ${pack.locations[cs.moving.to]?.location_name ?? cs.moving.to}`
          : (loc ?? ''),
        goal: cs?.goal ?? '',
        motivation: cs?.motivation ?? '',
        state: cs?.status ?? '',
        status: cs?.status ?? '',
        activity: cs?.activity ?? 1,
        // 记忆层。无人格画像的角色为 null，前端按缺省处理即可
        mood: cs?.persona?.mood ?? null,
        energy: cs?.persona?.energy ?? null,
      };
    });
  }

  private displayName(actor: string): string {
    if (actor === 'world') return '旁白';
    if (actor === 'user') return '你';
    return this.pack?.roles[actor]?.role_name ?? actor;
  }

  /** 引擎消息 -> 前端 message.js 期待的线格式。 */
  private toWire(m: OutMessage, round: number): Record<string, unknown> {
    return {
      type: 'message',
      data: {
        type: m.type === 'system' ? 'system' : 'role',
        username: m.name ?? this.displayName(m.roleCode ?? 'world'),
        role_code: m.roleCode ?? null,
        text: m.text,
        timestamp: new Date().toISOString(),
        scene: round,
        record_id: m.id ?? null,
        is_user: false,
      },
    };
  }

  private send(ws: WebSocket, payload: unknown): void {
    try {
      ws.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('[StorySession] 发送失败:', err);
    }
  }

  private broadcast(payload: unknown): void {
    const text = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(text);
      } catch {
        // 连接已断开，忽略
      }
    }
  }

  private sendError(ws: WebSocket, message: string): void {
    this.send(ws, { type: 'error', data: { message } });
  }
}
