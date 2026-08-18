/**
 * 故事与事件链。
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { loadConfig } from '@/config';
import { loadPack } from '@/domain/content';
import { EventText } from '@/domain/schemas';
import { getLLM, LLMError } from '@/llm';
import { orchestratorPrompts, render } from '@/prompts';

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

  const config = loadConfig(c.env);
  const P = orchestratorPrompts(pack.preset.language);
  const rolesInfo = Object.values(pack.roles)
    .map((r) => `${r.role_name}：${r.profile}`)
    .join('\n');

  const basePrompt = render(P.GENERATE_INTERVENTION_PROMPT, {
    world_description: pack.world.description,
    roles_info: rolesInfo,
    history_text: '',
  });

  const llm = getLLM(config, undefined, 'world');
  try {
    // 并发生成 3 条互不相同的事件线，比旧版逐条串行快得多
    const events = await Promise.all(
      [0, 1, 2].map(async (i) => {
        const variant =
          pack.preset.language === 'zh'
            ? `${basePrompt}\n\n请给出第 ${i + 1} 种可能的开局，与其它可能明显不同。`
            : `${basePrompt}\n\nProvide alternative opening #${i + 1}, clearly different from others.`;
        const result = await llm.structured(variant, EventText, { temperature: 1.0 });
        return result.event;
      }),
    );
    return c.json({ success: true, events });
  } catch (err) {
    console.error('[stories] 事件链生成失败:', err);
    return c.json({ detail: err instanceof LLMError ? err.message : '事件链生成失败' }, 502);
  }
});
