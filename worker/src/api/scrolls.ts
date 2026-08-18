/**
 * 书卷相关路由。
 *
 * 系统预设书卷来自 KV 内容包，用户书卷来自 D1，这里统一成前端期待的一个列表。
 * 旧版把系统预设也塞进数据库并在每次启动时 init_system_scrolls() 检查一遍，
 * 导致“改了预设文件但库里还是旧的”这类问题。
 */

import { Hono } from 'hono';

import { listScrolls, loadPack, ContentNotFound } from '@/domain/content';

import { currentUser, optionalAuth, requireAuth, type App } from './middleware';

export const scrollRoutes = new Hono<App>();

interface ScrollView {
  id: string;
  title: string;
  description: string;
  scroll_type: 'system' | 'user';
  language: string;
  user_id: number | null;
  is_public: boolean;
}

/** 书卷列表：系统预设 + 已登录用户自己的 + 公开的。 */
scrollRoutes.get('/scrolls', optionalAuth, async (c) => {
  const presets = await listScrolls(c.env.CONTENT);
  const scrolls: ScrollView[] = presets.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    scroll_type: 'system',
    language: p.language,
    user_id: null,
    is_public: true,
  }));

  const user = c.get('user');
  if (user) {
    for (const s of await c.get('repo').listUserScrolls(user.sub)) {
      scrolls.push({
        id: s.id,
        title: s.title,
        description: s.description,
        scroll_type: 'user',
        language: s.language,
        user_id: s.user_id,
        is_public: s.is_public === 1,
      });
    }
  }
  return c.json({ success: true, scrolls });
});

scrollRoutes.get('/user/scrolls', requireAuth, async (c) => {
  const rows = await c.get('repo').listUserScrolls(currentUser(c).sub);
  return c.json({
    success: true,
    scrolls: rows.map((s) => ({ ...s, scroll_type: 'user', is_public: s.is_public === 1 })),
  });
});

scrollRoutes.get('/scroll/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const pack = await loadPack(c.env.CONTENT, id);
    return c.json({
      success: true,
      scroll: {
        id,
        title: pack.preset.title,
        description: pack.preset.description,
        scroll_type: 'system',
        language: pack.preset.language,
        source: pack.preset.source,
      },
    });
  } catch (err) {
    if (!(err instanceof ContentNotFound)) throw err;
  }
  const scroll = await c.get('repo').getScroll(id);
  if (!scroll) return c.json({ detail: '书卷不存在' }, 404);
  return c.json({ success: true, scroll: { ...scroll, scroll_type: 'user' } });
});

/** 简介在卡片上只显示摘要，与旧版一样截断到 100 字。 */
function summarize(text: string, max = 100): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

scrollRoutes.get('/scroll/:id/characters', async (c) => {
  try {
    const pack = await loadPack(c.env.CONTENT, c.req.param('id'));
    return c.json({
      success: true,
      // 字段名必须与旧版一致：前端读的是 char.description 和 char.code
      // （intro.js:193、multiplayer-story.js:140），用 profile 会显示“暂无描述”
      characters: Object.values(pack.roles).map((r) => ({
        code: r.role_code,
        role_code: r.role_code,
        name: r.role_name,
        nickname: r.nickname,
        role: r.identity?.join('、') ?? '',
        description: summarize(r.profile),
        profile: r.profile,
        gender: r.gender,
        identity: r.identity,
      })),
    });
  } catch {
    return c.json({ detail: '书卷不存在' }, 404);
  }
});

scrollRoutes.get('/scroll/:id/character/:code', async (c) => {
  try {
    const pack = await loadPack(c.env.CONTENT, c.req.param('id'));
    const role = pack.roles[c.req.param('code')];
    if (!role) return c.json({ detail: '角色不存在' }, 404);
    return c.json({ success: true, character: role });
  } catch {
    return c.json({ detail: '书卷不存在' }, 404);
  }
});

scrollRoutes.get('/scroll/:id/world-info', async (c) => {
  try {
    const pack = await loadPack(c.env.CONTENT, c.req.param('id'));
    return c.json({
      success: true,
      world: pack.world,
      locations: Object.values(pack.locations),
    });
  } catch {
    return c.json({ detail: '书卷不存在' }, 404);
  }
});

scrollRoutes.post('/scroll/:id/share', requireAuth, async (c) => {
  const body = await c.req.json<{ is_public?: boolean }>().catch(() => ({}) as { is_public?: boolean });
  const ok = await c
    .get('repo')
    .setScrollPublic(c.req.param('id'), currentUser(c).sub, body.is_public ?? true);
  if (!ok) return c.json({ detail: '书卷不存在或无权限' }, 404);
  return c.json({ success: true });
});

/** 兼容旧接口：前端创建页仍会调用。 */
scrollRoutes.get('/list-presets', async (c) => {
  const presets = await listScrolls(c.env.CONTENT);
  return c.json({ presets: presets.map((p) => `${p.id}.json`) });
});

scrollRoutes.post('/load-preset', async (c) => {
  const body = await c.req.json<{ preset?: string }>().catch(() => ({}) as { preset?: string });
  const id = (body.preset ?? '').replace(/\.json$/, '');
  try {
    const pack = await loadPack(c.env.CONTENT, id);
    return c.json({ success: true, preset: pack.preset });
  } catch {
    return c.json({ detail: '预设不存在' }, 404);
  }
});

/**
 * 前端配置接口。
 *
 * 旧版就已禁用（返回 403），因为让前端改服务端模型/密钥是安全问题。
 * 这里保持同样行为，Workers 上配置只能通过 wrangler secret 设置。
 */
scrollRoutes.post('/save-config', (c) =>
  c.json({ detail: '前端配置已禁用。请使用 wrangler secret 配置密钥并重新部署。' }, 403),
);
