/**
 * 认证路由：注册、登录、登出、当前用户。
 *
 * 响应格式沿用旧版（{ success, token, user } / 错误 { detail }），
 * 因此 frontend/js/pages/login.js 一行都不用改。
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { hashPassword, signToken, verifyPassword } from '@/auth';
import { loadConfig } from '@/config';

import { currentUser, requireAuth, type App } from './middleware';

const credentials = z.object({
  username: z.string().min(1, '用户名不能为空').max(64),
  password: z.string().min(1, '密码不能为空').max(256),
  email: z.string().email().optional().or(z.literal('')),
});

export const authRoutes = new Hono<App>();

authRoutes.post('/register', async (c) => {
  const parsed = credentials.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ detail: parsed.error.issues[0]?.message ?? '参数不合法' }, 400);
  }
  const { username, password, email } = parsed.data;
  const repo = c.get('repo');

  if (await repo.findUserByName(username)) {
    return c.json({ detail: '用户名已存在' }, 409);
  }

  const user = await repo.createUser(username, await hashPassword(password), email || undefined);
  const token = await signToken(loadConfig(c.env).jwtSecret, user);
  return c.json({ success: true, token, user: { id: user.id, username: user.username } });
});

authRoutes.post('/login', async (c) => {
  const parsed = credentials.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ detail: parsed.error.issues[0]?.message ?? '参数不合法' }, 400);
  }
  const { username, password } = parsed.data;
  const repo = c.get('repo');

  const record = await repo.findUserByName(username);
  // 用户不存在时也走一次哈希校验，避免用响应时间区分“用户不存在”与“密码错误”
  const ok = record
    ? await verifyPassword(password, record.password_hash)
    : await verifyPassword(password, 'pbkdf2$100000$AAAA$AAAA').then(() => false);

  if (!record || !ok) {
    return c.json({ detail: '用户名或密码错误' }, 401);
  }

  await repo.touchLogin(record.id);
  const token = await signToken(loadConfig(c.env).jwtSecret, record);
  return c.json({
    success: true,
    token,
    user: { id: record.id, username: record.username, email: record.email },
  });
});

/** 登出：token 是自校验的，服务端无状态，交给前端清 localStorage。 */
authRoutes.post('/logout', (c) => c.json({ success: true }));

authRoutes.get('/user/me', requireAuth, async (c) => {
  const payload = currentUser(c);
  const user = await c.get('repo').findUserById(payload.sub);
  if (!user) return c.json({ detail: '用户不存在' }, 404);
  return c.json({ success: true, user });
});
