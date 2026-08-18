/**
 * 私语路由：创建会话、发消息、读历史、清空。
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { loadConfig } from '@/config';
import { greeting, replyAsRole } from '@/domain/chat';
import { loadPack } from '@/domain/content';
import { getLLM, LLMError } from '@/llm';
import type { ChatMessage } from '@/storage/repo';

import { currentUser, requireAuth, type App } from './middleware';

export const chatRoutes = new Hono<App>();

const createBody = z.object({
  scroll_id: z.union([z.string(), z.number()]).transform(String),
  role_code: z.string().min(1),
});

chatRoutes.post('/chat/create', requireAuth, async (c) => {
  const parsed = createBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ detail: '缺少 scroll_id 或 role_code' }, 400);

  const { scroll_id, role_code } = parsed.data;
  let pack;
  try {
    pack = await loadPack(c.env.CONTENT, scroll_id);
  } catch {
    return c.json({ detail: '书卷不存在' }, 404);
  }
  if (!pack.roles[role_code]) return c.json({ detail: '角色不存在' }, 404);

  const id = crypto.randomUUID();
  await c.get('repo').createChat(id, currentUser(c).sub, scroll_id, role_code);
  return c.json({
    success: true,
    session_id: id,
    greeting: greeting(pack, role_code),
  });
});

const sendBody = z.object({
  session_id: z.string().min(1),
  message: z.string().min(1).max(4000),
});

chatRoutes.post('/chat/send', requireAuth, async (c) => {
  const parsed = sendBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ detail: '缺少 session_id 或 message' }, 400);

  const repo = c.get('repo');
  const session = await repo.getChat(parsed.data.session_id);
  if (!session) return c.json({ detail: '会话不存在' }, 404);
  if (session.user_id !== currentUser(c).sub) return c.json({ detail: '无权访问该会话' }, 403);

  let pack;
  try {
    pack = await loadPack(c.env.CONTENT, session.scroll_id);
  } catch {
    return c.json({ detail: '书卷内容缺失' }, 404);
  }

  const history = JSON.parse(session.messages) as ChatMessage[];
  history.push({ role: 'user', content: parsed.data.message, at: Date.now() });

  const config = loadConfig(c.env);
  try {
    const reply = await replyAsRole(
      getLLM(config),
      pack,
      session.role_code,
      history,
      currentUser(c).username,
    );
    history.push({ role: 'assistant', content: reply, at: Date.now() });
    await repo.saveChatMessages(session.id, history);
    return c.json({ success: true, reply, role_code: session.role_code });
  } catch (err) {
    // 用户消息已经入历史但没拿到回复——回滚，避免下次带着孤立的用户消息重发
    history.pop();
    await repo.saveChatMessages(session.id, history);
    const detail = err instanceof LLMError ? err.message : '生成回复失败';
    console.error('[chat] 生成失败:', err);
    return c.json({ detail }, 502);
  }
});

chatRoutes.get('/chat/history/:id', requireAuth, async (c) => {
  const session = await c.get('repo').getChat(c.req.param('id'));
  if (!session) return c.json({ detail: '会话不存在' }, 404);
  if (session.user_id !== currentUser(c).sub) return c.json({ detail: '无权访问该会话' }, 403);
  return c.json({
    success: true,
    messages: JSON.parse(session.messages) as ChatMessage[],
    role_code: session.role_code,
  });
});

chatRoutes.post('/chat/clear/:id', requireAuth, async (c) => {
  const repo = c.get('repo');
  const session = await repo.getChat(c.req.param('id'));
  if (!session) return c.json({ detail: '会话不存在' }, 404);
  if (session.user_id !== currentUser(c).sub) return c.json({ detail: '无权访问该会话' }, 403);
  await repo.clearChat(session.id);
  return c.json({ success: true });
});
