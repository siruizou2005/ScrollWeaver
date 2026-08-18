/**
 * 认证中间件。
 *
 * 旧版有 get_current_user / get_optional_user 两套 Depends，且很多路由忘了加，
 * 导致 /api/scrolls 这类接口未登录也能拿到数据（之前实测返回 200 而非 401）。
 * 这里把“必须登录”和“可选登录”做成两个显式中间件，路由挂哪个一目了然。
 */

import type { Context, MiddlewareHandler } from 'hono';

import { extractToken, verifyToken, type TokenPayload } from '@/auth';
import { loadConfig, type Env } from '@/config';
import { Repo } from '@/storage/repo';

export interface Vars {
  user: TokenPayload | null;
  repo: Repo;
}

export type App = { Bindings: Env; Variables: Vars };

/** 每个请求注入一个 Repo，避免各处自己 new。 */
export const withRepo: MiddlewareHandler<App> = async (c, next) => {
  c.set('repo', new Repo(c.env.DB));
  await next();
};

/** 解析 token（存在则注入用户），不阻断。 */
export const optionalAuth: MiddlewareHandler<App> = async (c, next) => {
  const token = extractToken(c.req.raw);
  c.set('user', token ? await verifyToken(loadConfig(c.env).jwtSecret, token) : null);
  await next();
};

/** 要求登录，否则 401。 */
export const requireAuth: MiddlewareHandler<App> = async (c, next) => {
  const token = extractToken(c.req.raw);
  const user = token ? await verifyToken(loadConfig(c.env).jwtSecret, token) : null;
  if (!user) return c.json({ detail: '未登录或登录已过期' }, 401);
  c.set('user', user);
  await next();
};

/** 取当前用户；仅在 requireAuth 之后调用。 */
export function currentUser(c: Context<App>): TokenPayload {
  const user = c.get('user');
  if (!user) throw new Error('currentUser 必须在 requireAuth 之后使用');
  return user;
}
