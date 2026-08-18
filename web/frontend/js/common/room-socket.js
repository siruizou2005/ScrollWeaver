/**
 * socket.io 的最小替身，底层是原生 WebSocket。
 *
 * 后端迁到 Cloudflare Workers 后跑不了 socket.io（它有自己的握手协议和长轮询降级，
 * 需要专门的服务端）。房间语义改由 Durable Object 承载，线协议是 { event, data }。
 *
 * 这个垫片提供与 socket.io 相同的 .on() / .emit() / .disconnect()，
 * 因此 matching.js 与 multiplayer-story.js 里的事件处理逻辑一行都不用改，
 * 只需把 `io(API_BASE, {...})` 换成 `createRoomSocket(roomId)`。
 *
 * 与 socket.io 的差异（本项目用不到，故未实现）：
 *   - 没有命名空间与 ack 回调
 *   - 没有长轮询降级（Workers 只支持 WebSocket）
 */
(function (global) {
  'use strict';

  function createRoomSocket(roomId, options) {
    const opts = options || {};
    const handlers = new Map();
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const playerId =
      opts.playerId ||
      localStorage.getItem('room_player_id') ||
      (function () {
        const id =
          (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random();
        localStorage.setItem('room_player_id', id);
        return id;
      })();

    const url =
      protocol + '//' + location.host + '/ws/room/' + encodeURIComponent(roomId) +
      '?player=' + encodeURIComponent(playerId);

    let ws = null;
    let closedByUser = false;
    let retry = 0;
    // 断线后排队，重连成功再发出去——socket.io 原本就有这个行为，
    // 缺了它会导致刷新页面瞬间的 emit 静默丢失
    const pending = [];

    function fire(event, data) {
      const list = handlers.get(event);
      if (!list) return;
      for (const cb of list) {
        try {
          cb(data);
        } catch (err) {
          console.error('[room-socket] 处理 ' + event + ' 出错:', err);
        }
      }
    }

    function connect() {
      ws = new WebSocket(url);

      ws.addEventListener('open', function () {
        retry = 0;
        while (pending.length) {
          ws.send(pending.shift());
        }
        fire('connect');
      });

      ws.addEventListener('message', function (ev) {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch (err) {
          return;
        }
        if (msg && msg.event) fire(msg.event, msg.data);
      });

      ws.addEventListener('close', function () {
        fire('disconnect');
        if (closedByUser) return;
        // 指数退避重连，上限 10 秒
        retry += 1;
        setTimeout(connect, Math.min(10000, 500 * Math.pow(2, retry)));
      });

      ws.addEventListener('error', function () {
        fire('connect_error');
      });
    }

    connect();

    return {
      playerId: playerId,
      on: function (event, cb) {
        if (!handlers.has(event)) handlers.set(event, []);
        handlers.get(event).push(cb);
        return this;
      },
      off: function (event, cb) {
        const list = handlers.get(event);
        if (!list) return this;
        handlers.set(event, cb ? list.filter((f) => f !== cb) : []);
        return this;
      },
      emit: function (event, data) {
        const payload = JSON.stringify({ event: event, data: data || {} });
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        } else {
          pending.push(payload);
        }
        return this;
      },
      disconnect: function () {
        closedByUser = true;
        if (ws) ws.close();
      },
      get connected() {
        return Boolean(ws && ws.readyState === WebSocket.OPEN);
      },
    };
  }

  global.createRoomSocket = createRoomSocket;
})(window);
