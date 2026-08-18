/**
 * 故事与事件链。
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { loadConfig } from '@/config';
import { loadPack } from '@/domain/content';
import { EventChain } from '@/domain/schemas';
import { getLLM, LLMError } from '@/llm';

import { currentUser, optionalAuth, requireAuth, type App } from './middleware';

export const storyRoutes = new Hono<App>();

storyRoutes.get('/stories', requireAuth, async (c) => {
  const rows = await c.get('repo').listStories(currentUser(c).sub);
  return c.json({ success: true, stories: rows });
});

storyRoutes.get('/stories/:id', optionalAuth, async (c) => {
  const story = await c.get('repo').getStory(c.req.param('id'));
  if (!story) return c.json({ detail: '故事不存在' }, 404);
  return c.json({ success: true, story });
});

const saveStory = z.object({
  scroll_id: z.union([z.string(), z.number()]).transform(String),
  title: z.string().min(1),
  content: z.string().min(1),
});

storyRoutes.post('/stories', requireAuth, async (c) => {
  const parsed = saveStory.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ detail: '参数不合法' }, 400);
  const story = await c.get('repo').createStory({
    id: crypto.randomUUID(),
    user_id: currentUser(c).sub,
    ...parsed.data,
  });
  return c.json({ success: true, story });
});

/**
 * 事件链预览：为书卷生成若干条可能的开局事件，供玩家挑选。
 *
 * 旧版 event_chain_generator.py 直接 new Gemini(model=llm_name)，
 * 绕过适配器层且硬编码模型；这里走统一 LLM 层。
 */
storyRoutes.post('/scroll/:id/generate-event-chain', async (c) => {
  const scrollId = c.req.param('id');
  let pack;
  try {
    pack = await loadPack(c.env.CONTENT, scrollId);
  } catch {
    return c.json({ detail: '书卷不存在' }, 404);
  }

  const body = await c.req
    .json<{ act_count?: number; acts?: number }>()
    .catch(() => ({}) as { act_count?: number; acts?: number });
  // 前端提供 1/3/5/8/10 幕的选项
  const actCount = Math.min(10, Math.max(1, Number(body.act_count ?? body.acts ?? 3) || 3));

  const config = loadConfig(c.env);
  const rolesInfo = Object.values(pack.roles)
    .map((r) => `${r.role_name}：${r.profile}`)
    .join('\n');
  const locations = Object.values(pack.locations)
    .map((l) => `${l.location_name}：${l.description}`)
    .join('\n');

  const zh = pack.preset.language === 'zh';
  const prompt = zh
    ? `你是一位擅长多幕剧结构的编剧。请为下面的世界设计一条 ${actCount} 幕的故事线。\n\n` +
      `世界观：${pack.world.description}\n${pack.world.detail}\n\n` +
      `登场人物：\n${rolesInfo}\n\n可用地点：\n${locations}\n\n` +
      `要求：每一幕都要有台面上的明线冲突和暗中推进的暗线；` +
      `幕与幕之间要有因果递进；关系变化要具体到人物之间。恰好 ${actCount} 幕。`
    : `Design a ${actCount}-act story arc for the world below.\n\n` +
      `World: ${pack.world.description}\n${pack.world.detail}\n\n` +
      `Characters:\n${rolesInfo}\n\nLocations:\n${locations}\n\n` +
      `Each act needs a visible main plot and a hidden sub plot, with causal progression ` +
      `between acts. Exactly ${actCount} acts.`;

  try {
    const chain = await getLLM(config, undefined, 'world').structured(prompt, EventChain, {
      temperature: 0.9,
    });
    // 幕号可能被模型写错，这里按顺序纠正，避免前端显示成「第 0 幕」
    const acts = chain.acts.map((a, i) => ({ ...a, act_number: i + 1 }));
    // event-chain-preview.js:89 读的是 result.event_chain
    return c.json({ success: true, event_chain: { ...chain, acts } });
  } catch (err) {
    console.error('[stories] 事件链生成失败:', err);
    return c.json({ detail: err instanceof LLMError ? err.message : '事件链生成失败' }, 502);
  }
});
